import { describe, expect, it } from "vitest";
import { chunkText } from "./parsers";

describe("chunkText", () => {
  it("returns a single chunk for short text", () => {
    expect(chunkText("hello world")).toEqual(["hello world"]);
  });

  it("returns no chunks for empty text", () => {
    expect(chunkText("   ")).toEqual([]);
  });

  it("splits long text into bounded chunks on paragraph boundaries", () => {
    const para = `${"a".repeat(1000)}`;
    const text = Array.from({ length: 10 }, () => para).join("\n\n"); // ~10k chars
    const chunks = chunkText(text, 4000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const ch of chunks) {
      expect(ch.length).toBeLessThanOrEqual(4000);
    }
  });

  it("hard-splits a single oversized paragraph with no boundaries (BUG-1)", () => {
    const chunks = chunkText("a".repeat(50_000), 4000);
    expect(chunks.length).toBe(Math.ceil(50_000 / 4000));
    for (const ch of chunks) {
      expect(ch.length).toBeLessThanOrEqual(4000);
    }
    expect(chunks.join("")).toBe("a".repeat(50_000));
  });
});
