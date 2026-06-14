/*
 * Postgres row types, inferred from the Drizzle tables in ./schema.
 * These are DB rows (metadata/index); for cross-app domain DTOs see @soul/shared.
 */
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { memwalAccounts, users } from "./schema/accounts";
import type { documents, ingestionJobs, namespaces } from "./schema/content";
import type { auditLog, connectedApps } from "./schema/permissions";
import type { personalContext } from "./schema/profile";

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type MemwalAccount = InferSelectModel<typeof memwalAccounts>;
export type NewMemwalAccount = InferInsertModel<typeof memwalAccounts>;

export type NamespaceRow = InferSelectModel<typeof namespaces>;
export type NewNamespaceRow = InferInsertModel<typeof namespaces>;

export type IngestionJob = InferSelectModel<typeof ingestionJobs>;
export type NewIngestionJob = InferInsertModel<typeof ingestionJobs>;

export type DocumentRow = InferSelectModel<typeof documents>;
export type NewDocumentRow = InferInsertModel<typeof documents>;

export type ConnectedApp = InferSelectModel<typeof connectedApps>;
export type NewConnectedApp = InferInsertModel<typeof connectedApps>;

export type AuditEntry = InferSelectModel<typeof auditLog>;
export type NewAuditEntry = InferInsertModel<typeof auditLog>;

export type PersonalContext = InferSelectModel<typeof personalContext>;
export type NewPersonalContext = InferInsertModel<typeof personalContext>;
