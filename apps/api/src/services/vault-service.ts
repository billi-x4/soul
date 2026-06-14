/*
 * Zero-plaintext vault service (CLAUDE.md decision #4 — the client-side-encryption path).
 *
 * Everything here is deliberately blind: content arrives as an AES-256-GCM envelope sealed in
 * the browser, and this service can only validate its SHAPE, never open it. The envelope is
 * written to the blob store (Walrus in live mode) EXACTLY as received — unwrapped — because the
 * envelope itself is the protection, and raw storage is what keeps the data portable: the owner
 * can fetch the blob from any Walrus aggregator and decrypt it with their passphrase alone,
 * without Soul. (Managed-mode documents are wrapped with the server's at-rest key instead —
 * that path trades zero-plaintext for semantic indexing.)
 *
 * The honest trade-off, stated everywhere it matters: private items are never embedded by the
 * relayer, so they don't surface in semantic recall or MCP. That is the feature, not a bug.
 */
import { createHash } from "node:crypto";
import {
  isVaultEnvelope,
  MAX_VAULT_ENVELOPE_BYTES,
  MAX_VAULT_FILE_BYTES,
  MAX_VAULT_LABEL_CHARS,
  type Namespace,
  VAULT_ITEM_KINDS,
  VAULT_KDF,
  VAULT_PBKDF2_ITERATIONS,
  VAULT_SCHEME,
  type VaultEnvelope,
  type VaultItemKind,
  type VaultKdfParams,
  type VaultStatus,
  envelopeJson,
} from "@soul/shared";
import { BadRequestError, ConflictError, NotFoundError } from "../pkg/errors/error";
import { services } from "./container";
import type { VaultItemRecord, VaultRecord } from "./ports";

/**
 * Bounds for the client-chosen PBKDF2 work factor. The key-check envelope is an offline-guess
 * oracle, so the iteration count is the price of brute force — the floor must never undercut
 * the work factor we advertise. (The field exists so the cost can RISE over time, not fall.)
 */
const MIN_KDF_ITERATIONS = VAULT_PBKDF2_ITERATIONS;
const MAX_KDF_ITERATIONS = 5_000_000;

const sha256Hex = (s: string): string => createHash("sha256").update(s).digest("hex");

function assertKdfParams(params: unknown): asserts params is VaultKdfParams {
  if (typeof params !== "object" || params === null) {
    throw new BadRequestError("Invalid vault parameters");
  }
  const p = params as Record<string, unknown>;
  const saltOk =
    typeof p.saltB64 === "string" &&
    p.saltB64.length >= 22 && // ≥16 bytes of salt
    p.saltB64.length <= 48;
  const iterationsOk =
    typeof p.iterations === "number" &&
    Number.isInteger(p.iterations) &&
    p.iterations >= MIN_KDF_ITERATIONS &&
    p.iterations <= MAX_KDF_ITERATIONS;
  if (
    !saltOk ||
    !iterationsOk ||
    p.kdf !== VAULT_KDF ||
    p.scheme !== VAULT_SCHEME ||
    !isVaultEnvelope(p.checkEnvelope)
  ) {
    throw new BadRequestError("Invalid vault parameters");
  }
}

/** First-time setup: store the PUBLIC KDF params (the passphrase never reaches the server). */
export async function setupVault(userId: string, params: unknown): Promise<VaultRecord> {
  assertKdfParams(params);
  const created = await services.repo.createVault({ userId, kdfParams: params });
  if (!created) {
    // Re-keying would orphan every existing envelope (we cannot re-encrypt what we cannot read).
    throw new ConflictError("Your vault is already set up — it cannot be re-keyed.");
  }
  return created;
}

export async function vaultStatus(userId: string): Promise<VaultStatus> {
  const vault = await services.repo.getVault(userId);
  const itemCount = await services.repo.countVaultItems(userId);
  return vault
    ? { configured: true, params: vault.kdfParams, itemCount, createdAt: vault.createdAt }
    : { configured: false, itemCount };
}

