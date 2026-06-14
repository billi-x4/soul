-- Production-hardening pass (2026-06-11).
-- 1. users.session_epoch: stateless-session revocation lever. Tokens embed the epoch they were
--    minted under; bumping it on logout invalidates every outstanding token for that user.
-- 2. memwal_accounts.user_id UNIQUE: exactly one MemWalAccount per user — concurrent first-login
--    provisioning collapses onto one row instead of minting duplicate on-chain accounts.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "session_epoch" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "memwal_accounts" ADD CONSTRAINT "memwal_accounts_user_id_unique" UNIQUE ("user_id");
