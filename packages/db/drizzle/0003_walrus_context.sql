-- personal_context becomes metadata-only: the answers JSON moves to a Walrus blob.
ALTER TABLE "personal_context" DROP COLUMN IF EXISTS "answers";--> statement-breakpoint
ALTER TABLE "personal_context" ADD COLUMN IF NOT EXISTS "walrus_blob_id" text;--> statement-breakpoint
ALTER TABLE "personal_context" ADD COLUMN IF NOT EXISTS "answered_count" integer DEFAULT 0 NOT NULL;
