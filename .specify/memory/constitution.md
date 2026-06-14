<!--
SYNC IMPACT REPORT
==================
Version change: 2.0.0 → 3.0.0
Bump rationale: MAJOR — Principle VI is redefined again, from "mainnet-direct" to a
  **testnet-first build / mainnet-for-production** two-environment model. This reconciles the
  constitution with the owner's repeatedly-stated "testnet-first" direction (given across the
  constitution, plan, tasks, and implement commands) and enables a runnable, demoable build
  without funding a mainnet wallet. Mainnet remains the durable-production-persistence target.
  This realigns the SKILLs' generic testnet-first guidance with the project decision (the prior
  Principle VIII override of that guidance is withdrawn).

Principles (I–X) — names after this amendment:
  I.    User Ownership Is Absolute                         (unchanged)
  II.   Walrus + MemWal Is the Single Source of Truth      (unchanged)
  III.  Privacy Comes Only From Seal                        (unchanged)
  IV.   On-Chain, Auditable Permissions                     (unchanged)
  V.    Verifiable & Portable Over Convenient               (unchanged)
  VI.   Testnet-First Build, Mainnet for Production         (REDEFINED: was "Mainnet-Direct";
          two-environment model — develop/demo on testnet, persist production on mainnet)
  VII.  Correctness With Beta Tooling                       (unchanged)
  VIII. SKILLs Are Authoritative                            (unchanged)
  IX.   Secure Key Custody                                  (unchanged)
  X.    MVP Scope Discipline                                (unchanged)

Added sections: none
Removed sections: none

