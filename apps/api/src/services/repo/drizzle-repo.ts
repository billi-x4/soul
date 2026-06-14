/*
 * Drizzle-backed SoulRepo — the LIVE metadata/index store (Supabase Postgres).
 * Same interface as InMemoryRepo; selected by container.ts when config.live. Maps Drizzle rows
 * (Date timestamps, Buffer bytea) <-> the app-level records in ports.ts (ISO strings, Uint8Array).
 *
 * Source-of-Truth reminder: this is a fast, reconstructable cache. Memory content lives on
 * Walrus + MemWal; ownership/permissions are authoritative on Sui. Never store secrets unencrypted.
 */
import {
  and,
  auditLog,
  connectedApps,
  count,
  db,
  desc,
  documents,
  eq,
  ingestionJobs,
  marketAcquisitions,
  marketListings,
  memwalAccounts,
  namespaces,
  personalContext,
  sql,
  users,
  vaultItems,
  vaults,
} from "@soul/db";
import { NAMESPACES, type VaultKdfParams } from "@soul/shared";
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

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : d);
const toBuf = (u: Uint8Array) => Buffer.from(u);
const toBytes = (b: Buffer | Uint8Array | null | undefined) => (b ? new Uint8Array(b) : null);

function mapUser(r: typeof users.$inferSelect): UserRecord {
  return {
    id: r.id,
    suiAddress: r.suiAddress,
    username: r.username,
    authProvider: r.authProvider,
    oauthSubject: r.oauthSubject,
    displayName: r.displayName,
    suinsName: r.suinsName,
    sessionEpoch: r.sessionEpoch,
    createdAt: iso(r.createdAt),
  };
}

function mapAccount(r: typeof memwalAccounts.$inferSelect): AccountRecord {
  return {
    id: r.id,
    userId: r.userId,
    accountObjectId: r.accountObjectId,
    ownerAddress: r.ownerAddress,
    active: r.active,
    primaryDelegatePublicKey: r.primaryDelegatePublicKey,
    primaryDelegateSecretEnc: toBytes(r.primaryDelegateSecretEnc),
    createdAt: iso(r.createdAt),
  };
}

function mapJob(r: typeof ingestionJobs.$inferSelect): JobRecord {
  return {
    id: r.id,
    userId: r.userId,
    sourceType: r.sourceType,
    namespace: r.namespace,
    memwalJobId: r.memwalJobId,
    status: r.status,
    error: r.error,
    sourceHash: r.sourceHash,
    createdAt: iso(r.createdAt),
  };
}

function mapDoc(r: typeof documents.$inferSelect): DocRecord {
  return {
    id: r.id,
    userId: r.userId,
    namespace: r.namespace,
    filename: r.filename,
    walrusBlobId: r.walrusBlobId,
    mime: r.mime,
    size: r.size,
    contentHash: r.contentHash,
    createdAt: iso(r.createdAt),
  };
}

function mapApp(r: typeof connectedApps.$inferSelect): AppRecord {
  return {
    id: r.id,
    userId: r.userId,
    delegatePublicKey: r.delegatePublicKey,
    delegateAddress: r.delegateAddress,
    delegateSecretEnc: new Uint8Array(r.delegateSecretEnc),
    label: r.label,
    allowedNamespaces: r.allowedNamespaces,
    status: r.status,
    createdAt: iso(r.createdAt),
    revokedAt: r.revokedAt ? iso(r.revokedAt) : null,
  };
}

function mapAudit(r: typeof auditLog.$inferSelect): AuditRecord {
  return {
    id: r.id,
    userId: r.userId,
    action: r.action,
    target: r.target,
    metadata: r.metadata ?? null,
    createdAt: iso(r.createdAt),
  };
}

function mapListing(r: typeof marketListings.$inferSelect): ListingRecord {
  return {
    id: r.id,
    sellerUserId: r.sellerUserId,
    title: r.title,
    scope: r.scope,
    priceMist: r.priceMist,
    status: r.status,
    salesCount: r.salesCount,
    createdAt: iso(r.createdAt),
  };
}

function mapAcquisition(r: typeof marketAcquisitions.$inferSelect): AcquisitionRecord {
  return {
    id: r.id,
    kind: r.kind,
    listingId: r.listingId,
    title: r.title,
    buyerUserId: r.buyerUserId,
    sellerUserId: r.sellerUserId,
    appId: r.appId,
    scope: r.scope,
    priceMist: r.priceMist,
    txDigest: r.txDigest,
    claimed: r.claimed,
    delegateSecretEnc: toBytes(r.delegateSecretEnc),
    createdAt: iso(r.createdAt),
  };
}

