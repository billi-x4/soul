import { describe, expect, it } from "vitest";
import type { MemoryEngine } from "../ports";
import { MockMemoryEngine } from "./mock-engine";

const acct = "0xacc";
const key = "00";

describe("MockMemoryEngine", () => {
  it("analyze splits text into facts that are recallable by meaning", async () => {
    const engine: MemoryEngine = new MockMemoryEngine();
    const r = await engine.analyze({
      delegateKeyHex: key,
      accountId: acct,
      namespace: "bio",
      text: "I love Sui. I am building Soul. I live in Karachi.",
    });
    expect(r.factCount).toBe(3);

    const hits = await engine.recall({
      delegateKeyHex: key,
      accountId: acct,
      namespaces: ["bio"],
      query: "Sui",
    });
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]?.content?.toLowerCase()).toContain("sui");
    expect(hits[0]?.namespace).toBe("bio");
  });

  it("scopes recall to requested namespaces", async () => {
    const engine: MemoryEngine = new MockMemoryEngine();
    await engine.remember({
      delegateKeyHex: key,
      accountId: acct,
      namespace: "social",
      text: "TypeScript projects",
    });
    const bioHits = await engine.recall({
      delegateKeyHex: key,
      accountId: acct,
      namespaces: ["bio"],
      query: "TypeScript",
    });
    expect(bioHits.length).toBe(0);
    const socialHits = await engine.recall({
      delegateKeyHex: key,
      accountId: acct,
      namespaces: ["social"],
      query: "TypeScript",
    });
    expect(socialHits.length).toBe(1);
  });

  it("remove de-indexes an item; restore/verify count remaining", async () => {
    const engine: MemoryEngine = new MockMemoryEngine();
    await engine.remember({
      delegateKeyHex: key,
      accountId: acct,
      namespace: "bio",
      text: "one fact",
    });
    const [item] = await engine.recall({
      delegateKeyHex: key,
      accountId: acct,
      namespaces: ["bio"],
      query: "fact",
    });
    expect(item).toBeDefined();
    await engine.remove({ delegateKeyHex: key, accountId: acct, id: item!.id });
    const after = await engine.recall({
      delegateKeyHex: key,
      accountId: acct,
      namespaces: ["bio"],
      query: "fact",
    });
    expect(after.length).toBe(0);
    const v = await engine.verify({ delegateKeyHex: key, accountId: acct });
    expect(v.intact).toBe(true);
  });

  it("waitForJob resolves remember jobs to ready", async () => {
    const engine: MemoryEngine = new MockMemoryEngine();
    const { jobId } = await engine.remember({
      delegateKeyHex: key,
      accountId: acct,
      namespace: "bio",
      text: "x",
    });
    const status = await engine.waitForJob({ delegateKeyHex: key, accountId: acct, jobId });
    expect(status.status).toBe("ready");
  });
});