export async function addVaultItem(args: {
  userId: string;
  namespace: Namespace;
  label: string;
  kind: VaultItemKind;
  sizeBytes: number;
  envelope: unknown;
}): Promise<VaultItemRecord> {
  const vault = await services.repo.getVault(args.userId);
  if (!vault) {
    throw new ConflictError("Set up your private vault before adding private memories.");
  }
  if (!VAULT_ITEM_KINDS.includes(args.kind)) {
    throw new BadRequestError("kind must be 'text' or 'file'");
  }
  const label = args.label.trim();
  if (!label) {
    throw new BadRequestError(
      "A label is required (the only content-bearing field Soul can read)."
    );
  }
  if (label.length > MAX_VAULT_LABEL_CHARS) {
    throw new BadRequestError(`Label must be at most ${MAX_VAULT_LABEL_CHARS} characters`);
  }
  if (
    !Number.isInteger(args.sizeBytes) ||
    args.sizeBytes <= 0 ||
    args.sizeBytes > MAX_VAULT_FILE_BYTES
  ) {
    throw new BadRequestError("sizeBytes must be a positive integer within the 10 MB limit");
  }
  if (!isVaultEnvelope(args.envelope)) {
    throw new BadRequestError("Invalid envelope (expected { v:1, scheme, ivB64, ctB64 })");
  }
  const canonical = envelopeJson(args.envelope);
  if (canonical.length > MAX_VAULT_ENVELOPE_BYTES) {
    throw new BadRequestError("Envelope exceeds the 20 MB wire limit");
  }

  // RAW write — the envelope is already sealed; wrapping it in the server key would break the
  // "decryptable with the passphrase alone" portability guarantee.
  const { blobId } = await services.blobs.write(new TextEncoder().encode(canonical), {
    mime: "application/json",
  });
  const item = await services.repo.createVaultItem({
    userId: args.userId,
    namespace: args.namespace,
    label,
    kind: args.kind,
    sizeBytes: args.sizeBytes,
    walrusBlobId: blobId,
    envelopeHash: sha256Hex(canonical),
    scheme: args.envelope.scheme,
  });
  await services.repo.addAudit({
    userId: args.userId,
    action: "ingest",
    target: args.namespace,
    metadata: { sourceType: "private", sourceLabel: label, zeroPlaintext: true },
  });
  return item;
}

/** Detail = metadata + the envelope re-read from the blob store, for client-side decryption. */
export async function getVaultItemDetail(
  userId: string,
  id: string
): Promise<{ item: VaultItemRecord; envelope: VaultEnvelope }> {
  const item = await services.repo.getVaultItem(userId, id);
  if (!item) {
    throw new NotFoundError("Private item not found");
  }
  const bytes = await services.blobs.read(item.walrusBlobId);
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isVaultEnvelope(parsed)) {
    throw new NotFoundError("Stored envelope is unreadable");
  }
  return { item, envelope: parsed };
}

export async function removeVaultItem(userId: string, id: string): Promise<void> {
  const deleted = await services.repo.deleteVaultItem(userId, id);
  if (!deleted) {
    throw new NotFoundError("Private item not found");
  }
}

/**
 * Portability proof for the vault: re-read every envelope from the blob store and re-check its
 * hash. `missing` carries item ids whose blob is gone or no longer matches.
 */
export async function verifyVault(
  userId: string
): Promise<{ intact: boolean; verified: number; total: number; missing: string[] }> {
  const items = await services.repo.listVaultItems(userId);
  const missing: string[] = [];
  for (const item of items) {
    try {
      const bytes = await services.blobs.read(item.walrusBlobId);
      const hash = sha256Hex(new TextDecoder().decode(bytes));
      if (hash !== item.envelopeHash) {
        missing.push(item.id);
      }
    } catch {
      missing.push(item.id);
    }
  }
  return {
    intact: missing.length === 0,
    verified: items.length - missing.length,
    total: items.length,
    missing,
  };
}
