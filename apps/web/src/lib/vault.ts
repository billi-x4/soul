/*
 * Client-side vault — the zero-plaintext seam (CLAUDE.md decision #4).
 *
 * The vault key is derived from the user's passphrase IN THIS BROWSER (PBKDF2 → AES-256-GCM,
 * helpers from @soul/shared) and never leaves it: content is sealed into envelopes before any
 * request, and the API/relayer/Walrus only ever see ciphertext. The unlocked key is cached in
 * sessionStorage for the tab session (same custody class as the bearer token in localStorage)
 * and cleared on sign-out. Losing the passphrase means losing the private memories — there is
 * no reset, because there is nothing server-side to reset against. The UI says so plainly.
 */
import {
  bytesToB64,
  b64ToBytes,
  createVaultParams,
  decryptPayload,
  encryptPayload,
  MAX_VAULT_FILE_BYTES,
  type Namespace,
  unlockVaultKey,
  type VaultItemDetail,
  type VaultItemMeta,
  type VaultPayload,
  type VaultStatus,
} from "@soul/shared";
import { soulFetch } from "@/lib/api";

const KEY_CACHE = "soul.vault.key";

let cachedKey: CryptoKey | null = null;

async function cacheKey(key: CryptoKey): Promise<CryptoKey> {
  cachedKey = key;
  if (typeof window !== "undefined") {
    const raw = await crypto.subtle.exportKey("raw", key);
    window.sessionStorage.setItem(KEY_CACHE, bytesToB64(new Uint8Array(raw)));
  }
  return key;
}

/** The unlocked vault key for this tab session, or null (locked / never unlocked here). */
export async function getUnlockedKey(): Promise<CryptoKey | null> {
  if (cachedKey) {
    return cachedKey;
  }
  if (typeof window === "undefined") {
    return null;
  }
  const b64 = window.sessionStorage.getItem(KEY_CACHE);
  if (!b64) {
    return null;
  }
  cachedKey = await crypto.subtle.importKey(
    "raw",
    b64ToBytes(b64) as BufferSource,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
  return cachedKey;
}

/** Forget the key (sign-out, or an explicit "lock"). The passphrase re-derives it any time. */
export function lockVault(): void {
  cachedKey = null;
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(KEY_CACHE);
  }
}

export async function fetchVaultStatus(): Promise<VaultStatus> {
  return soulFetch<VaultStatus>("/api/vault");
}

/** First-time setup: derive locally, store ONLY the public KDF params server-side. */
export async function setUpVault(passphrase: string): Promise<CryptoKey> {
  const { params, key } = await createVaultParams(passphrase);
  await soulFetch("/api/vault", { method: "POST", body: { params } });
  return cacheKey(key);
}

/** Unlock with the passphrase against the stored params. Null = wrong passphrase. */
export async function unlockVault(passphrase: string, status: VaultStatus): Promise<CryptoKey | null> {
  if (!status.params) {
    return null;
  }
  const key = await unlockVaultKey(passphrase, status.params);
  return key ? cacheKey(key) : null;
}

/** Seal text in the browser and store the envelope. Zero plaintext leaves this function. */
export async function addPrivateText(args: {
  key: CryptoKey;
  namespace: Namespace;
  label: string;
  text: string;
}): Promise<VaultItemMeta> {
  const payload: VaultPayload = { kind: "text", text: args.text };
  const envelope = await encryptPayload(args.key, payload);
  return soulFetch<VaultItemMeta>("/api/vault/items", {
    method: "POST",
    body: {
      namespace: args.namespace,
      label: args.label,
      kind: "text",
      sizeBytes: new TextEncoder().encode(args.text).length,
      envelope,
    },
  });
}

/** Seal a file in the browser (bytes → base64 inside the encrypted payload). */
export async function addPrivateFile(args: {
  key: CryptoKey;
  namespace: Namespace;
  file: File;
}): Promise<VaultItemMeta> {
  if (args.file.size > MAX_VAULT_FILE_BYTES) {
    throw new Error("That file is over the 10 MB limit");
  }
  const bytes = new Uint8Array(await args.file.arrayBuffer());
  const payload: VaultPayload = {
    kind: "file",
    filename: args.file.name,
    mime: args.file.type || "application/octet-stream",
    dataB64: bytesToB64(bytes),
  };
  const envelope = await encryptPayload(args.key, payload);
  return soulFetch<VaultItemMeta>("/api/vault/items", {
    method: "POST",
    body: {
      namespace: args.namespace,
      label: args.file.name,
      kind: "file",
      sizeBytes: args.file.size,
      envelope,
    },
  });
}

export async function listPrivateItems(namespace?: string): Promise<VaultItemMeta[]> {
  const qs = namespace && namespace !== "all" ? `?namespace=${namespace}` : "";
  const r = await soulFetch<{ items: VaultItemMeta[] }>(`/api/vault/items${qs}`);
  return r.items;
}

/** Fetch one envelope and open it locally. Throws on a tampered envelope / wrong key. */
export async function decryptPrivateItem(key: CryptoKey, id: string): Promise<VaultPayload> {
  const detail = await soulFetch<VaultItemDetail>(`/api/vault/items/${id}`);
  return decryptPayload(key, detail.envelope);
}

export async function deletePrivateItem(id: string): Promise<{ note: string }> {
  return soulFetch<{ deleted: boolean; note: string }>(`/api/vault/items/${id}`, {
    method: "DELETE",
  });
}

/** Turn a decrypted file payload back into a downloadable Blob. */
export function payloadToBlob(payload: VaultPayload): Blob {
  return new Blob([b64ToBytes(payload.dataB64 ?? "") as BlobPart], {
    type: payload.mime ?? "application/octet-stream",
  });
}
