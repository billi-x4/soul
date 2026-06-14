---
name: soul-architecture
description: >
  Authoritative system design, architecture, requirements, data model, and finalized
  tech stack for "Soul" — a portable, user-owned, verifiable personal-memory web app
  built on the webapp-starter monorepo (Turborepo + Bun/Hono API + Next.js web + Drizzle
  + Supabase) extended with the Sui Stack (Enoki zkLogin, Walrus, MemWal/Walrus Memory,
  Seal, Sui L1, SuiNS) and consumed by AI clients via an MCP server with on-chain
  delegate-key permissions. USE THIS SKILL whenever the task touches Soul's architecture,
  system design, infrastructure, functional/non-functional requirements, project scope,
  data modeling, repo/monorepo structure, the tech-stack decision, where data lives
  (Postgres vs Walrus), trust boundaries, key custody, deployment, or env configuration —
  even if the specific term isn't named. For per-technology API details, package names,
  contract IDs, and beta caveats, READ THE COMPANION SKILL `sui-stack-for-soul/SKILL.md`;
  this skill is the blueprint, that one is the parts catalog.
---

# Soul — Architecture & System Design

This skill is the blueprint for Soul: scope, requirements, finalized stack, architecture, data model, flows, repo structure, and trust boundaries. For SDK/package/contract specifics, read the companion skill **`sui-stack-for-soul/SKILL.md`**. Keep the two in sync; this one says *what to build and how it fits together*, that one says *which primitive to call*.

## How to use this skill

1. Before writing code, locate the concern (auth, ingestion, storage, permissions, AI-consumption) in the **Architecture** and **Functional Requirements** sections.
2. Respect the **Source-of-Truth Matrix** — never put memory content in Postgres; never claim privacy from Sui ownership (only Seal provides it).
3. Follow the **Repo Structure** so changes land in the right monorepo app/package.
4. Honor the **Non-Functional Requirements** (especially eventual consistency, proof caching, rate limits) — they are where naive implementations break.
5. Pin versions; treat MemWal/Seal/Enoki as beta (see companion skill).

---

## 1. Product scope

**One-line product.** Build your "second soul" once from your own data; own it on Sui; use it in every AI tool via MCP; grant and revoke each app's access on-chain.

