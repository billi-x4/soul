# Soul API (`@soul/api`)

Bun + Hono backend for **Soul** — the portable, user-owned personal memory on the Sui Stack.
It solves one problem: your AI context shouldn't live in any one company's database. This API
turns a user's own data into Seal-encrypted facts on Walrus, anchors ownership and app
permissions on Sui (`memwal::account` delegate keys), and exposes the memory to any AI client
over MCP. See the root [README.md](../../README.md) for the product story and
[CLAUDE.md](../../CLAUDE.md) + `docs/` SKILLs for the full design.

## Architecture

Ports-and-adapters. The container (`src/services/container.ts`) picks per-slot adapters:

- **Mock mode (default):** in-memory repo + mock MemWal/Enoki/Sui/Walrus — every feature works
  end-to-end with zero external services.
- **Live mode (`SOUL_LIVE=true` + creds):** `DrizzleRepo` (Supabase Postgres), `EnokiAuth`
  (Google-JWT verification → revocable HMAC sessions), `SuiChain` (sponsored, managed-custodial),
  `MemWalEngine` (relayer, rate-budget enforced), `WalrusBlobStore` (blobs encrypted before
  write). Each slot falls back to mock gracefully if its creds are missing.

Route verticals (`src/routes/`): `auth` · `account` · `ingest` · `memory` · `vault` (zero-
plaintext: client-encrypted envelopes the server can never read) · `permissions` · `market` ·
`mcp` · `portability`. The MCP server/client/host live in `src/mcp/` (hosted Streamable-HTTP at
`POST /api/mcp` + local stdio) — see [docs/MCP.md](../../docs/MCP.md).

## Run

```bash
pnpm install
pnpm --filter @soul/api dev          # http://localhost:3004 (mock mode)
```

## Verify

```bash
pnpm --filter @soul/api test         # 37 unit tests
pnpm --filter @soul/api smoke        # 45-assertion end-to-end walkthrough (run with SOUL_LIVE=0)
pnpm --filter @soul/api mcp:selftest # MCP server <-> client handshake + scope checks
```

## Environment (`apps/api/.env`)

Default network is **testnet** (testnet-first build; mainnet at production cutover — CLAUDE.md
decision #6). Re-verify the MemWal registry / relayer URLs against
`docs/sui-stack-for-soul/SKILL.md` — they change during beta.

```
PORT=3004
SOUL_LIVE=true                       # opt into live adapters (per-slot fallback otherwise)
DATABASE_URL=...                     # Supabase Postgres -> DrizzleRepo
ENOKI_SECRET_KEY=... / ENOKI_PUBLIC_KEY=...   # -> EnokiAuth
SUI_SERVICE_KEY=...                  # -> SuiChain (managed-custodial signer)
SUI_NETWORK=testnet
MEMWAL_RELAYER_URL=https://relayer-staging.memory.walrus.xyz
MEMWAL_ACCOUNT_REGISTRY=0x...        # verify against the SKILL at build time
WALRUS_SIGNER_KEY=...                # raw-blob writes (reads are always real)
WEB_ORIGIN=...                       # comma-separated CORS allowlist (production)
SOUL_DEV_LOGIN=1                     # dev-login while live (never enabled in production)
```

Migrations: run `pnpm db:migrate` before live use (includes `0004_market.sql`,
`0005_hardening.sql`, and `0007_vault.sql`).
