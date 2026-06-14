/*
 * Mock MemoryEngine for dev-mode — a deterministic, in-memory stand-in for MemWal.
 *
 * Honors the user-visible contract: analyze() splits messy text into facts; remember()/analyze()
 * return jobs that become `ready` (eventual-consistency UX preserved with a tiny delay); recall()
 * does term-overlap scoring scoped to namespaces; restore()/verify() report counts. NO real Walrus/
 * Seal — that's the live adapter. Keys are accepted but not used (mock).
 */
import { createHash, randomUUID } from "node:crypto";
import type { MemoryItem, Namespace } from "@soul/shared";
import type { MemoryEngine } from "../ports";

interface MemRecord {
  id: string;
  namespace: Namespace;
  text: string;
  source: string;
  blobId: string;
  createdAt: string;
}
interface Job {
  status: "pending" | "ready" | "error";
  blobId?: string;
  readyAt: number;
}

const tokenize = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);

/** Split messy text into discrete "facts" (sentences / lines), like analyze() does. */
const extractFacts = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

export class MockMemoryEngine implements MemoryEngine {
  /** The mock supports everything; the live managed relayer does not (see MemWalEngine). */
  readonly capabilities = { delete: true, browse: true } as const;
  // accountId -> memories
  private store = new Map<string, MemRecord[]>();
  private jobs = new Map<string, Job>();
  private readonly JOB_DELAY_MS = 400;

  private mem(accountId: string): MemRecord[] {
    let list = this.store.get(accountId);
    if (!list) {
      list = [];
      this.store.set(accountId, list);
    }
    return list;
  }

  private add(
    accountId: string,
    namespace: Namespace,
    text: string,
    source: string
  ): { id: string; blobId: string } {
    const id = randomUUID();
    const blobId = `mock_${createHash("sha256").update(`${accountId}:${id}:${text}`).digest("hex").slice(0, 40)}`;
    this.mem(accountId).push({
      id,
      namespace,
      text,
      source,
      blobId,
      createdAt: new Date().toISOString(),
    });
    return { id, blobId };
  }

  private newJob(blobId: string): string {
    const jobId = `job_${randomUUID()}`;
    this.jobs.set(jobId, { status: "pending", blobId, readyAt: Date.now() + this.JOB_DELAY_MS });
    return jobId;
  }

  async analyze(args: { accountId: string; namespace: Namespace; text: string; source?: string }) {
    const facts = extractFacts(args.text);
    const source = args.source ?? args.namespace;
    const jobIds = facts.map((f) =>
      this.newJob(this.add(args.accountId, args.namespace, f, source).blobId)
    );
    return { jobIds, factCount: facts.length };
  }

  async remember(args: { accountId: string; namespace: Namespace; text: string; source?: string }) {
    const { blobId } = this.add(
      args.accountId,
      args.namespace,
      args.text,
      args.source ?? args.namespace
    );
    return { jobId: this.newJob(blobId) };
  }

  async waitForJob(args: { jobId: string }) {
    const job = this.jobs.get(args.jobId);
    if (!job) {
      return { status: "error" as const, error: "unknown job" };
    }
    const wait = job.readyAt - Date.now();
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    job.status = "ready";
    return { status: "ready" as const, blobId: job.blobId };
  }

  async recall(args: {
    accountId: string;
    namespaces: Namespace[];
    query: string;
    limit?: number;
  }): Promise<MemoryItem[]> {
    const qTokens = new Set(tokenize(args.query));
    const limit = args.limit ?? 10;
    const scored = this.mem(args.accountId)
      .filter((m) => args.namespaces.includes(m.namespace))
      .map((m) => {
        const mTokens = tokenize(m.text);
        const overlap = mTokens.filter((t) => qTokens.has(t)).length;
        const substr = m.text.toLowerCase().includes(args.query.toLowerCase()) ? 1 : 0;
        const score = overlap + substr * 2;
        return { m, score };
      })
      .filter((x) => x.score > 0 || qTokens.size === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored.map(({ m, score }) => ({
      id: m.id,
      namespace: m.namespace,
      snippet: m.text.slice(0, 200),
      content: m.text,
      source: m.source,
      blobId: m.blobId,
      createdAt: m.createdAt,
      distance: 1 / (1 + score),
    }));
  }

  async get(args: { accountId: string; id: string }): Promise<MemoryItem | null> {
    const m = this.mem(args.accountId).find((x) => x.id === args.id);
    if (!m) {
      return null;
    }
    return {
      id: m.id,
      namespace: m.namespace,
      content: m.text,
      snippet: m.text.slice(0, 200),
      source: m.source,
      blobId: m.blobId,
      createdAt: m.createdAt,
    };
  }

  async remove(args: { accountId: string; id: string }): Promise<void> {
    const list = this.mem(args.accountId);
    const idx = list.findIndex((m) => m.id === args.id);
    if (idx >= 0) {
      list.splice(idx, 1);
    }
  }

  async restore(args: { accountId: string; namespace?: Namespace }) {
    const list = this.mem(args.accountId).filter(
      (m) => !args.namespace || m.namespace === args.namespace
    );
    return { restored: list.length, skipped: 0, total: list.length };
  }

  async verify(args: { accountId: string }) {
    const total = this.mem(args.accountId).length;
    return { intact: true, verified: total, total, missing: [] as string[] };
  }

  async compatibility() {
    return { ok: true, detail: "mock" };
  }
}
