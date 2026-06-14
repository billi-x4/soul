/*
 * In-memory SoulRepo — dev-mode metadata/index store (no external Postgres needed).
 * Mirrors the @soul/db schema shapes via the app-level records in ports.ts. The live cutover
 * swaps this for a Drizzle-backed repo (same interface). Data is per-process and non-durable —
 * which is fine for dev/demo; durability is the live repo's job (Source-of-Truth: Walrus + on-chain).
 */
import { newId } from "@soul/id";
import { NAMESPACES } from "@soul/shared";
import type {
  AccountRecord,
  AcquisitionRecord,
  AppRecord,
  AuditRecord,
  DocRecord,
  JobRecord,
  ListingRecord,
  PersonalContextRecord,
  SoulRepo,
  UserRecord,
  VaultItemRecord,
  VaultRecord,
} from "../ports";

const now = () => new Date().toISOString();

export class InMemoryRepo implements SoulRepo {
  private users = new Map<string, UserRecord>();
  private accounts = new Map<string, AccountRecord>(); // by userId
  private namespaces = new Map<string, Set<string>>(); // userId -> names
  private jobs = new Map<string, JobRecord>();
  private documents = new Map<string, DocRecord>();
  private apps = new Map<string, AppRecord>();
  private audits: AuditRecord[] = [];
  private listings = new Map<string, ListingRecord>();
  private acquisitions = new Map<string, AcquisitionRecord>();
  private personalCtx = new Map<string, PersonalContextRecord>(); // by userId
  private vaults = new Map<string, VaultRecord>(); // by userId
  private vaultItems = new Map<string, VaultItemRecord>();

