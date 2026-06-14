# Implementation Plan: Soul MVP

**Branch**: `001-soul-mvp` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-soul-mvp/spec.md`

**Authoritative design sources** (read before implementing any layer — Constitution Principle VIII):
[`docs/soul-architecture/SKILL.md`](../../docs/soul-architecture/SKILL.md) (blueprint) and
[`docs/sui-stack-for-soul/SKILL.md`](../../docs/sui-stack-for-soul/SKILL.md) (parts catalog). This plan
encodes their finalized decisions; it does not invent alternatives.

## Summary

Soul lets a person build a portable, user-owned, verifiable personal-memory ("second soul") from their
own data and use it across AI tools, controlling access on-chain. The MVP delivers the six capabilities
in the spec: sign in (Enoki zkLogin + sponsored gas), build a soul (ingest paste/docs/GitHub/own
X+LinkedIn into Seal-encrypted memory on Walrus via MemWal), inspect/curate, grant & revoke AI-tool
access via on-chain delegate keys, consume via the MemWal MCP server, and prove ownership/portability
via `restore`.

**Technical approach**: Extend the existing `webapp-starter` monorepo (Turborepo + pnpm, `@soul/*`
scope). The Next.js web app handles login (dApp Kit + Enoki) and the Builder/Inspector/Permissions UIs;
the Bun + Hono API orchestrates Enoki sessions, sponsored Sui transactions (PTBs), MemWal
ingest/recall/analyze/restore, and delegate-key permissions. Supabase Postgres (via Drizzle) holds
**metadata/index only** and is fully reconstructable from on-chain state + Walrus. Walrus + MemWal is
the source of truth for memory; Seal is the only privacy layer (managed-relayer mode for MVP, which
sees plaintext and is disclosed). The frontend ships as a Walrus Site; the API on Railway; Postgres
managed (Supabase/Neon).

## Technical Context

**Language/Version**: End-to-end **TypeScript**. Workspace manager **pnpm@9**, Node ≥ 22 for tooling;
**Bun** runtime for `apps/api` (`bun run --hot`). Biome (+ ultracite) for lint/format.

**Primary Dependencies** (pin exact beta versions — Constitution VI; re-verify names/versions against
live docs at build time):
- Web: `next` (15), `tailwindcss` (v4), `shadcn/ui`, `@mysten/dapp-kit` (+ `@tanstack/react-query`),
  `@mysten/enoki`, `@mysten/sui`.
- API: `hono`, `@mysten/sui`, `@mysten/enoki`, `@mysten-incubation/memwal`, `@mysten/walrus`
  (raw doc blobs), `@mysten/seal` (manual mode only — post-MVP), `@octokit/rest`, `pdf-parse`,
  `mammoth`. Optional: `@mysten/suins` (handles).
- AI consumption: `@mysten-incubation/memwal-mcp` (hosted HTTP + local stdio).
- DB: `drizzle-orm`, `drizzle-kit`, Supabase Postgres driver.
- CLIs (via `suiup`): `sui`, `walrus`, `site-builder`.

**Storage** (per Source-of-Truth Matrix):
- **Walrus + MemWal index** — memory facts/embeddings (Seal-encrypted); the soul itself (SoT).
- **Walrus blobs** — raw uploaded documents (blob id mirrored in Postgres `documents`).
- **Sui L1 (`memwal::account`)** — ownership + delegate keys + freeze state (SoT for permissions).
- **Supabase Postgres (Drizzle)** — metadata/index ONLY: `users`, `memwal_accounts`, `connected_apps`,
  `namespaces`, `ingestion_jobs`, `documents`, `audit_log`. Reconstructable; not authoritative.

**Testing**: Unit — `bun test` / Vitest (services, parsers, mappers). Integration — API route tests
against a test Postgres and mocked/staged MemWal. End-to-end — Playwright for the headline flows
(sign-in, build, grant→recall→revoke, restore). Contract checks — validate request/response shapes
against `packages/shared` types and `contracts/`.

**Target Platform**: Modern web browsers (frontend); Bun service (API). Hosting: **Walrus Sites**
(`site-builder`) for the decentralized frontend (primary); **Railway** for the API; managed
Postgres (Supabase/Neon). Vercel (web) is a centralized preview/fallback only.

**Project Type**: Web application — monorepo with `apps/web` + `apps/api` + shared `packages/*`.

**Performance Goals** (from spec Success Criteria + SKILL NFRs):
- Sign-in to usable empty soul < 2 min; cache the zkLogin proof **per session** (~3 s to generate),
  not per signature (SC-001, NFR).
- Added information searchable within 2 min (handle MemWal **eventual consistency**: poll `job_id` /
  `waitForRememberJob`) with processing→ready status (SC-004).
- Meaning-based search: a known fact in top-5 results in ≥ 90% of an evaluation set (SC-003).
- Revoke effective within 1 min, verified by post-revoke recall failure (SC-007).
- Restore recovers 100% of items independently of Postgres, with restored/total counts (SC-009).
- Connected AI-tool recall returns the right knowledge for ≥ 90% of an evaluation set of prompts about
  known facts (SC-006).
- Usability (demo-grade): ≥ 90% of first-time people build a soul and connect one tool unassisted
  (SC-011).

**Constraints**:
- **Privacy = Seal only**; Sui objects + Walrus blobs are PUBLIC. Managed relayer **sees plaintext**
  (embeds + encrypts server-side) — disclosed plainly in UI before upload (Principle III; FR-016).
- **Relayer limits**: ~60 pts/min, ~500 pts/hr/account; op weights analyze 10 / remember 5 / restore 3
  / ask 2 / recall 1; managed quota ~1 GB/account. Batch + backoff; prefer relayer/publishers over
  raw SDK writes (~2200 reqs/blob).
- **Delegate-key cap = 20** per account (FR-028 ≥ 20 connected tools maps to this hard ceiling).
- **Key custody**: API holds/uses delegate keys for the relayer in managed mode — encrypt at rest,
  never log, scope per app, drop on revoke (Principle IX).
- **No fees to the user**: relayer wallet sponsors WAL + SUI (sponsored tx + storage); on testnet these are free faucet tokens.
- **Network = testnet-first build, mainnet at production cutover** (see below).

**Scale/Scope**: MVP single-region; per-user soul; ≤ 20 connected tools/soul; three namespaces
(`bio`, `docs`, `social` — GitHub imports land in `social`). Demo-grade concurrency; not yet multi-tenant scale-out.

> **NETWORK POLICY.** Per Constitution **Principle VI (v3.0.0)** Soul is **built and demoed on
> testnet** (`SUI_NETWORK=testnet` across dev/demo env + config) and cuts over to **mainnet for
> durable production persistence**. This matches the owner's standing testnet-first direction and the
> SKILLs' "build on testnet, then mainnet for persistence" guidance. The production cutover swaps env
> to mainnet and re-verifies contract IDs/endpoints; testnet is wipe-tolerant, so it is not used for
> long-lived production data.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design. Derived from
`.specify/memory/constitution.md` (v3.0.0).*

**Initial evaluation (pre-Phase 0):**

- [x] **I. Ownership / Identity** — PASS. Identity = Sui address via Enoki zkLogin (Google); no
  competing auth (Clerk removed). `POST /account/provision` is idempotent → exactly one `MemWalAccount`
  per Sui address (registry-enforced).
- [x] **II. Source of truth** — PASS. Memory content → Walrus + MemWal; the seven Postgres tables hold
  metadata/index only; `restore` rebuilds the index from Walrus (FR-034). No memory content in Postgres.
- [x] **III. Privacy = Seal** — PASS. No privacy claimed from ownership/Walrus; managed-relayer
  plaintext exposure disclosed before upload (FR-016, SC-005). Seal encrypts before Walrus.
- [x] **IV. Permissions** — PASS. `add_delegate_key` / `remove_delegate_key` / `deactivate_account` on
  `memwal::account`; revoke effective on-chain; every grant/revoke/freeze in `audit_log`; namespace
  scoping documented as **relayer-enforced, not on-chain** (FR-023 caveat). Cap 20 respected.
- [x] **V. Verifiable & portable** — PASS. `restore` + on-chain revoke preserved end-to-end; managed
  deps (Enoki, MemWal relayer) have documented native fallbacks (`@mysten/sui/zklogin`, self-hosted
  relayer, direct `@mysten/walrus` + `@mysten/seal`) — see research.md. No lock-in.
- [x] **VI. Network & pinning** — PASS (testnet-first build; Principle VI v3.0.0). `SUI_NETWORK=
  testnet` across dev/demo env + config; mainnet is the documented production-persistence cutover;
  beta SDKs pinned to exact versions; contract IDs / relayer URLs re-verified against live docs.
- [x] **VII. Beta correctness** — PASS. Eventual consistency handled via `job_id` polling /
  `waitForRememberJob`; relayer rate limits respected (batch + backoff); zkLogin proof cached per
  session; `MemWalCompatibilityError` from the SDK `/version` check handled.
- [x] **VIII. SKILLs read** — PASS. This plan is derived from both SKILLs; each layer references its
  SKILL section (auth → Layer 2, storage → Layer 3/4, encryption → Layer 5, permissions → Layer 4
  contract, MCP → Layer 4b).
- [x] **IX. Key custody** — PASS. Delegate keys + tokens encrypted at rest, never logged, scoped per
  app, dropped on revoke; no secrets in Sui objects or Walrus blobs.
- [x] **X. Scope** — PASS. Only the spec's MVP capabilities; post-MVP items (Sign-in-with-Soul SDK,
  browser extension, extra providers, self-hosted relayer, custom Seal policies, Nautilus, Messaging,
  public handle) explicitly out of scope.

**Result: PASS — no gate violations. Complexity Tracking is empty.**

## Project Structure

### Documentation (this feature)

```text
specs/001-soul-mvp/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 — decisions, rationale, alternatives, resolved clarifications
├── data-model.md        # Phase 1 — Postgres tables + off-Postgres entities + SoT matrix
├── quickstart.md        # Phase 1 — end-to-end validation/run guide
├── contracts/
│   └── api.md           # Phase 1 — HTTP API surface (request/response shapes)
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 — /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
soul/
├── apps/
│   ├── api/                      # @soul/api — Bun + Hono
│   │   └── src/
│   │       ├── routes/           # auth, account, ingest, memory, permissions, restore, mcp-config, health
│   │       ├── services/
│   │       │   ├── enoki/        # zkLogin sessions + proof cache, sponsored-tx builder
│   │       │   ├── sui/          # PTB builders: create_account, add/remove delegate key, (de)activate
│   │       │   ├── memwal/       # remember/recall/analyze/restore orchestration + job polling/backoff
│   │       │   ├── walrus/       # raw document blob upload/read (via relayer/publisher)
│   │       │   ├── seal/         # manual-mode client-side encryption (POST-MVP; stub for MVP)
│   │       │   └── ingestion/    # parsers (pdf-parse/mammoth/txt-md), github (octokit), x/linkedin export, chunking
│   │       ├── pkg/
│   │       │   ├── middleware/   # auth (Enoki session → x-user-id seam), rate-limit/backoff, error, audit
│   │       │   └── crypto/       # at-rest encryption for delegate keys/tokens
│   │       └── index.ts
│   └── web/                      # @soul/web — Next.js 15 + Tailwind v4 + shadcn/ui (App Router)
│       └── src/
│           ├── app/              # (marketing), login, builder, inspector, permissions, connect/[appId]
│           ├── components/       # shadcn UI + feature components (ingest forms, item cards, app rows)
│           └── lib/              # dApp Kit + Enoki providers, api client, session hooks
├── packages/
│   ├── db/                       # @soul/db — Drizzle schema + migrations (Supabase)
│   ├── shared/                   # @soul/shared — shared types (Memory, ConnectedApp, Namespace, Job, AuditEntry)  [NEW]
│   ├── id/                       # @soul/id — id generation
│   ├── logs/                     # @soul/logs — logging (must never log secrets)
│   └── typescript-config/        # @soul/typescript-config
├── turbo.json · pnpm-workspace.yaml · biome.jsonc · railway.toml
```

**Structure Decision**: Web-application monorepo, realized as the existing `webapp-starter`
Turborepo. We keep its shape and add the Sui Stack services under `apps/api/src/services/`, the Soul
pages under `apps/web/src/app/`, and a **new** `packages/shared` for cross-app types. The temporary auth
seams (`apps/api/src/pkg/middleware/auth.ts`, `apps/web/src/lib/auth.ts`, marked `TODO(enoki)`) are
where Enoki sessions wire in (Stage 1).

## Architecture

Six layers (per architecture SKILL §3); trust boundaries per SKILL §9.

1. **Consumers** — the user's browser and external **AI clients** (Claude Desktop, Cursor).
2. **Frontend (`apps/web`)** — Login (zkLogin via Enoki + dApp Kit), Soul Builder, Inspector,
   Permissions Dashboard. Holds no long-term secrets.
3. **Backend API (`apps/api`)** — Enoki session/auth, ingestion pipeline, MemWal orchestration,
   sponsored Sui PTB building, delegate-key custody, MCP connection config issuance. Uses delegate keys
   to call the relayer in managed mode.
4. **App Data (Supabase + Drizzle)** — metadata/index only; never memory content.
5. **Sui Stack (external, verifiable)** — Enoki (auth), MemWal (relayer + `memwal::account`), Walrus
   (encrypted blobs = SoT), Seal (encryption/access), Sui L1 (objects, ownership, delegate keys),
   SuiNS (optional handle).
6. **MCP Server (MemWal)** — bridges AI clients to `recall` via a scoped delegate key, without going
   through Soul's backend.

**Trust boundaries**: identity = the Sui address (Postgres mirrors, never authoritative); privacy =
Seal only (managed relayer = plaintext-at-server, disclosed); permission = on-chain delegate keys
(who) + relayer-enforced namespace scoping (what — not an on-chain guarantee); key custody = API
encrypts delegate keys at rest, scopes per app, drops on revoke.

## Component Breakdown

**Web (`apps/web`)**
- **Providers/lib** — dApp Kit + Enoki provider (register Enoki wallet), session hook (caches zkLogin
  proof per session), typed API client.
- **Login** — Google → Enoki zkLogin → Sui address; triggers idempotent account provisioning.
- **Soul Builder** — three ingest surfaces (paste, document upload, social self-import — X/LinkedIn
  export + GitHub connect) + per-job processing/ready status; the **plaintext disclosure** gate before first upload.
- **Soul Inspector** — browse by namespace, meaning-based search, item provenance (blob id/source/date),
  edit, delete.
- **Permissions Dashboard** — connect app (label + namespace scope) → returns MCP config; list apps;
  revoke; freeze/unfreeze; audit history.

**API services (`apps/api/src/services`)**
- **enoki/** — session creation, sponsored-tx sponsorship + execution, proof caching.
- **sui/** — PTB builders for `create_account`, `add_delegate_key`, `remove_delegate_key`,
  `deactivate_account`/`reactivate_account`.
- **memwal/** — `remember`/`rememberBulk`/`analyze`/`recall`/`restore`; job polling +
  `waitForRememberJob`; rate-limit budgeting (point weights) + backoff; `/version` compatibility check.
- **walrus/** — raw document blob upload/read via relayer/publisher + aggregator.
- **ingestion/** — parsers (pdf-parse, mammoth, txt/md), GitHub via Octokit, X/LinkedIn export-archive
  parser (+ optional OAuth), chunking + namespace routing; own-data-only enforcement.
- **seal/** — manual client-side encryption (post-MVP path; MVP uses Seal via MemWal).

**Packages**
- **db/** — Drizzle schema + migrations for the seven tables (see data-model.md).
- **shared/** — `Namespace`, `MemoryItem`, `ConnectedApp`, `IngestionJob`, `AuditEntry`, DTOs.

## API Surface

Full request/response shapes in [contracts/api.md](./contracts/api.md). Summary (Hono, REST, JSON;
session via Enoki; all mutating Sui ops sponsored):

| Area | Endpoint | Purpose | Spec FR |
|---|---|---|---|
| Auth | `POST /auth/enoki/nonce`, `POST /auth/enoki/callback`, `GET /auth/session`, `POST /auth/logout` | zkLogin sign-in + session | FR-001..004 |
| Account | `POST /account/provision`, `GET /account` | idempotent MemWalAccount; status | FR-002,005 |
| Ingest | `POST /ingest/text`, `POST /ingest/document`, `POST /ingest/github`, `POST /ingest/social`, `GET /ingest/jobs`, `GET /ingest/jobs/:id` | add data; poll jobs | FR-007..015 |
| Memory | `GET /memory`, `GET /memory/:id`, `PATCH /memory/:id`, `DELETE /memory/:id` | browse/search/detail/edit/delete | FR-017..021 |
| Permissions | `POST /permissions/apps`, `GET /permissions/apps`, `DELETE /permissions/apps/:id`, `POST /permissions/freeze`, `POST /permissions/unfreeze`, `GET /permissions/audit` | grant/list/revoke/freeze/audit | FR-022..028 |
| MCP | `GET /mcp/config/:appId` | hosted HTTP + local stdio config | FR-029..032 (US5) |
| Portability | `GET /verify`, `POST /restore`, `GET /ownership` | integrity, restore, ownership proof | FR-033..036 |
| Ops | `GET /health` | liveness | — |

The MemWal **MCP server** (six tools — `memwal_remember`, `memwal_recall`, `memwal_analyze`,
`memwal_restore`, `memwal_login`, `memwal_logout`; **NO `ask`**) is consumed by AI clients directly:
hosted Streamable HTTP at the relayer's `/api/mcp` (auth `Authorization: Bearer <delegate-key>` +
`x-memwal-account-id`), or local stdio (`npx -y @mysten-incubation/memwal-mcp`). Soul's API only issues
the connection config; it is not an MCP server itself. Recall is bound to exactly the owner's
`MemWalAccount` by the Bearer delegate key + `x-memwal-account-id` pair (a delegate key is valid only
for the account it was added to on-chain) — so revoke/freeze kills recall (FR-031) and a tool can never
reach another person's soul (FR-032).

## Data Model

Detailed in [data-model.md](./data-model.md). Seven Postgres tables (metadata/index only): `users`,
`memwal_accounts`, `connected_apps` (= delegate keys), `namespaces`, `ingestion_jobs`, `documents`,
`audit_log`. Off-Postgres entities of record: the `MemWalAccount` Sui object (ownership + delegate keys
+ freeze), memory items (Walrus + MemWal index, Seal-encrypted), and raw document blobs (Walrus). The
spec's Key Entities map: Person→`users`, Soul→`memwal_accounts` + the MemWal space, Knowledge item→
MemWal memory (mirrored minimally), Area→`namespaces`, Source/Document→`documents`, Connected tool→
`connected_apps`, Activity record→`audit_log`.

## Implementation Sequencing

Staged per the Sui-stack SKILL build sequence, mapped to spec user stories. Each stage is an
independently demonstrable slice.

- **Stage 0 — Toolchain + pipeline proof.** Install CLIs via `suiup` (sui/walrus/site-builder); pin
  SDK versions; one `remember → recall` round-trip + one raw Walrus blob write/read. Wire the
  `/version` compatibility check. *(Foundational; no user story.)*
- **Stage 1 — Auth + identity (US1, P1).** Enoki zkLogin (Google) + sponsored tx via dApp Kit; proof
  caching; idempotent `create_account` on first login; fill the auth seams. *(Delivers US1.)*
- **Stage 2 — Memory core + ingestion + inspector (US2 P1, US3 P2).** `analyze` for messy input,
  `remember`/`rememberBulk` for structured; three namespaces; parsers (pdf/docx/txt-md), GitHub
  (Octokit), X/LinkedIn export self-import; job polling + status; Seal envelope for doc uploads;
  Inspector browse/search/provenance/edit/delete; the plaintext disclosure gate. *(Delivers US2, US3.)*
- **Stage 3 — Permissions (US4, P1).** `add_delegate_key` per app (cap 20), `remove_delegate_key`,
  `deactivate_account`/`reactivate_account`; Permissions Dashboard + `audit_log`; delegate-key custody
  (encrypt at rest, scope, drop on revoke). *(Delivers US4.)*
- **Stage 4 — AI-client surface (US5, P2).** Issue MemWal MCP config: hosted HTTP (Bearer delegate key
  + `x-memwal-account-id`) + local stdio for Claude Desktop/Cursor; verify recall scoped to granted
  namespaces and that revoke/freeze kills recall. *(Delivers US5.)*
- **Stage 5 — Portability + hosting (US6, P3).** `restore(namespace)` with restored/skipped/total;
  integrity check; ownership proof; deploy the frontend as a **Walrus Site** (`site-builder deploy
  --epochs <N> ./dist`), optional SuiNS handle; API on Railway; managed Postgres. *(Delivers US6 +
  decentralized hosting.)*

## Non-Functional Requirements — how they are honored

- **Eventual consistency** — every `remember`/`analyze` returns a `job_id`; the API polls /
  `waitForRememberJob` before reporting "stored"; the Inspector renders "processing → ready" and
  tolerates "written but not yet queryable" (FR-015, SC-004).
- **Relayer rate limits / quota** — a budgeting layer accounts for point weights (analyze 10 / remember
  5 / restore 3 / recall 1; `ask` is SDK-only and not on this relayer-budgeting path), batches
  `rememberBulk` (≤ 20), and backs off on 429; large documents are
  chunked before `analyze`; envelope-encrypt big payloads; ~1 GB/account quota tracked.
- **zkLogin proof caching** — generated once per session (~3 s), cached client-side; never per signature.
- **Seal-only privacy + disclosure** — Seal encrypts before Walrus; the UI discloses managed-relayer
  plaintext before first upload (Principle III).
- **Key custody** — delegate keys/tokens encrypted at rest (`pkg/crypto`), never logged, scoped per app,
  dropped on revoke (Principle IX).
- **Pinned betas + verification** — exact versions in `package.json`; contract IDs / relayer URLs
  re-verified against live docs before deploy (Principle VI).
- **Source-of-truth integrity** — no memory content in Postgres; `restore` proves reconstructability.

## Risks & Mitigations

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | Beta SDK churn (MemWal/Seal/Enoki) — names, contract IDs, relayer URLs change | Build breaks | Pin exact versions; handle `MemWalCompatibilityError`; re-verify IDs/URLs at build time (Principle VI); centralize config |
| R2 | MemWal eventual consistency mis-handled | "stored" shown before queryable | Always poll `job_id`/`waitForRememberJob`; design Inspector for not-yet-queryable |
| R3 | Relayer rate limits / ~1 GB quota | Ingestion throttled/blocked | Point-weight budgeting, batching, backoff; chunk docs; plan self-host path (post-MVP) |
| R4 | Delegate-key cap = 20/account | Cannot exceed 20 connected tools | Surface limit in UI (FR-028); custom Seal policies are the post-MVP escape |
| R5 | Managed relayer sees plaintext | Privacy misperception | Disclose plainly before upload (FR-016, SC-005); manual/self-host mode is the post-MVP zero-plaintext path |
| R6 | Mainnet costs (WAL + SUI) on the sponsoring wallet | Operational cost / drained sponsor | Budget per-op weights + storage epochs; monitor relayer wallet balance |
| R7 | X/LinkedIn API access/approval friction | Live OAuth import may be blocked | MVP ships the **data-export archive** path (own data, no approval); OAuth optional (research.md) |
| R8 | Delegate-key custody leak | Full compromise of a user's memory | Encrypt at rest, never log, scope per app, drop on revoke; defense in depth (Principle IX) |
| R9 | zkLogin proof latency (~3 s) | Sluggish sign-in | Cache proof per session; show progress |
| R10 | Walrus Sites deploy + SuiNS binding complexity | Hosting slips | Treat as Stage 5; Vercel/Railway fallback for preview; budget storage epochs |
| R11 | Namespace scoping is relayer-enforced, not on-chain | Over-stated "scoped access" | Describe precisely (FR-023 caveat); revoke/freeze are the absolute on-chain controls |
| R12 | Network cutover testnet→mainnet (config + contract IDs differ) | Wrong env/costs at launch | Build on testnet (Principle VI v3.0.0); document the mainnet cutover (env swap + re-verified IDs); re-verify before launch (T054) |

## Complexity Tracking

> No Constitution Check violations. This section is intentionally empty.

## Post-Design Constitution Re-check

*Re-evaluated after Phase 1 (data-model.md, contracts/api.md, quickstart.md).* The design introduces no
new principle violations: the seven tables hold metadata/index only (II), the API never returns
delegate keys in raw form after issuance and never logs them (IX), the contract surface routes all
privacy through Seal and discloses plaintext (III), revoke/freeze map to on-chain calls with audit
(IV), and `restore`/ownership endpoints preserve portability (V). **Result: PASS.**
