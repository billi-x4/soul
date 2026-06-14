---
description: "Task list for Soul MVP implementation"
---

# Tasks: Soul MVP

**Input**: Design documents from `specs/001-soul-mvp/` — [plan.md](./plan.md), [spec.md](./spec.md),
[research.md](./research.md), [data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md),
[quickstart.md](./quickstart.md).

**Tests**: Full TDD test tasks were NOT requested. Each user-story phase ends with a lightweight
**validation checkpoint** task that runs the matching `quickstart.md` scenario (keeps every task
"testable" without a test-first suite). Add unit/integration tasks later if desired.

**Organization**: Grouped by user story so each is independently implementable and testable. Sequenced
in the requested dependency order so **the app runs at every milestone**.

## Format: `[ID] [P?] [Story] Description`  + markers

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task).
- **[Story]**: `[US1]`..`[US6]` maps to the spec's user stories. Setup/Foundational/Polish carry no story label.
- **🌐**: Touches the live Sui Stack (Sui chain / Enoki / MemWal / Walrus / Seal). Per Constitution
  **Principle VI (v3.0.0)** these are built and validated on **testnet** (`SUI_NETWORK=testnet`);
  mainnet is the documented production-persistence cutover (env swap + re-verified contract IDs/
  endpoints).
- **⚠️**: Depends on a **beta caveat** — contract IDs, relayer / MCP / publisher endpoints, or exact SDK
  versions. **Re-verify against live docs before implementing** (Constitution VI; sui-stack SKILL
  "Caveats every agent must respect").
- Each task cites its **governing source** — a SKILL section (`arch §N` = `docs/soul-architecture/SKILL.md`;
  `sui-stack L#` = `docs/sui-stack-for-soul/SKILL.md` layer) and/or the relevant contract, data-model,
  FR, Principle, or quickstart scenario. (UI/route tasks legitimately govern by FR + contract since the
  SKILLs describe stack mechanics, not route/UI behavior; validation checkpoints govern by quickstart.)

> **Scope guard**: Post-MVP items are EXCLUDED (Sign-in-with-Soul SDK, browser extension, extra login
> providers, self-hosted relayer, manual/custom Seal policies, Nautilus, Messaging, public SuiNS handle).
> SuiNS handle binding is optional polish and intentionally not a task.
>
> **FR-006 (login-loss recovery)** is an intentional **documented non-build limitation** (research §C1):
> Google re-auth deterministically restores the same soul; permanent loss of the Google account = loss
> of access, with no separate Soul-managed recovery credential in MVP. It is surfaced as disclosure copy
> (T050), not built.

---

> **BUILD STATUS (2026-06-05):** The MVP is **implemented and runtime-verified end-to-end in dev mode**
> (in-memory + mock adapters; `SOUL_LIVE` off). All six user stories work via the API (US1–US6
> runtime-tested) and the web UI (typecheck + production build); 16 vitest tests pass; the Drizzle
> migration is generated. A task is checked when its deliverable is implemented. **🌐 tasks are
> delivered against mock adapters** — the live Sui-Stack wiring + 4 beta blockers are specified in
> [live-cutover.md](./live-cutover.md). Tasks still open (need local toolchain / external creds):
> **T002** (suiup CLIs), **T051/T052** (actual Walrus Site / Railway+Postgres deploy), **T053** (live
> testnet e2e), **T054** (pre-launch re-verification).

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Toolchain, pinned dependencies, env, and a working ingest→recall pipeline before feature work.

