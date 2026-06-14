/*
 * Ports (hexagonal interfaces) for the Soul API service layer.
 *
 * Everything the routes need is expressed here; concrete adapters are either MOCK (dev-mode,
 * in-memory, zero external services) or LIVE (Sui Stack). Selected by `config.live` in
 * container.ts. Internal record types are app-level (decoupled from Drizzle row shapes); the
 * Drizzle repo maps rows ↔ records. See research.md "Runnable-without-creds architecture".
 */
import type {
  AcquisitionKind,
  AuditAction,
  ConnectedAppStatus,
  IngestionStatus,
  ListingStatus,
  MemoryItem,
  Namespace,
  SourceType,
  VaultItemKind,
  VaultKdfParams,
} from "@soul/shared";

// ---------- internal records (metadata/index only) ----------

export interface UserRecord {
  id: string;
  suiAddress: string;
  /** The Soul handle (rendered `<username>.soul`); null until claimed. */
  username?: string | null;
  /** Sign-in provider: "google" | "dev" | … */
  authProvider?: string | null;
  oauthSubject?: string | null;
  displayName?: string | null;
  suinsName?: string | null;
  /** Session generation; tokens minted under an older epoch are rejected (logout bumps it). */
  sessionEpoch: number;
  createdAt: string;
}

export interface AccountRecord {
  id: string;
  userId: string;
  accountObjectId: string;
  ownerAddress: string;
  active: boolean;
  /** Soul's own primary delegate key for this account (used for the owner's web-UI memory ops). */
  primaryDelegatePublicKey?: string | null;
  primaryDelegateSecretEnc?: Uint8Array | null;
  createdAt: string;
}

export interface JobRecord {
  id: string;
  userId: string;
  sourceType: SourceType;
  namespace: Namespace;
  memwalJobId?: string | null;
  status: IngestionStatus;
  error?: string | null;
  sourceHash?: string | null;
  createdAt: string;
}

export interface DocRecord {
  id: string;
  userId: string;
  namespace: Namespace;
  filename: string;
  walrusBlobId: string;
  mime: string;
  size: number;
  contentHash?: string | null;
  createdAt: string;
}

export interface AppRecord {
  id: string;
  userId: string;
  delegatePublicKey: string;
  delegateAddress: string;
  /** Encrypted at rest; never logged or returned (Principle IX). */
  delegateSecretEnc: Uint8Array;
  label: string;
  allowedNamespaces: Namespace[];
  status: ConnectedAppStatus;
  createdAt: string;
  revokedAt?: string | null;
}

