# Soul Web (`@soul/web`)

Next.js 15 + Tailwind v4 + shadcn/ui frontend for **Soul** — the portable, user-owned personal
memory you build once, own on Sui, and plug into any AI tool over MCP. See the root
[README.md](../../README.md) for the product story; design system:
[DESIGN.md](DESIGN.md) (**PULSE** — void/bone/red, dark-only).

## Run

```bash
pnpm install
pnpm --filter @soul/web dev   # http://localhost:3000 (expects the API on :3004)
```

Sign-in lives at `/sign-in`: dev sign-in in mock mode; Enoki zkLogin (Google) →
`/auth/callback` → `/api/auth/login` in live mode. Unauthenticated visits to any app route
redirect there.

## Surfaces

- `/` — marketing landing (hero, the four rights, how-it-works, vault, MCP ecosystem,
  marketplace preview, ownership ledger, CTA).
- `/sign-in` — the sign-in page (Google zkLogin or dev mode).
- `/overview` — dashboard home (sign-in + auth callback land here).
- `/builder` — import paste / documents / your own social data (X, LinkedIn, GitHub). A
  Managed ⇄ Private toggle switches to zero-plaintext mode (encrypted in-browser, vault
  passphrase, `src/lib/vault.ts` + `components/soul/vault-gate.tsx`).
- `/inspector` — browse/search memory by namespace with provenance; edit/delete. The Private
  tab unlocks the vault and decrypts items locally (reveal text / download files).
- `/permissions` — grant/revoke scoped delegate keys (cap 20), freeze, audit log.
- `/connect` — MCP connection config (hosted HTTP + local stdio).
- `/marketplace` — Browse / My listings / Acquired / Send; shown-once key ceremonies.
- `/portability` — verify integrity, `restore` from Walrus, prove on-chain ownership.
- `/analytics` — real-data-only usage analytics.

All app pages talk to the API through the typed `soulFetch` client (`SoulApiError` with
`.status`; the shell signs out only on 401/403).

## Build & deploy

```bash
pnpm --filter @soul/web build                  # standard production build
WALRUS_SITE=1 pnpm --filter @soul/web build    # static export -> ./out for Walrus Sites
```

The static export deploys decentralized via `site-builder` (`ws-resources.json` holds the live
testnet site object). Runbook: [docs/walrus-site-deploy.md](../../docs/walrus-site-deploy.md).
Note: the export bakes `NEXT_PUBLIC_*` values from `.env.local` at build time.

## Environment (`apps/web/.env`)

```
NEXT_PUBLIC_API_URL=http://localhost:3004
NEXT_PUBLIC_ENOKI_PUBLIC_KEY=...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
NEXT_PUBLIC_SUI_NETWORK=testnet
```