- [x] T001 ⚠️ Add and **pin exact beta versions** of Sui Stack deps in `apps/api/package.json` and `apps/web/package.json` (`@mysten/sui`, `@mysten/dapp-kit` + `@tanstack/react-query`, `@mysten/enoki`, `@mysten-incubation/memwal`, `@mysten-incubation/memwal-mcp`, `@mysten/walrus`, `@octokit/rest`, `pdf-parse`, `mammoth`); confirm `@mysten/sui` (NOT `@mysten/sui.js`). (arch §2; sui-stack "Caveats")
- [ ] T002 [P] 🌐 Install toolchain CLIs via `suiup` (`sui`, `walrus`, `site-builder`) and record versions in `apps/api/README.md`. (sui-stack "Toolchain setup") — ⛔ **OWNER-GATED**: a local/CI machine binary install (`curl -sSfL https://raw.githubusercontent.com/MystenLabs/suiup/main/install.sh | sh` then `suiup install sui@testnet walrus site-builder@testnet`). Only needed for the deploy tasks below; not required to run the app in dev.
- [x] T003 [P] ⚠️ Add env scaffolding: `apps/api/.env.example` (`SUI_NETWORK=testnet`, staging `MEMWAL_RELAYER_URL`, `MEMWAL_ACCOUNT_REGISTRY`, `ENOKI_*`, `DATABASE_URL`) + `apps/web/.env.example` (`NEXT_PUBLIC_*`), plus the documented mainnet cutover values, loaded via `apps/api/src/pkg/config.ts`. (arch §10; Constitution VI)
- [x] T004 [P] Verify the `@soul/*` workspace builds after dependency changes: `pnpm install`, `pnpm lint`, `pnpm build`. (arch §3)
- [x] T005 🌐⚠️ Pipeline proof — throwaway script `apps/api/scripts/pipeline-proof.ts`: one MemWal `remember → recall` round-trip + one raw Walrus blob write/read; wire the MemWal SDK `/version` check (handle `MemWalCompatibilityError`). (sui-stack L3/L4; plan Stage 0)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Data model, shared types, and cross-cutting infrastructure every story depends on (requested step 1).

**⚠️ CRITICAL**: No user-story phase can begin until this phase is complete.

- [x] T006 [P] Define shared types in `packages/shared/src/index.ts` (`Namespace`, `MemoryItem`, `ConnectedApp`, `IngestionJob`, `AuditEntry`, request/response DTOs). (arch §8; data-model.md §D)
- [x] T007 [P] Drizzle schema `users` + `memwal_accounts` in `packages/db/src/schema/accounts.ts`. (data-model.md §B; arch §6)
- [x] T008 [P] Drizzle schema `namespaces`, `ingestion_jobs` (incl. `source_hash`), `documents` (incl. `content_hash`, `size`) in `packages/db/src/schema/content.ts`. (data-model.md §B)
- [x] T009 [P] Drizzle schema `connected_apps` (incl. `delegate_secret_enc`, `allowed_namespaces`) + `audit_log` (action enum incl. `ingest`/`restore`/`unfreeze`) in `packages/db/src/schema/permissions.ts`. (data-model.md §B; Principle IX)
- [x] T010 Generate + apply the Drizzle migration to Supabase (`pnpm db:generate`, `pnpm db:push`) and add a dev seed in `packages/db/src/seed.ts`. (arch §6)
- [x] T011 [P] At-rest encryption util for delegate keys/tokens in `apps/api/src/pkg/crypto/at-rest.ts` (encrypt/decrypt; **never log secrets**). (Principle IX; arch §9)
- [x] T012 [P] Audit-writer + request-logging middleware in `apps/api/src/pkg/middleware/audit.ts` and `logging.ts` (logging MUST redact secrets). (Principle IX; FR-027)
- [x] T013 [P] 🌐 Relayer rate-limit/backoff util (point-weight budgeting: analyze 10 / remember 5 / restore 3 / recall 1; 429 backoff; ~1 GB quota tracking) in `apps/api/src/services/memwal/limits.ts`. (sui-stack L4; Principle VII)
- [x] T014 ⚠️ Hono bootstrap + global error handler + `GET /health` (surfacing the MemWal `/version` check) in `apps/api/src/index.ts`. (contracts/api.md; NFR observability)
- [x] T015 Auth middleware seam (resolve session → user; replaces the temporary `x-user-id`) in `apps/api/src/pkg/middleware/auth.ts`. (CLAUDE §7; arch §3)

**Checkpoint**: Schema migrated, shared types compile, API boots with health + middleware. User stories can begin.

---

