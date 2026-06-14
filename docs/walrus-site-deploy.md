# Deploying Soul as a Walrus Site

> Runbook + verified facts from the first real deployment (2026-06-11, Windows 11).
> Authoritative upstreams: `docs/soul-architecture/SKILL.md` §hosting, the `walrus-sites`
> agent skill, and https://docs.wal.app/docs/sites. Re-verify package IDs / prices at
> deploy time — Walrus ships ~every two weeks.

## Verified facts that override older assumptions

1. **`wal.app` serves ONLY mainnet sites that have a SuiNS name linked.** It does not
   serve Base36 object-ID subdomains, and it does not serve testnet at all. A testnet
   site is viewable only through a self-hosted portal (`<b36>.localhost:<port>`).
2. **`soul.sui` is already registered** (owner `0x857fd1…7191e`, expires
   **2026-09-21**, currently parked: no target address, no `walrus_site_id`). Until it
   is bought from the owner or drops (30-day grace → re-registrable ~2026-10-21),
   **`soul.wal.app` cannot be obtained**. 4-char SuiNS names cost **100 USDC/yr**
   (renewal 50); 5+ chars cost 10 USDC/yr (e.g. `soulapp.sui` → `soulapp.wal.app`).
3. **SuiNS linking** (once a name is owned): suins.io → *Names You Own* → 3-dot menu →
   **Link To Walrus Site** → paste the site **object ID** → approve tx. Resolves in
   seconds. (SDK alternative: `suinsTransaction.setUserData` with key `walrusSiteId`.)
4. **Walrus epochs:** mainnet = 14 days, testnet = 1 day; max 53 epochs (~2 years)
   purchasable per call (`--epochs max`); extend later with `walrus extend` / re-deploy.
5. **Gas:** the site-creation PTB (site object + ~80 resource dynamic fields + routes)
   needs the full default **0.5 SUI gas budget** — 0.25 SUI hard-fails with
   `InsufficientGas`. Keep ≥ 1 SUI in the deployer wallet. `--gas-budget` is a global
   site-builder flag.
6. **Mainnet money:** `walrus get-wal` is **testnet-only**. Mainnet WAL must be bought
   (CEX/DEX). Live mainnet prices (2026-06-11): storage 67,021 FROST /
   encoded-MiB/epoch + one-time write 121,691 FROST/MiB. Soul's 2.64 MB quilt-packed
   export ≈ **~0.3 WAL for 53 epochs**; budget ~1–2 WAL headroom (every update
   re-uploads the quilt). Estimator: https://costcalculator.wal.app/.
7. **Quilts:** site-builder packs all files into one quilt blob, so the ~64 MB
   per-blob metadata overhead is paid once, not per file.

## Toolchain (Windows, installed to `%USERPROFILE%\.local\bin`)

- `walrus.exe` / `site-builder.exe`: official GCS binaries
  `https://storage.googleapis.com/mysten-walrus-binaries/{walrus|site-builder}-mainnet-latest-windows-x86_64.exe`
- `sui` CLI: GitHub release `sui-mainnet-vX.Y.Z-windows-x86_64.tgz` (or `suiup`).
- Configs (multi-context, both networks in one file):
  - `%USERPROFILE%\.config\walrus\client_config.yaml` ← raw.githubusercontent.com/MystenLabs/walrus/main/setup/client_config.yaml
  - `%USERPROFILE%\.config\walrus\sites-config.yaml` ← raw.githubusercontent.com/MystenLabs/walrus-sites/main/sites-config.yaml
    (default_context is **mainnet** — always pass `--context` explicitly)

## Deployer wallet

Created fresh for deployment (the API's `SUI_SERVICE_KEY` is the managed-custodial
signer and must NOT be reused as the deploy wallet):

- Address: `0x5068e343b3d28bd50b34ede2a384b8a34188fbac9945c4b59d6f6e50cb58f429`
- Keystore: `%USERPROFILE%\.sui\sui_config\sui.keystore` (recovery phrase was shown
  once at creation — store it in a password manager).
- Testnet funding: `https://faucet.testnet.sui.io/v2/gas` (1 SUI/drop, aggressive
  rate limit) then `walrus --context testnet get-wal`.

## Deploy (testnet)

```powershell
# 1. Build the static export (bakes NEXT_PUBLIC_* from apps/web/.env.local!)
$env:WALRUS_SITE='1'; pnpm --filter @soul/web build        # → apps/web/out

# 2. ws-resources.json must be IN the published directory
Copy-Item apps\web\ws-resources.json apps\web\out\

# 3. Deploy (creates or updates the site recorded in out/ws-resources.json)
site-builder --context testnet --gas-budget 500000000 deploy --epochs 30 apps\web\out

# 4. Copy the updated ws-resources.json (now contains object_id) back & commit
Copy-Item apps\web\out\ws-resources.json apps\web\ws-resources.json
```

Mainnet is the same with `--context mainnet --epochs max` and a wallet holding
real SUI (≥1) + WAL (≥1). **Before mainnet:** rebuild with production
`NEXT_PUBLIC_API_URL` (the 2026-06-11 build bakes `http://localhost:3004` — fine for
dev, wrong for prod) and update the Enoki/Google OAuth redirect URIs to the final
domain.

## Viewing the testnet site (local portal)

Prepared at `%USERPROFILE%\walrus-sites\portal` (deps installed with
`bun install --ignore-scripts`, testnet `server/portal-config.yaml` in place,
`PORT` patched to honor `$env:PORTAL_PORT`):

```powershell
cd $env:USERPROFILE\walrus-sites\portal
$env:PORTAL_PORT='3333'   # 3000 is often taken by other dev servers
bun -F server start
# → http://<b36-site-id>.localhost:3333   (b36 from `site-builder convert <object-id>`)
```

Do not modify `original_package_id` in the portal config — it is the Walrus Sites
framework package, not Soul's package.

## Current deployment (2026-06-11)

- Network: **testnet** (decision #6 — testnet-first; mainnet at cutover)
- Site object: `0xa37648ae6cd3a332b94711f11c91167c8360b342dae2d683c1deb57e605a7b6a`
  (type `0xf99aee9…be799::site::Site`, owner = deployer wallet; recorded in
  `apps/web/ws-resources.json` — **testnet** id; remove/replace it before the first
  mainnet deploy or site-builder will try to update a non-existent object)
- B36 URL (local portal): `http://42o1xaop1ee9ujdlrjf6sf01i5hfgzisjic42czkicptdzpe96.localhost:3333`
- All 95 resources in one quilt blob (`0xd241dd6b…317456`), earliest expiry
  **2026-07-01** — extend with `site-builder --context testnet update --epochs <N> apps\web\out`
- Verified: `sui_getObject` type/owner ✓; `/index.html` (104 KB) served by
  `https://aggregator.walrus-testnet.walrus.space/v1/blobs/by-quilt-patch-id/<patch-id>` ✓

## Debugging

- `site-builder sitemap <object-id>` — list resources + blob expiry (expired ⇒ 404).
- `site-builder convert <object-id>` — hex → b36 subdomain.
- 404 on a client route ⇒ check `routes: {"/*": "/index.html"}` in ws-resources.json.
