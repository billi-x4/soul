/*
 * Personal context METADATA (the index for a user's "soul").
 *
 * Source of truth lives on the Sui stack, not here:
 *   - the structured answers JSON is a Walrus blob (walrus_blob_id) — durable + portable, and
 *   - the compiled narrative is ingested into the MemWal `bio` namespace (recallable memory).
 * Postgres only mirrors the pointer + lightweight flags so the UI is fast and reconstructable.
 * One row per user; editable any time from /profile.
 */
import { newId } from "@soul/id";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./accounts";

export const personalContext = pgTable("personal_context", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newId("context")),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  /** Walrus blob holding the structured answers JSON (the soul's raw form). Null until first save. */
  walrusBlobId: text("walrus_blob_id"),
  /** Count of answered questions — metadata for display without reading the blob. */
  answeredCount: integer("answered_count").notNull().default(0),
  /** True once the user has finished (vs. skipped) onboarding. */
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
