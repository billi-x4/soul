import { describe, expect, it } from "vitest";
import { checkBudget, recordSpend, withBackoff } from "./limits";

describe("rate-limit budgeting", () => {
  const now = 1_000_000;

  it("allows ops within the per-minute account budget", () => {
    expect(checkBudget("recall", "acc-a", undefined, now).ok).toBe(true);
  });

  it("blocks ops that exceed the per-minute account budget (60 pts)", () => {
    // 12 × remember (5 pts) = 60; the next remember would hit 65 > 60.
    for (let i = 0; i < 12; i++) {
      recordSpend("remember", "acc-b", undefined, now);
    }
    const check = checkBudget("remember", "acc-b", undefined, now);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("account per-minute");
  });

  it("enforces the per-delegate per-minute budget (30 pts)", () => {
    for (let i = 0; i < 6; i++) {
      recordSpend("remember", "acc-c", "del-1", now);
    }
    const check = checkBudget("remember", "acc-c", "del-1", now);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("delegate");
  });
});

describe("withBackoff", () => {
  it("retries on a 429 then succeeds", async () => {
    let calls = 0;
    const result = await withBackoff(
      () => {
        calls++;
        if (calls === 1) {
          throw { status: 429 };
        }
        return Promise.resolve("ok");
      },
      { baseMs: 1, retries: 2 }
    );
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("does not retry on a non-rate-limit error", async () => {
    let calls = 0;
    await expect(
      withBackoff(
        () => {
          calls++;
          throw { status: 500 };
        },
        { baseMs: 1, retries: 3 }
      )
    ).rejects.toBeDefined();
    expect(calls).toBe(1);
  });
});