export interface AuditRecord {
  id: string;
  userId: string;
  action: AuditAction;
  target?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * A marketplace listing. What is sold is ACCESS — a scoped, revocable delegate key on the
 * seller's `memwal::account` — never the memory bytes (CLAUDE.md decisions #3/#5).
 */
export interface ListingRecord {
  id: string;
  sellerUserId: string;
  title: string;
  scope: Namespace[];
  /** Price in MIST as a decimal string (bigint-safe). */
  priceMist: string;
  status: ListingStatus;
  salesCount: number;
  createdAt: string;
}

/**
 * An acquired soul (purchase or gift) from the buyer/recipient's side. The delegate key it
 * references lives as an AppRecord on the SELLER's account. For purchases the secret is shown
 * once at buy time and never stored; for gifts it is stored encrypted-at-rest until the
 * recipient claims it, then wiped (Principle IX).
 */
export interface AcquisitionRecord {
  id: string;
  kind: AcquisitionKind;
  listingId?: string | null;
  title: string;
  buyerUserId: string;
  sellerUserId: string;
  /** The connected-app (delegate key) on the seller's account backing this acquisition. */
  appId: string;
  scope: Namespace[];
  /** "0" for gifts. */
  priceMist: string;
  txDigest?: string | null;
  /** True once the one-time credential reveal has been used (purchases start claimed). */
  claimed: boolean;
  /** Gift secret, encrypted at rest; null/empty once claimed. Never logged or returned raw. */
  delegateSecretEnc?: Uint8Array | null;
  createdAt: string;
}

/**
 * Zero-plaintext vault config (one per user). Holds only the PUBLIC key-derivation parameters the
 * browser needs to re-derive the vault key from the passphrase — the key itself never exists
 * server-side, so the server can never read vault content.
 */
export interface VaultRecord {
  userId: string;
  kdfParams: VaultKdfParams;
  createdAt: string;
}

/**
 * A private memory item: a client-encrypted envelope on Walrus, indexed here. Label/namespace/
 * kind/size are the only things Soul can see — by design (CLAUDE.md decision #4).
 */
export interface VaultItemRecord {
  id: string;
  userId: string;
  namespace: Namespace;
  label: string;
  kind: VaultItemKind;
  sizeBytes: number;
  walrusBlobId: string;
  /** SHA-256 of the canonical envelope JSON; Portability re-reads the blob and re-checks it. */
  envelopeHash: string;
  scheme: string;
  createdAt: string;
}

/** Metadata only — the answers themselves live in the Walrus blob (walrusBlobId). */
export interface PersonalContextRecord {
  userId: string;
  walrusBlobId: string | null;
  answeredCount: number;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------- ports ----------

export interface SessionUser {
  userId: string;
  suiAddress: string;
}

export interface SoulRepo {
  // users
  getUserBySuiAddress(suiAddress: string): Promise<UserRecord | null>;
  getUserById(id: string): Promise<UserRecord | null>;
  getUserByUsername(username: string): Promise<UserRecord | null>;
  createUser(input: {
    suiAddress: string;
    authProvider?: string;
    oauthSubject?: string;
    displayName?: string;
  }): Promise<UserRecord>;
  /** Claim/set the Soul handle for a user. Throws on uniqueness violation (caller pre-checks). */
  setUsername(userId: string, username: string): Promise<void>;
  /** Record the sign-in provider (e.g. "google"). Used to lazily backfill on login. */
  setAuthProvider(userId: string, provider: string): Promise<void>;
  /** Invalidate every outstanding session token for the user; returns the new epoch. */
  bumpSessionEpoch(userId: string): Promise<number>;
  // accounts
  getAccountByUserId(userId: string): Promise<AccountRecord | null>;
  /** Look up an account by its on-chain object id (used by MCP delegate-key auth). */
  getAccountByObjectId(accountObjectId: string): Promise<AccountRecord | null>;
  createAccount(input: Omit<AccountRecord, "id" | "createdAt">): Promise<AccountRecord>;
  setAccountActive(userId: string, active: boolean): Promise<void>;
  // namespaces
  ensureNamespaces(userId: string): Promise<void>;
  // ingestion jobs
  createJob(
    input: Pick<JobRecord, "userId" | "sourceType" | "namespace" | "sourceHash"> &
      Partial<JobRecord>
  ): Promise<JobRecord>;
  updateJob(id: string, patch: Partial<JobRecord>): Promise<void>;
  getJob(userId: string, id: string): Promise<JobRecord | null>;
  listJobs(userId: string): Promise<JobRecord[]>;
  findJobBySourceHash(userId: string, sourceHash: string): Promise<JobRecord | null>;
  // documents
  createDocument(input: Omit<DocRecord, "id" | "createdAt">): Promise<DocRecord>;
  findDocumentByContentHash(userId: string, contentHash: string): Promise<DocRecord | null>;
  // connected apps (delegate keys)
  createConnectedApp(
    input: Omit<AppRecord, "id" | "createdAt" | "status" | "revokedAt"> & Partial<AppRecord>
  ): Promise<AppRecord>;
  getConnectedApp(userId: string, id: string): Promise<AppRecord | null>;
  listConnectedApps(userId: string): Promise<AppRecord[]>;
  countActiveApps(userId: string): Promise<number>;
  revokeApp(userId: string, id: string): Promise<void>;
  // audit
  addAudit(input: {
    userId: string;
    action: AuditAction;
    target?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  /** Newest first; `limit` bounds the response (the log grows forever). */
  listAudit(userId: string, limit?: number): Promise<AuditRecord[]>;
  // marketplace listings
  createListing(
    input: Omit<ListingRecord, "id" | "createdAt" | "status" | "salesCount"> &
      Partial<ListingRecord>
  ): Promise<ListingRecord>;
  getListing(id: string): Promise<ListingRecord | null>;
  listActiveListings(): Promise<ListingRecord[]>;
  listListingsByUser(userId: string): Promise<ListingRecord[]>;
  setListingStatus(id: string, status: ListingStatus): Promise<void>;
  incrementListingSales(id: string): Promise<void>;
  // marketplace acquisitions (purchases + gifts)
  createAcquisition(input: Omit<AcquisitionRecord, "id" | "createdAt">): Promise<AcquisitionRecord>;
  getAcquisition(id: string): Promise<AcquisitionRecord | null>;
  listAcquisitionsByBuyer(buyerUserId: string): Promise<AcquisitionRecord[]>;
  listAcquisitionsBySeller(sellerUserId: string): Promise<AcquisitionRecord[]>;
  /**
   * One-time reveal bookkeeping: atomically wipe delegateSecretEnc + set claimed, but ONLY if
   * still unclaimed. Returns true when this call won the claim — concurrent claimers get false,
   * so a gift secret can never be revealed twice (the caller decrypts its pre-read copy only
   * after winning).
   */
  claimAcquisition(id: string): Promise<boolean>;
  /** Principle IX hygiene: drop any stored (gift) secret backing a revoked delegate key. */
  wipeAcquisitionSecretsForApp(appId: string): Promise<void>;
  // zero-plaintext vault (server stores public KDF params + envelope metadata, never the key)
  getVault(userId: string): Promise<VaultRecord | null>;
  /** One vault per user; returns null when one already exists (caller answers 409). */
  createVault(input: Omit<VaultRecord, "createdAt">): Promise<VaultRecord | null>;
  createVaultItem(input: Omit<VaultItemRecord, "id" | "createdAt">): Promise<VaultItemRecord>;
  getVaultItem(userId: string, id: string): Promise<VaultItemRecord | null>;
  /** Newest first; optionally filtered to one namespace. */
  listVaultItems(userId: string, namespace?: Namespace): Promise<VaultItemRecord[]>;
  /** True if a row was deleted (the Walrus envelope is immutable — disclose, as with memory). */
  deleteVaultItem(userId: string, id: string): Promise<boolean>;
  countVaultItems(userId: string): Promise<number>;
  // personal context METADATA (the soul's answers live on Walrus; recall facts in MemWal)
  getPersonalContext(userId: string): Promise<PersonalContextRecord | null>;
  upsertPersonalContext(input: {
    userId: string;
    walrusBlobId: string | null;
    answeredCount: number;
    completed: boolean;
  }): Promise<PersonalContextRecord>;
}

export interface AuthProvider {
  /**
   * Verify a session token (Enoki zkLogin in live mode) → the verified Sui address, or null.
   * `epoch` is the session generation the token was minted under (undefined for tokens that
   * predate / opt out of revocation, e.g. dev sessions); requireSession compares it against
   * the user's current sessionEpoch.
   */
  verify(token: string | undefined): Promise<{ suiAddress: string; epoch?: number } | null>;
  /** Dev-only: mint a session token for a Sui address (used by the dev login button + tests). */
  devSession(suiAddress?: string): Promise<{ token: string; suiAddress: string }>;
  /**
   * Live only: verify a Google/zkLogin OAuth JWT via Enoki and return the verified Sui address.
   * Present on the Enoki adapter; undefined on the mock adapter (dev uses devSession instead).
   */
  loginWithOAuth?(jwt: string): Promise<{ suiAddress: string }>;
  /** Live only: mint a server session token for an already-verified address. */
  issueSession?(suiAddress: string, epoch?: number): Promise<{ token: string }>;
}

export interface ChainService {
  /** Create one MemWalAccount for the owner (sponsored). */
  createAccount(ownerAddress: string): Promise<{ accountObjectId: string }>;
  /** Generate a fresh Ed25519 delegate keypair (private key hex + 32-byte pubkey + Sui address). */
  generateDelegateKey(): Promise<{ privateKeyHex: string; publicKey: Uint8Array; address: string }>;
  // `ownerAddress` (the user's identity) is threaded through so the live adapter can re-derive the
  // per-user on-chain owner keypair that must sign the account's mutations (managed-custodial mode).
  addDelegateKey(args: {
    accountObjectId: string;
    publicKey: Uint8Array;
    delegateAddress: string;
    label: string;
    ownerAddress: string;
  }): Promise<void>;
  removeDelegateKey(args: {
    accountObjectId: string;
    publicKey: Uint8Array;
    ownerAddress: string;
  }): Promise<void>;
  setAccountActive(args: {
    accountObjectId: string;
    active: boolean;
    ownerAddress: string;
  }): Promise<void>;
  /**
   * Marketplace payment: transfer SUI from the buyer to the seller. Mock mode fabricates a
   * deterministic digest; live mode builds a split+transfer PTB signed by the buyer's derived
   * owner keypair with service-sponsored gas (managed-custodial mode).
   */
  transferSui(args: {
    fromAddress: string;
    toAddress: string;
    amountMist: string;
  }): Promise<{ digest: string }>;
  explorerUrl(objectId: string): string;
}

export interface MemoryEngine {
  /**
   * What this engine can honestly do. The MemWal managed relayer has no delete primitive and
   * no list-without-query (live-cutover blocker #2), so routes must consult these instead of
   * pretending — `delete: false` means remove() is a no-op, `browse: false` means an empty
   * query recalls nothing.
   */
  readonly capabilities: { delete: boolean; browse: boolean };
  analyze(args: {
    delegateKeyHex: string;
    accountId: string;
    namespace: Namespace;
    text: string;
    source?: string;
  }): Promise<{ jobIds: string[]; factCount: number }>;
  remember(args: {
    delegateKeyHex: string;
    accountId: string;
    namespace: Namespace;
    text: string;
    source?: string;
  }): Promise<{ jobId: string }>;
  waitForJob(args: {
    delegateKeyHex: string;
    accountId: string;
    jobId: string;
  }): Promise<{ status: "ready" | "error"; blobId?: string; error?: string }>;
  recall(args: {
    delegateKeyHex: string;
    accountId: string;
    namespaces: Namespace[];
    query: string;
    limit?: number;
  }): Promise<MemoryItem[]>;
  get(args: { delegateKeyHex: string; accountId: string; id: string }): Promise<MemoryItem | null>;
  remove(args: { delegateKeyHex: string; accountId: string; id: string }): Promise<void>;
  restore(args: {
    delegateKeyHex: string;
    accountId: string;
    namespace?: Namespace;
  }): Promise<{ restored: number; skipped: number; total: number }>;
  verify(args: {
    delegateKeyHex: string;
    accountId: string;
  }): Promise<{ intact: boolean; verified: number; total: number; missing: string[] }>;
  compatibility(): Promise<{ ok: boolean; detail?: string }>;
}

export interface BlobStore {
  write(bytes: Uint8Array, opts?: { mime?: string }): Promise<{ blobId: string }>;
  read(blobId: string): Promise<Uint8Array>;
}