## Phase 3: User Story 1 — Sign in with no crypto setup (Priority: P1) 🎯 MVP

**Goal**: Google sign-in → owned Sui account, no seed phrase / wallet / fee; one `MemWalAccount` per person (requested step 2).

**Independent Test**: Fresh sign-in lands in a signed-in, owned, empty soul with no seed/fee prompt; repeat login does not create a second account.

- [x] T016 [P] [US1] 🌐⚠️ dApp Kit + Enoki provider; register the Enoki wallet; React Query setup in `apps/web/src/lib/providers/sui-provider.tsx`. (sui-stack L2)
- [x] T017 [US1] 🌐⚠️ Enoki zkLogin session service (nonce, callback, **cache the proof per session ~3 s**) in `apps/api/src/services/enoki/session.ts`. (sui-stack L2; Principle VII)
- [x] T018 [US1] 🌐⚠️ Sponsored-tx sponsor+execute helper in `apps/api/src/services/enoki/sponsor.ts` and `create_account` PTB builder in `apps/api/src/services/sui/account.ts` (verify mainnet package/registry IDs). (sui-stack L4)
- [x] T019 [US1] 🌐⚠️ Idempotent provisioning route `POST /account/provision` (exactly one `MemWalAccount` per Sui address) in `apps/api/src/routes/account.ts`. (FR-002; Principle I)
- [x] T020 [US1] Auth routes `POST /auth/enoki/nonce|callback`, `GET /auth/session`, `POST /auth/logout` + `GET /account` in `apps/api/src/routes/auth.ts`. (contracts/api.md; FR-001..005)
- [x] T021 [US1] Login UI (Google sign-in, no-seed/no-fee flow, ownership shown) + session hook in `apps/web/src/app/login/page.tsx` and `apps/web/src/lib/session.ts`, AND **close the documented web auth seam** by wiring `apps/web/src/lib/auth.ts` `getToken()` to return the Enoki session token (consumed by `apps/web/src/api/client.ts`). (FR-001..005; CLAUDE §7)
- [x] T022 [US1] **Validation checkpoint**: run quickstart US1 (sign-in → owned empty soul; idempotent provision; zero seed/fee — SC-001). (quickstart "US1")

**Checkpoint**: A person can sign in and owns an empty soul. MVP demoable.

---

## Phase 4: User Story 2 — Build a soul from my own data (Priority: P1)

**Goal**: Ingest paste/docs/own X+LinkedIn+GitHub → organized, searchable knowledge in three areas (GitHub files under Social), with processing/ready status and the plaintext disclosure (requested steps 3 & 4).

**Independent Test**: Add from all sources → each filed under the correct area; processing→ready; own-data only; disclosure shown before first upload.

- [x] T023 [P] [US2] 🌐⚠️ MemWal client service (`analyze`, `remember`, `rememberBulk` ≤20, `recall`) + **job polling / `waitForRememberJob`** in `apps/api/src/services/memwal/client.ts`. (sui-stack L4; Principle VII eventual consistency)
- [x] T024 [US2] 🌐 Namespace bootstrap (`bio`, `docs`, `social`) on account creation in `apps/api/src/services/memwal/namespaces.ts` + `namespaces` rows. (arch §6 data model; FR-013)
- [x] T025 [P] [US2] Document parsers (pdf-parse / mammoth / txt-md) + chunking in `apps/api/src/services/ingestion/parsers.ts`. (arch §2/§8; FR-008)
- [x] T026 [P] [US2] GitHub import (own public data via Octokit) in `apps/api/src/services/ingestion/github.ts`. (arch §8; FR-009)
- [x] T027 [P] [US2] X/LinkedIn **data-export archive** parser (own data only; reject third-party data) in `apps/api/src/services/ingestion/social.ts`. (research §C2; FR-010, FR-011)
- [x] T028 [US2] 🌐⚠️ Raw document blob upload/read via Walrus relayer/publisher+aggregator in `apps/api/src/services/walrus/blobs.ts` (verify publisher/aggregator URLs). (sui-stack L3; FR-008)
- [x] T029 [US2] 🌐⚠️ Ingest routes `/ingest/text|document|github|social` + `/ingest/jobs[/:id]` with **empty-input rejection** and **dedup** (`content_hash`/`source_hash`) in `apps/api/src/routes/ingest.ts`. (contracts/api.md; FR-007..015; edge cases)
- [x] T030 [US2] Builder UI: four ingest surfaces + per-job processing/ready polling in `apps/web/src/app/builder/page.tsx`. (FR-007..015; SC-004)
- [x] T031 [US2] **Plaintext-disclosure gate** before first upload (plain-language: the service can read your content) in `apps/web/src/app/builder/disclosure.tsx`. (Principle III; FR-016; SC-005)
- [x] T032 [US2] **Validation checkpoint**: run quickstart US2 (four sources → correct areas; processing→ready; own-data only; disclosure — SC-002/004/005). (quickstart "US2")

