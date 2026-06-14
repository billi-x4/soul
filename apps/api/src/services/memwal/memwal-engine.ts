/*
 * Live MemoryEngine adapter — MemWal managed-relayer mode (@mysten-incubation/memwal v0.0.7).
 *
 * This is the real Sui-Stack memory engine: it signs requests with a per-app Ed25519 delegate
 * key and talks to the staging/prod relayer (config.memwal.relayerUrl). The relayer (a TEE)
 * does the heavy lifting server-side — fact extraction, embedding, Seal encryption, Walrus
 * upload/download, and vector search. In MANAGED mode the relayer sees plaintext (CLAUDE.md
 * decision #4); the zero-plaintext path is post-MVP manual mode.
 *
 * Beta limitations (see specs/001-soul-mvp/live-cutover.md):
 *   - Blocker #2 (MemWal managed-mode get/delete): there is NO get-by-id and NO delete primitive
 *     in the managed SDK surface. `get()` returns null and `remove()` is a no-op. Callers must not
 *     rely on point reads/deletes against the live engine. Recall is the only read path.
 *   - There is also no integrity-verify primitive: `verify()` is approximated via `health()`
 *     (relayer reachable + ok) and reports zero counts (we cannot enumerate owned blobs here).
 *
 * Eventual consistency (CLAUDE.md §6): remember()/analyze() return job ids and run async; the
 * route layer polls waitForJob() before showing "stored".
 *
 * Secrets: the delegate private key is never logged. The client cache key uses a one-way SHA-256
 * fingerprint of the key, never the key itself.
 */
import { createHash } from "node:crypto";
import type { AnalyzeResult, RestoreResult } from "@mysten-incubation/memwal";
import { MemWal, MemWalCompatibilityError } from "@mysten-incubation/memwal";
import { type MemoryItem, NAMESPACES, type Namespace } from "@soul/shared";
import { config } from "../../pkg/config";
import type { MemoryEngine } from "../ports";
import { BudgetExceededError, checkBudget, type MemwalOp, recordSpend, withBackoff } from "./limits";

/** Snippet length for list-view previews (mirrors the recall contract). */
const SNIPPET_LEN = 280;
/** Client-cache bound: one MemWal client per (account, namespace, key) — MCP traffic can present
 * a different delegate key per request, so the cache must not grow without limit. */
const MAX_CACHED_CLIENTS = 64;

export class MemWalEngine implements MemoryEngine {
  /** Managed-relayer beta: no delete primitive, no list-without-query (blocker #2). */
  readonly capabilities = { delete: false, browse: false } as const;

  /** Cache of MemWal clients keyed by accountId:namespace:keyFingerprint (LRU, bounded). */
  private readonly clients = new Map<string, MemWal>();

  /** One-way fingerprint of the delegate key for safe cache keying (never reversible, never logged). */
  private keyFingerprint(delegateKeyHex: string): string {
    return createHash("sha256").update(delegateKeyHex).digest("hex").slice(0, 16);
  }

  /**
   * Construct (and cache) a MemWal client bound to a delegate key + account + namespace.
   * `namespace` is the client default; recall/remember can still override per call.
   */
  private client(delegateKeyHex: string, accountId: string, namespace?: string): MemWal {
    const cacheKey = `${accountId}:${namespace ?? ""}:${this.keyFingerprint(delegateKeyHex)}`;
    const cached = this.clients.get(cacheKey);
    if (cached) {
      // LRU touch: re-insertion moves the key to the back of the Map's iteration order.
      this.clients.delete(cacheKey);
      this.clients.set(cacheKey, cached);
      return cached;
    }
    const created = MemWal.create({
      key: delegateKeyHex,
      accountId,
      serverUrl: config.memwal.relayerUrl,
      namespace,
    });
    if (this.clients.size >= MAX_CACHED_CLIENTS) {
      const oldest = this.clients.keys().next().value;
      if (oldest !== undefined) {
        // Evict WITHOUT destroy(): the SDK's destroy() zeroes the signing key in place, which
        // would corrupt any in-flight request (e.g. a 60s waitForRememberJob poll) still holding
        // the instance. Dropping the reference lets in-flight work finish; GC reclaims it.
        this.clients.delete(oldest);
      }
    }
    this.clients.set(cacheKey, created);
    return created;
  }

  /**
   * Client-side relayer budgeting (Constitution VII): refuse calls that would exceed the
   * documented point budgets (60/min + 500/hr per account, 30/min per delegate key) with a 429
   * instead of tripping the relayer, retry real 429s with backoff, and record spend on success.
   */
  private async spend<T>(
    op: MemwalOp,
    accountId: string,
    delegateKeyHex: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const delegateId = this.keyFingerprint(delegateKeyHex);
    const budget = checkBudget(op, accountId, delegateId);
    if (!budget.ok) {
      throw new BudgetExceededError(
        `Memory relayer budget exhausted (${budget.reason}); retry in ~${Math.ceil(budget.retryAfterMs / 1000)}s.`,
        budget.retryAfterMs
      );
    }
    const result = await withBackoff(fn);
    recordSpend(op, accountId, delegateId);
    return result;
  }

  async analyze(args: {
    delegateKeyHex: string;
    accountId: string;
    namespace: Namespace;
    text: string;
    source?: string;
  }): Promise<{ jobIds: string[]; factCount: number }> {
    const client = this.client(args.delegateKeyHex, args.accountId, args.namespace);
    const res: AnalyzeResult = await this.spend("analyze", args.accountId, args.delegateKeyHex, () =>
      client.analyze(args.text, args.namespace)
    );
    return { jobIds: res.job_ids, factCount: res.fact_count };
  }

