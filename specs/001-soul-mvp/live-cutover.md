# Live Cutover Guide — Soul (testnet/mainnet)

The app runs **fully in dev mode** today (in-memory + mock adapters; `SOUL_LIVE` unset). This guide
specifies how to flip to the **live Sui Stack** and — per Constitution Principle VII and the build
rule *"if a beta tool blocks you, STOP and present options"* — flags the genuine blockers that need a
decision before live operation. All package/API facts were verified 2026-06-05 (re-verify at build).

## 1. Credentials required (none self-provisionable by the build)

| Secret | Where | Used by |
|---|---|---|
| `DATABASE_URL` | Supabase Postgres | Drizzle repo (metadata/index) |
| `ENOKI_SECRET_KEY` | Enoki dashboard (server, private) | sponsored-tx (EnokiClient) |
| `NEXT_PUBLIC_ENOKI_PUBLIC_KEY` | Enoki (public) | client zkLogin wallet |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth | zkLogin provider |
| `SECRET_ENCRYPTION_KEY` | generated, stored as a secret | delegate-key at-rest encryption |
| funded relayer/sponsor wallet | testnet faucet (free) / mainnet WAL+SUI | sponsoring tx + Walrus writes |

Set `SOUL_LIVE=true` (+ the above) to switch `apps/api/src/services/container.ts` to live adapters.

## 2. Verified live-adapter wiring (ready to implement against these exact APIs)

- **Repo → Drizzle** (`services/repo/drizzle-repo.ts`, implemented): maps the 7 tables ↔ the records in
  `ports.ts` using `@soul/db`. Already typechecks; selected when `DATABASE_URL` is present.
- **MemoryEngine → MemWal** (`@mysten-incubation/memwal` 0.0.7): `MemWal.create({ key: <primary
  delegate priv hex>, accountId, serverUrl: config.memwal.relayerUrl, namespace })`. Map
  `analyze`/`remember`/`waitForRememberJob`/`recall`/`restore`/`compatibility` directly. Cache one
  client per (accountId, key).
- **ChainService → Sui PTBs + Enoki** (`@mysten/sui` 2.17.0 `Transaction` + `@mysten/enoki` 1.0.8
  `EnokiClient`): build `${pkg}::account::create_account(registry, clock)` /
  `add_delegate_key(account, pubkey, addr, label, clock)` / `remove_delegate_key` /
  `deactivate_account` / `reactivate_account` (exact signatures verified on-chain), then
  `enokiClient.createSponsoredTransaction({ network, transactionKindBytes, sender, allowedMoveCallTargets })`
  → sign → `executeSponsoredTransaction`.
- **BlobStore → Walrus** (`@mysten/walrus` 1.1.7): `new SuiClient({ url, network }).$extend(walrus({
  uploadRelay: { host: config.walrus.uploadRelay, sendTip: { max } } }))` → `client.walrus.writeBlob /
  readBlob`.
- **AuthProvider → Enoki zkLogin** (web: `@mysten/dapp-kit` 1.0.6 legacy + `registerEnokiWallets`;
  migrate to `@mysten/dapp-kit-react` 2.0.3 post-MVP).
- Contract IDs (verified on-chain): testnet pkg `0xcf6ad755…29c6` / reg `0xe80f2fee…4437`; mainnet pkg
  `0xcee7a6fd…a24c6` / reg `0x0da982ce…7edd`. Rate limits: 60/min + 500/hr per account, 30/min per
  delegate; weights analyze 10 / remember 5 / restore 3 / recall 1 (enforced by `services/memwal/limits.ts`).

## 3. ⚠ Blockers to resolve before live (STOP-and-present)

1. **Enoki server-side session verification is under-specified.** `EnokiClient` is documented for
   sponsorship, not for verifying an incoming zkLogin session → Sui address on the server. The API's
   `AuthProvider.verify(token)` needs a definitive server-verification pattern.
   **Options:** (a) verify the zkLogin signature/JWT server-side with `@mysten/sui/zklogin` primitives;
   (b) have the client sign a server-issued nonce with its zkLogin session and verify the signature;
   (c) use an Enoki-issued session/JWT if/when documented. **Decision needed.**

2. **MemWal managed mode has no documented `get-by-id` or `delete`.** The SDK exposes
   remember/recall/analyze/restore (+ ask/embed/health/compatibility) — no per-item fetch or delete.
   This affects Inspector **edit/delete (FR-020/FR-021)** in live mode.
   **Options:** (a) implement delete as crypto-shred via `/manual` mode (client-side Seal key
   deletion) — heavier, post-MVP; (b) keep edit/delete dev-only and disclose that live "delete" is
   de-index-when-the-SDK-supports-it; (c) wait for a relayer delete endpoint. **Decision needed.**

3. **Sponsored tx requires the user's client-side zkLogin signature.** `create_account` /
   `add_delegate_key` must be signed by the owner (zkLogin), so a pure server-side
   `ChainService.createAccount(owner)` can't fully execute — it needs a build→client-sign→execute
   round-trip. **Option:** add a 2-step API (`POST /account/provision/prepare` → returns sponsored
   bytes; client signs via dApp Kit; `POST /account/provision/execute`). **Design change needed.**

4. **Direct Walrus writes need a funded signer.** Raw document blobs written via `@mysten/walrus` need
   a keypair to pay/sign (the relayer abstracts this for memory, not for raw blobs).
   **Options:** (a) route raw docs through MemWal too; (b) use a funded service wallet for blob writes;
   (c) use the public publisher HTTP API. **Decision needed.**

## 4. Frontend cutover

Replace the dev sign-in in `components/soul/app-shell.tsx` with the Enoki zkLogin flow (legacy
`@mysten/dapp-kit` `registerEnokiWallets({ client, network, apiKey, providers:{ google:{ clientId }}})`
+ connect; cache the zkLogin proof per session ~3 s). The `lib/auth.ts` token contract (bearer →
verified address) is unchanged, so pages need no edits.

## 5. Deploy

- **Frontend (Walrus Site):** `next build` with static export (`output:'export'`) → `site-builder
  deploy --epochs <N> ./out` (testnet site package verified in research). Add `ws-resources.json` with
  `routes: { "/*": "/index.html" }` for client routing. Optional SuiNS name.
- **API:** Railway (`railway.toml` + `apps/api/Dockerfile`, testnet env; replaced Render
  2026-06-12). **Postgres:** managed (Supabase/Neon) — `pnpm db:migrate` applies `drizzle/*.sql`.
- **Pre-launch:** re-verify contract IDs / relayer / MCP / Walrus endpoints / SDK versions (T054).
