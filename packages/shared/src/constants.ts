/*
 * Soul shared constants + the unions derived from them. Single source of truth for
 * the namespace / status / action value sets used by both apps and the DB schema.
 * See docs/soul-architecture/SKILL.md §6 (data model) and CLAUDE.md §4.
 */

/** The three memory areas (one namespace per data domain). */
export const NAMESPACES = ["bio", "docs", "social"] as const;
export type Namespace = (typeof NAMESPACES)[number];

/** Where an ingestion run came from. GitHub imports land in the `social` namespace. */
export const SOURCE_TYPES = ["paste", "document", "github", "social"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/**
 * Ingestion job lifecycle. MemWal writes are eventually consistent: `remember`/`analyze`
 * return a job id and run async, so a job is only guaranteed queryable once `ready`.
 */
export const INGESTION_STATUSES = ["pending", "processing", "ready", "error"] as const;
export type IngestionStatus = (typeof INGESTION_STATUSES)[number];

/** A connected app (= on-chain delegate key) is either active or revoked. */
export const CONNECTED_APP_STATUSES = ["active", "revoked"] as const;
export type ConnectedAppStatus = (typeof CONNECTED_APP_STATUSES)[number];

/** Auditable actions recorded in the activity history (FR-027 + marketplace). */
export const AUDIT_ACTIONS = [
  "grant",
  "revoke",
  "freeze",
  "unfreeze",
  "ingest",
  "restore",
  "list",
  "unlist",
  "purchase",
  "gift",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/* ----------------------------- marketplace ------------------------------ */

/** A listing stays active (multiple buyers may license it) until cancelled. */
export const LISTING_STATUSES = ["active", "cancelled"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/** How an acquired soul reached you: bought on the market, or sent as a gift. */
export const ACQUISITION_KINDS = ["purchase", "gift"] as const;
export type AcquisitionKind = (typeof ACQUISITION_KINDS)[number];

/** SUI's smallest unit. Prices are carried as MIST strings (bigint-safe). */
export const MIST_PER_SUI = 1_000_000_000;

/** Max delegate keys per MemWalAccount — the `memwal::account` on-chain cap (FR-028). */
export const MAX_DELEGATE_KEYS = 20;

/**
 * Max CONNECTED apps per account. One on-chain slot is permanently held by Soul's own primary
 * web key (minted at provisioning), so only the remaining slots are grantable/sellable.
 */
export const MAX_CONNECTED_APPS = MAX_DELEGATE_KEYS - 1;

/** Server-enforced input ceilings (mirrored client-side for friendlier errors). */
export const MAX_INGEST_TEXT_CHARS = 100_000;
export const MAX_MEMORY_EDIT_CHARS = 20_000;
export const MAX_LISTING_TITLE_CHARS = 120;

/* ------------------------- zero-plaintext vault -------------------------- */

/**
 * The private-vault envelope scheme. Content is encrypted IN THE BROWSER before upload; the API,
 * relayer, and Walrus only ever see this envelope. "aes-256-gcm" is the WebCrypto scheme shipped
 * today; the field exists so a Seal / MemWal-manual-mode scheme can slot in without a data
 * migration (CLAUDE.md decision #4 — zero-plaintext path).
 */
export const VAULT_SCHEME = "aes-256-gcm" as const;
export const VAULT_KDF = "pbkdf2-sha256" as const;
/** OWASP-recommended PBKDF2-SHA-256 work factor; stored per-vault so it can rise over time. */
export const VAULT_PBKDF2_ITERATIONS = 310_000;
/** Known constant sealed at setup; decrypting it proves a passphrase without storing the key. */
export const VAULT_CHECK_PLAINTEXT = "soul-vault-check-v1";
export const MIN_VAULT_PASSPHRASE_CHARS = 8;

/** What a private item holds (inside the encrypted payload, invisible to the server). */
export const VAULT_ITEM_KINDS = ["text", "file"] as const;
export type VaultItemKind = (typeof VAULT_ITEM_KINDS)[number];

/** Pre-encryption ceilings (mirror managed-mode caps). */
export const MAX_VAULT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_VAULT_LABEL_CHARS = 160;
/**
 * Wire ceiling for one envelope. File bytes are base64'd TWICE (into the payload's dataB64,
 * then the AES-GCM ciphertext into ctB64), so a 10 MB file ≈ 10 × 4/3 × 4/3 ≈ 17.8 MB envelope.
 * 20 MB covers that worst case with headroom.
 */
export const MAX_VAULT_ENVELOPE_BYTES = 20 * 1024 * 1024;

/** A sealed envelope — the ONLY form private content ever takes outside the browser. */
export interface VaultEnvelope {
  v: 1;
  scheme: typeof VAULT_SCHEME;
  ivB64: string;
  ctB64: string;
}

/** Public KDF parameters + key-check; stored server-side so any device can unlock. NOT secret. */
export interface VaultKdfParams {
  saltB64: string;
  iterations: number;
  kdf: typeof VAULT_KDF;
  scheme: typeof VAULT_SCHEME;
  checkEnvelope: VaultEnvelope;
}

/** The plaintext shape sealed inside an envelope. Exists only in the browser. */
export interface VaultPayload {
  kind: VaultItemKind;
  /** kind === "text" */
  text?: string;
  /** kind === "file" */
  filename?: string;
  mime?: string;
  dataB64?: string;
}
/** 10^19 MIST ≈ the total SUI supply; longer digit strings are nonsense prices. */
export const MAX_PRICE_MIST_DIGITS = 20;

/** Runtime guard shared by API routes and web forms (single source of truth). */
export function isNamespace(value: unknown): value is Namespace {
  return typeof value === "string" && (NAMESPACES as readonly string[]).includes(value);
}

/** The six MemWal MCP tools. There is intentionally NO `ask` tool (sui-stack SKILL L4b). */
export const MEMWAL_MCP_TOOLS = [
  "memwal_remember",
  "memwal_recall",
  "memwal_analyze",
  "memwal_restore",
  "memwal_login",
  "memwal_logout",
] as const;
export type MemwalMcpTool = (typeof MEMWAL_MCP_TOOLS)[number];
