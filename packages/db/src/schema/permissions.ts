/*
 * Permissions (= on-chain delegate keys) + audit log (metadata/index only).
 * The authoritative grant/revoke/freeze state is on Sui (`memwal::account`); these
 * rows mirror it for the UI. The delegate-key SECRET is encrypted at rest and is
 * NEVER logged or returned in any API response (Constitution Principle IX). See
 * arch SKILL §9 + sui-stack SKILL L4.
 */
import { newId } from "@soul/id";
import { AUDIT_ACTIONS, CONNECTED_APP_STATUSES, type Namespace } from "@soul/shared";
import { customType, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./accounts";

/** Raw bytes column — holds the encrypted-at-rest delegate-key secret. */
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const connectedAppStatusEnum = pgEnum("connected_app_status", CONNECTED_APP_STATUSES);
export const auditActionEnum = pgEnum("audit_action", AUDIT_ACTIONS);

export const connectedApps = pgTable("connected_apps", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newId("app")),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  delegatePublicKey: text("delegate_public_key").notNull(),
  delegateAddress: text("delegate_address").notNull(),
  /** Encrypted-at-rest secret used to call the relayer in managed mode. Never logged/returned. */
  delegateSecretEnc: bytea("delegate_secret_enc").notNull(),
  label: text("label").notNull(),
  /** Relayer-enforced namespace scope (NOT an on-chain guarantee). */
  allowedNamespaces: jsonb("allowed_namespaces").$type<Namespace[]>().notNull(),
  status: connectedAppStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
});

export const auditLog = pgTable("audit_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newId("audit")),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  action: auditActionEnum("action").notNull(),
  target: text("target"),
  /** Non-secret context (label, namespaces, counts). Never store secrets here. */
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
