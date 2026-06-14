# Quickstart & Validation — Soul MVP

A run/validation guide proving the MVP end-to-end. Implementation detail (service bodies, migrations,
test suites) belongs in `tasks.md` / the implementation phase, not here. References:
[plan.md](./plan.md), [contracts/api.md](./contracts/api.md), [data-model.md](./data-model.md),
[research.md](./research.md).

> **Network: testnet-first build** (Constitution VI v3.0.0). `SUI_NETWORK=testnet`, staging relayer;
> testnet WAL + SUI are free faucet tokens. Mainnet is the production-persistence cutover. Re-verify
> package versions, contract IDs, and relayer URLs against live docs before running (Principle VI).

## Prerequisites

- Node ≥ 22, `pnpm@9`, `bun`. Toolchain CLIs via `suiup`: `sui`, `walrus`, `site-builder`.
- Accounts/keys: Enoki (public + secret keys), Google OAuth client id, Supabase Postgres URL, a funded
  **relayer/sponsor wallet** (testnet WAL + SUI from the faucet), MemWal staging relayer URL + testnet account registry id.

## Setup

1. `pnpm install` at the repo root.
2. Configure env (values per architecture SKILL §10; **testnet for the build** per Principle VI):
   - `apps/api/.env`: `DATABASE_URL`, `ENOKI_SECRET_KEY`, `ENOKI_PUBLIC_KEY`, `SUI_NETWORK=testnet`,
     `MEMWAL_RELAYER_URL=https://relayer-staging.memory.walrus.xyz`, `MEMWAL_ACCOUNT_REGISTRY=<testnet registry>`.
   - `apps/web/.env`: `NEXT_PUBLIC_ENOKI_PUBLIC_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`,
     `NEXT_PUBLIC_SUI_NETWORK=testnet`, `NEXT_PUBLIC_API_URL`.
3. `pnpm db:push` (apply Drizzle schema to Supabase).
4. `pnpm dev` (Turbo runs web + api).

## Stage 0 — Pipeline proof (foundational)

- **Health**: `GET /health` → `{ status: "ok", memwalVersionOk: true }` (confirms the MemWal `/version`
  check passes; `MemWalCompatibilityError` surfaces here if mismatched).
- **Round-trip**: server-side, `remember("hello soul", "bio")` → poll the returned `job_id` to `ready` →
  `recall("soul", { namespace: "bio" })` returns the item. Confirms the eventual-consistency path.
- **Raw blob**: write + read one Walrus blob via the relayer/publisher path.

## End-to-end demo (validates all six user stories)

### US1 — Sign in (FR-001..005)
- Open the web app → "Sign in with Google" → Enoki zkLogin → land signed-in.
- **Expect**: a Sui address shown; an empty soul owned by it; **no** seed phrase, wallet, token, or fee
  prompt at any step (SC-001). On first login `POST /account/provision` creates exactly one
  `MemWalAccount` (idempotent — repeat login does not create a second).

### US2 — Build a soul (FR-007..016)
- Before first upload, **expect the plaintext disclosure** (managed relayer can read content) — SC-005.
- Paste text → `POST /ingest/text` (`bio`); upload a PDF/docx/txt/md → `POST /ingest/document` (`docs`);
  connect GitHub → `POST /ingest/github` (`social`); upload an X/LinkedIn export → `POST /ingest/social`
  (`social`).
- Poll `GET /ingest/jobs/:id` → `processing` → `ready` (SC-004). **Expect** each source filed under the
  correct area (SC-002). Try importing a non-own profile → **rejected** (own-data only).

### US3 — Inspect & curate (FR-017..021)
- `GET /memory?namespace=docs` to browse; `GET /memory?query=...` for meaning-based search → a known
  fact appears in the **top 5** (SC-003). `GET /memory/:id` shows source + date. `PATCH` edits;
  `DELETE` de-indexes (item disappears from browse/search/recall; disclosure that the stored copy is
  immutable).

### US4 — Grant & revoke (FR-022..028)
- `POST /permissions/apps` `{ label: "Claude Desktop", allowedNamespaces: ["bio","social"] }` → returns
  the app + **MCP config** (delegate-key secret shown once). Appears in `GET /permissions/apps`.
- Try to exceed 20 active apps → **`409`** with the limit explained (FR-028).
- `GET /permissions/audit` shows the `grant`.

### US5 — Use in AI tools (FR-029..032)
- Connect a real client (Claude Desktop / Cursor) using the **stdio** config, or a cloud client via the
  **hosted HTTP** config (`Authorization: Bearer <delegate-key>` + `x-memwal-account-id`).
- Ask the client something answerable only from the soul → it `memwal_recall`s from the **granted
  namespaces only** (not ungranted ones). Confirm there is **no `ask` tool**.
- **Recall accuracy**: over an evaluation set of prompts about known facts, the client recalls the right
  knowledge in ≥ 90% of cases (SC-006).
- **Cross-soul isolation**: a second person's connected tool recalls only that second person's soul —
  never the first person's (spec US5 AC4 / FR-032); the Bearer delegate key + `x-memwal-account-id` pair
  binds recall to exactly one `MemWalAccount`.

### US4/US5 — Revoke is real (SC-007)
- `DELETE /permissions/apps/:id` (or `POST /permissions/freeze`) → within 1 minute, the same client can
  recall **nothing** from the soul. Audited as `revoke`/`freeze`. **This is the "ownership is real"
  moment.**

### US6 — Prove ownership & portability (FR-033..036)
- `GET /verify` → `{ intact: true, verified, total, missing: [] }`.
- `POST /restore` (optionally per namespace) → `{ restored, skipped, total }` with `restored == total`
  for an intact soul (SC-009) — rebuilt from Walrus independently of Postgres (simulate by clearing the
  index/cache first).
- `GET /ownership` → on-chain account object id + owner address + explorer link (SC-010).

## Ship (Stage 5)

- Build the web app; deploy as a **Walrus Site**: `site-builder deploy --epochs <N> ./dist` (optionally
  bind a SuiNS name). Deploy the API to Railway (`railway.toml` + `apps/api/Dockerfile`); run
  `pnpm db:migrate` against the managed Postgres. Re-verify all contract IDs/endpoints first
  (Principle VI).

## Pass criteria

All six user-story sections above behave as described, the Success Criteria thresholds (SC-001..011)
hold, and a post-revoke recall fails. The soul restores 100% from Walrus with Postgres cleared —
demonstrating portability and that Postgres is a disposable cache.
