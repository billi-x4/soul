/*
 * Identity & ownership tables (metadata/index only — Source-of-Truth is Sui).
 * `users.sui_address` MIRRORS the on-chain identity; `memwal_accounts` mirrors the
 * MemWalAccount Sui object (ownership + freeze state). See arch SKILL §6.
 */
import { newId } from "@soul/id";
import { boolean, customType, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Raw bytes column for the encrypted-at-rest primary delegate-key secret (Principle IX). */
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newId("user")),
  /** The Sui address (identity, via Enoki zkLogin). Unique; mirrors on-chain. */
  suiAddress: text("sui_address").notNull().unique(),
  /** The Soul handle (rendered as `<username>.soul`). Unique; null until the user claims it. */
  username: text("username").unique(),
  /** Which provider the user signed in with (e.g. "google", "dev"). */
  authProvider: text("auth_provider"),
  /** Google OAuth subject, for session linkage. */
  oauthSubject: text("oauth_subject"),
  displayName: text("display_name"),
  /** Optional SuiNS handle (not MVP-critical). */
  suinsName: text("suins_name"),
  /**
   * Session generation. Stateless HMAC session tokens embed the epoch they were minted under;
   * bumping it (POST /auth/logout) invalidates every outstanding token for this user without a
   * session table — the only revocation lever for a stolen 7-day token.
   */
  sessionEpoch: integer("session_epoch").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const memwalAccounts = pgTable("memwal_accounts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newId("account")),
  /** Unique: exactly one MemWalAccount per user (provisioning races collapse onto one row). */
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  /** The MemWalAccount Sui object id (authoritative for permissions). */
  accountObjectId: text("account_object_id").notNull().unique(),
  ownerAddress: text("owner_address").notNull(),
  /** Mirrors the on-chain freeze state: false = frozen (deactivate_account). */
  active: boolean("active").notNull().default(true),
  /** Soul's own primary delegate key for the owner's web-UI memory ops (encrypted at rest). */
  primaryDelegatePublicKey: text("primary_delegate_public_key"),
  primaryDelegateSecretEnc: bytea("primary_delegate_secret_enc"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
