# Soul — Project Guide

> **Tagline:** *Your Second Soul.* A portable, user-owned, verifiable personal-memory web app built on the Sui Stack.

This file is the standing brief for every agent working in this repo. It is a map; the **authoritative design sources** are the two SKILLs in `docs/`. Precedence: a SKILL wins over this file on architecture/stack mechanics — *except* where **§Confirmed decisions** below records an explicit project decision (e.g. testnet-first build, mainnet for production), which overrides the SKILLs' generic defaults. If you make a new stack decision, record it here.

---

## 0. Standing instruction — read the SKILLs before you build (MANDATORY)

Before implementing **anything** in a given domain, read the relevant `docs/*/SKILL.md` in full first:

- **`docs/soul-architecture/SKILL.md`** — the *blueprint*: scope, functional/non-functional requirements, finalized stack, data model, key flows, repo structure, trust boundaries. Read this to know **what to build and how it fits together**.
- **`docs/sui-stack-for-soul/SKILL.md`** — the *parts catalog*: every Sui Stack layer (Sui L1, Enoki/zkLogin, Walrus, MemWal, Seal, SuiNS), official docs, exact package names + install commands, contract IDs, relayer URLs, rate limits, and beta caveats. Read this to know **which primitive to call**.

Rules of engagement:
- Touching auth, ingestion, storage, permissions, or AI-consumption? Locate the concern in the architecture SKILL **and** read the matching layer in the Sui-stack SKILL before writing code.
- The Sui Stack ships ~every two weeks and most pieces are **beta/alpha**. Treat your training data as stale. **Re-verify package names, contract IDs, relayer URLs, and rate limits against the live docs at build time** — the SKILL links are the entry points.
- Keep the two SKILLs and this file in sync.

---

## 1. What Soul is

Build your "second soul" **once** from your own data → **own it** on Sui → **use it in every AI tool** via MCP → **grant and revoke** each app's access on-chain.

A user signs in with Google (no seed phrase, no gas), imports their own data (pasted text, uploaded documents, and their own X/LinkedIn/GitHub data), and Soul turns it into facts that are **encrypted with Seal and stored on Walrus via MemWal**, organized into namespaces (`bio`, `docs`, `social` — GitHub is a social *source*, not its own namespace). The user **owns** this memory through their Sui account. Any MCP-aware AI client (Claude Desktop, Cursor) can `recall` the soul using a **scoped on-chain delegate key** the user grants — and revoking that key on-chain kills access for real. A `restore` action rebuilds the index from Walrus, proving the data is genuinely portable and decentralized. The Soul app itself is served decentralized as a **Walrus Site**.

**MVP is in scope** for: Google zkLogin + sponsored gas, auto-provision one `MemWalAccount` per user, ingestion (paste / docs / **own-data X+LinkedIn+GitHub social import**), Seal-encrypted storage on Walrus, a Soul Inspector (browse/search/edit/delete with provenance), a Permissions Dashboard (mint/list/revoke delegate keys + freeze), MCP consumption by a real client, the `restore` portability proof, and **decentralized hosting as a Walrus Site**.

**Explicitly out of scope (do NOT build now):** a "Sign in with Soul" SDK for third parties, a browser extension, login providers beyond Google, self-hosted relayer, custom Seal policies, Nautilus verifiable compute, and Sui Stack Messaging.

---

## 2. Confirmed decisions (authoritative for this project)

These are settled. They override generic SKILL defaults where they differ.

