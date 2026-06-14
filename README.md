# Soul — *Your Second Soul*

**A portable, user-owned, verifiable personal memory for every AI — built on the Sui Stack.**

You build your "second soul" **once** from your own data. You **own it** on the Sui (Back by Walrus Storage).
You **use it** in any AI tool over MCP. You **grant, sell, and revoke** every app's access on-chain.

*Your Soul. Your Data. Your Life.*

> 🌐 Live on Sui testnet, hosted decentralized as a **Walrus Site** (site object
> `0xa37648ae6cd3a332b94711f11c91167c8360b342dae2d683c1deb57e605a7b6a`).
> Runs locally in mock mode with zero setup — see [Quick start](#quick-start-simple).

---

## The problem

Every AI tool you use today has the same flaw: **it doesn't know you — or it owns you.**

1. **You repeat yourself forever.** You explain who you are, what you do, and how you work to
   ChatGPT. Then again to Claude. Then again to Cursor. Every new tool starts from zero.
2. **Your context is locked in.** The memory you *do* build up inside one product lives in that
   company's database. You can't take it to the next tool, and you can't prove what they hold.
3. **"Delete my data" is a promise, not a mechanism.** Revoking an app's access means trusting a
   settings toggle in someone else's backend. There is no kill switch you can verify.
4. **Your data is valuable — to everyone but you.** Consented, provenanced personal context is
   exactly the data AI products want. Today it gets harvested; you never get to price it.

## The solution

Soul turns your personal context into a **single, portable, encrypted memory that you own as an
asset on-chain** — and that any AI client can plug into:

| What | How |
|---|---|
| **Create it** | Sign in with Google (zkLogin — no seed phrase, no gas). Import your own data: pasted notes, documents, your own X/LinkedIn/GitHub data. Soul distills it into facts across three namespaces: `bio` · `docs` · `social`. |
| **Seal it** | For anything Soul itself should never read: **Private mode** encrypts in your browser (passphrase-derived key, AES-256-GCM) before upload — zero plaintext leaves the tab. Read, download, and delete privately in the Inspector; excluded from AI recall by design. |
| **Own it** | The facts are **encrypted with Seal** and stored as **Walrus blobs**, indexed by **MemWal**. Ownership is a `memwal::account` object on **Sui** that answers to your keys. Our Postgres is just a disposable cache — lose us, keep everything. |
| **Use it** | Soul speaks **MCP**, the open protocol AI clients already use. Paste one config into Claude Desktop, Cursor, or any MCP client, and that tool can `recall` your soul — scoped to exactly the namespaces you allow. |
| **Sell it** | List scoped slices of your soul on the **marketplace** (priced in SUI), or gift access for free. Buyers get a delegate key, payment settles on Sui — and your revoke button still works on every license you've sold. |
| **Revoke it** | Every connected app is an **on-chain delegate key** on your account (max 20). Revoking it is a real Sui transaction that kills access everywhere at once. Freeze the whole account in one click. |
| **Leave with it** | One click runs `restore`: your entire index is rebuilt from Walrus alone, proving the data is genuinely portable. Portability you can run, not a promise in a blog post. |

**The honest fine print:** Sui objects and Walrus blobs are public by design — privacy comes
*only* from encryption, and we never pretend otherwise. **Managed mode** (the default, and what
powers semantic recall) uses a relayer that sees plaintext during ingestion (it embeds + encrypts
server-side); the product discloses this on every import screen. **Private mode** is the shipped
zero-plaintext path: content is encrypted *in your browser* (passphrase → PBKDF2 → AES-256-GCM)
before anything is uploaded, so Soul, the relayer, and Walrus only ever see ciphertext — and the
disclosed trade is that private memories aren't semantically searchable and never surface to
connected AI tools. Lose the passphrase and they're unrecoverable, by design.

---

## How it works (3 steps for a user)

1. **Sign in with Google.** Enoki zkLogin derives a Sui account from your Google sign-in.
   No seed phrase, no wallet setup, no gas — sponsorship covers it.
2. **Import your data.** Paste text, upload documents (PDF/docx/txt/md), or import your own
   social data (X, LinkedIn, GitHub). Everything is encrypted with Seal before it reaches Walrus.
3. **Connect any AI.** Mint a delegate key scoped to the namespaces an app should see, paste the
   MCP config once, and the tool knows you on day one. Revoke the key on-chain whenever — it dies
   everywhere at once.

```jsonc
// claude_desktop_config.json — paste once, known everywhere
{
  "mcpServers": {
    "soul": {
      "url": "https://<your-api>/api/mcp",
      "headers": {
        "Authorization": "Bearer <delegate-key>",
        "x-memwal-account-id": "0x7f3a…e8f3"
      }
    }
  }
}
```

---

## Product tour

| Surface | What it does |
|---|---|
| `/` | Marketing site — the brand surface (the **PULSE** design system). |
| `/sign-in` | Sign in — Google zkLogin (live) or dev mode (mock). Unauthenticated app visits land here. |
| `/overview` | Dashboard home: soul status, namespaces, recent activity. |
| `/builder` | **Soul Builder** — import paste / documents / your own social data (X, LinkedIn, GitHub). Async ingestion with eventual-consistency status. A **Managed ⇄ Private** toggle switches to zero-plaintext mode: content is encrypted in-browser before upload. |
| `/inspector` | **Inspector** — browse/search memory by namespace with provenance; edit/delete. The **Private** tab unlocks your vault and decrypts items locally (reveal text / download files). |
| `/permissions` | **Permissions** — grant scoped delegate keys to AI tools (cap 20), revoke on-chain, freeze/unfreeze the account, full audit log. |
| `/connect` | **Connect AI** — the MCP connection config (hosted HTTP + local stdio) for any client. |
| `/marketplace` | **Marketplace** — list scoped slices of your soul for SUI, buy others' souls, send gifts, track acquisitions with live revoke status. |
| `/portability` | **Portability** — verify integrity, `restore` the index from Walrus, prove on-chain ownership. |
| `/analytics` | Real-data-only usage analytics. |

---

## Quick start (simple)

Works out of the box in **mock mode** — zero external services, every feature end-to-end:

```bash
# Prereqs: Node >= 22, pnpm 9, Bun (https://bun.sh)
pnpm install
pnpm dev          # API on :3004, Web on :3000
```

Open http://localhost:3000, sign in at `/sign-in` (dev mode), and walk the whole product: import data in the
Builder, inspect it, grant a key in Permissions, hit `POST /api/mcp` with it, list it on the
Marketplace, run `restore` in Portability.

### Verify everything

```bash
pnpm turbo run typecheck             # all packages typecheck
pnpm --filter @soul/web build        # Next.js production build (static-export ready)
pnpm --filter @soul/api test         # 37 unit tests (incl. the zero-plaintext vault suite)
pnpm --filter @soul/api smoke        # 45-assertion end-to-end walkthrough (incl. encrypt→store→re-derive→decrypt)
pnpm --filter @soul/api mcp:selftest # in-process MCP server <-> client handshake + scope checks
```

## Going live (advanced)

The API is ports-and-adapters: the container
([apps/api/src/services/container.ts](apps/api/src/services/container.ts)) selects **live Sui
Stack adapters** when `SOUL_LIVE=true` and credentials exist, with graceful per-slot fallback to
mock — the app always runs. Full runbook: [specs/001-soul-mvp/live-cutover.md](specs/001-soul-mvp/live-cutover.md).

| Slot | Live when | Adapter |
|---|---|---|
| Repo (Postgres) | `DATABASE_URL` | `DrizzleRepo` (Supabase) |
| Auth (Google zkLogin) | `ENOKI_SECRET_KEY` | `EnokiAuth` (server-verifies the JWT, mints a revocable HMAC session) |
| Chain (account / delegate keys) | `SUI_SERVICE_KEY` | `SuiChain` (Enoki-sponsored, managed-custodial) |
| Memory (ingest / recall / restore) | chain is live | `MemWalEngine` (MemWal relayer, rate-budget enforced) |
| Blobs (raw docs) | `WALRUS_SIGNER_KEY` | `WalrusBlobStore` (reads always real; writes need a funded signer) |

1. Set up Postgres: `pnpm db:push` (or run the migrations in `packages/db/drizzle/`).
2. Fill `apps/api/.env` + `apps/web/.env` (see [CLAUDE.md §8](CLAUDE.md) for the full list).
   Default network is **Sui testnet** (decision: testnet-first build, mainnet for production).
3. Re-verify MemWal contract IDs / relayer URLs against the live docs — the Sui Stack is beta and
   ships ~every two weeks.

### Connect a real AI client

- **Hosted (any MCP client):** `POST /api/mcp` — stateless Streamable-HTTP JSON-RPC, authenticated
  by the delegate key (`Authorization: Bearer …` + `x-memwal-account-id`).
- **Local stdio (Claude Desktop / Cursor):** `pnpm --filter @soul/api mcp:stdio` with
  `SOUL_MCP_ACCOUNT_ID` + `SOUL_MCP_DELEGATE_KEY`.

Six tools, namespace-scoped per grant: `memwal_recall`, `memwal_remember`, `memwal_analyze`,
`memwal_restore`, plus session `memwal_login` / `memwal_logout`. Full architecture (Host /
Client / Server): [docs/MCP.md](docs/MCP.md).

### Deploy

- **Frontend → Walrus Sites (primary, decentralized):**
  `WALRUS_SITE=1 pnpm --filter @soul/web build` → `site-builder deploy --epochs <N> ./apps/web/out`.
  Runbook with verified gotchas (gas, epochs, SuiNS): [docs/walrus-site-deploy.md](docs/walrus-site-deploy.md).
- **API → Railway:** [railway.toml](railway.toml) + [apps/api/Dockerfile](apps/api/Dockerfile)
  (env contract documented in the toml). **Postgres:** `pnpm db:migrate`.

---

## Architecture

**End-to-end TypeScript monorepo** (Turborepo + pnpm, `@soul/*` scope, Biome).

| Layer | Choice | Notes |
|---|---|---|
| API | **Bun + Hono** (`apps/api`) | ports-and-adapters; mock or live Sui Stack per env |
| Web | **Next.js 15 + Tailwind v4 + shadcn/ui** (`apps/web`) | App Router; the **PULSE** design system |
| DB | **Drizzle + Supabase** (`packages/db`) | metadata/index **only** — reconstructable from Walrus |
| Auth | **Enoki zkLogin (Google)** + sponsored gas | no seed phrase, no gas; revocable sessions |
| Memory | **Walrus + MemWal**, encrypted with **Seal** | the soul itself; the source of truth |
| Permissions | on-chain **`memwal::account`** delegate keys | grant / revoke / freeze; cap 20 |
| AI surface | **MCP** Host / Client / Server | hosted HTTP + local stdio |
| Hosting | **Walrus Sites** (primary) · Railway (api) / Vercel (web) fallback | testnet-first build, mainnet for production |

### Source of truth — what lives where

| Data | Lives in |
|---|---|
| Memory facts / embeddings | **Walrus + MemWal index** (Seal-encrypted) — the soul itself |
| Raw uploaded documents | **Walrus blobs** (encrypted before write — Walrus is public) |
| Ownership + permissions | **Sui** (`memwal::account` object, delegate keys, freeze state) |
| App/user metadata, jobs, audit | **Postgres** — fast UI cache, reconstructable via `restore`, never authoritative |

### Repo layout

```
apps/api    @soul/api — Bun + Hono. routes/ · services/{repo,identity,memwal,sui,walrus} (mock + live) · mcp/
apps/web    @soul/web — Next.js. app/{(marketing),(app)/{overview,builder,inspector,permissions,connect,marketplace,portability,analytics}}
packages    @soul/db · @soul/shared · @soul/id · @soul/logs · @soul/typescript-config
docs        architecture + Sui-stack SKILLs · MCP.md · walrus-site-deploy.md
specs       spec-driven development artifacts (001-soul-mvp)
```

> Design sources of truth: [PRODUCT.md](PRODUCT.md) (brand + voice),
> [apps/web/DESIGN.md](apps/web/DESIGN.md) (the **PULSE** design system), and the two SKILLs in
> [docs/](docs/) (architecture + Sui-stack catalog). Standing engineering brief: [CLAUDE.md](CLAUDE.md).
