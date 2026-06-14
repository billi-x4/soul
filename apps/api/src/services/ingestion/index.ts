/*
 * Ingestion orchestrator (US2). Computes a source hash for dedup, creates an ingestion job, then
 * runs analyze → waitForJob asynchronously (eventual consistency: return the job immediately,
 * resolve in the background), and audits success. Empty input is rejected; re-imports are deduped.
 */
import { createHash } from "node:crypto";
import type { Namespace, SourceType } from "@soul/shared";
import { encryptSecret } from "../../pkg/crypto/at-rest";
import { BadRequestError } from "../../pkg/errors/error";
import { services } from "../container";
import { BudgetExceededError } from "../memwal/limits";
import type { AccountRecord, JobRecord } from "../ports";
import { chunkText } from "./parsers";

const sha256 = (s: string | Uint8Array): string => createHash("sha256").update(s).digest("hex");

/** Longest a background ingest job will wait out relayer budget windows before giving up. */
const MAX_BUDGET_WAIT_MS = 15 * 60_000;
/** Cap each individual wait so a per-hour refusal (retryAfterMs = 1h) doesn't park the job. */
const MAX_SINGLE_WAIT_MS = 65_000;

/**
 * Run a relayer call, WAITING out budget refusals instead of failing the job: a multi-chunk
 * ingest (analyze = 10 pts, ~30 pts/min per delegate) legitimately spans several budget
 * windows. Foreground routes still get the immediate 429 — this patience is ingest-only.
 */
async function withBudgetPatience<T>(fn: () => Promise<T>): Promise<T> {
  let waited = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof BudgetExceededError) || waited >= MAX_BUDGET_WAIT_MS) {
        throw e;
      }
      const delay = Math.min(e.retryAfterMs, MAX_SINGLE_WAIT_MS);
      waited += delay;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export async function ingest(args: {
  userId: string;
  account: AccountRecord;
  delegateKeyHex: string;
  namespace: Namespace;
  sourceType: SourceType;
  text: string;
  sourceLabel: string;
}): Promise<JobRecord> {
  const { userId, account, delegateKeyHex, namespace, sourceType, text, sourceLabel } = args;
  if (!text.trim()) {
    throw new BadRequestError("Empty input — nothing to add.");
  }
  const sourceHash = sha256(`${namespace}:${sourceType}:${text}`);
  const dup = await services.repo.findJobBySourceHash(userId, sourceHash);
  // Dedup only against jobs that worked (or are still working) — a failed first ingest must not
  // permanently block re-importing the same content.
  if (dup && dup.status !== "error") {
    return dup;
  }

  const job = await services.repo.createJob({
    userId,
    sourceType,
    namespace,
    sourceHash,
    status: "processing",
  });

  // Eventual consistency: resolve in the background, return the job now.
  void (async () => {
    try {
      for (const part of chunkText(text)) {
        const { jobIds } = await withBudgetPatience(() =>
          services.memory.analyze({
            delegateKeyHex,
            accountId: account.accountObjectId,
            namespace,
            text: part,
            source: sourceLabel,
          })
        );
        for (const jid of jobIds) {
          const result = await services.memory.waitForJob({
            delegateKeyHex,
            accountId: account.accountObjectId,
            jobId: jid,
          });
          // A failed/timed-out fact job must fail the soul job — "ready" must mean stored.
          if (result.status === "error") {
            throw new Error(result.error ?? "A memory job failed while processing.");
          }
        }
      }
      await services.repo.updateJob(job.id, { status: "ready" });
      await services.repo.addAudit({
        userId,
        action: "ingest",
        target: namespace,
        metadata: { sourceType, sourceLabel },
      });
    } catch (e) {
      await services.repo.updateJob(job.id, { status: "error", error: (e as Error).message });
    }
  })();

  return job;
}

/** Store a raw uploaded document blob (Walrus in live mode) + mirror metadata (FR-004). */
export async function storeDocument(args: {
  userId: string;
  namespace: Namespace;
  filename: string;
  mime: string;
  bytes: Uint8Array;
  contentHash: string;
}): Promise<void> {
  // Dedup: re-uploading the same file reuses the existing blob/row (no duplicate Walrus cost).
  const existing = await services.repo.findDocumentByContentHash(args.userId, args.contentHash);
  if (existing) {
    return;
  }
  // Walrus blobs are PUBLIC and discoverable (CLAUDE.md decision #4) — never write a user's
  // document plaintext. AES-256-GCM under the at-rest master key; decryptSecret() reverses it.
  const { blobId } = await services.blobs.write(encryptSecret(Buffer.from(args.bytes)), {
    mime: "application/octet-stream",
  });
  await services.repo.createDocument({
    userId: args.userId,
    namespace: args.namespace,
    filename: args.filename,
    walrusBlobId: blobId,
    mime: args.mime,
    size: args.bytes.length,
    contentHash: args.contentHash,
  });
}
