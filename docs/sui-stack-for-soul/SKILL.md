---
name: sui-stack-for-soul
description: >
  Authoritative reference for the entire Sui Stack (Sui L1, zkLogin/Enoki, Walrus,
  Walrus Memory/MemWal, Seal, SuiNS, Nautilus, DeepBook, Sui Stack Messaging) as it
  applies to building "Soul" — a portable, user-owned, verifiable personal-memory web
  app where a user ingests their data, it is structured into Sui objects, encrypted
  with Seal, stored on Walrus via MemWal, and consumed by AI clients through an MCP
  server with on-chain delegate-key permissions. USE THIS SKILL whenever the task
  touches Soul, the Sui Stack, Walrus, MemWal/Walrus Memory, Seal, zkLogin, Enoki,
  SuiNS, Sui smart contracts/Move, the @mysten/* or @mysten-incubation/* packages,
  decentralized storage of agent/user memory, MCP servers for AI memory, or
  on-chain permissioning — even if the user does not name the specific technology.
  It supplies official docs, package names, install commands, current beta/testnet
  status, code patterns, and the exact Soul architecture mapping so coding agents
  build on correct, current primitives instead of guessing.
---

# Sui Stack for Soul

This skill is the single source of truth for building **Soul** on the Sui Stack. Read the relevant layer before writing code for it. Every layer below lists: what it does, where it fits in Soul, official docs, package + install, status, and concrete usage notes.

## How to use this skill

1. Identify which layer the current task touches (auth, storage, encryption, identity, frontend, AI-consumption).
2. Read that layer's section here. For deep APIs, follow the official doc links — they are current; your training data may be stale because **Sui ships roughly every two weeks** and several of these products are **beta/alpha**.
3. Pin exact package versions in `package.json` / `pyproject.toml`. Do not assume an API is stable.
4. Build on **testnet** first, then cut to **mainnet** for anything that must persist.
5. Prefer the **managed/reused** path (Enoki, MemWal relayer, MemWal MCP) for the MVP; drop to native SDKs only when a documented limit forces it (see "Decision thresholds").

## What Soul is (so every layer choice has context)

Soul = a user builds a verifiable "second self" from their own data (copy-paste bio, uploaded documents, GitHub/social), Soul structures it and stores it **encrypted on Walrus**, the user **owns** it via their Sui account, and **any AI client** (Claude Desktop, Cursor, ChatGPT) consumes it through an **MCP server**. The user **grants and revokes** each app's access with **on-chain delegate keys**. Walrus is the key player; MemWal is the engine; Seal makes it private; Sui makes ownership and revocation real.

---

## The Soul → Sui Stack mapping (read this first)

| Soul concern | Use this | Package(s) | Status |
|---|---|---|---|
| **Authentication** (no seed phrases) | Enoki zkLogin (Google first), sponsored gas | `@mysten/enoki` | beta |
| **Storage** of memory + documents | Walrus blobs via MemWal | `@mysten-incubation/memwal`, `@mysten/walrus` | MemWal **beta**, Walrus mainnet |
| **Encryption + access control** | Seal (client-side) + MemWal delegate keys | `@mysten/seal` (via MemWal) | beta |
| **Permissions** (grant/revoke apps) | `memwal::account` Move contract delegate keys | on-chain (MemWal) | beta |
| **Identity / handles** (`name.sui`) | SuiNS | `@mysten/suins` | mainnet |
| **Web frontend** | Sui dApp Kit (React) | `@mysten/dapp-kit` | mainnet (migrating) |
| **Decentralized hosting (primary)** | Walrus Sites | `site-builder` CLI | mainnet |
| **AI-client consumption** | MemWal MCP server | `@mysten-incubation/memwal-mcp` | beta |
| **Base chain / objects / Move** | Sui L1 | `@mysten/sui`, Sui CLI | mainnet |
| **Deferred (post-MVP)** | Nautilus (verifiable compute), Sui Stack Messaging (coordination) | — | testnet/alpha |
| **Out of scope** | DeepBook (liquidity) | `@mysten/deepbook-v3` | mainnet |

---

## Toolchain setup (do this once)

Install the CLIs with **suiup** (the official version manager):

```bash
curl -sSfL https://raw.githubusercontent.com/MystenLabs/suiup/main/install.sh | sh
suiup install sui@testnet      # Sui CLI
suiup install walrus           # Walrus CLI
suiup install site-builder     # Walrus Sites
# seal CLI as needed
```

Scaffold the web app with the official dApp template:

```bash
npm create @mysten/dapp@latest   # choose: react-client-dapp
```

**Feed your coding agent the official LLM docs.** Mysten publishes machine-readable docs:
- MemWal: `SKILL.md`, `llms.txt`, `llms-full.txt` in [github.com/MystenLabs/MemWal](https://github.com/MystenLabs/MemWal)
- Sui TS SDK + docs expose LLM-friendly endpoints; check [sdk.mystenlabs.com](https://sdk.mystenlabs.com) and [docs.sui.io](https://docs.sui.io).

---

## Layer 1 — Sui (Coordination Layer / L1)

**What it does.** Sui is the base L1 blockchain. Its **object-centric model** (owned vs shared objects) and the **Move** smart-contract language are what make per-user ownership and on-chain permissions natural.

**Where it fits in Soul.** Each user's Soul account and its delegate keys live as Sui objects; ownership and revocation are enforced on-chain. You will mostly interact with Sui *through* MemWal's contract and the SDKs rather than writing much Move yourself.

- **Docs:** https://docs.sui.io · https://sui.io/developers
- **Object model:** https://docs.sui.io/concepts/object-model
- **Move:** https://move-book.com · Move intro course: https://github.com/sui-foundation/sui-move-intro-course
- **TypeScript SDK:** `@mysten/sui` — `npm i @mysten/sui` — https://sdk.mystenlabs.com/typescript
- **React dApp Kit:** `@mysten/dapp-kit` — `npm i @mysten/dapp-kit @tanstack/react-query` — https://sdk.mystenlabs.com/dapp-kit
- **CLI:** installed via `suiup` (above) — https://docs.sui.io/references/cli
- **Status:** mainnet (also testnet/devnet/localnet).

**Critical version caveats.**
- The TS SDK was renamed: **`@mysten/sui.js` → `@mysten/sui`** (use the new one).
- dApp Kit is migrating toward **`@mysten/dapp-kit-react` / `@mysten/dapp-kit-core`** — check which the current template installs and match it.
- Transactions are built with **Programmable Transaction Blocks (PTBs)** via the `Transaction` builder.
- **Object contents are publicly readable on-chain. Never store unencrypted secrets in objects** — this is why Soul encrypts with Seal before anything touches Walrus.

---

## Layer 2 — zkLogin + Enoki (Authentication)

**What it does.** zkLogin lets users get a Sui address from a normal **web login (Google/Apple/etc.)** with **no seed phrase**, using a zero-knowledge proof. **Enoki** is Mysten's managed service that wraps zkLogin **and sponsored transactions** so users never see gas.

**Where it fits in Soul.** This is Soul's front door. A user signs in with Google, gets a Sui account, and Soul (via Enoki sponsorship) pays gas so the experience feels web2.

- **zkLogin docs:** https://sui.io/zklogin · https://docs.sui.io/concepts/cryptography/zklogin · guide: https://docs.sui.io/guides/developer/cryptography/zklogin-integration
- **Enoki:** https://docs.enoki.mystenlabs.com — `@mysten/enoki` — `npm i @mysten/enoki`
- **Native fallback:** `@mysten/sui/zklogin` (build proofs yourself / self-host the prover)
- **Status:** zkLogin mainnet; Enoki beta (some features gated).

**Usage notes.**
- Register Enoki wallets through dApp Kit's wallet registration hook so they appear like any wallet.
- The Mysten prover takes **~3 seconds** to produce a proof on a 16 vCPU / 64 GB box — **cache the ZK proof per session**, not per signature.
- Start with **one provider (Google)** for the MVP.

---

## Layer 3 — Walrus (Verifiable Data / decentralized storage)

**What it does.** Walrus stores large binary blobs across a decentralized network using **erasure coding** (RedStuff, now Reed–Solomon; ~5× storage overhead). Reads survive up to ~2/3 of nodes being unresponsive; writes tolerate up to ~1/3 unavailable. Content is addressed by blob ID (tamper-evident).

**Where it fits in Soul.** The actual bytes of the user's memory and uploaded documents live here. MemWal writes to Walrus for you, but you may also store raw document blobs directly.

- **Docs:** https://docs.wal.app · https://www.walrus.xyz
- **Getting started:** https://docs.wal.app/usage/setup.html
- **TS SDK:** `@mysten/walrus` — `npm i @mysten/walrus` — https://sdk.mystenlabs.com/walrus
- **HTTP API (publishers write / aggregators read):** https://docs.wal.app/usage/web-api.html
- **Public aggregators & publishers:** https://docs.wal.app/usage/web-api.html#public-services
- **CLI:** `walrus` (via suiup) — https://docs.wal.app/usage/client-cli.html
- **Walrus Sites (deploy the frontend):** https://docs.wal.app/walrus-sites/intro.html — `site-builder deploy --epochs <N> ./dist`
- **Status:** **mainnet since March 2025** (100+ nodes). Testnet is periodically wiped (1-day epochs; mainnet epochs are 2 weeks, max ~53).

**Usage notes.**
- **All Walrus blobs are PUBLIC and discoverable.** Soul's privacy comes only from Seal encryption *before* upload — never rely on obscurity.
- Storage on mainnet **costs real WAL + SUI**. With the **managed relayer (below), the user holds no tokens** — the relayer's wallet pays.
- Direct SDK blob writes are request-heavy (~2200 requests to write, ~335 to read a blob). **Prefer the relayer / public publishers / aggregators** over raw SDK writes for throughput.
- For documents, use **envelope encryption** (Seal) rather than encrypting megabytes directly.

---

## Layer 4 — Walrus Memory / MemWal (the memory engine — Soul's core)

**What it does.** MemWal (product name **"Walrus Memory"**) is a privacy-first AI memory layer: it embeds text, **encrypts it with Seal**, stores it on **Walrus**, indexes it for semantic search, and enforces **ownership + delegate-key permissions** on Sui. It is the glue you would otherwise have to build yourself.

**Where it fits in Soul.** This is the heart of Soul. Use it for ingest and retrieval; use its contract for permissions; use its MCP server for AI-client consumption.

- **Docs:** https://docs.wal.app/walrus-memory (mirror: https://docs.memwal.ai)
- **Repo:** https://github.com/MystenLabs/MemWal (Apache-2.0; branch `dev`)
- **TS SDK:** `@mysten-incubation/memwal` — `npm i @mysten-incubation/memwal`
- **Python SDK:** mirrors the TS surface — confirm the exact package name in the repo before installing.
- **Manual (client-side Seal) mode:** `@mysten-incubation/memwal/manual`
- **Vercel AI middleware:** `@mysten-incubation/memwal/ai`
- **MCP server:** `@mysten-incubation/memwal-mcp` (see Layer 4b)
- **OpenClaw plugin:** `@mysten-incubation/oc-memwal`
- **Dashboard / playground:** https://memory.walrus.xyz (staging https://staging.memory.walrus.xyz) — manage and **revoke** delegate keys here
- **Status:** **beta** — pin versions; expect change. The SDK has a `/version` compatibility check (`MemWalCompatibilityError`).

**Operations (SDK).**
- `remember(text, namespace?)` → returns `{ job_id, status }` immediately; embedding + encryption + upload + indexing happen **asynchronously** (use `rememberAndWait()` / `waitForRememberJob()` when you need the result; `rememberBulk()` for ≤20).
- `recall(query, { limit?, namespace?, maxDistance? })` → semantic search scoped to `owner + namespace`; returns `{ results: [{ blob_id, text, distance }] }` (lower distance = closer).
- `analyze(text, namespace?)` → LLM extracts memorable facts and stores each (background jobs). Use this for the **ingestion/personalization layer** that turns messy input into structured facts.
- `ask(...)` → memory-augmented Q&A (SDK only; see MCP caveat below).
- `restore(namespace, limit?)` → rebuilds the index **from Walrus blobs** (this is the **portability/recoverability** proof — a fresh DB reconstructs from the decentralized source of truth).

**Memory spaces.** A space is `owner + namespace`. For Soul, use **one namespace per data domain**: `bio`, `docs`, `social` (GitHub imports land in `social`). Namespace isolation is **relayer-enforced, not on-chain** — be precise about this when claiming "scoped access."

**The relayer (how data actually moves).**
- Production: `https://relayer.memory.walrus.xyz` · Staging (testnet): `https://relayer-staging.memory.walrus.xyz`
- The **default managed relayer sees plaintext** (it embeds + Seal-encrypts server-side). For a true "we can't read your soul" guarantee, use **`/manual` mode** (client-side Seal) or **self-host the relayer**.
- Rate limits ~60 points/min burst, ~500 points/hour/account; operation weights: analyze 10, remember 5, restore 3, ask 2, recall 1. There is a per-account quota (~1 GB) on the managed relayer — plan to self-host before launch if you need more.

**Permissions contract `memwal::account` (Move).** This *is* Soul's permission system.
- One `MemWalAccount` per Sui address (enforced by a shared `AccountRegistry`).
- `add_delegate_key` / `remove_delegate_key` (owner only) — **max 20 delegate keys.** Each app/AI client that gets access = one delegate key. Revoke = remove the key.
- `deactivate_account` / `reactivate_account` (owner only) — global freeze.
- `seal_approve(id, account)` — the Seal access check.
- **Owner/delegate authorization is enforced on-chain** (a compromised relayer cannot forge delegate permissions). Surface this as Soul's permissions dashboard.
- **Contract IDs (re-verify before deploy — may be redeployed during beta):**
  - Mainnet: package `0xcee7a6fd8de52ce645c38332bde23d4a30fd9426bc4681409733dd50958a24c6`, registry `0x0da982cefa26864ae834a8a0504b904233d49e20fcc17c373c8bed99c75a7edd`
  - Testnet: package `0xcf6ad755a1cdff7217865c796778fabe5aa399cb0cf2eba986f4b582047229c6`, registry `0xe80f2feec1c139616a86c9f71210152e2a7ca552b20841f2e192f99f75864437`

**Example apps to differentiate from (do NOT just rebuild these):** Playground, Chatbot, Noter, Researcher — https://docs.wal.app/walrus-memory/examples/example-apps. Soul's value over them = the ingestion intelligence, multi-domain namespaces, the permissions dashboard, and the cross-client MCP consumption UX.

### Layer 4b — MemWal MCP server (AI-client consumption surface)

**What it does.** Exposes a user's memory to MCP-aware AI clients.

- **Docs:** https://docs.wal.app/walrus-memory/mcp/overview · reference https://docs.wal.app/walrus-memory/mcp/reference
- **Hosted (Streamable HTTP):** `https://relayer.memory.walrus.xyz/api/mcp` — auth via `Authorization: Bearer <delegate-key>` + header `x-memwal-account-id: <accountId>`
- **Local (stdio):** `npx -y @mysten-incubation/memwal-mcp` (credentials at `~/.memwal/credentials.json`) — for Claude Desktop / Cursor
- **Tools (SIX, verified):** `memwal_remember`, `memwal_recall`, `memwal_analyze`, `memwal_restore`, plus session `memwal_login` / `memwal_logout`. **There is NO `ask` MCP tool** — for Q&A, call the SDK's `ask` server-side, or do `memwal_recall` + let the client reason. (`memwal_logout` wipes local creds but does **not** revoke the on-chain delegate key.)

**Soul demo wiring.** Mint a delegate key for a client → connect that client to the MCP server → it can `recall` the user's soul in every conversation → revoke the key in the dashboard → access dies. That revoke is the "ownership is real" moment.

---

## Layer 5 — Seal (Data Security / encryption with access control)

**What it does.** Identity-based **threshold encryption**: data is encrypted client-side; decryption keys are released by key servers **only if an on-chain Move policy (`seal_approve`) passes**.

**Where it fits in Soul.** Seal is what makes the soul private. MemWal uses Seal under the hood; you only touch Seal directly if you write **custom access policies** or use **manual mode**.

- **Docs:** https://seal.mystenlabs.com · https://seal-docs.wal.app
- **Repo:** https://github.com/MystenLabs/seal — `@mysten/seal` — `npm i @mysten/seal`
- **Status:** beta (committee/MPC key-server mode is testnet-only).

**Usage notes.**
- Privacy of Soul rests **entirely on Seal**, never on Sui object ownership (objects are public).
- Use **envelope encryption** for large document payloads.
- Do not use Seal for wallet keys, PHI, or government secrets (per its own guidance).

---

## Layer 6 — SuiNS (Identity / onchain naming)

**What it does.** Human-readable names for Sui addresses (e.g. `iqbal.sui`).

**Where it fits in Soul.** Gives a soul a shareable handle and powers "Sign in with Soul" UX. Optional polish, not MVP-critical.

- **Docs:** https://suins.io · https://docs.suins.io — `@mysten/suins` — `npm i @mysten/suins`
- **Status:** mainnet.
- **Usage:** resolve a name → address (and reverse) for display and discovery.

---

## Layer 7 — Nautilus (Verifiable offchain compute) — DEFERRED

**What it does.** Run computation off-chain in a **TEE** and verify an **attestation on-chain**, so results are provable.

**Where it fits in Soul.** *Optional, post-MVP.* Could provably process soul data (e.g. verifiable summarization) so users trust the transform, not just the storage.

- **Docs:** https://sui.io/nautilus — Repo: https://github.com/MystenLabs/nautilus
- **Status:** **testnet; template unaudited ("for evaluation purposes only").** Do not put on the MVP critical path.

---

## Layer 8 — Sui Stack Messaging — DEFERRED

**What it does.** End-to-end encrypted messaging using **Walrus for storage + Seal for privacy** — a natural agent-to-agent / app-to-user coordination channel.

- **Repo:** https://github.com/MystenLabs/sui-stack-messaging-sdk
- **Status:** **beta/alpha; no forward secrecy.** Treat as a stretch goal only.

---

## Layer 9 — DeepBook — OUT OF SCOPE (for completeness)

On-chain central limit order book / liquidity layer. `@mysten/deepbook-v3` · https://docs.sui.io/standards/deepbookv3 · https://deepbook.tech. Not used by Soul; included so the stack picture is complete and you don't accidentally pull it toward the DeFi track.

---

## Build sequence for Soul (staged)

**Stage 0 — Toolchain + pipeline proof.** Install CLIs (suiup), scaffold with `npm create @mysten/dapp`, feed MemWal `llms-full.txt` to the agent. Do a single `remember → recall` round-trip and one raw Walrus blob write/read on **testnet** (staging relayer).

**Stage 1 — Auth + identity.** Enoki zkLogin (Google) + sponsored transactions via dApp Kit. Optionally attach a SuiNS handle.

**Stage 2 — Memory core.** MemWal ingest (`analyze` for messy input → facts; `remember`/`rememberBulk` for structured) and retrieval (`recall`). One namespace per domain (`bio`/`docs`/`social` — GitHub imports land in `social`). Managed relayer first; Seal envelope encryption for document uploads.

**Stage 3 — Permissions.** Use `memwal::account`: one account per user; `add_delegate_key` per connected app (cap 20); `remove_delegate_key` to revoke; `deactivate_account` to freeze. Build the permissions dashboard.

**Stage 4 — AI-client surface.** Wire the MemWal MCP server: hosted HTTP `/api/mcp` (Bearer delegate key + `x-memwal-account-id`) for cloud clients; local stdio (`npx -y @mysten-incubation/memwal-mcp`) for Claude Desktop / Cursor. Build UX around the four real tools; no `ask` tool.

**Stage 5 — Ship the frontend.** Deploy the frontend **decentralized as a Walrus Site** (`site-builder deploy --epochs <N> ./dist`), optionally tied to a SuiNS name — this is Soul's **primary hosting target**. Vercel (web) / Railway (api) remain only as a centralized preview/fallback.

**Ingestion scope — X / LinkedIn = self-import of the user's OWN data.** MVP ingestion is **copy-paste + document upload + GitHub** (public API, easy) **plus X / LinkedIn self-import**: the user connects and pulls **their own** data — official OAuth where available, otherwise their platform "download your data" export (the user supplies/scrapes only their own account). Soul parses it, maps it to the `social` namespace, and stores it decentralized on **Sui + Walrus** like any other source. **Never scrape third parties** (auth walls + ToS) — own-data-only is the hard line.

---

## Decision thresholds (when to leave the easy path)

1. **MemWal beta limits / relayer SLA block you** → self-host the relayer and/or switch to `@mysten-incubation/memwal/manual` for client-side Seal control.
2. **Need >20 apps per user, or richer policy logic** → write custom Seal `seal_approve` Move policies instead of relying solely on `memwal::account`.
3. **Need provable processing (not just storage)** → add Nautilus once it leaves testnet.
4. **A managed dependency (Enoki / MemWal relayer) imposes unacceptable cost or lock-in** → fall back to native `@mysten/sui/zklogin` + self-hosted prover and direct `@mysten/walrus` + `@mysten/seal`.

---

## Caveats every agent must respect

- **Maturity is the dominant risk.** MemWal/Walrus Memory, Seal, and Enoki are **beta**; Nautilus and Sui Stack Messaging are **testnet/alpha**. Pin versions. Re-verify package names, contract IDs, relayer URLs, and rate limits against live docs at build time — they change.
- **Privacy = Seal only.** Sui objects and Walrus blobs are public. Encrypt client-side before upload; never claim ownership alone provides privacy.
- **The default managed relayer sees plaintext.** Use manual mode or self-host for a true zero-plaintext-at-server claim.
- **`remember` is eventually consistent** (returns a job id; a write may not be instantly recallable). Handle "written but not yet queryable" in UI and adapters; use `rememberAndWait` when correctness matters.
- **MCP has no `ask` tool** — six tools total (`remember`/`recall`/`analyze`/`restore` + `login`/`logout`).
- **Costs are real on mainnet** (WAL + SUI). Testnet is wiped periodically — never demo durability on testnet.
- **Sui SDK churn:** use `@mysten/sui` (not `@mysten/sui.js`); watch the dApp Kit package migration.

---

## Quick link index

Sui: https://docs.sui.io · SDK https://sdk.mystenlabs.com/typescript · dApp Kit https://sdk.mystenlabs.com/dapp-kit · Move course https://github.com/sui-foundation/sui-move-intro-course
zkLogin/Enoki: https://sui.io/zklogin · https://docs.enoki.mystenlabs.com
Walrus: https://docs.wal.app · SDK https://sdk.mystenlabs.com/walrus · Sites https://docs.wal.app/walrus-sites/intro.html
Walrus Memory/MemWal: https://docs.wal.app/walrus-memory · repo https://github.com/MystenLabs/MemWal · MCP https://docs.wal.app/walrus-memory/mcp/overview · dashboard https://memory.walrus.xyz
Seal: https://seal.mystenlabs.com · https://seal-docs.wal.app · repo https://github.com/MystenLabs/seal
SuiNS: https://docs.suins.io
Nautilus: https://sui.io/nautilus · repo https://github.com/MystenLabs/nautilus
Sui Stack Messaging: https://github.com/MystenLabs/sui-stack-messaging-sdk
DeepBook: https://deepbook.tech