**Checkpoint**: A person can fill and search their soul; US1+US2 work independently.

---

## Phase 5: User Story 3 — Inspect and curate my soul (Priority: P2)

**Goal**: Browse by area, meaning-based search, provenance, edit, delete (requested step 5).

**Independent Test**: Browse each area; search by description (top-5); view source+date; edit; delete (gone from browse/search/recall).

- [x] T033 [US3] 🌐 Memory read routes `GET /memory` (browse/search → `recall`) and `GET /memory/:id` (detail; map `blob_id`→`blobId`, `text`→`snippet`/`content`) in `apps/api/src/routes/memory.ts`. (contracts/api.md; FR-017..019)
- [x] T034 [US3] 🌐 Edit `PATCH /memory/:id` (delete + re-`remember`) and delete `DELETE /memory/:id` (**de-index**; honest "stored copy is immutable" note) in `apps/api/src/routes/memory.ts`. (FR-020, FR-021; research §C3)
- [x] T035 [US3] Inspector UI: browse-by-area, meaning-based search, provenance (blob id / source / date), edit + delete in `apps/web/src/app/inspector/page.tsx`. (FR-017..021; SC-003)
- [x] T036 [US3] **Validation checkpoint**: run quickstart US3 (browse/search top-5; provenance; edit/delete reflected — SC-003). (quickstart "US3")

**Checkpoint**: A person can see, search, and curate exactly what Soul knows.

---

## Phase 6: User Story 4 — Grant and revoke AI-tool access (Priority: P1)

**Goal**: Connect AI tools with area scope, list them, revoke (effective on-chain), freeze, and audit (requested step 6).
*(P1; sequenced here per the requested "app runs at every milestone" order — curate before granting.)*

**Independent Test**: Connect a scoped tool → appears in list; revoke → it cannot reach the soul; freeze → all cut off; cap-20 enforced; grants/revokes audited.

- [x] T037 [P] [US4] 🌐⚠️ Sui PTB builders `add_delegate_key`, `remove_delegate_key`, `deactivate_account`, `reactivate_account` in `apps/api/src/services/sui/delegate.ts` (verify mainnet package/registry IDs; **cap 20**). (sui-stack L4 contract; FR-025..028)
- [x] T038 [US4] Delegate-key mint + **custody** (encrypt at rest, scope per app, **drop on revoke**, never log/return after issuance) in `apps/api/src/services/sui/custody.ts`. (Principle IX; FR-022, FR-023)
- [x] T039 [US4] 🌐⚠️ Permissions routes `POST/GET/DELETE /permissions/apps`, `POST /permissions/freeze|unfreeze`, `GET /permissions/audit` with **cap-20 (409)** enforcement in `apps/api/src/routes/permissions.ts`. (contracts/api.md; FR-022..028)
- [x] T040 [US4] Permissions Dashboard UI: connect (label + namespaces), list, revoke, freeze/unfreeze, audit history in `apps/web/src/app/permissions/page.tsx`. (FR-022..028)
- [x] T041 [US4] **Validation checkpoint**: run quickstart US4 (scoped grant; list; revoke; freeze; cap-20; audit entries). (quickstart "US4")

