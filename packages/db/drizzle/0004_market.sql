-- Marketplace: scoped, revocable ACCESS licenses (delegate keys on the seller's account) —
-- never the memory bytes. Gift secrets are encrypted at rest and wiped (NULL) on claim.
CREATE TYPE "public"."listing_status" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."acquisition_kind" AS ENUM('purchase', 'gift');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'list';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'unlist';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'purchase';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'gift';--> statement-breakpoint
CREATE TABLE "market_listings" (
	"id" text PRIMARY KEY NOT NULL,
	"seller_user_id" text NOT NULL,
	"title" text NOT NULL,
	"scope" jsonb NOT NULL,
	"price_mist" text NOT NULL,
	"status" "listing_status" DEFAULT 'active' NOT NULL,
	"sales_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_acquisitions" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "acquisition_kind" NOT NULL,
	"listing_id" text,
	"title" text NOT NULL,
	"buyer_user_id" text NOT NULL,
	"seller_user_id" text NOT NULL,
	"app_id" text NOT NULL,
	"scope" jsonb NOT NULL,
	"price_mist" text NOT NULL,
	"tx_digest" text,
	"claimed" boolean DEFAULT false NOT NULL,
	"delegate_secret_enc" "bytea",
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_seller_user_id_users_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_acquisitions" ADD CONSTRAINT "market_acquisitions_listing_id_market_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."market_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_acquisitions" ADD CONSTRAINT "market_acquisitions_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_acquisitions" ADD CONSTRAINT "market_acquisitions_seller_user_id_users_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_acquisitions" ADD CONSTRAINT "market_acquisitions_app_id_connected_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."connected_apps"("id") ON DELETE no action ON UPDATE no action;