Templates / artifacts updated for the testnet-first model:
  ✅ .specify/templates/plan-template.md — Constitution Check item VI + version ref → v3.0.0
  ✅ apps/api/.env.example, apps/web/.env.example, railway.toml (was render.yaml; Railway
     replaced Render 2026-06-12) — SUI_NETWORK=testnet (dev/demo); staging relayer; mainnet
     documented as the production cutover
  ✅ CLAUDE.md §0 precedence example, §2 decision #6, §8 env — updated to testnet-first build
  ✅ specs/001-soul-mvp/plan.md — Network note + Constitution Check VI + risk R12 → testnet-first
  ✅ specs/001-soul-mvp/tasks.md — 🌐 legend → testnet build / mainnet cutover
  ⚠ specs/001-soul-mvp/quickstart.md, research.md §11 — being swept to testnet in the SDD-finalize pass
  ℹ docs/*/SKILL.md — their generic "testnet-first, then mainnet" guidance is now ALIGNED with the
     project decision (no longer overridden); the SKILLs are not edited.

Follow-up TODOs: NETWORK_POLICY resolved → testnet-first build / mainnet production.
-->

# Soul Constitution

Soul is a portable, user-owned, verifiable personal-memory web app on the Sui Stack
("Your Second Soul"). This constitution defines the non-negotiable principles that govern
how Soul is designed and built. It is binding on all contributors and agents. Where this
document and any other guidance conflict, this constitution wins, except that the design
SKILLs in `docs/*/SKILL.md` remain the authoritative source for layer mechanics (see
Principle VIII).

## Core Principles

### I. User Ownership Is Absolute

The soul belongs to the user, enforced by their Sui account.

- Identity MUST be the user's Sui address, derived via **Enoki zkLogin** (Google for MVP).
- There MUST be exactly one identity system. No competing or parallel auth (e.g. Clerk, a
  separate user/password store) MAY be introduced.
- Postgres `users` (and any mirror) MAY reflect the Sui address but is NEVER authoritative.
- Account provisioning MUST be idempotent: exactly one `MemWalAccount` per Sui address.

**Rationale**: Ownership and on-chain permissions are enforced through the user's Sui account;
a second identity system would silently undermine the "user-owned" guarantee.

### II. Walrus + MemWal Is the Single Source of Truth

Memory lives on the decentralized stack, not in our database.

- Memory content — facts, embeddings, and uploaded documents — MUST be stored on **Walrus via
  MemWal**. Memory content MUST NOT be stored in Postgres.
- Postgres MUST hold metadata / index data ONLY, and MUST be fully reconstructable from
  on-chain account state + Walrus via `restore`.
- Any feature that persists memory MUST remain `restore`-recoverable; a feature that makes
  Postgres authoritative for memory is a violation.

**Rationale**: Portability and verifiability are the product. Postgres is a disposable cache;
the soul must survive losing it.

### III. Privacy Comes Only From Seal

Encryption is the only privacy boundary.

- Privacy MUST derive solely from **Seal** encryption. Sui objects and Walrus blobs are PUBLIC
  and discoverable; code and UX MUST NOT claim that ownership, obscurity, or storage location
  provides privacy.
- Whenever a path can expose plaintext — notably the **managed relayer**, which embeds and
  encrypts server-side — Soul MUST disclose this plainly to the user in the UI.
- Sensitive payloads MUST be Seal-encrypted before anything reaches Walrus.

**Rationale**: A false privacy claim is worse than none; users must know exactly who can read
their soul.

### IV. On-Chain, Auditable Permissions

Access is granted and revoked on-chain, and every change is recorded.

- App / AI-client access MUST be controlled via MemWal `memwal::account` delegate keys:
  `add_delegate_key` to grant, `remove_delegate_key` to revoke, `deactivate_account` /
  `reactivate_account` to freeze.
- Revocation MUST take effect on-chain — not merely app-side or by deleting local credentials.
- Every grant and every revoke MUST be written to an audit log.
- Namespace scoping is **relayer-enforced, not an on-chain guarantee**, and MUST be described
  as such wherever "scoped access" is claimed. The per-account delegate-key cap (20) MUST be
  respected.

**Rationale**: "You own it" is only real if the user can verifiably and auditably grant and
revoke access.

### V. Verifiable & Portable Over Convenient

When convenience conflicts with sovereignty, sovereignty wins.

- Designs MUST preserve verifiability and portability: `restore` and on-chain revoke MUST
  remain functional end to end.
- No design MAY lock the user into a single platform or provider. Managed dependencies (Enoki,
  the MemWal relayer) MUST retain a documented self-host / native fallback path
  (`@mysten/sui/zklogin`, self-hosted relayer, direct `@mysten/walrus` + `@mysten/seal`).

**Rationale**: The whole point of Soul is escaping per-app data silos; we must not become one.

### VI. Testnet-First Build, Mainnet for Production; Beta-Pinned Dependencies

Develop and demo on testnet; persist production on mainnet; never trust beta APIs to be stable.

- Soul is **built, tested, and iterated on Sui/Walrus testnet** (free and fast). `SUI_NETWORK=
  testnet` is the default across dev/demo env and deploy config. This is the owner's standing
  direction and enables a runnable build without funding a mainnet wallet.
- **Mainnet is the production-persistence target.** Anything that must durably persist for real
  users cuts over to mainnet (`SUI_NETWORK=mainnet`) via env, with contract IDs/endpoints
  re-verified. Testnet is periodically wiped — do not rely on it for long-lived data.
- Mainnet storage costs real WAL + SUI (paid by the sponsoring relayer wallet in managed mode);
  per-operation weights and storage epochs MUST be budgeted before cutover.
- All Sui Stack SDKs MUST be treated as **beta**: pin exact versions (no floating ranges).
- Contract IDs, registries, and relayer/aggregator endpoints MUST be verified against live docs
  at build time before any deploy — they change during beta. Use the **testnet** IDs + staging
  relayer for the build; swap to mainnet IDs + the production relayer at cutover.
- Use `@mysten/sui` (never the deprecated `@mysten/sui.js`); track the dApp Kit package
  migration.

**Rationale**: A free, wipe-tolerant testnet is the right place to build and demo a beta-stack
app; mainnet is reserved for durable production. Pinning + live re-verification keep a fast-moving
beta stack from breaking the build. This aligns with the SKILLs' "build on testnet, then mainnet
for persistence" guidance.

### VII. Correctness With Beta Tooling

Handle the known failure modes of the stack, every time.

- MemWal writes are **eventually consistent**: `remember` / `analyze` return job ids and run
  asynchronously. Code MUST poll / `waitFor` job completion before reporting "stored," and UI
  MUST tolerate "written but not yet queryable."
- Relayer **rate limits** and per-account quotas MUST be respected (batch + backoff); prefer the
  relayer / publishers / aggregators over request-heavy raw SDK writes.
- The **zkLogin proof** MUST be cached per session (it takes ~3 s to generate), never per
  signature.
- The MemWal SDK `/version` check (`MemWalCompatibilityError`) MUST be handled.

**Rationale**: These are the predictable ways a correct-looking integration breaks in practice.

### VIII. SKILLs Are Authoritative

Read the docs before you build the layer.

- `docs/soul-architecture/SKILL.md` (blueprint) and `docs/sui-stack-for-soul/SKILL.md` (parts
  catalog) are the authoritative design references.
- Any contributor or agent MUST read the relevant SKILL section before implementing a layer
  (auth, ingestion, storage, permissions, AI-consumption).
- Implementations MUST NOT rely on training-data assumptions about the Sui Stack; verify against
  the SKILLs and the live docs they link.
- `CLAUDE.md` records project-specific decisions and runtime guidance; the two SKILLs and
  `CLAUDE.md` MUST be kept in sync with this constitution.

**Rationale**: The stack moves too fast to build from memory; the SKILLs prevent guesswork.

### IX. Secure Key Custody

Delegate keys are the keys to the soul; treat them accordingly.

- Delegate keys and session tokens MUST NEVER be logged or exposed in responses, errors, or
  client code.
- Keys MUST be scoped per app, encrypted at rest, and dropped on revoke.
- No unencrypted secrets MAY be placed in Sui objects or Walrus blobs (both public).
- Defense in depth: encrypt at every layer (in transit and at rest), not only via Seal.

**Rationale**: A leaked or over-scoped delegate key is a full compromise of the user's memory.

### X. MVP Scope Discipline

Build the verifiable core; defer the rest.

- Work MUST be limited to the MVP defined in `docs/soul-architecture/SKILL.md` §1 (in scope).
- Post-MVP items — "Sign in with Soul" SDK, browser extension, login providers beyond Google,
  self-hosted relayer, custom Seal policies, Nautilus, Sui Stack Messaging — MUST remain
  deferred unless explicitly promoted via a constitution amendment or a recorded decision.
- New scope MUST be justified against the MVP before it is built.

**Rationale**: Shipping the verifiable core beats a broad, unfinished surface.

## Technology & Architecture Constraints

- **Monorepo**: Turborepo + pnpm, `@soul/*` workspace scope, end-to-end TypeScript, Biome.
  API = Bun + Hono (`apps/api`); Web = Next.js + Tailwind + shadcn/ui (`apps/web`);
  DB = Drizzle + Supabase/Postgres (`packages/db`), metadata/index only.
- **Source-of-Truth Matrix** (authoritative): memory facts/embeddings → Walrus + MemWal index
  (Seal-encrypted); raw documents → Walrus blobs (blob id mirrored in `documents`); ownership +
  permissions → Sui `memwal::account`; app/user metadata, jobs, audit → Postgres
  (reconstructable); identity → Sui address via Enoki.
- **Privacy mode**: the MVP ships managed-relayer mode (plaintext-at-server, disclosed per
  Principle III); manual / client-side-Seal mode is the post-MVP hardened path.
- **Hosting**: Walrus Sites is the primary target; Vercel (web) / Railway (api) are centralized
  fallbacks only.
- **Environment**: use the variables in `docs/soul-architecture/SKILL.md` §10 (Enoki, Supabase,
  MemWal relayer + account registry, Sui network). Per Principle VI the build defaults to
  **testnet** (`SUI_NETWORK=testnet`, staging relayer `https://relayer-staging.memory.walrus.xyz`);
  flip to `mainnet` + the production relayer at the production cutover. No Clerk variables. Secrets
  are never committed.

## Development Workflow & Quality Gates

- **Spec-driven development**: features flow through Spec Kit — constitution → `specify` →
  `plan` → `tasks` → `implement`. Specs and plans MUST stay consistent with this constitution.
- **Constitution Check (gate)**: every implementation plan MUST pass the Constitution Check in
  `plan-template.md` before Phase 0 and again after Phase 1 design. Violations MUST be recorded
  in Complexity Tracking with justification, or the design MUST be revised.
- **Network**: Soul is built/demoed on **testnet** (Principle VI); `SUI_NETWORK=testnet` is the
  dev/demo default. A documented **mainnet cutover** (env swap + re-verified contract IDs/endpoints)
  moves durable production to mainnet. Before any deploy, contract IDs/endpoints MUST be re-verified
  against live docs.
- **Dependency discipline**: Sui Stack versions are pinned; bumping a beta SDK requires
  re-verifying contract IDs/endpoints and the `/version` compatibility check.
- **Security review**: any change touching delegate keys, tokens, or encryption MUST be reviewed
  against Principle IX before merge.

## Governance

- This constitution supersedes other practices and conventions. The `docs/*/SKILL.md` files
  remain authoritative for layer mechanics (Principle VIII); `CLAUDE.md` records project
  decisions and runtime guidance and MUST be kept consistent with this document.
- **Amendments** MUST be proposed in writing with rationale, versioned, and accompanied by
  updates to dependent artifacts (templates, `CLAUDE.md`, SKILLs as needed).
- **Versioning policy** (semantic):
  - MAJOR: backward-incompatible governance changes or removal/redefinition of a principle.
  - MINOR: a new principle/section, or materially expanded guidance.
  - PATCH: clarifications and wording with no change in obligations.
- **Compliance**: plans and pull requests MUST verify compliance with these principles.
  Unjustified violations block merge. Complexity that contradicts a principle MUST be justified
  in the plan's Complexity Tracking or rejected.

**Version**: 3.0.0 | **Ratified**: 2026-06-05 | **Last Amended**: 2026-06-05