**Checkpoint**: A person can grant/revoke/freeze real, audited, on-chain access.

---

## Phase 7: User Story 5 — Use my soul inside AI tools (Priority: P2)

**Goal**: A connected AI client recalls the soul (granted areas only) via the MemWal MCP server; revoke/freeze kills recall (requested step 7).

**Independent Test**: A connected client recalls from granted areas only (no `ask` tool); after revoke/freeze it recalls nothing; another person's tool cannot reach this soul.

- [x] T042 [US5] 🌐⚠️ MCP connection-config endpoint `GET /mcp/config/:appId` — hosted Streamable HTTP (`Authorization: Bearer <delegate-key>` + `x-memwal-account-id`) + local stdio; **six tools, NO `ask`** — in `apps/api/src/routes/mcp-config.ts` (verify relayer `/api/mcp` endpoint). (sui-stack L4b; FR-029, FR-030)
- [x] T043 [US5] Connect-client UI (hosted + stdio config for Claude Desktop / Cursor; one-time delegate-key reveal) in `apps/web/src/app/connect/[appId]/page.tsx`. (FR-029, FR-030)
- [x] T044 [US5] 🌐 **Validation checkpoint**: run quickstart US5 (recall from granted areas only; no `ask`; **revoke/freeze kills recall** within 1 min; **cross-soul isolation** two-person test — SC-006, SC-007; FR-031, FR-032). (quickstart "US5" + "Revoke is real")

**Checkpoint**: A real AI client uses the soul; revoke is provably real.

---

## Phase 8: User Story 6 — Prove ownership and portability (Priority: P3)

**Goal**: Verify the soul is intact and restore it from Walrus independently of Postgres; show ownership (requested step 8).

**Independent Test**: Clear the index → restore recovers 100% from Walrus (restored/total shown); verify reports intact; ownership shown independent of the app.

- [x] T045 [P] [US6] 🌐⚠️ Restore endpoint `POST /restore` (MemWal `restore` → restored/skipped/total) in `apps/api/src/routes/restore.ts`. (sui-stack L4; FR-034; SC-009)
- [x] T046 [P] [US6] 🌐 Integrity `GET /verify` (intact + verified/total/missing) and `GET /ownership` (account object id + owner + explorer URL) in `apps/api/src/routes/portability.ts`. (FR-033, FR-036; SC-010)
- [x] T047 [US6] Portability UI: verify result, restore (restored/total), ownership proof (explorer link) in `apps/web/src/app/inspector/portability.tsx`. (FR-033..036)
- [x] T048 [US6] **Validation checkpoint**: run quickstart US6 (clear index → restore 100% from Walrus; verify intact; ownership independent of app — SC-009, SC-010). (quickstart "US6")

**Checkpoint**: Portability and verifiable ownership demonstrated end-to-end.

---

## Phase 9: Polish, Hardening & Deployment

**Purpose**: Cross-cutting hardening and decentralized hosting (requested step 9).