### In scope (MVP)
- Google sign-in via **Enoki zkLogin** → a Sui account; **sponsored gas** (no seed phrase, no tokens for the user).
- Auto-create the user's **MemWalAccount** (Sui object) on first login.
- **Ingestion** from three sources: copy-paste text (structured/unstructured), **document upload** (pdf/docx/txt/md), and **social self-connect** (**X / LinkedIn / GitHub**) — the user connects and imports **their own** data (prefer official OAuth or the platform's "download your data" export; GitHub via the public API; the user pulls it, Soul ingests it). The data is then stored decentralized on **Sui + Walrus** like any other source.
- Transform input into facts (`analyze`) and store them **Seal-encrypted on Walrus via MemWal**, organized into namespaces: `bio`, `docs`, `social` (GitHub imports land in `social` — it is a social source, not its own namespace).
- **Soul Inspector**: browse/search memory by namespace; see provenance (blob id, source, timestamp); edit/delete.
- **Permissions Dashboard**: connect an AI client/app → mint a scoped **delegate key**; list connected apps; **revoke** (remove delegate key); **freeze** account.
- **AI consumption**: connect a real client (Claude Desktop / Cursor) to the **MemWal MCP server** so it can `recall` the soul.
- **Portability proof**: `restore` rebuilds the index from Walrus.
- **Decentralized hosting**: deploy the Soul frontend as a **Walrus Site** (`site-builder`), optionally linked to a SuiNS name — so the app itself is served from the decentralized stack, not just the data.

### Out of scope (post-MVP — do NOT build now)
- "Sign in with Soul" SDK for third-party developers.
- Browser extension; multi-provider OAuth beyond Google (note: X/LinkedIn here are *data connections* for self-import, not login providers).
- Self-hosted relayer; custom Seal access policies; Nautilus verifiable compute; Sui Stack Messaging.

---

## 2. Finalized tech stack

**Base = `sullyo/webapp-starter`** (Turborepo monorepo, pnpm, TypeScript, Biome). Keep its shape; change only what must be Sui-native.

### Keep from the starter
- **Monorepo:** Turborepo + pnpm workspaces; Biome for lint/format.
- **API (`apps/api`):** **Bun + Hono**.
- **Web (`apps/web`):** **Next.js + Tailwind + shadcn/ui**.
- **DB layer:** **Drizzle ORM + Supabase (Postgres)** — but repurposed (see Source-of-Truth Matrix).
- **Deploy:** **Walrus Sites** (`site-builder`) for the decentralized frontend, optionally bound to a SuiNS name — the primary hosting target for Soul. **Vercel** (web) usable as a centralized/preview alternative; **Railway** (api — Dockerfile + `railway.toml`) for the Bun backend; managed Postgres (Supabase/Neon). Ngrok for local webhook/dev.

### Replace
- **Clerk → Enoki zkLogin.** *Decision + rationale:* Soul's identity must be the user's **Sui account**, because memory ownership and app permissions are enforced on-chain via that account's delegate keys. Two identity systems (Clerk + Sui) would conflict and undermine the "user-owned" guarantee. Enoki gives Google→Sui zkLogin **and** sponsored transactions, preserving the web2 feel Clerk provided. Remove Clerk packages, env vars, middleware, and the Clerk→user webhook; replace with Enoki session handling.

### Add (Sui Stack)
- `@mysten/sui` — base SDK, transactions (PTBs).
- `@mysten/dapp-kit` (+ `@tanstack/react-query`) — React wallet/tx hooks; register Enoki wallet.
- `@mysten/enoki` — zkLogin + sponsored tx.
- `@mysten-incubation/memwal` — memory engine (ingest/recall/analyze/restore).
- `@mysten-incubation/memwal-mcp` — MCP server for AI clients.
- `@mysten/seal` — only if doing client-side/manual encryption or custom policies (otherwise used via MemWal).
- `@mysten/walrus` — only for direct raw-document blob writes if not routed through MemWal.
- `@mysten/suins` — optional human-readable handles.
- `site-builder` CLI — deploy the frontend as a Walrus Site (decentralized hosting).

### Ingestion helpers
- Document parsing: `pdf-parse` / `mammoth` (docx) / plain read for txt-md.
- GitHub: `@octokit/rest` or plain `fetch` against the public API.
- X / LinkedIn (self-import): prefer **official OAuth** where available, or ingest the user's **"download your data"** export archive (zip/json/csv) — the user supplies their own data; Soul never scrapes third parties. Parse the export, map to the `social` namespace, then `analyze`/`remember` like any other source.

### Language note
Keep the MVP **all-TypeScript** to match the starter. The **MemWal Python SDK** is optional — introduce a Python worker only if heavy/async ingestion (large document batches, embeddings preprocessing) outgrows the Bun API. Not needed for MVP.

---

## 3. Architecture overview

Six layers (see the architecture diagram). Each layer's responsibility:

1. **Consumers** — the User (browser) and external **AI Clients** (Claude Desktop, Cursor, ChatGPT).
2. **Frontend (`apps/web`, Next.js)** — Login (zkLogin via Enoki + dApp Kit), Soul Builder (ingestion UI), Soul Inspector, Permissions Dashboard. Holds no long-term secrets; in optional manual mode it performs client-side Seal encryption.
3. **Backend API (`apps/api`, Bun/Hono)** — Auth/session (Enoki), the ingestion pipeline, memory orchestration (MemWal SDK calls), Sui transaction building (sponsored: create account, add/remove delegate key), and issuing MCP connection config/keys. This is where delegate keys are used to call the relayer in the managed-mode MVP.
4. **App Data (Supabase Postgres + Drizzle)** — metadata and index **only**: users, connected-apps registry, ingestion jobs, document metadata, audit log. **Never stores memory content.**
5. **Sui Stack (external, verifiable)** — Enoki (auth), MemWal (relayer + `memwal::account` contract), Walrus (encrypted blobs = source of truth), Seal (encryption/access), Sui L1 (objects, ownership, delegate keys), SuiNS (handles).
6. **MCP Server (MemWal)** — the bridge that lets AI clients `recall` the soul using a scoped delegate key, without going through Soul's own backend.

**Data flow.** User → Frontend → API → (Postgres for metadata) + (Sui Stack for memory). MemWal writes encrypted blobs to Walrus, encrypts via Seal, and records ownership/permissions on Sui. AI clients connect to the MemWal MCP server with a delegate key the API issued, and `recall` directly.

---

## 4. Functional requirements

- **FR1 — Auth.** Sign in with Google via Enoki zkLogin; derive a Sui address; sponsor gas. Cache the ZK proof per session.
- **FR2 — Account provisioning.** On first login, create one `MemWalAccount` for the user (idempotent — one per Sui address).
- **FR3 — Ingestion.** Accept copy-paste text, document uploads (pdf/docx/txt/md), and **social self-imports — X / LinkedIn / GitHub** (user-connected via OAuth, their own data-export archive, or GitHub public data — own data only; all land in the `social` namespace). Run `analyze` to extract facts; route each source to its namespace.
- **FR4 — Storage.** Persist facts as MemWal memories (Seal-encrypted, on Walrus). Store raw uploaded documents as Walrus blobs; keep blob metadata in Postgres.
- **FR5 — Inspector.** List/search memory per namespace; show provenance (blob id, source, created_at, which delegate key wrote it); allow edit/delete.
- **FR6 — Permissions.** Connect an app/AI client → generate a scoped delegate key (label + allowed namespaces) → `add_delegate_key` (cap 20). List connected apps with status. Revoke via `remove_delegate_key`. Global freeze via `deactivate_account`. Record every grant/revoke in the audit log.
- **FR7 — AI consumption.** Produce MCP connection details: hosted Streamable HTTP (Bearer delegate key + `x-memwal-account-id`) for cloud clients, or local stdio config for Claude Desktop/Cursor. Built around the six real MCP tools (no `ask`).
- **FR8 — Portability.** Provide a `restore` action that rebuilds the index from Walrus and shows counts (restored/skipped/total) — the verifiability demo.
- **FR9 — Identity handle (optional).** Resolve/attach a SuiNS name for display and sharing.

---

## 5. Non-functional requirements

- **Security.** Never store unencrypted secrets in Sui objects or Walrus (both are public). Define a **delegate-key custody policy**: in managed-mode MVP the API uses keys to call the relayer — store them encrypted at rest, scope per app, rotate on revoke. Prefer **manual mode** (client-side Seal) for the privacy-hardened path.
- **Privacy.** Disclose plainly that the **default managed relayer sees plaintext** (it embeds + encrypts server-side). For "we can't read your soul," Soul ships a **zero-plaintext private vault**: a passphrase-derived AES-256-GCM key (PBKDF2, WebCrypto) seals content in the browser before upload; envelopes are stored RAW on Walrus (decryptable with the passphrase alone), never embedded, and therefore excluded from semantic recall and MCP — disclosed as the trade. The envelope `scheme` field is the seam for full Seal / MemWal `/manual` mode or a self-hosted relayer later. Privacy derives **only** from encryption — never object ownership or obscurity.
- **Performance.** Cache the zkLogin proof per session (~3 s to generate). Handle MemWal **eventual consistency**: `remember` returns a `job_id`; poll/`waitFor` before showing "stored," and design the Inspector for "written but not yet queryable." Chunk large documents before `analyze`. Use relayer/publishers/aggregators, not raw SDK writes (~2200 reqs/blob).
- **Reliability / availability.** Walrus tolerates ~1/3 nodes down for writes, ~2/3 for reads. **Use mainnet for anything persistent** — testnet is wiped. Plan for relayer SLA limits (self-host fallback).
- **Scalability.** Managed relayer ~1 GB/account quota and ~60 pts/min / 500 pts/hr/account rate limits (op weights: analyze 10, remember 5, restore 3, ask 2, recall 1) shape ingest throughput — batch and backoff. Delegate-key cap is 20/app-account → custom Seal policies if exceeded.
- **Cost.** Mainnet storage costs WAL + SUI, paid by the relayer wallet (sponsored) in managed mode; budget per-operation weights and storage epochs.
- **Observability.** Persist ingestion job status and errors; surface a grant/revoke audit log; handle `MemWalCompatibilityError` from the SDK `/version` check.
- **Maintainability / DX.** Monorepo, end-to-end TypeScript, pinned versions, shared types in `packages/`. Treat all Sui Stack betas as moving targets.

---

## 6. Data model (Postgres via Drizzle) + Source-of-Truth Matrix

Postgres holds **metadata/index only**. Suggested tables:

- **users** — `id`, `sui_address` (unique), `oauth_subject`, `display_name`, `suins_name?`, `created_at`.
- **memwal_accounts** — `user_id`, `account_object_id`, `owner_address`, `active`, `created_at`.
- **connected_apps** (= delegate keys) — `id`, `user_id`, `delegate_public_key`, `delegate_address`, `label`, `allowed_namespaces` (jsonb), `status` (active|revoked), `created_at`, `revoked_at?`.
- **namespaces** — `user_id`, `name` (`bio`|`docs`|`github`|`social`|custom), `created_at`.
- **ingestion_jobs** — `id`, `user_id`, `source_type`, `namespace`, `memwal_job_id`, `status`, `error?`, `created_at`.
- **documents** — `id`, `user_id`, `namespace`, `filename`, `walrus_blob_id`, `mime`, `size`, `created_at`.
- **vaults** — `user_id` (pk), `kdf_params` (jsonb: PUBLIC salt/iterations/key-check — the passphrase never reaches the server), `created_at`.
- **vault_items** — `id`, `user_id`, `namespace`, `label` (the only content-bearing plaintext field; kind/size/timestamps are also visible metadata), `kind` (text|file), `size_bytes`, `walrus_blob_id` (raw client-encrypted envelope), `envelope_hash`, `scheme`, `created_at`.
- **audit_log** — `id`, `user_id`, `action` (grant|revoke|ingest|freeze|restore), `target`, `metadata` (jsonb), `created_at`.

### Source-of-Truth Matrix
| Data | Lives in | Notes |
|---|---|---|
| Memory facts / embeddings | **Walrus + MemWal index** | Encrypted via Seal; the soul itself. |
| Raw uploaded documents | **Walrus blobs** | Blob id mirrored in `documents`. |
| Private (zero-plaintext) memories | **Walrus blobs** (raw client-encrypted envelopes) | Sealed in the browser; passphrase alone decrypts; indexed in `vault_items`, never by the relayer. |
| Ownership + permissions | **Sui (`memwal::account`)** | Delegate keys, freeze state. |
| App/user metadata, jobs, audit | **Postgres** | Fast UI/index; reconstructable, not authoritative. |
| Identity | **Sui address (via Enoki)** | Postgres `users` row mirrors it. |

If Postgres is lost, it can be rebuilt from on-chain account state + Walrus (`restore`). That is the portability guarantee in practice.

---

## 7. Key flows (sequence summaries)

- **Login:** Google → Enoki zkLogin → Sui address → (if new) build sponsored tx to `create_account` → upsert `users` + `memwal_accounts`.
- **Ingest:** upload/paste/social-import (X/LinkedIn export, GitHub) → API parses & chunks → `analyze`/`remember` into the source namespace → store doc/export blob on Walrus → write `ingestion_jobs` + `documents` → poll job to completion.
- **Grant access:** user names an app + picks namespaces → API generates a delegate key → sponsored `add_delegate_key` → store in `connected_apps` → return MCP config → audit.
- **AI recall:** client connects to MemWal MCP with the delegate key + account id → `memwal_recall` scoped to allowed namespaces → results returned to the client.
- **Revoke:** user revokes an app → sponsored `remove_delegate_key` → mark `connected_apps.revoked` → audit. Client's access dies on-chain.
- **Restore (proof):** API calls `restore(namespace)` → rebuilds index from Walrus → show restored/skipped/total.

---

## 8. Repo structure (monorepo, adapted from the starter)

```
soul/
├── apps/
│   ├── api/                      # Bun + Hono
│   │   └── src/
│   │       ├── routes/           # auth, ingest, memory, permissions, mcp-config
│   │       ├── services/
│   │       │   ├── enoki/        # zkLogin sessions, sponsored tx
│   │       │   ├── memwal/       # ingest/recall/analyze/restore orchestration
│   │       │   ├── sui/          # tx builders: create_account, add/remove delegate key
│   │       │   ├── walrus/       # raw document blob upload/read
│   │       │   ├── seal/         # (manual-mode encryption, optional)
│   │       │   └── ingestion/    # parsers (pdf/docx), github fetch, x/linkedin export, chunking
│   │       └── index.ts
│   └── web/                      # Next.js + shadcn/ui
│       └── src/
│           ├── app/              # routes: login, builder, inspector, permissions
│           ├── components/       # shadcn UI
│           └── lib/              # dApp Kit + Enoki providers, api client
├── packages/
│   ├── db/                       # Drizzle schema + migrations (Supabase)
│   └── shared/                   # shared types (Memory, ConnectedApp, Namespace, Job)
├── turbo.json  ·  pnpm-workspace.yaml  ·  biome.jsonc
```

Removed vs starter: all Clerk integration (`@clerk/*`, middleware, webhook). Added: the Sui Stack services above and the `shared` types package.

---

## 9. Trust boundaries & security decisions

- **Identity boundary:** the Sui address (Enoki) is the single identity. Postgres mirrors it but is never authoritative.
- **Privacy boundary:** Seal encryption is the only thing protecting memory. Managed relayer = plaintext-at-server (acceptable for MVP, must be disclosed). Manual mode = client-side Seal (privacy-hardened, more complex). Choose per deployment and state it in the UI.
- **Permission boundary:** on-chain delegate keys (`memwal::account`) authorize *who* can act; namespace scoping (relayer-enforced) limits *what* a key sees. Be precise: namespace isolation is not an on-chain guarantee.
- **Key custody:** in managed-mode MVP the API holds/uses delegate keys — encrypt at rest, never log, scope per app, drop on revoke. Document this clearly.

---

## 10. Environment configuration (replaces the starter's Clerk vars)

```
# apps/api/.env
DATABASE_URL=...                         # Supabase Postgres
ENOKI_SECRET_KEY=...                     # Enoki (server)
ENOKI_PUBLIC_KEY=...
SUI_NETWORK=testnet                      # testnet first, then mainnet
MEMWAL_RELAYER_URL=https://relayer-staging.memory.walrus.xyz   # staging→prod
MEMWAL_ACCOUNT_REGISTRY=...              # network-specific (see companion skill)
# (manual mode only) SEAL_*; (raw blobs) WALRUS_PUBLISHER_URL / AGGREGATOR_URL

# apps/web/.env
NEXT_PUBLIC_ENOKI_PUBLIC_KEY=...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
NEXT_PUBLIC_SUI_NETWORK=testnet
NEXT_PUBLIC_API_URL=...
```

---

## 11. Caveats / beta watch

All Sui Stack beta/alpha caveats, exact package names, contract IDs, relayer URLs, rate limits, and the "six MCP tools / no `ask`" correction live in **`sui-stack-for-soul/SKILL.md`** — read it before implementing any layer. Re-verify contract IDs and endpoints against live docs at build time; they change during beta. Build on testnet, demo/persist on mainnet.