1. **Enoki zkLogin replaces Clerk.** Soul's identity *is* the user's Sui account; ownership and app permissions are enforced on-chain via that account's delegate keys. Two identity systems would conflict. All Clerk code/env/middleware/webhook is removed; Enoki session handling replaces it.
2. **Postgres is metadata/index ONLY.** It never stores memory content. It is a fast, reconstructable cache for the UI — if lost it is rebuilt from on-chain state + Walrus (`restore`). See the Source-of-Truth Matrix.
3. **Walrus + MemWal is the source of truth for memory.** The actual bytes of facts and documents live on Walrus, indexed by MemWal. This is the soul itself.
4. **Privacy comes only from encryption (Seal / the vault) — never ownership or obscurity.** Sui objects and Walrus blobs are **public and discoverable**. Two privacy modes ship, each honest about its trade: **(a) Managed mode (default)** routes through the relayer, which **sees plaintext** (it embeds + encrypts server-side with Seal) — this MUST be disclosed plainly in the UI; it is what powers semantic recall. **(b) Private mode (zero-plaintext, shipped 2026-06-12)**: content is sealed **in the browser** (passphrase → PBKDF2 → AES-256-GCM via WebCrypto, `@soul/shared/vault`) before upload; the API/relayer/Walrus only ever see envelopes, stored RAW on Walrus so they stay decryptable with the passphrase alone. The trade — disclosed in the UI — is that private items are never embedded, so they don't surface in semantic search or to connected AI tools over MCP. The envelope `scheme` field is the seam for Seal / MemWal `/manual` mode later.
5. **Permissions are on-chain delegate keys.** `add_delegate_key` / `remove_delegate_key` / `deactivate_account` on `memwal::account` are the real grant / revoke / freeze. Max **20 delegate keys** per account. Namespace scoping is **relayer-enforced, not on-chain** — be precise when describing "scoped access."
6. **Testnet-first build, mainnet for production.** Soul is built, tested, and demoed on **Sui/Walrus testnet** (free, fast, wipe-tolerant); `SUI_NETWORK=testnet` is the dev/demo default. **Mainnet is the production-persistence target** — durable real-user data cuts over to mainnet via env, re-verifying contract IDs/endpoints, budgeting WAL + SUI (paid by the sponsoring relayer wallet). *(Aligned with the SKILLs' "build on testnet, then mainnet for persistence" guidance. Constitution Principle VI, v3.0.0.)*
7. **Defense in depth — encrypt at every layer.** Beyond Seal-on-Walrus: encrypt secrets at rest (delegate keys, tokens), in transit (TLS), and in Postgres rows where sensitive. Never store unencrypted secrets in Sui objects or Walrus blobs (both public). Never log secrets.
8. **X / LinkedIn / GitHub = self-import of the user's OWN data.** The user connects and pulls **their own** data (official OAuth where available, their platform "download your data" export, or their own public GitHub profile — the user supplies/scrapes only their own account), Soul ingests it into the `social` namespace and stores it decentralized on **Sui + Walrus** like any other source. There is no separate `github` namespace — GitHub is one of the social sources. Soul never scrapes third parties.
9. **Walrus Sites is the primary hosting target.** Deploy the frontend as a Walrus Site (`site-builder`), optionally bound to a SuiNS name. Vercel (web) / Railway (api — `railway.toml` + `apps/api/Dockerfile`) remain only as centralized preview/fallback.
10. **Pin beta SDK versions.** MemWal, Seal, Enoki are **beta**; Nautilus and Messaging are testnet/alpha. Pin exact versions. Handle the MemWal SDK `/version` check (`MemWalCompatibilityError`). Use `@mysten/sui` (NOT `@mysten/sui.js`); watch the dApp Kit package migration.
11. **All-TypeScript MVP.** The MemWal Python SDK is optional — only add a Python worker if heavy/async ingestion outgrows the Bun API. Not needed for MVP.
12. **Workspace is rebranded to the `@soul/*` scope** (was `@repo/*`); root package is `soul`.

---

## 3. Finalized tech stack

**Base = `sullyo/webapp-starter`** (this repo). Keep its shape; change only what must be Sui-native.

| Concern | Choice | Notes |
|---|---|---|
| Monorepo | **Turborepo + pnpm** workspaces (`pnpm@9`, Node ≥ 22) | `apps/*` + `packages/*`, `@soul/*` scope |
| Lint/format | **Biome** (+ `ultracite`) | `pnpm format`, `pnpm lint` |
| API (`apps/api`) | **Bun + Hono** | runtime is Bun (`bun run --hot`); pnpm is the workspace manager |
| Web (`apps/web`) | **Next.js 15 + Tailwind v4 + shadcn/ui** | App Router |
| DB layer | **Drizzle ORM + Supabase (Postgres)** | repurposed — **metadata/index only** |
| Auth | **Enoki zkLogin (Google)** + sponsored gas | **replaces Clerk** |
| Memory engine | **MemWal** (`@mysten-incubation/memwal`) | ingest/recall/analyze/restore |
| Storage | **Walrus** blobs (via MemWal; `@mysten/walrus` for raw docs) | source of truth |
| Encryption | **Seal** (via MemWal) + **zero-plaintext vault** (browser WebCrypto, `@soul/shared/vault`) | the only privacy layers; `@mysten/seal` direct = future manual mode |
| Permissions | **`memwal::account`** on-chain delegate keys | grant/revoke/freeze |
| Chain / tx | **Sui L1** — `@mysten/sui` (PTBs) + `@mysten/dapp-kit` (+ `@tanstack/react-query`) | register Enoki wallet via dApp Kit |
| Identity handle | **SuiNS** (`@mysten/suins`) | optional polish, not MVP-critical |
| AI consumption | **MemWal MCP server** (`@mysten-incubation/memwal-mcp`) | hosted HTTP + local stdio |
| Hosting | **Walrus Sites** (`site-builder`) — primary; **Vercel** (web) / **Railway** (api) fallback | `railway.toml` + `apps/api/Dockerfile` |

---

## 4. Source-of-Truth Matrix

| Data | Lives in | Notes |
|---|---|---|
| Memory facts / embeddings | **Walrus + MemWal index** | Encrypted via Seal; the soul itself. |
| Raw uploaded documents | **Walrus blobs** | Blob id mirrored in the `documents` table. |
| Private (zero-plaintext) memories | **Walrus blobs** — client-encrypted envelopes, stored RAW | Sealed in the browser; only the passphrase decrypts. Metadata in `vaults`/`vault_items`; never indexed by the relayer. |
| Ownership + permissions | **Sui (`memwal::account`)** | Delegate keys, freeze state. |
| App/user metadata, jobs, audit | **Postgres** | Fast UI/index; reconstructable, **not** authoritative. |
| Identity | **Sui address (via Enoki)** | Postgres `users` row mirrors it. |

**Target Postgres tables (metadata/index only)** — see architecture SKILL §6 for fields: `users`, `memwal_accounts`, `connected_apps` (= delegate keys), `namespaces`, `ingestion_jobs`, `documents`, `audit_log`. (The current schema — `users` / `chats` / `chat_messages` — is the retained chat feature, not the final Soul schema; see §7.)

---

## 5. Repo structure & where things go

```
soul/
├── apps/
│   ├── api/        # @soul/api — Bun + Hono. routes/ + services/{enoki,memwal,sui,walrus,seal,ingestion} (to be added)
│   └── web/        # @soul/web — Next.js + shadcn. app/{login,builder,inspector,permissions} + lib/{dapp-kit+enoki providers, api client}
├── packages/
│   ├── db/         # @soul/db — Drizzle schema + migrations (Supabase)
│   ├── id/         # @soul/id — id generation
│   ├── logs/       # @soul/logs — logging
│   ├── typescript-config/  # @soul/typescript-config
│   └── shared/     # NEW: @soul/shared — shared types (Memory, ConnectedApp, Namespace, Job) — to be added
├── turbo.json · pnpm-workspace.yaml · biome.jsonc · railway.toml
```

- **Workspace scope is `@soul/*`** (e.g. `@soul/db`). Use it for new packages.
- The Sui Stack services go in `apps/api/src/services/`; the Soul pages in `apps/web/src/app/`; shared types in a new `packages/shared`.

---

## 6. Guardrails the naive implementation gets wrong

- **Eventual consistency.** `remember`/`analyze` return a `job_id` and run async. Poll / `rememberAndWait` / `waitForRememberJob` before showing "stored." Design the Inspector for "written but not yet queryable."
- **Throughput.** Direct SDK blob writes are request-heavy (~2200 reqs/blob). Use the relayer / public publishers / aggregators. Respect relayer rate limits (~60 pts/min, ~500 pts/hr/account; weights: analyze 10, remember 5, restore 3, ask 2, recall 1) — batch and backoff. Managed relayer quota ~1 GB/account. Chunk large documents before `analyze`; envelope-encrypt big payloads.
- **MCP has no `ask` tool.** Six tools total: `memwal_remember`, `memwal_recall`, `memwal_analyze`, `memwal_restore`, plus session `memwal_login` / `memwal_logout` (the four *memory* tools + two *session* tools). For Q&A, call the SDK's `ask` server-side or do `recall` + let the client reason. `memwal_logout` wipes local creds but does **not** revoke the on-chain delegate key.
- **Cache the zkLogin proof per session** (~3 s to generate), not per signature.
- **Delegate-key custody (managed-mode MVP):** the API holds/uses delegate keys to call the relayer — encrypt at rest, never log, scope per app, drop on revoke (see decision #7).
- **Secrets never go in Sui objects or Walrus blobs** (both public).

---

## 7. Current conversion status (read before touching code)

> **Zero-plaintext vault (2026-06-12) — SHIPPED.** Decision #4's client-side-encryption path is
> live as a full vertical: the browser derives an AES-256-GCM key from a vault passphrase
> (PBKDF2-SHA-256, 310k iters; isomorphic WebCrypto helpers in `packages/shared/src/vault.ts`)
> and seals paste text / files into versioned envelopes BEFORE upload — the API stores only
> public KDF params + a key-check (`vaults`) and envelope metadata (`vault_items`, migration
> `0007_vault.sql`); envelopes land RAW on Walrus (portable: passphrase alone decrypts, no Soul
> needed — `verify`/`restore` re-read + hash-check them). API: `/api/vault` + `/api/vault/items`
> (201-instant, no relayer, real delete) in `routes/vault.ts` + `services/vault-service.ts`; repo
> methods in both InMemoryRepo + DrizzleRepo. Web: Builder privacy toggle (Managed ⇄ Private,
> disclosure swaps, vault setup/unlock gate `components/soul/vault-gate.tsx`), Inspector
> "Private" tab (decrypt-to-reveal / download, label filter, real delete), Portability vault
> rows; key cached in sessionStorage for the tab, cleared on sign-out; losing the passphrase is
> unrecoverable BY DESIGN (no reset — the UI says so). Honesty surfaces updated: landing fine
> print, MCP recall tool description + Connect page state that private items are never indexed
> and never surface to AI tools. Verified: typecheck, 37/37 vitest, 45/45 smoke (incl. an
> in-process browser-ritual round-trip: encrypt → store → re-derive on a "new device" → decrypt;
> blob-equals-envelope; recall-exclusion), web build. Run `db:migrate` (0007) before live use.
>
> **Production-readiness pass (2026-06-11).** A multi-agent review + fix sweep hardened the
> dashboard end-to-end. New invariants: **dev-login** is gated by `config.devLoginEnabled`
> (`!isProd && (!live || SOUL_DEV_LOGIN=1)`) — live smoke runs now need `SOUL_DEV_LOGIN=1`;
> **sessions are revocable** via a per-user `users.session_epoch` (tokens embed it, `POST
> /auth/logout` bumps it; optional `SESSION_SIGNING_KEY` separates session signing from at-rest
> custody); **raw Walrus blobs (documents + personal context) are encrypted** with the at-rest
> cipher before write (Walrus is public); apps cap at **`MAX_CONNECTED_APPS` = 19** (the primary
> soul-web key holds the 20th on-chain slot); marketplace **payments stay in the derived-wallet
> custody domain** (both `transferSui` endpoints resolve through `ownerKeypair`) so failed
> purchases auto-refund + auto-revoke the orphaned key; gift claims are **atomic**
> (`claimAcquisition` returns won-or-not); the relayer **rate budget is enforced in
> `MemWalEngine`** (429 foreground, waited-out in background ingest); live memory routes are
> **capability-honest** (PATCH/DELETE → 501 in managed mode; GET returns `capabilities`);
> deploy config sets `NODE_ENV=production` (load-bearing) + `WEB_ORIGIN` (comma-separated CORS
> list) — since 2026-06-12 that is `railway.toml` + `apps/api/Dockerfile` (Railway replaced
> Render; `render.yaml` deleted; NODE_ENV baked into the image). Migration `0005_hardening.sql`
> (session_epoch + unique account per user) must run before live use. Verified: typecheck,
> 31/31 vitest, 34/34 smoke (mock), web build + `WALRUS_SITE=1` export.
>
> **Walrus Site deployed (2026-06-11) — testnet.** Site object
> `0xa37648ae6cd3a332b94711f11c91167c8360b342dae2d683c1deb57e605a7b6a` (id recorded in
> `apps/web/ws-resources.json`; blobs expire 2026-07-01 unless extended). Full runbook + verified
> facts in `docs/walrus-site-deploy.md`. Two constraints discovered for decision #9's "optionally
> bound to a SuiNS name": **wal.app serves only mainnet sites that have a SuiNS name linked** (no
> b36 subdomains, no testnet — testnet needs a self-hosted portal), and **`soul.sui` is already
> registered by a third party** (expires 2026-09-21), so `soul.wal.app` requires buying the name,
> waiting for it to drop, or choosing another name (5+ chars = 10 USDC/yr, e.g. `soulapp.sui`).
>
> **UI/UX recreation (2026-06-10): the "PULSE" design system** replaced Devotion — dark-only
> void/bone/red (OKLCH tokens in `apps/web/src/app/globals.css`; Archivo thin display + Geist +
> Spectral italic; canvas particle constellation in `apps/web/src/components/pulse/`), a rebuilt
> landing page (9 sections incl. marketplace preview + inverted "ledger" ownership section), a
> grouped sidebar shell, and 3 new dashboard pages (`/overview` home, `/marketplace`,
> `/analytics` real-data-only). Sign-in lives on its own **`/sign-in` route** (Google zkLogin +
> dev sign-in); unauthenticated visits to app routes redirect there, the auth callback lands on
> `/overview`, and signed-out marketing CTAs point at `/sign-in`. `soulFetch` throws
> `SoulApiError` with `.status` (shell signs out only on 401/403). See `apps/web/DESIGN.md`.
> Build + `WALRUS_SITE=1` export green.
>
> **Marketplace vertical (2026-06-10) — LIVE.** Users sell/send souls as SCOPED, REVOCABLE
> delegate-key licenses on the seller's `memwal::account` (never the bytes — decisions #3/#5);
> payment is a SUI transfer through the `ChainService` port (`transferSui`: mock digest in dev,
> managed-custodial sponsored PTB in `SuiChain` — buyer pays from the DERIVED owner address).
> API: `/api/market/*` (11 endpoints: listings CRUD, buy → key shown once, send → gift claimed
> once then wiped, acquisitions w/ live revoke status, sales, status) in
> `apps/api/src/services/market-service.ts` + `routes/market.ts`; repo methods in both
> InMemoryRepo + DrizzleRepo; tables in `packages/db/src/schema/market.ts` + hand-written
> `drizzle/0004_market.sql` (**run `db:migrate` before live use** — live Supabase lacks the
> tables); audit enum grew `list|unlist|purchase|gift`; dev-login accepts `{seed}` for multi-user
> dev. Web: `/marketplace` (Browse/My listings/Acquired/Send, shown-once ceremonies,
> dev-payments-simulated disclosure via `GET /api/market/status`). Verified: 31/31 vitest,
> 34/34 smoke (mock mode), and a live two-user HTTP flow (list→buy→sale→gift→claim→409→revoke).
>
> **Production hardening pass (2026-06-05).** Beyond the MVP below, the app also ships: **live
> Sui-Stack adapters wired** behind the container with graceful per-slot fallback (`DrizzleRepo` real
> Postgres, `EnokiAuth` real Google-JWT verification + HMAC sessions, `MemWalEngine`, `WalrusBlobStore`,
> `SuiChain` managed-custodial + Enoki-sponsored — all typecheck-clean, flip-ready by env); a full
> **MCP Host/Client/Server** architecture (`apps/api/src/mcp/`: stateless hosted HTTP at `POST /api/mcp`
> + SDK stdio + `SoulMcpClient` + `McpHost`, delegate-key auth, namespace scope — verified by
> `mcp:selftest`); and the **frontend Enoki zkLogin** sign-in (`/auth/callback` → `/api/auth/login`).
> The 4 beta blockers below are resolved with documented defaults (Enoki `getZkLogin` for server
> verification; managed-custodial `SuiChain`; `get`/`delete` honestly degraded in managed mode; Walrus
> writes gated on a funded signer). `apps/api` tsconfig uses `moduleResolution: bundler` (for `@mysten/*`
> subpath exports). Dev-login is hard-disabled in production. See [README.md](README.md) + [docs/MCP.md](docs/MCP.md).

The MVP (spec `specs/001-soul-mvp/`) is **implemented and runs end-to-end in dev mode** (mock adapters,
zero external services). Build status:
- **Clerk + Posts removed; `@soul/*` scope; chat demo replaced** by the Soul data model.
- **Data model**: `@soul/db` Drizzle schema = the 7 metadata/index tables (users, memwal_accounts,
  connected_apps, namespaces, ingestion_jobs, documents, audit_log); migration generated
  (`packages/db/drizzle/0000_*.sql`). `@soul/shared` holds domain types/consts.
- **API (`apps/api`)**: ports-&-adapters with a `SOUL_LIVE` flag (`src/services/`). Dev = in-memory
  repo + mock MemWal/Enoki/Sui/Walrus; all 7 route verticals implemented (auth, account, ingest,
  memory, permissions, mcp, portability) + crypto-at-rest, rate-limit budgeting, session seam.
  **Runtime-verified US1–US6.** 17 vitest tests pass. An in-process end-to-end smoke test
  (`pnpm --filter @soul/api smoke`) drives all six stories through the real route handlers + mock
  adapters: **21/21 assertions pass** (dev-login→ingest→recall→grant→revoke→audit→verify→restore→
  ownership + auth-enforced 401). An adversarial multi-agent review (API + web + SDD) passed with
  spec coverage clean; 7 confirmed defects (chunking guardrail, CORS origin, archive size cap, doc
  dedup, recall-limit validation, silent sign-in, SDD version) were fixed.
- **Web (`apps/web`)**: app shell + the `/sign-in` page (Google zkLogin / dev sign-in) + all six story pages (builder, inspector,
  permissions, connect, portability) wired to the typed `soulFetch`. Typechecks + production build.
- **Deploy**: gated static export (`WALRUS_SITE=1 pnpm build` → `./out`) + `ws-resources.json` for
  Walrus Sites; `railway.toml` + `apps/api/Dockerfile` (Railway, testnet env) for the API;
  managed Postgres (`pnpm db:migrate`).

**Live cutover** (Enoki/MemWal/Sui PTBs/Walrus + Drizzle repo, gated by `SOUL_LIVE` + creds) is
specified in `specs/001-soul-mvp/live-cutover.md`, which also flags **4 beta blockers** (Enoki server
session verification; MemWal managed-mode get/delete; sponsored-tx client-sign round-trip; Walrus
write signer) that need decisions before live operation. The legacy `auth.ts` (`x-user-id`) seam is
superseded by `pkg/middleware/session.ts`; the web `lib/auth.ts` now manages the dev session token.

---

## 8. Environment & networks (testnet build → mainnet production)

Replaces the starter's Clerk vars. See architecture SKILL §10 for the full list. **Re-verify contract IDs / relayer URLs / rate limits in the Sui-stack SKILL (Layer 4) at build time — they change during beta.**

```
# apps/api/.env
DATABASE_URL=...                 # Supabase Postgres
ENOKI_SECRET_KEY=... / ENOKI_PUBLIC_KEY=...
SUI_NETWORK=testnet              # decision #6 — testnet-first build (mainnet at cutover)
MEMWAL_RELAYER_URL=https://relayer-staging.memory.walrus.xyz   # staging (testnet) relayer
MEMWAL_ACCOUNT_REGISTRY=0xe80f2feec1c139616a86c9f71210152e2a7ca552b20841f2e192f99f75864437   # testnet registry (verify)
# MEMWAL package (testnet, verify): 0xcf6ad755a1cdff7217865c796778fabe5aa399cb0cf2eba986f4b582047229c6
# mainnet cutover: registry 0x0da982...75a7edd, package 0xcee7a6...58a24c6, relayer relayer.memory.walrus.xyz
# manual mode only: SEAL_* · raw blobs: WALRUS_PUBLISHER_URL / WALRUS_AGGREGATOR_URL

# apps/web/.env
NEXT_PUBLIC_ENOKI_PUBLIC_KEY=... · NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
NEXT_PUBLIC_SUI_NETWORK=testnet · NEXT_PUBLIC_API_URL=...
```

---

## 9. Build sequence (staged — from the Sui-stack SKILL)

0. **Toolchain + pipeline proof** — install CLIs via `suiup` (sui/walrus/site-builder); one `remember → recall` round-trip + one raw Walrus blob write/read.
1. **Auth + identity** — Enoki zkLogin (Google) + sponsored tx via dApp Kit; auto-create `MemWalAccount` on first login (idempotent, one per Sui address). Wire the auth seams from §7.
2. **Memory core** — MemWal ingest (`analyze` for messy input, `remember`/`rememberBulk` for structured) + `recall`; one namespace per domain.
3. **Permissions** — `memwal::account`: `add_delegate_key` per app (cap 20), `remove_delegate_key` to revoke, `deactivate_account` to freeze; Permissions Dashboard + audit log.
4. **AI-client surface** — wire the MemWal MCP server (hosted HTTP `/api/mcp` with Bearer delegate key + `x-memwal-account-id`; local stdio for Claude Desktop/Cursor).
5. **Ship the frontend** — **Walrus Sites** (`site-builder deploy --epochs <N> ./dist`), optionally tied to a SuiNS name.

---

## 10. Commands (root)

```
pnpm dev          # turbo run dev (all apps)
pnpm build        # turbo run build
pnpm lint         # biome via turbo
pnpm typecheck
pnpm format       # biome format --write .
pnpm db:push | db:generate | db:migrate | db:studio | db:seed   # Drizzle (packages/db)
```

API runs on Bun. Toolchain CLIs (`sui`, `walrus`, `site-builder`) install via `suiup` (see Sui-stack SKILL).

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/001-soul-mvp/plan.md` (with `research.md`, `data-model.md`, `contracts/api.md`,
and `quickstart.md` in the same directory). Active feature: **Soul MVP** (branch `001-soul-mvp`).
<!-- SPECKIT END -->
