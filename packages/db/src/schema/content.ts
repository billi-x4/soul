/*
 * Namespaces, ingestion jobs, and document metadata (metadata/index only).
 * Memory content itself lives on Walrus + MemWal — never here. Raw document bytes
 * live on Walrus; only the blob id is mirrored. See arch SKILL §6 + Source-of-Truth.
 */
import { newId } from "@soul/id";
import { INGESTION_STATUSES, NAMESPACES, SOURCE_TYPES } from "@soul/shared";
import { integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./accounts";

export const namespaceEnum = pgEnum("namespace", NAMESPACES);
export const sourceTypeEnum = pgEnum("source_type", SOURCE_TYPES);
export const ingestionStatusEnum = pgEnum("ingestion_status", INGESTION_STATUSES);

export const namespaces = pgTable("namespaces", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newId("namespace")),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  name: namespaceEnum("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ingestionJobs = pgTable("ingestion_jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newId("job")),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  sourceType: sourceTypeEnum("source_type").notNull(),
  namespace: namespaceEnum("namespace").notNull(),
  /** The MemWal async job id (poll to completion — eventual consistency). */
  memwalJobId: text("memwal_job_id"),
  status: ingestionStatusEnum("status").notNull().default("pending"),
  error: text("error"),
  /** Hash of the input/source, for duplicate detection ("empty/duplicate input" edge case). */
  sourceHash: text("source_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const documents = pgTable("documents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newId("document")),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  namespace: namespaceEnum("namespace").notNull(),
  filename: text("filename").notNull(),
  /** Pointer to the raw blob on Walrus (the bytes are the source of truth). */
  walrusBlobId: text("walrus_blob_id").notNull(),
  mime: text("mime").notNull(),
  /** Bytes; enforce a configured maximum ("large document" edge case). */
  size: integer("size").notNull(),
  /** Hash of the raw blob, for re-import duplicate detection. */
  contentHash: text("content_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
