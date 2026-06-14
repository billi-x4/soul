-- Zero-plaintext vault (2026-06-11). Client-side encryption: the browser derives an AES-256-GCM
-- key from the user's passphrase (PBKDF2) and seals content BEFORE upload. The server stores only
-- public KDF parameters and envelope metadata — it can never read vault content.
CREATE TYPE "public"."vault_item_kind" AS ENUM('text', 'file');
--> statement-breakpoint
CREATE TABLE "vaults" (
	"user_id" text PRIMARY KEY NOT NULL,
	"kdf_params" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"namespace" "namespace" NOT NULL,
	"label" text NOT NULL,
	"kind" "vault_item_kind" NOT NULL,
	"size_bytes" integer NOT NULL,
	"walrus_blob_id" text NOT NULL,
	"envelope_hash" text NOT NULL,
	"scheme" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vault_items" ADD CONSTRAINT "vault_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "vault_items_user_id_idx" ON "vault_items" ("user_id");
