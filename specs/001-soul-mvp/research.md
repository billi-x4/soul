# Phase 0 Research — Soul MVP

All decisions are sourced from the two authoritative SKILLs (Constitution Principle VIII); this file
records them in Decision / Rationale / Alternatives form and resolves the spec's open clarifications
for planning. **Beta caveat (Principle VI)**: every package name, version, contract ID, and relayer URL
below MUST be re-verified against live docs at build time — they change during beta.

## 1. Monorepo & toolchain

- **Decision**: Keep the `webapp-starter` Turborepo (pnpm@9, Node ≥ 22, Biome), `@soul/*` scope. `apps/web`
  (Next.js 15 + Tailwind v4 + shadcn/ui), `apps/api` (Bun + Hono), `packages/db` (Drizzle + Supabase),
  new `packages/shared` (types). CLIs via `suiup` (`sui`, `walrus`, `site-builder`).
- **Rationale**: Architecture SKILL §2 fixes the stack; "keep its shape, change only what must be
  Sui-native." All-TypeScript MVP (SKILL §2 language note).
- **Alternatives**: Python MemWal worker (rejected for MVP — only if heavy async ingestion outgrows Bun).

## 2. Auth — Enoki zkLogin (Google) + sponsored gas

- **Decision**: `@mysten/enoki` + `@mysten/dapp-kit` (+ `@tanstack/react-query`). Register the Enoki
  wallet via dApp Kit; Google provider only; sponsor all transactions; **cache the zkLogin proof per
  session** (~3 s to generate). Clerk fully removed. Identity = the Sui address.
- **Rationale**: Sui-stack SKILL Layer 2; Constitution Principle I (single identity). Sponsored tx +
  Google give the web2 feel without seed phrases or fees.
- **Alternatives / fallback**: native `@mysten/sui/zklogin` + self-hosted prover (Principle V escape
  hatch; post-MVP). Extra providers beyond Google — out of scope (spec).

## 3. Memory engine — MemWal on Walrus, Seal-encrypted

- **Decision**: `@mysten-incubation/memwal`. `analyze(text, namespace)` for messy input → facts;
  `remember`/`rememberBulk` (≤ 20) for structured; `recall(query, {namespace, limit, maxDistance})` for
  retrieval; `restore(namespace)` for portability. Three namespaces: `bio`, `docs`, `social` (GitHub imports land in `social`).
  Managed relayer for MVP. Handle the SDK `/version` check (`MemWalCompatibilityError`).
- **Rationale**: Sui-stack SKILL Layer 4 — MemWal is the engine; managed/reused path for MVP.
- **Alternatives / fallback**: `@mysten-incubation/memwal/manual` (client-side Seal) or self-hosted
  relayer for zero-plaintext / quota relief — post-MVP (SKILL "Decision thresholds").

## 4. Storage — Walrus (SoT) + raw blobs

- **Decision**: Memory bytes live on Walrus via MemWal (Seal-encrypted). Raw uploaded documents stored as
  Walrus blobs (via relayer/publisher), blob id mirrored in Postgres `documents`. Envelope-encrypt large
  payloads; prefer relayer/publishers/aggregators over raw SDK writes (~2200 reqs/blob).
- **Rationale**: Sui-stack SKILL Layer 3; Source-of-Truth Matrix; throughput NFR.
- **Alternatives**: direct `@mysten/walrus` SDK writes (used only where the relayer path is unavailable).

## 5. Encryption — Seal (the only privacy layer)

- **Decision**: Seal via MemWal (managed mode) for MVP — no direct `@mysten/seal` calls on the critical
  path. The managed relayer **embeds + encrypts server-side and sees plaintext**; disclose this plainly
  in the UI before first upload.
- **Rationale**: Sui-stack SKILL Layer 5; Constitution Principle III. Privacy ≠ ownership/obscurity.
- **Alternatives**: direct `@mysten/seal` + custom `seal_approve` policies / manual mode — post-MVP.

## 6. Permissions — `memwal::account` on-chain delegate keys

- **Decision**: `add_delegate_key` / `remove_delegate_key` (owner only, **max 20**) per connected app;
  `deactivate_account` / `reactivate_account` for global freeze; all sponsored via Enoki. Namespace
  scoping is **relayer-enforced, not on-chain** — describe precisely. Mirror state in `connected_apps` +
  `audit_log`.
- **Rationale**: Sui-stack SKILL Layer 4 contract; Constitution Principle IV. On-chain owner/delegate
  authorization (a compromised relayer cannot forge it).
- **Contract IDs — re-verify before deploy.** Testnet (build): package
  `0xcf6ad755a1cdff7217865c796778fabe5aa399cb0cf2eba986f4b582047229c6`, registry
  `0xe80f2feec1c139616a86c9f71210152e2a7ca552b20841f2e192f99f75864437`. Mainnet (cutover): package
  `0xcee7a6fd8de52ce645c38332bde23d4a30fd9426bc4681409733dd50958a24c6`, registry
  `0x0da982cefa26864ae834a8a0504b904233d49e20fcc17c373c8bed99c75a7edd`.
