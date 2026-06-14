import { describe, expect, it } from "vitest";
import { decryptSecret, decryptSecretString, encryptSecret } from "./at-rest";

describe("at-rest delegate-key encryption", () => {
  it("round-trips a secret string", () => {
    const secret = "deadbeef".repeat(8); // looks like a hex private key
    const blob = encryptSecret(secret);
    expect(Buffer.isBuffer(blob)).toBe(true);
    expect(decryptSecretString(blob)).toBe(secret);
  });

  it("round-trips raw bytes", () => {
    const data = Buffer.from([1, 2, 3, 4, 5]);
    expect(Buffer.from(decryptSecret(encryptSecret(data))).equals(data)).toBe(true);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-secret");
    const b = encryptSecret("same-secret");
    expect(a.equals(b)).toBe(false);
    expect(decryptSecretString(a)).toBe("same-secret");
    expect(decryptSecretString(b)).toBe("same-secret");
  });
});
