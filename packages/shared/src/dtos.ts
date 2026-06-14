/*
 * Soul shared domain DTOs — the cross-app shapes returned/consumed by the API and web.
 * These are NOT Postgres rows (those live in @soul/db). Memory content itself is the
 * source of truth on Walrus + MemWal; these are the user-facing projections.
 */

import type {
  AcquisitionKind,
  AuditAction,
  ConnectedAppStatus,
  IngestionStatus,
  ListingStatus,
  Namespace,
  SourceType,
  VaultEnvelope,
  VaultItemKind,
  VaultKdfParams,
} from "./constants";

/** A single piece of recalled/browsed knowledge (from MemWal `recall`, not Postgres). */
export interface MemoryItem {
  id: string;
  namespace: Namespace;
  /** Short preview for list views. */
  snippet?: string;
  /** Full text — fetched on demand for the detail view, never cached in Postgres. */
  content?: string;
  /** Provenance: where this knowledge came from. */
  source: string;
  /** Walrus blob id backing this item. */
  blobId: string;
  createdAt: string;
  /** Semantic distance from the query (lower = closer); present on recall results. */
  distance?: number;
}

/** A connected AI tool (= on-chain delegate key). Never carries the key secret. */
export interface ConnectedApp {
  id: string;
  label: string;
  allowedNamespaces: Namespace[];
  status: ConnectedAppStatus;
  createdAt: string;
  revokedAt?: string | null;
}

/** Status of an ingestion run (poll until `ready` — eventual consistency). */
export interface IngestionJob {
  id: string;
  sourceType: SourceType;
  namespace: Namespace;
  status: IngestionStatus;
  error?: string | null;
}

/** An entry in the reviewable activity history. */
export interface AuditEntry {
  action: AuditAction;
  target: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/** Metadata for an uploaded document (the raw bytes live on Walrus). */
export interface DocumentMeta {
  id: string;
  namespace: Namespace;
  filename: string;
  mime: string;
  size: number;
  createdAt: string;
}

/**
 * A marketplace listing: a scoped, revocable license over the seller's soul.
 * What is sold is ACCESS — a delegate key on the seller's `memwal::account`,
 * scoped to `scope` (relayer-enforced) — never the memory bytes themselves.
 */
export interface SoulListing {
  id: string;
  sellerHandle: string | null;
  sellerAddress: string;
  /** Short seller-written pitch, e.g. "Full-stack engineer, 8y of repos". */
  title: string;
  scope: Namespace[];
  /** Price in MIST as a decimal string ("0" is not allowed for listings). */
  priceMist: string;
  status: ListingStatus;
  /** How many licenses this listing has sold. */
  salesCount: number;
  /** True when the caller owns this listing. */
  mine?: boolean;
  createdAt: string;
}

/** A soul you acquired — bought on the market or received as a gift. */
export interface SoulAcquisition {
  id: string;
  kind: AcquisitionKind;
  listingId: string | null;
  title: string;
  sellerHandle: string | null;
  sellerAddress: string;
  /** The seller's MemWalAccount object — the `x-memwal-account-id` your AI uses. */
  sellerAccountObjectId: string;
  scope: Namespace[];
  /** "0" for gifts. */
  priceMist: string;
  /** Payment transaction digest (simulated by the mock chain in dev mode). */
  txDigest: string | null;
  /** Explorer link for the payment tx, when available. */
  explorerUrl?: string | null;
  /** Delegate-key state on the seller's account — the seller can revoke. */
  status: ConnectedAppStatus;
  /** False until the one-time MCP credential reveal has been used. */
  claimed: boolean;
  createdAt: string;
}

/** A sale of one of your listings, as seen by the seller. */
export interface SoulSale {
  acquisitionId: string;
  listingId: string | null;
  kind: AcquisitionKind;
  buyerHandle: string | null;
  buyerAddress: string;
  scope: Namespace[];
  priceMist: string;
  txDigest: string | null;
  /** The connected-app (delegate key) backing this sale — revocable in Permissions. */
  appId: string;
  status: ConnectedAppStatus;
  createdAt: string;
}

/**
 * Vault status for the signed-in user. `params` carries everything a NEW device needs to
 * re-derive the key from the passphrase — all public by design (the passphrase is the secret).
 */
export interface VaultStatus {
  configured: boolean;
  params?: VaultKdfParams;
  itemCount: number;
  createdAt?: string;
}

/**
 * A private (zero-plaintext) memory item's METADATA. The content is an encrypted envelope on
 * Walrus; the server can list these but can never read them. Private items are NOT semantically
 * indexed and never surface in AI recall/MCP — that trade-off is the feature.
 */
export interface VaultItemMeta {
  id: string;
  namespace: Namespace;
  /** User-chosen plaintext label — the only content-bearing field the server can read. */
  label: string;
  kind: VaultItemKind;
  /** Pre-encryption size in bytes (text byte-length or file size). */
  sizeBytes: number;
  /** Walrus blob holding the raw envelope JSON — fetchable + decryptable without Soul. */
  walrusBlobId: string;
  scheme: VaultEnvelope["scheme"];
  createdAt: string;
}

/** Detail view: metadata + the envelope itself, for client-side decryption. */
export interface VaultItemDetail extends VaultItemMeta {
  envelope: VaultEnvelope;
}

/** Portability proof for the vault: every envelope re-read from Walrus and hash-checked. */
export interface VaultVerifyResult {
  intact: boolean;
  verified: number;
  total: number;
  missing: string[];
}

/** MCP connection config issued to a connected client (hosted HTTP + local stdio). */
export interface McpConnectionConfig {
  hosted: {
    url: string;
    headers: {
      Authorization: string;
      "x-memwal-account-id": string;
    };
  };
  stdio: {
    command: string;
    args: string[];
    credentialsPath: string;
  };
  /** The six MemWal MCP tools — no `ask`. */
  tools: readonly string[];
}