  async getUserBySuiAddress(suiAddress: string): Promise<UserRecord | null> {
    for (const u of this.users.values()) {
      if (u.suiAddress === suiAddress) {
        return u;
      }
    }
    return null;
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async getUserByUsername(username: string): Promise<UserRecord | null> {
    for (const u of this.users.values()) {
      if (u.username === username) {
        return u;
      }
    }
    return null;
  }

  async createUser(input: {
    suiAddress: string;
    authProvider?: string;
    oauthSubject?: string;
    displayName?: string;
  }): Promise<UserRecord> {
    const user: UserRecord = {
      id: newId("user"),
      suiAddress: input.suiAddress,
      username: null,
      authProvider: input.authProvider ?? null,
      oauthSubject: input.oauthSubject ?? null,
      displayName: input.displayName ?? null,
      suinsName: null,
      sessionEpoch: 0,
      createdAt: now(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async setUsername(userId: string, username: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.username = username;
    }
  }

  async setAuthProvider(userId: string, provider: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.authProvider = provider;
    }
  }

  async bumpSessionEpoch(userId: string): Promise<number> {
    const user = this.users.get(userId);
    if (!user) {
      return 0;
    }
    user.sessionEpoch += 1;
    return user.sessionEpoch;
  }

  async getAccountByUserId(userId: string): Promise<AccountRecord | null> {
    return this.accounts.get(userId) ?? null;
  }

  async getAccountByObjectId(accountObjectId: string): Promise<AccountRecord | null> {
    for (const a of this.accounts.values()) {
      if (a.accountObjectId === accountObjectId) {
        return a;
      }
    }
    return null;
  }

  async createAccount(input: Omit<AccountRecord, "id" | "createdAt">): Promise<AccountRecord> {
    const account: AccountRecord = { id: newId("account"), createdAt: now(), ...input };
    this.accounts.set(account.userId, account);
    return account;
  }

  async setAccountActive(userId: string, active: boolean): Promise<void> {
    const acc = this.accounts.get(userId);
    if (acc) {
      acc.active = active;
    }
  }

  async ensureNamespaces(userId: string): Promise<void> {
    if (!this.namespaces.has(userId)) {
      this.namespaces.set(userId, new Set(NAMESPACES));
    }
  }

  async createJob(
    input: Pick<JobRecord, "userId" | "sourceType" | "namespace" | "sourceHash"> &
      Partial<JobRecord>
  ): Promise<JobRecord> {
    const job: JobRecord = {
      id: newId("job"),
      userId: input.userId,
      sourceType: input.sourceType,
      namespace: input.namespace,
      memwalJobId: input.memwalJobId ?? null,
      status: input.status ?? "pending",
      error: input.error ?? null,
      sourceHash: input.sourceHash ?? null,
      createdAt: now(),
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async updateJob(id: string, patch: Partial<JobRecord>): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      this.jobs.set(id, { ...job, ...patch });
    }
  }

  async getJob(userId: string, id: string): Promise<JobRecord | null> {
    const job = this.jobs.get(id);
    return job && job.userId === userId ? job : null;
  }

  async listJobs(userId: string): Promise<JobRecord[]> {
    return [...this.jobs.values()]
      .filter((j) => j.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findJobBySourceHash(userId: string, sourceHash: string): Promise<JobRecord | null> {
    // Newest first, so a successful retry shadows an earlier errored attempt.
    let latest: JobRecord | null = null;
    for (const j of this.jobs.values()) {
      if (j.userId === userId && j.sourceHash === sourceHash) {
        if (!latest || j.createdAt > latest.createdAt) {
          latest = j;
        }
      }
    }
    return latest;
  }

  async createDocument(input: Omit<DocRecord, "id" | "createdAt">): Promise<DocRecord> {
    const doc: DocRecord = { id: newId("document"), createdAt: now(), ...input };
    this.documents.set(doc.id, doc);
    return doc;
  }

  async findDocumentByContentHash(userId: string, contentHash: string): Promise<DocRecord | null> {
    for (const d of this.documents.values()) {
      if (d.userId === userId && d.contentHash === contentHash) {
        return d;
      }
    }
    return null;
  }

  async createConnectedApp(
    input: Omit<AppRecord, "id" | "createdAt" | "status" | "revokedAt"> & Partial<AppRecord>
  ): Promise<AppRecord> {
    const app: AppRecord = {
      id: newId("app"),
      userId: input.userId,
      delegatePublicKey: input.delegatePublicKey,
      delegateAddress: input.delegateAddress,
      delegateSecretEnc: input.delegateSecretEnc,
      label: input.label,
      allowedNamespaces: input.allowedNamespaces,
      status: input.status ?? "active",
      createdAt: now(),
      revokedAt: input.revokedAt ?? null,
    };
    this.apps.set(app.id, app);
    return app;
  }

  async getConnectedApp(userId: string, id: string): Promise<AppRecord | null> {
    const app = this.apps.get(id);
    return app && app.userId === userId ? app : null;
  }

  async listConnectedApps(userId: string): Promise<AppRecord[]> {
    return [...this.apps.values()]
      .filter((a) => a.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async countActiveApps(userId: string): Promise<number> {
    return [...this.apps.values()].filter((a) => a.userId === userId && a.status === "active")
      .length;
  }

  async revokeApp(userId: string, id: string): Promise<void> {
    const app = this.apps.get(id);
    if (app && app.userId === userId) {
      app.status = "revoked";
      app.revokedAt = now();
      // Drop the at-rest secret on revoke (Principle IX).
      app.delegateSecretEnc = new Uint8Array(0);
    }
  }

  async addAudit(input: {
    userId: string;
    action: AuditRecord["action"];
    target?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    this.audits.push({
      id: newId("audit"),
      userId: input.userId,
      action: input.action,
      target: input.target ?? null,
      metadata: input.metadata ?? null,
      createdAt: now(),
    });
  }

  async listAudit(userId: string, limit?: number): Promise<AuditRecord[]> {
    const all = this.audits
      .filter((a) => a.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return limit !== undefined ? all.slice(0, limit) : all;
  }

  async createListing(
    input: Omit<ListingRecord, "id" | "createdAt" | "status" | "salesCount"> &
      Partial<ListingRecord>
  ): Promise<ListingRecord> {
    const listing: ListingRecord = {
      id: newId("listing"),
      sellerUserId: input.sellerUserId,
      title: input.title,
      scope: input.scope,
      priceMist: input.priceMist,
      status: input.status ?? "active",
      salesCount: input.salesCount ?? 0,
      createdAt: now(),
    };
    this.listings.set(listing.id, listing);
    return listing;
  }

  async getListing(id: string): Promise<ListingRecord | null> {
    return this.listings.get(id) ?? null;
  }

  async listActiveListings(): Promise<ListingRecord[]> {
    return [...this.listings.values()]
      .filter((l) => l.status === "active")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listListingsByUser(userId: string): Promise<ListingRecord[]> {
    return [...this.listings.values()]
      .filter((l) => l.sellerUserId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async setListingStatus(id: string, status: ListingRecord["status"]): Promise<void> {
    const listing = this.listings.get(id);
    if (listing) {
      listing.status = status;
    }
  }

  async incrementListingSales(id: string): Promise<void> {
    const listing = this.listings.get(id);
    if (listing) {
      listing.salesCount += 1;
    }
  }

  async createAcquisition(
    input: Omit<AcquisitionRecord, "id" | "createdAt">
  ): Promise<AcquisitionRecord> {
    const acq: AcquisitionRecord = {
      id: newId("acq"),
      kind: input.kind,
      listingId: input.listingId ?? null,
      title: input.title,
      buyerUserId: input.buyerUserId,
      sellerUserId: input.sellerUserId,
      appId: input.appId,
      scope: input.scope,
      priceMist: input.priceMist,
      txDigest: input.txDigest ?? null,
      claimed: input.claimed,
      delegateSecretEnc: input.delegateSecretEnc ?? null,
      createdAt: now(),
    };
    this.acquisitions.set(acq.id, acq);
    return acq;
  }

  async getAcquisition(id: string): Promise<AcquisitionRecord | null> {
    return this.acquisitions.get(id) ?? null;
  }

  async listAcquisitionsByBuyer(buyerUserId: string): Promise<AcquisitionRecord[]> {
    return [...this.acquisitions.values()]
      .filter((a) => a.buyerUserId === buyerUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listAcquisitionsBySeller(sellerUserId: string): Promise<AcquisitionRecord[]> {
    return [...this.acquisitions.values()]
      .filter((a) => a.sellerUserId === sellerUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async claimAcquisition(id: string): Promise<boolean> {
    const acq = this.acquisitions.get(id);
    // Check-and-set with no await in between: atomic on the single-threaded runtime, so two
    // interleaved claim requests cannot both win (one-time reveal, Principle IX).
    if (!acq || acq.claimed) {
      return false;
    }
    acq.claimed = true;
    acq.delegateSecretEnc = null;
    return true;
  }

  async wipeAcquisitionSecretsForApp(appId: string): Promise<void> {
    for (const acq of this.acquisitions.values()) {
      if (acq.appId === appId && acq.delegateSecretEnc) {
        // The key was revoked on-chain; its stored gift secret is dead weight — drop it.
        acq.delegateSecretEnc = null;
      }
    }
  }

  async getVault(userId: string): Promise<VaultRecord | null> {
    return this.vaults.get(userId) ?? null;
  }

  async createVault(input: Omit<VaultRecord, "createdAt">): Promise<VaultRecord | null> {
    // Check-and-set with no await between: a vault is created exactly once per user.
    if (this.vaults.has(input.userId)) {
      return null;
    }
    const vault: VaultRecord = { ...input, createdAt: now() };
    this.vaults.set(vault.userId, vault);
    return vault;
  }

  async createVaultItem(input: Omit<VaultItemRecord, "id" | "createdAt">): Promise<VaultItemRecord> {
    const item: VaultItemRecord = { id: newId("vaultItem"), createdAt: now(), ...input };
    this.vaultItems.set(item.id, item);
    return item;
  }

  async getVaultItem(userId: string, id: string): Promise<VaultItemRecord | null> {
    const item = this.vaultItems.get(id);
    return item && item.userId === userId ? item : null;
  }

  async listVaultItems(userId: string, namespace?: VaultItemRecord["namespace"]) {
    return [...this.vaultItems.values()]
      .filter((i) => i.userId === userId && (!namespace || i.namespace === namespace))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteVaultItem(userId: string, id: string): Promise<boolean> {
    const item = this.vaultItems.get(id);
    if (!item || item.userId !== userId) {
      return false;
    }
    this.vaultItems.delete(id);
    return true;
  }

  async countVaultItems(userId: string): Promise<number> {
    return [...this.vaultItems.values()].filter((i) => i.userId === userId).length;
  }

  async getPersonalContext(userId: string): Promise<PersonalContextRecord | null> {
    return this.personalCtx.get(userId) ?? null;
  }

  async upsertPersonalContext(input: {
    userId: string;
    walrusBlobId: string | null;
    answeredCount: number;
    completed: boolean;
  }): Promise<PersonalContextRecord> {
    const existing = this.personalCtx.get(input.userId);
    const rec: PersonalContextRecord = {
      userId: input.userId,
      walrusBlobId: input.walrusBlobId,
      answeredCount: input.answeredCount,
      completed: input.completed,
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now(),
    };
    this.personalCtx.set(input.userId, rec);
    return rec;
  }
}
