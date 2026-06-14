/*
 * Zero-plaintext vault (metadata/index only — the server can NEVER read vault content).
 *
 * `vaults` holds the PUBLIC key-derivation parameters (salt, iterations, key-check envelope) the
 * browser needs to re-derive the vault key from the user's passphrase on any device. None of it
 * is secret; the passphrase — which never leaves the browser — is the only secret.
 *
 * `vault_items` indexes client-encrypted envelopes stored on Walrus. Only the label, namespace,
 * kind, and size are visible to Soul; the content is an AES-256-GCM envelope sealed in the
 * browser (CLAUDE.md decision #4 — the zero-plaintext path).
 */
import { newId } from "@soul/id";
import { VAULT_ITEM_KINDS } from "@soul/shared";
import { integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./accounts";
import { namespaceEnum } from "./content";

export const vaultItemKindEnum = pgEnum("vault_item_kind", VAULT_ITEM_KINDS);

export const vaults = pgTable("vaults", {
  /** One vault per user. */
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  /** Public KDF params + key-check envelope (VaultKdfParams) — required to unlock on a new device. */
  kdfParams: jsonb("kdf_params").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const vaultItems = pgTable("vault_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newId("vaultItem")),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  namespace: namespaceEnum("namespace").notNull(),
  /**
   * Plaintext label — the only content-bearing field the server can read (namespace, kind,
   * size, and timestamps are also visible metadata; the content itself never is).
   */
  label: text("label").notNull(),
  kind: vaultItemKindEnum("kind").notNull(),
  /** Pre-encryption size (display only; the envelope on Walrus is larger). */
  sizeBytes: integer("size_bytes").notNull(),
  /** Walrus blob holding the raw envelope JSON (portable: decryptable with the passphrase alone). */
  walrusBlobId: text("walrus_blob_id").notNull(),
  /** SHA-256 of the canonical envelope JSON — Portability re-reads the blob and re-checks this. */
  envelopeHash: text("envelope_hash").notNull(),
  scheme: text("scheme").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