- **Alternatives**: custom Seal policies for > 20 apps or richer logic — post-MVP.

## 7. App data — Supabase Postgres via Drizzle (metadata/index ONLY)

- **Decision**: Seven tables — `users`, `memwal_accounts`, `connected_apps`, `namespaces`,
  `ingestion_jobs`, `documents`, `audit_log` (data-model.md). Never store memory content. Fully
  reconstructable from on-chain state + Walrus via `restore`.
- **Rationale**: Architecture SKILL §6; Constitution Principle II.
- **Alternatives**: storing facts in Postgres (rejected — violates SoT and portability).

## 8. AI consumption — MemWal MCP server (six tools, no `ask`)

- **Decision**: `@mysten-incubation/memwal-mcp`. Hosted Streamable HTTP at `…/api/mcp` (auth
  `Authorization: Bearer <delegate-key>` + `x-memwal-account-id`); local stdio (`npx -y
  @mysten-incubation/memwal-mcp`) for Claude Desktop / Cursor. Six tools: `memwal_remember`,
  `memwal_recall`, `memwal_analyze`, `memwal_restore`, `memwal_login`, `memwal_logout`. **No `ask`** —
  for Q&A, call the SDK `ask` server-side or `recall` + let the client reason. `memwal_logout` clears
  local creds but does NOT revoke the on-chain delegate key.
- **Rationale**: Sui-stack SKILL Layer 4b; spec FR-029/030; Constitution guardrail (no `ask`).
- **Alternatives**: a Soul-hosted custom MCP server (rejected — reuse the MemWal MCP server).

## 9. Ingestion helpers

- **Decision**: `pdf-parse` (PDF), `mammoth` (docx), plain read (txt/md); `@octokit/rest` (or `fetch`)
  for GitHub public API; X/LinkedIn via the user's own data-export archive (and optional OAuth where a
  platform's official API allows). Chunk large docs before `analyze`. **Own-data only — never scrape
  third parties.**
- **Rationale**: Architecture SKILL §2 ingestion helpers + §8; spec FR-007..011; hard own-data boundary.

## 10. Hosting

- **Decision**: Frontend as a **Walrus Site** (`site-builder deploy --epochs <N> ./dist`), optional
  SuiNS handle — primary. API on **Railway** (Bun, Dockerfile); managed Postgres. Vercel = preview fallback.
- **Rationale**: Architecture SKILL §2 / Sui-stack SKILL Layer 3 (Walrus Sites) + build Stage 5;
  Constitution Principle IX (decentralized hosting is the primary target).

## 11. Network

- **Decision**: **testnet-first build, mainnet for production** — `SUI_NETWORK=testnet` across dev/demo
  env + config (staging relayer); cut over to mainnet for durable production persistence.
- **Rationale**: Constitution Principle VI (v3.0.0) + `CLAUDE.md` §2 #6 (owner's standing direction);
  aligns with the SKILLs' "build on testnet, then mainnet for persistence." Testnet is free and
  wipe-tolerant — ideal for building/demoing a beta-stack app without funding a mainnet wallet.
- **Cutover**: swap env to `mainnet` + production relayer and re-verify contract IDs/endpoints (T054).

---

## Resolved spec clarifications (for planning)

These three carried over from `spec.md` as `[NEEDS CLARIFICATION]`. The plan adopts the following
working decisions, grounded in the SKILLs + architecture constraints. **Recommend confirming via
`/speckit-clarify` and updating the spec to match.**

### C1 — FR-006: account recovery if the Google login is lost

- **Decision**: MVP relies on **Google re-authentication** for access continuity — Enoki/zkLogin derive
  the same Sui address deterministically on each Google sign-in, so logging back into the same Google
  account always restores the same soul. **Permanent loss of the underlying Google account is out of
  MVP recovery scope** (documented limitation; no separate Soul-managed recovery credential).
- **Rationale**: Identity = the Sui address derived via Enoki from the Google identity (Principle I). A
  separate recovery credential (backup key / exported seed) would reintroduce the seed-phrase UX the
  product explicitly removes and create a competing credential.
- **Alternatives**: social recovery / backup delegate key / seed export — all **post-MVP**.

### C2 — FR-010: X/LinkedIn self-import — live OAuth vs data-export archive

- **Decision**: MVP ships the **data-export archive** path (the user uploads their own downloaded X /
  LinkedIn export; Soul parses → `social` namespace). **Live OAuth connect is optional/post-MVP**, used
  only where a platform's official API permits own-data export without approval friction.
- **Rationale**: SKILL: "prefer official OAuth where available, OR ingest the export archive." The
  archive path is the reliable own-data route and avoids X/LinkedIn API approval risk for MVP. Own-data
  only; never scrape (hard boundary).
