/*
 * Zero-plaintext vault crypto — isomorphic WebCrypto helpers shared by the web app (encrypt in
 * the browser), the API (shape validation only — it can NEVER decrypt), and tests/smoke (full
 * client-side round-trips in-process).
 *
 * Threat model: the vault key is derived from the user's passphrase IN THE BROWSER (PBKDF2-SHA-256)
 * and never leaves it. The server stores only the public KDF parameters (salt, iterations) and a
 * key-check envelope (a known constant encrypted under the key) so a new device can verify an
 * unlock. Content is sealed as AES-256-GCM envelopes BEFORE upload; the envelope itself is what
 * lands on Walrus, so the data stays decryptable with the passphrase alone — even without Soul.
 *
 * The `scheme` field is the forward-compat seam: "aes-256-gcm" today; a Seal/MemWal-manual-mode
 * scheme can slot in without changing the storage shape (sui-stack SKILL Layer 5).
 *
 * NOTE: a key-check value is inherently an offline-guess oracle for whoever holds it (the same
 * trade-off every passphrase vault makes). PBKDF2 at 310k iterations prices that attack; the
 * passphrase's strength is the real protection — the UI says so plainly.
 */
import {
  MAX_VAULT_ENVELOPE_BYTES,
  VAULT_CHECK_PLAINTEXT,
  VAULT_KDF,
  VAULT_PBKDF2_ITERATIONS,
  VAULT_SCHEME,
  type VaultEnvelope,
  type VaultKdfParams,
  type VaultPayload,
} from "./constants";

const subtle = () => globalThis.crypto.subtle;

const te = new TextEncoder();
const td = new TextDecoder();

export function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin);
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/** Derive the AES-256-GCM vault key from a passphrase + stored KDF params. Browser/Bun/Node ≥19. */
export async function deriveVaultKey(
  passphrase: string,
  params: Pick<VaultKdfParams, "saltB64" | "iterations">
): Promise<CryptoKey> {
  const material = await subtle().importKey("raw", te.encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return subtle().deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: b64ToBytes(params.saltB64) as BufferSource,
      iterations: params.iterations,
    },
    material,
    { name: "AES-GCM", length: 256 },
    true, // extractable: the web app caches the raw key for the session (cleared on sign-out)
    ["encrypt", "decrypt"]
  );
}

/** Seal arbitrary bytes into a versioned envelope (random 12-byte IV per call). */
export async function encryptBytes(key: CryptoKey, plaintext: Uint8Array): Promise<VaultEnvelope> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    plaintext as BufferSource
  );
  return { v: 1, scheme: VAULT_SCHEME, ivB64: bytesToB64(iv), ctB64: bytesToB64(new Uint8Array(ct)) };
}

/** Open an envelope. Throws (GCM auth failure) on a wrong key or tampered ciphertext. */
export async function decryptBytes(key: CryptoKey, envelope: VaultEnvelope): Promise<Uint8Array> {
  const pt = await subtle().decrypt(
    { name: "AES-GCM", iv: b64ToBytes(envelope.ivB64) as BufferSource },
    key,
    b64ToBytes(envelope.ctB64) as BufferSource
  );
  return new Uint8Array(pt);
}

/** Seal a structured payload ({ kind, text | filename+mime+dataB64 }) as UTF-8 JSON. */
export async function encryptPayload(key: CryptoKey, payload: VaultPayload): Promise<VaultEnvelope> {
  return encryptBytes(key, te.encode(JSON.stringify(payload)));
}

export async function decryptPayload(key: CryptoKey, envelope: VaultEnvelope): Promise<VaultPayload> {
  return JSON.parse(td.decode(await decryptBytes(key, envelope))) as VaultPayload;
}

/**
 * First-time vault setup: random salt, current KDF defaults, and the key-check envelope the
 * server stores so any device can verify a passphrase before trusting decryptions.
 */
export async function createVaultParams(
  passphrase: string
): Promise<{ params: VaultKdfParams; key: CryptoKey }> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const base = {
    saltB64: bytesToB64(salt),
    iterations: VAULT_PBKDF2_ITERATIONS,
    kdf: VAULT_KDF,
    scheme: VAULT_SCHEME,
  };
  const key = await deriveVaultKey(passphrase, base);
  const checkEnvelope = await encryptBytes(key, te.encode(VAULT_CHECK_PLAINTEXT));
  return { params: { ...base, checkEnvelope }, key };
}

/** Unlock on any device: derive from the stored params and prove the key opens the check value. */
export async function unlockVaultKey(
  passphrase: string,
  params: VaultKdfParams
): Promise<CryptoKey | null> {
  const key = await deriveVaultKey(passphrase, params);
  try {
    const check = td.decode(await decryptBytes(key, params.checkEnvelope));
    return check === VAULT_CHECK_PLAINTEXT ? key : null;
  } catch {
    return null; // GCM auth failure — wrong passphrase
  }
}

/** SHA-256 hex of an envelope's canonical JSON — the integrity fingerprint Portability re-checks. */
export async function envelopeHash(envelope: VaultEnvelope): Promise<string> {
  const digest = await subtle().digest("SHA-256", te.encode(envelopeJson(envelope)) as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Canonical serialized form — the exact bytes written to (and re-read from) Walrus. */
export function envelopeJson(envelope: VaultEnvelope): string {
  return JSON.stringify({
    v: envelope.v,
    scheme: envelope.scheme,
    ivB64: envelope.ivB64,
    ctB64: envelope.ctB64,
  });
}

/** Runtime guard for envelopes arriving over the wire (API + restore paths). */
export function isVaultEnvelope(value: unknown): value is VaultEnvelope {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const e = value as Record<string, unknown>;
  return (
    e.v === 1 &&
    e.scheme === VAULT_SCHEME &&
    typeof e.ivB64 === "string" &&
    e.ivB64.length === 16 && // 12 bytes → exactly 16 base64 chars
    typeof e.ctB64 === "string" &&
    e.ctB64.length > 0 &&
    // Hard ceiling on the ciphertext so the cheap shape check rejects oversized envelopes
    // before any hashing/serialization work (the rest of the envelope is ~100 bytes).
    e.ctB64.length <= MAX_VAULT_ENVELOPE_BYTES
  );
}
