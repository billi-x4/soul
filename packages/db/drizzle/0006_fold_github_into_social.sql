-- Fold the `github` namespace into `social` (2026-06-12). GitHub stays as an import SOURCE
-- (source_type 'github' is unchanged), but its facts now live in the `social` namespace —
-- three namespaces remain: bio, docs, social.
--
-- 1. Move existing rows off the value.
UPDATE "ingestion_jobs" SET "namespace" = 'social' WHERE "namespace" = 'github';
--> statement-breakpoint
UPDATE "documents" SET "namespace" = 'social' WHERE "namespace" = 'github';
--> statement-breakpoint
-- A user may already have a social namespace row; drop their github row rather than renaming
-- it into a duplicate.
DELETE FROM "namespaces" n
WHERE n."name" = 'github'
  AND EXISTS (
    SELECT 1 FROM "namespaces" s WHERE s."user_id" = n."user_id" AND s."name" = 'social'
  );
--> statement-breakpoint
UPDATE "namespaces" SET "name" = 'social' WHERE "name" = 'github';
--> statement-breakpoint
-- 2. Rewrite jsonb namespace scopes (delegate keys + marketplace), deduped.
UPDATE "connected_apps" SET "allowed_namespaces" = (
  SELECT coalesce(jsonb_agg(DISTINCT CASE WHEN v = 'github' THEN 'social' ELSE v END), '[]'::jsonb)
  FROM jsonb_array_elements_text("allowed_namespaces") AS v
) WHERE "allowed_namespaces" ? 'github';
--> statement-breakpoint
UPDATE "market_listings" SET "scope" = (
  SELECT coalesce(jsonb_agg(DISTINCT CASE WHEN v = 'github' THEN 'social' ELSE v END), '[]'::jsonb)
  FROM jsonb_array_elements_text("scope") AS v
) WHERE "scope" ? 'github';
--> statement-breakpoint
UPDATE "market_acquisitions" SET "scope" = (
  SELECT coalesce(jsonb_agg(DISTINCT CASE WHEN v = 'github' THEN 'social' ELSE v END), '[]'::jsonb)
  FROM jsonb_array_elements_text("scope") AS v
) WHERE "scope" ? 'github';
--> statement-breakpoint
-- 3. Recreate the namespace enum without 'github' (Postgres cannot drop an enum value in place).
ALTER TYPE "public"."namespace" RENAME TO "namespace_old";
--> statement-breakpoint
CREATE TYPE "public"."namespace" AS ENUM('bio', 'docs', 'social');
--> statement-breakpoint
ALTER TABLE "namespaces" ALTER COLUMN "name" TYPE "public"."namespace" USING "name"::text::"public"."namespace";
--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ALTER COLUMN "namespace" TYPE "public"."namespace" USING "namespace"::text::"public"."namespace";
--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "namespace" TYPE "public"."namespace" USING "namespace"::text::"public"."namespace";
--> statement-breakpoint
DROP TYPE "public"."namespace_old";