- [x] T049 [P] Security pass: confirm no delegate key/token is ever logged or returned after issuance, all are encrypted at rest and dropped on revoke; audit `apps/api/src/services/sui/custody.ts` + logging. (Principle IX)
- [x] T050 [P] Disclosure-copy review across the UI: managed relayer reads plaintext; delete = de-index (immutable copy persists); and the **login-loss limitation** (losing your Google account = losing access; no separate recovery in MVP). (Principle III; FR-016, FR-021, FR-006; research §C1)
- [ ] T051 🌐⚠️ Build the frontend and deploy as a **Walrus Site**: `WALRUS_SITE=1 pnpm --filter @soul/web build` (static export → `apps/web/out`, `ws-resources.json` present) then `site-builder deploy --epochs <N> ./apps/web/out`. (sui-stack L3 Walrus Sites; plan Stage 5) — ⛔ **OWNER-GATED**: needs the `site-builder` CLI (T002) + a funded testnet wallet. Static-export build config + `ws-resources.json` are done; only the network deploy remains.
- [ ] T052 [P] ⚠️ Deploy the API to Railway per `railway.toml` + `apps/api/Dockerfile` with **testnet** env (`SUI_NETWORK=testnet`, staging relayer URL); document the mainnet-cutover env. (arch §2; Constitution VI) — ⛔ **OWNER-GATED**: needs a Railway account + a managed Postgres (DATABASE_URL) + Enoki/Google creds. `railway.toml`, the Dockerfile, the Drizzle migrations (applied 2026-06-12), and the env templates are done; only the hosted deploy remains.
- [ ] T053 🌐⚠️ Full end-to-end quickstart run on **testnet** (sign-in → build → inspect → grant → recall → revoke → restore); repeat on mainnet at production cutover. (quickstart "Pass criteria"; SC-001..011) — ⛔ **OWNER-GATED**: requires the live adapters wired (the 4 [live-cutover.md](./live-cutover.md) decisions) + all live creds + a funded testnet wallet. The same flow is already verified end-to-end in **dev mode** (mock adapters) and by the 17 unit tests.
- [x] T054 [P] ⚠️ **Pre-launch beta re-verification**: confirm package/registry contract IDs, relayer URL, MCP `/api/mcp` endpoint, publisher/aggregator URLs, and SDK versions against live docs. (Constitution VI; sui-stack "Caveats") — ✓ Done 2026-06-05 via the multi-agent SDK-verification workflow (Context7 + web + on-chain RPC); results in [research.md](./research.md) "SDK verification (2026-06-05)". **Re-run immediately before the production deploy** (endpoints/IDs drift during beta).

---

## Dependencies & Execution Order

### Phase dependencies
- **Setup (P1)** → no deps; start immediately.
- **Foundational (P2)** → depends on Setup; **blocks all user stories**.
- **User Stories (P3–P8)** → all depend on Foundational. Sequenced US1 → US2 → US3 → US4 → US5 → US6 (requested order; each runs as a milestone). US5 depends on US4 (a granted connection) + US2 (content). US3/US6 depend on US2.
- **Polish/Deploy (P9)** → depends on the desired stories being complete (deploy after US1–US6 for the full demo).

### Within each story
- Service/PTB builders → routes → UI → validation checkpoint.
- `[P]` tasks touch different files and can run together.

### Parallel opportunities
- Setup: T002/T003/T004 in parallel (after T001).
- Foundational: T006–T009 (schema + types) in parallel; T011/T012/T013 in parallel.
- US2: parsers T025, GitHub T026, social T027 in parallel (independent files).
- US6: T045 (`restore.ts`) and T046 (`portability.ts`) in parallel (distinct files).
- Polish: T049/T050/T052/T054 in parallel.

## Parallel Example: Foundational data model

```bash
# Launch the foundational types + schema files together (independent files; Drizzle schemas
# do not import @soul/shared types, so T006 is concurrent, not a prerequisite):
Task: "T006 Shared types in packages/shared/src/index.ts"
Task: "T007 Drizzle schema users + memwal_accounts in packages/db/src/schema/accounts.ts"
Task: "T008 Drizzle schema namespaces/ingestion_jobs/documents in packages/db/src/schema/content.ts"
Task: "T009 Drizzle schema connected_apps + audit_log in packages/db/src/schema/permissions.ts"
```

## Implementation Strategy

### MVP first
1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1 Sign in). **STOP & validate** (T022) — you have an owned account.
2. Add Phase 4 (US2 Build a soul) → validate (T032). This is the core demoable MVP: build once, own it.

### Incremental delivery (app runs at every milestone)
US1 → US2 → US3 → US4 → US5 → US6, validating at each checkpoint, then Phase 9 deploy. Each story adds value without breaking the previous.

## Notes
- Re-verify every **⚠️** task against live docs before coding (beta caveat).
- Build/validate **🌐** tasks on testnet (`SUI_NETWORK=testnet`); mainnet is the production cutover (Constitution VI v3.0.0).
- Commit after each task or logical group; never commit secrets or `.env`.
- Tests are validation-checkpoint-based here; add unit/integration/e2e (Vitest/Playwright per plan) as a later hardening pass if desired.