- **Alternatives**: OAuth-only (rejected — approval/access risk); scraping (rejected — ToS/own-data line).

### C3 — FR-021: what "delete" means

- **Decision**: "Delete" = **remove the item from the MemWal index + Postgres metadata** so it no longer
  appears in browse / search / recall. The underlying Walrus blob is **immutable and public and may
  persist**; this is **disclosed honestly** to the user (no false erasure claim).
- **Rationale**: Walrus blobs are public + immutable; true erasure is not guaranteed. Constitution
  Principle III forbids over-promising privacy. De-indexing is the honest, achievable MVP behavior.
- **Alternatives**: cryptographic shredding via per-item Seal key deletion (requires manual/custom Seal
  policies) — **post-MVP**; claiming hard erasure (rejected — false, violates Principle III).

---

## SDK verification (2026-06-05) — implementation decisions

A multi-agent live-docs verification (Context7 + web + on-chain RPC) confirmed the stack and surfaced
deltas the build encodes:

- **Versions (pinned exact)**: `@mysten/sui` 2.17.0, `@mysten/enoki` 1.0.8, `@mysten/walrus` 1.1.7,
  `@mysten/seal` 1.1.3 (NOT used in managed MVP — MemWal does Seal server-side), `@mysten/suins` 1.1.4
  (optional), `@mysten-incubation/memwal` 0.0.7, `@mysten-incubation/memwal-mcp` **0.0.4** (bumped from
  0.0.3). All confirmed on npm.
- **dApp Kit migration is LIVE**: legacy `@mysten/dapp-kit` 1.0.6 (currently installed) is deprecated;
  the new path is `@mysten/dapp-kit-react` 2.0.3 + `@mysten/dapp-kit-core` 1.3.2 (`createDAppKit` /
  `<DAppKitProvider>`, no `@tanstack/react-query` required). **Decision**: Enoki's published examples
  still target legacy dapp-kit and there is no documented Enoki+`createDAppKit` path yet, so the **MVP
  login flow uses legacy `@mysten/dapp-kit` 1.0.6**; migrating to `dapp-kit-react` (bridging Enoki via
  `walletInitializers`) is **post-MVP**.
- **MemWal auth model (confirmed)**: `MemWal.create({ key, accountId, serverUrl?, namespace? })` where
  `key` = Ed25519 **delegate** private key (hex); the owner address is derived **server-side** from the
  delegate public key. Account/delegate management via `@mysten-incubation/memwal/account` (needs
  `@mysten/sui`) or direct PTBs. Ops: `remember`→job, `rememberAndWait`/`waitForRememberJob`, `recall`,
  `analyze`/`analyzeAndWait`, `restore`, `compatibility()` (the `/version` check → `MemWalCompatibilityError`).
- **`memwal::account` PTB signatures (on-chain verified)**: `create_account(registry: &mut, clock)`,
  `add_delegate_key(account, public_key: vector<u8>, sui_address, label: String, clock)`,
  `remove_delegate_key(account, public_key)`, `deactivate_account(account)` / `reactivate_account`,
  `seal_approve(id, account)`. `MAX_DELEGATE_KEYS = 20`; registry enforces one account per address.
- **Contract IDs (on-chain confirmed)**: testnet package `0xcf6ad755…29c6` / registry `0xe80f2fee…4437`;
  mainnet package `0xcee7a6fd…a24c6` / registry `0x0da982ce…7edd`. Build uses testnet pair (Principle VI).
- **Rate limits (confirmed)**: 60 pts/min + 500 pts/hr per account; 30 pts/min per delegate key. Weights:
  analyze 10, remember 5, restore/manual 3, ask 2, recall 1. 1 GB/account quota.
- **Walrus SDK shape changed**: client-extension pattern `new SuiClient({url,network}).$extend(walrus({
  uploadRelay }))` → `client.walrus.writeBlob/readBlob`; prefer the Upload Relay for writes.

### Runnable-without-creds architecture (ports & adapters)

To deliver a runnable app before external credentials (Enoki keys, Google OAuth, Supabase, funded
testnet wallet) are provisioned, the API uses **ports & adapters** gated by a `SOUL_LIVE` flag:
- `SOUL_LIVE` false (default) → **dev/mock adapters**: in-memory repo + mock session + mock MemWal
  (deterministic embed/recall) so the full UX (all six user stories) runs locally with zero external
  services.
- `SOUL_LIVE` true (+ required creds present) → **live adapters** wired against the verified SDK APIs
  above (Enoki sponsorship, MemWal relayer, Sui PTBs, Walrus). Production-ready; flip via env at cutover.
This keeps the source-of-truth matrix intact (live mode), satisfies "the app runs at every milestone,"
and isolates the credential/beta-endpoint risk behind one flag.