  async remember(args: {
    delegateKeyHex: string;
    accountId: string;
    namespace: Namespace;
    text: string;
    source?: string;
  }): Promise<{ jobId: string }> {
    const client = this.client(args.delegateKeyHex, args.accountId, args.namespace);
    const res = await this.spend("remember", args.accountId, args.delegateKeyHex, () =>
      client.remember(args.text, args.namespace)
    );
    return { jobId: res.job_id };
  }

  async waitForJob(args: {
    delegateKeyHex: string;
    accountId: string;
    jobId: string;
  }): Promise<{ status: "ready" | "error"; blobId?: string; error?: string }> {
    // The job id is account-scoped, not namespace-scoped — use a default-namespace client.
    const client = this.client(args.delegateKeyHex, args.accountId);
    try {
      const res = await client.waitForRememberJob(args.jobId);
      return { status: "ready", blobId: res.blob_id };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  }

  async recall(args: {
    delegateKeyHex: string;
    accountId: string;
    namespaces: Namespace[];
    query: string;
    limit?: number;
  }): Promise<MemoryItem[]> {
    // The relayer requires a non-empty query for vector search; empty → nothing to recall.
    if (args.query.trim().length === 0) {
      return [];
    }
    const limit = args.limit ?? 10;
    const nowIso = new Date().toISOString();
    const merged: MemoryItem[] = [];

    // One recall per namespace (the relayer scopes recall to a single namespace).
    for (const ns of args.namespaces) {
      const client = this.client(args.delegateKeyHex, args.accountId, ns);
      const res = await this.spend("recall", args.accountId, args.delegateKeyHex, () =>
        client.recall(args.query, limit, ns)
      );
      for (const r of res.results) {
        merged.push({
          id: r.blob_id,
          namespace: ns,
          snippet: r.text.slice(0, SNIPPET_LEN),
          content: r.text,
          source: ns,
          blobId: r.blob_id,
          createdAt: nowIso,
          distance: r.distance,
        });
      }
    }

    // Closest first, then cap to the requested limit across all namespaces.
    merged.sort(
      (a, b) => (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY)
    );
    return merged.slice(0, limit);
  }

  /**
   * Managed mode has no get-by-id primitive (live-cutover blocker #2). Point reads are not
   * supported against the live relayer — recall is the only read path. Returns null so the
   * route layer degrades gracefully instead of fabricating data.
   */
  async get(_args: {
    delegateKeyHex: string;
    accountId: string;
    id: string;
  }): Promise<MemoryItem | null> {
    return null;
  }

  /**
   * Managed mode has no delete primitive (live-cutover blocker #2). Revocation is enforced
   * on-chain (remove the delegate key); individual fact deletion is not exposed. No-op.
   */
  async remove(_args: { delegateKeyHex: string; accountId: string; id: string }): Promise<void> {
    // intentional no-op — see class doc comment / blocker #2.
  }

  async restore(args: {
    delegateKeyHex: string;
    accountId: string;
    namespace?: Namespace;
  }): Promise<{ restored: number; skipped: number; total: number }> {
    if (args.namespace) {
      const namespace = args.namespace;
      const client = this.client(args.delegateKeyHex, args.accountId, namespace);
      const res: RestoreResult = await this.spend("restore", args.accountId, args.delegateKeyHex, () =>
        client.restore(namespace)
      );
      return { restored: res.restored, skipped: res.skipped, total: res.total };
    }
    // No namespace → restore each known namespace and sum the counts (restore is single-shot per ns).
    let restored = 0;
    let skipped = 0;
    let total = 0;
    for (const ns of NAMESPACES) {
      const client = this.client(args.delegateKeyHex, args.accountId, ns);
      const res: RestoreResult = await this.spend("restore", args.accountId, args.delegateKeyHex, () =>
        client.restore(ns)
      );
      restored += res.restored;
      skipped += res.skipped;
      total += res.total;
    }
    return { restored, skipped, total };
  }

  /**
   * No dedicated integrity-verify primitive in managed mode. We approximate "intact" with a
   * relayer health probe (reachable + ok). We cannot enumerate owned blobs from here, so the
   * verified/total counts are zero and `missing` is empty — the Inspector surfaces this as a
   * liveness check, not a per-blob audit. See class doc / blocker note.
   */
  async verify(args: {
    delegateKeyHex: string;
    accountId: string;
  }): Promise<{ intact: boolean; verified: number; total: number; missing: string[] }> {
    const client = this.client(args.delegateKeyHex, args.accountId);
    try {
      const health = await client.health();
      const intact =
        health.status.toLowerCase() === "ok" || health.status.toLowerCase() === "healthy";
      return { intact, verified: 0, total: 0, missing: [] };
    } catch {
      return { intact: false, verified: 0, total: 0, missing: [] };
    }
  }

  /**
   * Probe the relayer compatibility contract. The check is account-agnostic, so we spin up a
   * throwaway client with a dummy key/account purely to reach `compatibility()`. A
   * MemWalCompatibilityError (or any failure) means the SDK/relayer versions are out of sync.
   */
  async compatibility(): Promise<{ ok: boolean; detail?: string }> {
    const throwaway = MemWal.create({
      key: "00".repeat(32),
      accountId: "0x0",
      serverUrl: config.memwal.relayerUrl,
    });
    try {
      const meta = await throwaway.compatibility();
      return { ok: true, detail: `relayer ${meta.relayerVersion} (api ${meta.apiVersion})` };
    } catch (err) {
      if (err instanceof MemWalCompatibilityError) {
        return { ok: false, detail: err.message };
      }
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    } finally {
      throwaway.destroy();
    }
  }
}
