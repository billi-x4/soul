CREATE TYPE "public"."ingestion_status" AS ENUM('pending', 'processing', 'ready', 'error');--> statement-breakpoint
CREATE TYPE "public"."namespace" AS ENUM('bio', 'docs', 'github', 'social');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('paste', 'document', 'github', 'social');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('grant', 'revoke', 'freeze', 'unfreeze', 'ingest', 'restore');--> statement-breakpoint
CREATE TYPE "public"."connected_app_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TABLE "memwal_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_object_id" text NOT NULL,
	"owner_address" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"primary_delegate_public_key" text,
	"primary_delegate_secret_enc" "bytea",
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "memwal_accounts_account_object_id_unique" UNIQUE("account_object_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"sui_address" text NOT NULL,
	"oauth_subject" text,
	"display_name" text,
	"suins_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_sui_address_unique" UNIQUE("sui_address")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"namespace" "namespace" NOT NULL,
	"filename" text NOT NULL,
	"walrus_blob_id" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"content_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_type" "source_type" NOT NULL,
	"namespace" "namespace" NOT NULL,
	"memwal_job_id" text,
	"status" "ingestion_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"source_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "namespaces" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" "namespace" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action" "audit_action" NOT NULL,
	"target" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connected_apps" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"delegate_public_key" text NOT NULL,
	"delegate_address" text NOT NULL,
	"delegate_secret_enc" "bytea" NOT NULL,
	"label" text NOT NULL,
	"allowed_namespaces" jsonb NOT NULL,
	"status" "connected_app_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "memwal_accounts" ADD CONSTRAINT "memwal_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "namespaces" ADD CONSTRAINT "namespaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_apps" ADD CONSTRAINT "connected_apps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;