/*
 * Record → API DTO mappers. Keeps wire shapes (@soul/shared) decoupled from internal records,
 * and guarantees secrets (e.g. delegateSecretEnc) never leak into responses (Principle IX).
 */
import type {
  AuditEntry,
  ConnectedApp,
  ConnectedAppStatus,
  DocumentMeta,
  IngestionJob,
  SoulAcquisition,
  SoulListing,
  SoulSale,
  VaultItemMeta,
} from "@soul/shared";
import type {
  AcquisitionRecord,
  AppRecord,
  AuditRecord,
  DocRecord,
  JobRecord,
  ListingRecord,
  VaultItemRecord,
} from "../services/ports";

export const toConnectedApp = (a: AppRecord): ConnectedApp => ({
  id: a.id,
  label: a.label,
  allowedNamespaces: a.allowedNamespaces,
  status: a.status,
  createdAt: a.createdAt,
  revokedAt: a.revokedAt ?? null,
});

export const toIngestionJob = (j: JobRecord): IngestionJob => ({
  id: j.id,
  sourceType: j.sourceType,
  namespace: j.namespace,
  status: j.status,
  error: j.error ?? null,
});

export const toAuditEntry = (a: AuditRecord): AuditEntry => ({
  action: a.action,
  target: a.target ?? "",
  metadata: a.metadata ?? undefined,
  createdAt: a.createdAt,
});

export const toDocumentMeta = (d: DocRecord): DocumentMeta => ({
  id: d.id,
  namespace: d.namespace,
  filename: d.filename,
  mime: d.mime,
  size: d.size,
  createdAt: d.createdAt,
});

/** Vault item metadata — the server-visible surface of a private memory (never content). */
export const toVaultItemMeta = (v: VaultItemRecord): VaultItemMeta => ({
  id: v.id,
  namespace: v.namespace,
  label: v.label,
  kind: v.kind,
  sizeBytes: v.sizeBytes,
  walrusBlobId: v.walrusBlobId,
  scheme: v.scheme as VaultItemMeta["scheme"],
  createdAt: v.createdAt,
});

// ---------- marketplace (access licenses — never memory bytes, never secrets) ----------

export const toSoulListing = (
  l: ListingRecord,
  seller: { handle: string | null; suiAddress: string },
  mine: boolean
): SoulListing => ({
  id: l.id,
  sellerHandle: seller.handle,
  sellerAddress: seller.suiAddress,
  title: l.title,
  scope: l.scope,
  priceMist: l.priceMist,
  status: l.status,
  salesCount: l.salesCount,
  mine,
  createdAt: l.createdAt,
});

/** NEVER emits delegateSecretEnc — the gift secret is revealed exactly once via claim. */
export const toSoulAcquisition = (
  a: AcquisitionRecord,
  ctx: {
    sellerHandle: string | null;
    sellerAddress: string;
    sellerAccountObjectId: string;
    status: ConnectedAppStatus;
    explorerUrl?: string | null;
  }
): SoulAcquisition => ({
  id: a.id,
  kind: a.kind,
  listingId: a.listingId ?? null,
  title: a.title,
  sellerHandle: ctx.sellerHandle,
  sellerAddress: ctx.sellerAddress,
  sellerAccountObjectId: ctx.sellerAccountObjectId,
  scope: a.scope,
  priceMist: a.priceMist,
  txDigest: a.txDigest ?? null,
  explorerUrl: ctx.explorerUrl ?? null,
  status: ctx.status,
  claimed: a.claimed,
  createdAt: a.createdAt,
});

/** NEVER emits delegateSecretEnc (Principle IX). */
export const toSoulSale = (
  a: AcquisitionRecord,
  ctx: { buyerHandle: string | null; buyerAddress: string; status: ConnectedAppStatus }
): SoulSale => ({
  acquisitionId: a.id,
  listingId: a.listingId ?? null,
  kind: a.kind,
  buyerHandle: ctx.buyerHandle,
  buyerAddress: ctx.buyerAddress,
  scope: a.scope,
  priceMist: a.priceMist,
  txDigest: a.txDigest ?? null,
  appId: a.appId,
  status: ctx.status,
  createdAt: a.createdAt,
});
