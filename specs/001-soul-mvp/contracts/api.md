# API Contracts — Soul MVP (`apps/api`, Bun + Hono)

REST/JSON. Sessions established via Enoki zkLogin; the temporary `x-user-id` seam
(`apps/api/src/pkg/middleware/auth.ts`) is replaced by the Enoki session in Stage 1. All Sui-mutating
operations are **sponsored** (no user gas). Shapes reference `@soul/shared` types. **No endpoint ever
returns a delegate-key secret after issuance, and none are ever logged** (Principle IX).

Conventions: `4xx` with `{ "error": { "code": string, "message": string } }` (plain-language). Async
ingestion returns `202` + a job; clients poll the job (eventual consistency).

## Auth & session

### `POST /auth/enoki/nonce` → `200`
Begin zkLogin. Resp: `{ nonce, maxEpoch, randomness, ...enokiParams }`. (Client caches proof per session.)

### `POST /auth/enoki/callback` → `200`
Body: `{ idToken }` (Google). Completes zkLogin, derives the Sui address, establishes a session, and
triggers idempotent account provisioning. Resp: `{ suiAddress, account: { objectId, active }, isNew }`.

### `GET /auth/session` → `200 | 401`
Resp: `{ suiAddress, userId, account: { objectId, active } }`.

### `POST /auth/logout` → `204`
Clears the Soul session. (Does NOT revoke any on-chain delegate key.)

## Account

### `POST /account/provision` → `200`
Idempotent. Creates exactly one `MemWalAccount` for the session's Sui address (sponsored
`create_account`) if absent. Resp: `{ account: { objectId, ownerAddress, active }, created: boolean }`.

### `GET /account` → `200`
Resp: `{ objectId, ownerAddress, active, namespaces: ["bio","docs","social"], connectedCount }`.

## Ingestion (FR-007..015)

All return `202 { jobId, memwalJobId, status: "pending" }` unless noted. **All ingest routes** reject
empty/blank input with a plain-language `400`, and de-duplicate re-imports of identical content (no
duplicate item created; obvious duplicates flagged) — per the "Empty or duplicate input" edge case.

### `POST /ingest/text`
Body: `{ namespace, text }`. Routes to `analyze` (messy) or `remember` (structured).

### `POST /ingest/document`
`multipart/form-data`: `file` (pdf/docx/txt/md) + `namespace`. Rejects unsupported/oversized files
(`400`, plain reason). Stores the raw blob on Walrus (→ `documents`), then chunks + `analyze`.

### `POST /ingest/github`
Body: `{ username }`. Imports the user's **public** GitHub data via Octokit; files the resulting
knowledge under the `social` namespace (GitHub is a social source, not its own namespace).

### `POST /ingest/social`
Body (archive): `multipart/form-data` `archive` (zip/json/csv) + `{ platform: "x"|"linkedin" }`.
Body (oauth, optional/post-MVP): `{ platform, oauth: { ... } }`. **Own-data only**; third-party data is
rejected. Routes to `social`.

### `GET /ingest/jobs/:id` → `200`
Resp: `{ jobId, status: "pending"|"processing"|"ready"|"error", error?, namespace, sourceType }`.

### `GET /ingest/jobs` → `200`
Resp: `{ jobs: IngestionJob[] }` (recent first).

## Memory / Inspector (FR-017..021)

### `GET /memory?namespace=&query=&limit=` → `200`
Browse (no `query`) or meaning-based search (`query` → `recall`). Resp:
`{ items: [{ id, namespace, snippet, source, blobId, createdAt, distance? }] }`.
(The HTTP layer maps MemWal SDK `recall` fields: `blob_id`→`blobId`, `text`→`snippet` here / full
`content` in the detail route, `distance` passthrough — these are API-surface names, not SDK fields.)

### `GET /memory/:id` → `200`
Resp: `{ id, namespace, content, source, blobId, createdAt }` (content fetched on demand, not cached in
Postgres).

### `PATCH /memory/:id` → `202`
Body: `{ content }`. Edits an item (delete+re-`remember` under the hood); returns a job to poll.

### `DELETE /memory/:id` → `200`
De-indexes the item (removed from browse/search/recall). Resp:
`{ deleted: true, note: "Removed from your soul's index; the underlying stored copy is immutable." }`.

## Permissions (FR-022..028)

### `POST /permissions/apps` → `200`
Body: `{ label, allowedNamespaces: Namespace[] }`. Mints a delegate key, calls sponsored
`add_delegate_key` (rejects if active count = 20 → `409`), persists `connected_apps`, audits `grant`.
Resp: `{ app: { id, label, allowedNamespaces, status, createdAt }, mcp: McpConnectionConfig }`
(**the delegate-key secret is delivered here once for the connecting client and never returned again**).

### `GET /permissions/apps` → `200`
Resp: `{ apps: [{ id, label, allowedNamespaces, status, createdAt, revokedAt? }] }` (no secrets).

### `DELETE /permissions/apps/:id` → `200`
Sponsored `remove_delegate_key`; sets `status=revoked`; audits `revoke`; drops the at-rest secret.
Resp: `{ revoked: true }`. After this, the app can recall nothing (verified by SC-007).

### `POST /permissions/freeze` → `200`  /  `POST /permissions/unfreeze` → `200`
Sponsored `deactivate_account` / `reactivate_account`; mirrors `memwal_accounts.active`; audits.

### `GET /permissions/audit` → `200`
Resp: `{ entries: [{ action: "grant"|"revoke"|"freeze"|"unfreeze"|"ingest"|"restore", target, metadata, createdAt }] }`.
(`ingest` = FR-027's "import"; `unfreeze` = FR-026's "restore access".)

## MCP config (FR-029, FR-030 — US5)

### `GET /mcp/config/:appId` → `200`
Resp:
```json
{
  "hosted": { "url": "https://relayer.memory.walrus.xyz/api/mcp",
    "headers": { "Authorization": "Bearer <delegate-key>", "x-memwal-account-id": "<accountObjectId>" } },
  "stdio":  { "command": "npx", "args": ["-y", "@mysten-incubation/memwal-mcp"],
    "credentialsPath": "~/.memwal/credentials.json" },
  "tools": ["memwal_remember","memwal_recall","memwal_analyze","memwal_restore","memwal_login","memwal_logout"]
}
```
Note: **no `ask` tool**. The delegate-key value is shown to the connecting owner once for client setup.

## Portability & ownership (FR-033..036 — US6)

### `GET /verify` → `200`
Integrity check. Resp: `{ intact: boolean, verified: number, total: number, missing: string[] }`
(intact ⟺ every expected item accounted for and retrievable from the owned store).

### `POST /restore` → `200`
Body: `{ namespace? }`. Calls MemWal `restore`, rebuilding the index from Walrus. Resp:
`{ restored: number, skipped: number, total: number }`. Audits `restore`.

### `GET /ownership` → `200`
Resp: `{ accountObjectId, ownerAddress, suinsName?, explorerUrl }` — proof recorded on-chain,
independent of the Soul app.

## Ops

### `GET /health` → `200` → `{ status: "ok", memwalVersionOk: boolean }`
(`memwalVersionOk` surfaces the MemWal `/version` compatibility check.)
