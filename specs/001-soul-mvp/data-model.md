# Data Model — Soul MVP

**Principle II / Source-of-Truth**: Postgres holds **metadata/index ONLY** and is fully reconstructable
from on-chain state + Walrus via `restore`. Memory content NEVER lives in Postgres. Below: (A) the
authoritative off-Postgres entities, (B) the seven Postgres tables, (C) the Source-of-Truth Matrix, (D)
spec Key-Entity mapping, (E) state transitions.

## A. Entities of record (off-Postgres)

- **MemWalAccount** (Sui object, via `memwal::account`) — one per Sui address (registry-enforced). Holds
  ownership, the set of delegate keys (≤ 20), and active/frozen state. **Authoritative for permissions.**
- **Memory item / fact** (Walrus blob + MemWal index, Seal-encrypted) — the soul itself. Addressed by
  `blob_id`; scoped by `owner + namespace`. **Authoritative for memory content.** Soul mirrors only
  minimal, non-content metadata for the Inspector (and re-fetches/`recall`s content on demand).
- **Raw document blob** (Walrus) — the original uploaded file; `blob_id` mirrored in `documents`.

## B. Postgres tables (Drizzle, in `packages/db`)

> Conventions: `id` = app-generated id (`@soul/id`); timestamps `timestamptz`; `*_at` UTC. No column
> ever stores memory content, secrets in plaintext, or unencrypted delegate keys.

### users
| field | type | notes |
|---|---|---|
| id | text (pk) | app id |
| sui_address | text (unique, not null) | the identity (mirrors on-chain; not authoritative) |
| oauth_subject | text | Google `sub` (for session linkage) |
| display_name | text | optional |
| suins_name | text (nullable) | optional handle |
| created_at | timestamptz | |

### memwal_accounts
| field | type | notes |
|---|---|---|
| id | text (pk) | |
| user_id | text (fk → users.id) | |
| account_object_id | text (unique) | the `MemWalAccount` Sui object id |
| owner_address | text | = users.sui_address |
| active | boolean | mirrors on-chain freeze state (false = frozen) |
| created_at | timestamptz | |

### connected_apps  (= delegate keys)
| field | type | notes |
|---|---|---|
| id | text (pk) | |
| user_id | text (fk → users.id) | |
| delegate_public_key | text | public key of the delegate |
| delegate_address | text | derived address |
| delegate_secret_enc | bytea | **encrypted-at-rest** secret for managed-mode relayer calls; never logged/returned |
| label | text | human label (e.g., "Claude Desktop") |
| allowed_namespaces | jsonb | subset of {bio,docs,social} — relayer-enforced scope |
| status | text enum(`active`,`revoked`) | |
| created_at | timestamptz | |
| revoked_at | timestamptz (nullable) | |

### namespaces
| field | type | notes |
|---|---|---|
| id | text (pk) | |
| user_id | text (fk → users.id) | |
| name | text enum(`bio`,`docs`,`social`) | MVP fixed set (custom = post-MVP); GitHub imports land in `social` |
| created_at | timestamptz | |

### ingestion_jobs
| field | type | notes |
|---|---|---|
| id | text (pk) | |
| user_id | text (fk → users.id) | |
| source_type | text enum(`paste`,`document`,`github`,`social`) | |
| namespace | text | target area |
| memwal_job_id | text | the MemWal async job id (eventual consistency) |
| status | text enum(`pending`,`processing`,`ready`,`error`) | |
| error | text (nullable) | plain-language reason on failure |
| source_hash | text (nullable) | hash of the input/source for duplicate detection |
| created_at | timestamptz | |

### documents
| field | type | notes |
|---|---|---|
| id | text (pk) | |
| user_id | text (fk → users.id) | |
| namespace | text | usually `docs` (or source area) |
| filename | text | |
| walrus_blob_id | text | pointer to the raw blob on Walrus |
| mime | text | pdf/docx/txt/md |
| size | integer | bytes (enforce max-size per the "Large document" edge case) |
| content_hash | text | hash of the raw blob; used to detect re-imported duplicates |
| created_at | timestamptz | |

### audit_log
| field | type | notes |
|---|---|---|
| id | text (pk) | |
| user_id | text (fk → users.id) | |
| action | text enum(`grant`,`revoke`,`freeze`,`unfreeze`,`ingest`,`restore`) | matches FR-027 (incl. imports + restores) |
| target | text | e.g., connected_app id, namespace, job id |
| metadata | jsonb | non-secret context (label, namespaces, counts) |
| created_at | timestamptz | |

**Relationships**: `users` 1—1 `memwal_accounts`; `users` 1—N `connected_apps` / `namespaces` /
`ingestion_jobs` / `documents` / `audit_log`.

## C. Source-of-Truth Matrix

| Data | Lives in | Authoritative? | Notes |
|---|---|---|---|
| Memory facts / embeddings | Walrus + MemWal index | ✅ | Seal-encrypted; the soul itself |
| Raw uploaded documents | Walrus blobs | ✅ | `walrus_blob_id` mirrored in `documents` |
| Ownership + permissions + freeze | Sui `memwal::account` | ✅ | delegate keys, active flag |
| Identity | Sui address (via Enoki) | ✅ | `users.sui_address` mirrors it |
| App/user metadata, jobs, audit, index | Postgres | ❌ (cache) | reconstructable from on-chain + Walrus (`restore`) |

## D. Spec Key-Entity → model mapping

| Spec entity | Model |
|---|---|
| Person (Owner) | `users` (identity = `sui_address`) |
| Soul | `memwal_accounts` (on-chain object) + the MemWal space (`owner + namespaces`) |
| Knowledge item | MemWal memory (Walrus + index); minimal mirror only |
| Area | `namespaces` (bio/docs/social) |
| Source / Imported document | `documents` (+ `ingestion_jobs` for the import run) |
| Connected tool | `connected_apps` (= on-chain delegate key) |
| Activity record | `audit_log` |

## E. State transitions

- **Ingestion job**: `pending → processing → ready` (or `→ error`). UI shows processing vs ready
  (eventual consistency); only `ready` items are guaranteed searchable.
- **Connected app**: `active → revoked` (on `remove_delegate_key`; `revoked_at` set). Reconnect = a
  **new** `connected_apps` row (the old revoked access never silently returns — spec edge case).
- **Account**: `active ⇄ frozen` via `deactivate_account` / `reactivate_account` (mirrored in
  `memwal_accounts.active`). While frozen, no delegate key can recall.
- **Memory item (delete)**: removed from index + metadata → no longer in browse/search/recall; the
  underlying Walrus blob may persist (immutable) — disclosed (research C3).

## Validation rules (from spec requirements)

- Exactly one `memwal_accounts` row per `users` row (idempotent provisioning — FR-002).
- `connected_apps` active count per user ≤ 20 (delegate-key cap — FR-028).
- `allowed_namespaces` ⊆ {bio,docs,social}.
- `documents.size` ≤ a configured maximum (reject larger — "Large document" edge case).
- `delegate_secret_enc` is always encrypted at rest and never serialized into any API response or log
  (Principle IX).
- Empty/blank input (empty pasted text or an empty file) MUST be rejected with a plain-language reason
  and create no item or job — "Empty or duplicate input" edge case.
- Re-importing the same source (matching `content_hash` / `source_hash`) MUST NOT create duplicate
  items; obvious duplicates are flagged so the person can remove them.
