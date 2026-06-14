/*
 * MemWal relayer rate-limit budgeting + backoff (Constitution Principle VII; sui-stack SKILL L4).
 *
 * Verified relayer limits (2026-06-05): 60 points/min + 500 points/hr PER ACCOUNT; 30 points/min
 * PER DELEGATE KEY. Operation weights below. We track points in-memory with sliding windows and
 * refuse (or delay) calls that would exceed a budget, plus a backoff helper for 429s. This is a
 * client-side guardrail to avoid tripping the relayer — the relayer remains the source of truth.
 */

import { TooManyRequestsError } from "../../pkg/errors/error";

/**
 * Structured budget refusal: foreground routes surface it as a 429, while background ingestion
 * catches it and WAITS `retryAfterMs` instead of failing the job mid-stream (a 100k-char paste
 * legitimately needs several budget windows). Lives here (not in the engine) so the ingest
 * orchestrator can import it without pulling the beta MemWal SDK into mock mode.
 */
export class BudgetExceededError extends TooManyRequestsError {
  readonly retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}

/** Point cost per relayer operation. */
export const OP_WEIGHTS = {
  analyze: 10,
  remember: 5,
  restore: 3,
  manual: 3,
  ask: 2,
  recall: 1,
} as const;
export type MemwalOp = keyof typeof OP_WEIGHTS;

const ACCOUNT_PER_MIN = 60;
const ACCOUNT_PER_HOUR = 500;
const DELEGATE_PER_MIN = 30;
const MINUTE = 60_000;
const HOUR = 3_600_000;

type Hit = { at: number; points: number };

/** Sliding-window points ledger keyed by an arbitrary id (account or delegate). */
class Window {
  private hits = new Map<string, Hit[]>();

  private prune(key: string, now: number) {
    const list = this.hits.get(key);
    if (!list) {
      return [];
    }
    const kept = list.filter((h) => now - h.at < HOUR);
    this.hits.set(key, kept);
    return kept;
  }

  points(key: string, windowMs: number, now: number): number {
    return this.prune(key, now)
      .filter((h) => now - h.at < windowMs)
      .reduce((sum, h) => sum + h.points, 0);
  }

  add(key: string, points: number, now: number) {
    const list = this.prune(key, now);
    list.push({ at: now, points });
    this.hits.set(key, list);
  }
}

const accountWindow = new Window();
const delegateWindow = new Window();

export type BudgetCheck = { ok: boolean; retryAfterMs: number; reason?: string };

/**
 * Check whether `op` is affordable for the given account (+ optional delegate) right now.
 * Returns `ok:false` with a suggested `retryAfterMs` when a limit would be exceeded.
 * `now` is injectable for testing.
 */
export function checkBudget(
  op: MemwalOp,
  accountId: string,
  delegateId?: string,
  now = Date.now()
): BudgetCheck {
  const cost = OP_WEIGHTS[op];
  const accMin = accountWindow.points(accountId, MINUTE, now);
  const accHour = accountWindow.points(accountId, HOUR, now);
  if (accMin + cost > ACCOUNT_PER_MIN) {
    return { ok: false, retryAfterMs: MINUTE, reason: "account per-minute budget" };
  }
  if (accHour + cost > ACCOUNT_PER_HOUR) {
    return { ok: false, retryAfterMs: HOUR, reason: "account per-hour budget" };
  }
  if (delegateId) {
    const delMin = delegateWindow.points(delegateId, MINUTE, now);
    if (delMin + cost > DELEGATE_PER_MIN) {
      return { ok: false, retryAfterMs: MINUTE, reason: "delegate per-minute budget" };
    }
  }
  return { ok: true, retryAfterMs: 0 };
}

/** Record that `op` was spent (call after a successful relayer request). */
export function recordSpend(
  op: MemwalOp,
  accountId: string,
  delegateId?: string,
  now = Date.now()
) {
  const cost = OP_WEIGHTS[op];
  accountWindow.add(accountId, cost, now);
  if (delegateId) {
    delegateWindow.add(delegateId, cost, now);
  }
}

/**
 * Run `fn`, retrying on 429 / rate-limit errors with exponential backoff + jitter.
 * Index-derived jitter (no Math.random) keeps behavior deterministic-ish across attempts.
 */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number; isRateLimited?: (e: unknown) => boolean } = {}
): Promise<T> {
  const retries = opts.retries ?? 4;
  const baseMs = opts.baseMs ?? 500;
  const isRateLimited =
    opts.isRateLimited ??
    ((e: unknown) => {
      const status =
        (e as { status?: number; statusCode?: number })?.status ??
        (e as { statusCode?: number })?.statusCode;
      return status === 429 || /rate.?limit|too many requests/i.test((e as Error)?.message ?? "");
    });

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isRateLimited(err)) {
        throw err;
      }
      const delay = baseMs * 2 ** attempt + ((attempt * 37) % 250);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