function mapVault(r: typeof vaults.$inferSelect): VaultRecord {
  return {
    userId: r.userId,
    // jsonb round-trips the VaultKdfParams shape we wrote; the API validates on write.
    kdfParams: r.kdfParams as unknown as VaultKdfParams,
    createdAt: iso(r.createdAt),
  };
}

function mapVaultItem(r: typeof vaultItems.$inferSelect): VaultItemRecord {
  return {
    id: r.id,
    userId: r.userId,
    namespace: r.namespace,
    label: r.label,
    kind: r.kind,
    sizeBytes: r.sizeBytes,
    walrusBlobId: r.walrusBlobId,
    envelopeHash: r.envelopeHash,
    scheme: r.scheme,
    createdAt: iso(r.createdAt),
  };
}

function mapPersonalContext(r: typeof personalContext.$inferSelect): PersonalContextRecord {
  return {
    userId: r.userId,
    walrusBlobId: r.walrusBlobId,
    answeredCount: r.answeredCount,
    completed: r.completed,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

export class DrizzleRepo implements SoulRepo {
  async getUserBySuiAddress(suiAddress: string): Promise<UserRecord | null> {
    const [r] = await db.select().from(users).where(eq(users.suiAddress, suiAddress)).limit(1);
    return r ? mapUser(r) : null;
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    const [r] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return r ? mapUser(r) : null;
  }

  async getUserByUsername(username: string): Promise<UserRecord | null> {
    const [r] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return r ? mapUser(r) : null;
  }

  async createUser(input: {
    suiAddress: string;
    authProvider?: string;
    oauthSubject?: string;
    displayName?: string;
  }): Promise<UserRecord> {
    const [r] = await db
      .insert(users)
      .values({
        suiAddress: input.suiAddress,
        authProvider: input.authProvider ?? null,
        oauthSubject: input.oauthSubject ?? null,
        displayName: input.displayName ?? null,
      })
      .returning();
    return mapUser(r as typeof users.$inferSelect);
  }

  async setUsername(userId: string, username: string): Promise<void> {
    await db.update(users).set({ username }).where(eq(users.id, userId));
  }

  async setAuthProvider(userId: string, provider: string): Promise<void> {
    await db.update(users).set({ authProvider: provider }).where(eq(users.id, userId));
  }

  async bumpSessionEpoch(userId: string): Promise<number> {
    const [r] = await db
      .update(users)
      .set({ sessionEpoch: sql`${users.sessionEpoch} + 1` })
      .where(eq(users.id, userId))
      .returning({ sessionEpoch: users.sessionEpoch });
    return r?.sessionEpoch ?? 0;
  }

  async getAccountByUserId(userId: string): Promise<AccountRecord | null> {
    const [r] = await db
      .select()
      .from(memwalAccounts)
      .where(eq(memwalAccounts.userId, userId))
      .limit(1);
    return r ? mapAccount(r) : null;
  }

  async getAccountByObjectId(accountObjectId: string): Promise<AccountRecord | null> {
    const [r] = await db
      .select()
      .from(memwalAccounts)
      .where(eq(memwalAccounts.accountObjectId, accountObjectId))
      .limit(1);
    return r ? mapAccount(r) : null;
  }

  async createAccount(input: Omit<AccountRecord, "id" | "createdAt">): Promise<AccountRecord> {
    const [r] = await db
      .insert(memwalAccounts)
      .values({
        userId: input.userId,
        accountObjectId: input.accountObjectId,
        ownerAddress: input.ownerAddress,
        active: input.active,
        primaryDelegatePublicKey: input.primaryDelegatePublicKey ?? null,
        primaryDelegateSecretEnc: input.primaryDelegateSecretEnc
          ? toBuf(input.primaryDelegateSecretEnc)
          : null,
      })
      .returning();
    return mapAccount(r as typeof memwalAccounts.$inferSelect);
  }

  async setAccountActive(userId: string, active: boolean): Promise<void> {
    await db.update(memwalAccounts).set({ active }).where(eq(memwalAccounts.userId, userId));
  }

  async ensureNamespaces(userId: string): Promise<void> {
    const existing = await db
      .select({ name: namespaces.name })
      .from(namespaces)
      .where(eq(namespaces.userId, userId));
    const have = new Set(existing.map((e) => e.name));
    const missing = NAMESPACES.filter((n) => !have.has(n));
    if (missing.length > 0) {
      await db.insert(namespaces).values(missing.map((name) => ({ userId, name })));
    }
  }

  async createJob(
    input: Pick<JobRecord, "userId" | "sourceType" | "namespace" | "sourceHash"> &
      Partial<JobRecord>
  ): Promise<JobRecord> {
    const [r] = await db
      .insert(ingestionJobs)
      .values({
        userId: input.userId,
        sourceType: input.sourceType,
        namespace: input.namespace,
        memwalJobId: input.memwalJobId ?? null,
        status: input.status ?? "pending",
        error: input.error ?? null,
        sourceHash: input.sourceHash ?? null,
      })
      .returning();
    return mapJob(r as typeof ingestionJobs.$inferSelect);
  }

  async updateJob(id: string, patch: Partial<JobRecord>): Promise<void> {
    const set: Partial<typeof ingestionJobs.$inferInsert> = {};
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.error !== undefined) set.error = patch.error;
    if (patch.memwalJobId !== undefined) set.memwalJobId = patch.memwalJobId;
    if (Object.keys(set).length > 0) {
      await db.update(ingestionJobs).set(set).where(eq(ingestionJobs.id, id));
    }
  }

  async getJob(userId: string, id: string): Promise<JobRecord | null> {
    const [r] = await db
      .select()
      .from(ingestionJobs)
      .where(and(eq(ingestionJobs.id, id), eq(ingestionJobs.userId, userId)))
      .limit(1);
    return r ? mapJob(r) : null;
  }

  async listJobs(userId: string): Promise<JobRecord[]> {
    const rows = await db
      .select()
      .from(ingestionJobs)
      .where(eq(ingestionJobs.userId, userId))
      .orderBy(desc(ingestionJobs.createdAt));
    return rows.map(mapJob);
  }

  async findJobBySourceHash(userId: string, sourceHash: string): Promise<JobRecord | null> {
    // Newest first, so a successful retry shadows an earlier errored attempt.
    const [r] = await db
      .select()
      .from(ingestionJobs)
      .where(and(eq(ingestionJobs.userId, userId), eq(ingestionJobs.sourceHash, sourceHash)))
      .orderBy(desc(ingestionJobs.createdAt))
      .limit(1);
    return r ? mapJob(r) : null;
  }

  async createDocument(input: Omit<DocRecord, "id" | "createdAt">): Promise<DocRecord> {
    const [r] = await db
      .insert(documents)
      .values({
        userId: input.userId,
        namespace: input.namespace,
        filename: input.filename,
        walrusBlobId: input.walrusBlobId,
        mime: input.mime,
        size: input.size,
        contentHash: input.contentHash ?? null,
      })
      .returning();
    return mapDoc(r as typeof documents.$inferSelect);
  }

  async findDocumentByContentHash(userId: string, contentHash: string): Promise<DocRecord | null> {
    const [r] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.userId, userId), eq(documents.contentHash, contentHash)))
      .limit(1);
    return r ? mapDoc(r) : null;
  }

  async createConnectedApp(
    input: Omit<AppRecord, "id" | "createdAt" | "status" | "revokedAt"> & Partial<AppRecord>
  ): Promise<AppRecord> {
    const [r] = await db
      .insert(connectedApps)
      .values({
        userId: input.userId,
        delegatePublicKey: input.delegatePublicKey,
        delegateAddress: input.delegateAddress,
        delegateSecretEnc: toBuf(input.delegateSecretEnc),
        label: input.label,
        allowedNamespaces: input.allowedNamespaces,
        status: input.status ?? "active",
      })
      .returning();
    return mapApp(r as typeof connectedApps.$inferSelect);
  }

  async getConnectedApp(userId: string, id: string): Promise<AppRecord | null> {
    const [r] = await db
      .select()
      .from(connectedApps)
      .where(and(eq(connectedApps.id, id), eq(connectedApps.userId, userId)))
      .limit(1);
    return r ? mapApp(r) : null;
  }

  async listConnectedApps(userId: string): Promise<AppRecord[]> {
    const rows = await db
      .select()
      .from(connectedApps)
      .where(eq(connectedApps.userId, userId))
      .orderBy(desc(connectedApps.createdAt));
    return rows.map(mapApp);
  }

  async countActiveApps(userId: string): Promise<number> {
    const [r] = await db
      .select({ c: count() })
      .from(connectedApps)
      .where(and(eq(connectedApps.userId, userId), eq(connectedApps.status, "active")));
    return r?.c ?? 0;
  }

  async revokeApp(userId: string, id: string): Promise<void> {
    // Drop the at-rest secret on revoke (Principle IX): overwrite with empty bytes.
    await db
      .update(connectedApps)
      .set({ status: "revoked", revokedAt: new Date(), delegateSecretEnc: Buffer.alloc(0) })
      .where(and(eq(connectedApps.id, id), eq(connectedApps.userId, userId)));
  }

  async addAudit(input: {
    userId: string;
    action: AuditRecord["action"];
    target?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await db.insert(auditLog).values({
      userId: input.userId,
      action: input.action,
      target: input.target ?? null,
      metadata: input.metadata ?? null,
    });
  }

  async listAudit(userId: string, limit?: number): Promise<AuditRecord[]> {
    const base = db
      .select()
      .from(auditLog)
      .where(eq(auditLog.userId, userId))
      .orderBy(desc(auditLog.createdAt));
    const rows = limit !== undefined ? await base.limit(limit) : await base;
    return rows.map(mapAudit);
  }

  async createListing(
    input: Omit<ListingRecord, "id" | "createdAt" | "status" | "salesCount"> &
      Partial<ListingRecord>
  ): Promise<ListingRecord> {
    const [r] = await db
      .insert(marketListings)
      .values({
        sellerUserId: input.sellerUserId,
        title: input.title,
        scope: input.scope,
        priceMist: input.priceMist,
        status: input.status ?? "active",
        salesCount: input.salesCount ?? 0,
      })
      .returning();
    return mapListing(r as typeof marketListings.$inferSelect);
  }

  async getListing(id: string): Promise<ListingRecord | null> {
    const [r] = await db.select().from(marketListings).where(eq(marketListings.id, id)).limit(1);
    return r ? mapListing(r) : null;
  }

  async listActiveListings(): Promise<ListingRecord[]> {
    const rows = await db
      .select()
      .from(marketListings)
      .where(eq(marketListings.status, "active"))
      .orderBy(desc(marketListings.createdAt));
    return rows.map(mapListing);
  }

  async listListingsByUser(userId: string): Promise<ListingRecord[]> {
    const rows = await db
      .select()
      .from(marketListings)
      .where(eq(marketListings.sellerUserId, userId))
      .orderBy(desc(marketListings.createdAt));
    return rows.map(mapListing);
  }

  async setListingStatus(id: string, status: ListingRecord["status"]): Promise<void> {
    await db.update(marketListings).set({ status }).where(eq(marketListings.id, id));
  }

  async incrementListingSales(id: string): Promise<void> {
    await db
      .update(marketListings)
      .set({ salesCount: sql`${marketListings.salesCount} + 1` })
      .where(eq(marketListings.id, id));
  }

  async createAcquisition(
    input: Omit<AcquisitionRecord, "id" | "createdAt">
  ): Promise<AcquisitionRecord> {
    const [r] = await db
      .insert(marketAcquisitions)
      .values({
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
        delegateSecretEnc: input.delegateSecretEnc ? toBuf(input.delegateSecretEnc) : null,
      })
      .returning();
    return mapAcquisition(r as typeof marketAcquisitions.$inferSelect);
  }

  async getAcquisition(id: string): Promise<AcquisitionRecord | null> {
    const [r] = await db
      .select()
      .from(marketAcquisitions)
      .where(eq(marketAcquisitions.id, id))
      .limit(1);
    return r ? mapAcquisition(r) : null;
  }

  async listAcquisitionsByBuyer(buyerUserId: string): Promise<AcquisitionRecord[]> {
    const rows = await db
      .select()
      .from(marketAcquisitions)
      .where(eq(marketAcquisitions.buyerUserId, buyerUserId))
      .orderBy(desc(marketAcquisitions.createdAt));
    return rows.map(mapAcquisition);
  }

  async listAcquisitionsBySeller(sellerUserId: string): Promise<AcquisitionRecord[]> {
    const rows = await db
      .select()
      .from(marketAcquisitions)
      .where(eq(marketAcquisitions.sellerUserId, sellerUserId))
      .orderBy(desc(marketAcquisitions.createdAt));
    return rows.map(mapAcquisition);
  }

  async claimAcquisition(id: string): Promise<boolean> {
    // One-time reveal: wipe the at-rest secret in the same statement that flips claimed.
    // The `claimed = false` predicate makes concurrent claims race-safe — exactly one UPDATE
    // matches, so exactly one caller is told it won.
    const rows = await db
      .update(marketAcquisitions)
      .set({ claimed: true, delegateSecretEnc: null })
      .where(and(eq(marketAcquisitions.id, id), eq(marketAcquisitions.claimed, false)))
      .returning({ id: marketAcquisitions.id });
    return rows.length > 0;
  }

  async wipeAcquisitionSecretsForApp(appId: string): Promise<void> {
    // The key was revoked on-chain; any stored gift secret backing it is dead weight — drop it.
    await db
      .update(marketAcquisitions)
      .set({ delegateSecretEnc: null })
      .where(eq(marketAcquisitions.appId, appId));
  }

  async getVault(userId: string): Promise<VaultRecord | null> {
    const [r] = await db.select().from(vaults).where(eq(vaults.userId, userId)).limit(1);
    return r ? mapVault(r) : null;
  }

  async createVault(input: Omit<VaultRecord, "createdAt">): Promise<VaultRecord | null> {
    // onConflictDoNothing + RETURNING: concurrent setups collapse onto one row; losers get null
    // (one vault per user — re-keying would orphan every existing envelope).
    const [r] = await db
      .insert(vaults)
      .values({
        userId: input.userId,
        kdfParams: input.kdfParams as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing({ target: vaults.userId })
      .returning();
    return r ? mapVault(r) : null;
  }

  async createVaultItem(input: Omit<VaultItemRecord, "id" | "createdAt">): Promise<VaultItemRecord> {
    const [r] = await db
      .insert(vaultItems)
      .values({
        userId: input.userId,
        namespace: input.namespace,
        label: input.label,
        kind: input.kind,
        sizeBytes: input.sizeBytes,
        walrusBlobId: input.walrusBlobId,
        envelopeHash: input.envelopeHash,
        scheme: input.scheme,
      })
      .returning();
    return mapVaultItem(r as typeof vaultItems.$inferSelect);
  }

  async getVaultItem(userId: string, id: string): Promise<VaultItemRecord | null> {
    const [r] = await db
      .select()
      .from(vaultItems)
      .where(and(eq(vaultItems.id, id), eq(vaultItems.userId, userId)))
      .limit(1);
    return r ? mapVaultItem(r) : null;
  }

  async listVaultItems(
    userId: string,
    namespace?: VaultItemRecord["namespace"]
  ): Promise<VaultItemRecord[]> {
    const where = namespace
      ? and(eq(vaultItems.userId, userId), eq(vaultItems.namespace, namespace))
      : eq(vaultItems.userId, userId);
    const rows = await db
      .select()
      .from(vaultItems)
      .where(where)
      .orderBy(desc(vaultItems.createdAt));
    return rows.map(mapVaultItem);
  }

  async deleteVaultItem(userId: string, id: string): Promise<boolean> {
    const rows = await db
      .delete(vaultItems)
      .where(and(eq(vaultItems.id, id), eq(vaultItems.userId, userId)))
      .returning({ id: vaultItems.id });
    return rows.length > 0;
  }

  async countVaultItems(userId: string): Promise<number> {
    const [r] = await db
      .select({ value: count() })
      .from(vaultItems)
      .where(eq(vaultItems.userId, userId));
    return r?.value ?? 0;
  }

  async getPersonalContext(userId: string): Promise<PersonalContextRecord | null> {
    const [r] = await db
      .select()
      .from(personalContext)
      .where(eq(personalContext.userId, userId))
      .limit(1);
    return r ? mapPersonalContext(r) : null;
  }

  async upsertPersonalContext(input: {
    userId: string;
    walrusBlobId: string | null;
    answeredCount: number;
    completed: boolean;
  }): Promise<PersonalContextRecord> {
    const [r] = await db
      .insert(personalContext)
      .values({
        userId: input.userId,
        walrusBlobId: input.walrusBlobId,
        answeredCount: input.answeredCount,
        completed: input.completed,
      })
      .onConflictDoUpdate({
        target: personalContext.userId,
        set: {
          walrusBlobId: input.walrusBlobId,
          answeredCount: input.answeredCount,
          completed: input.completed,
          updatedAt: new Date(),
        },
      })
      .returning();
    return mapPersonalContext(r as typeof personalContext.$inferSelect);
  }
}
