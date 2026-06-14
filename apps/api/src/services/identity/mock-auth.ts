/*
 * Mock AuthProvider for dev-mode. Sessions are opaque "soul-dev.<suiAddress>" tokens — no real
 * zkLogin/Enoki. The live adapter verifies an Enoki zkLogin session and derives the Sui address.
 */
import { createHash } from "node:crypto";
import type { AuthProvider } from "../ports";

const PREFIX = "soul-dev.";
const DEV_DEFAULT_ADDR = `0x${createHash("sha256").update("soul-dev-user").digest("hex")}`;

export class MockAuth implements AuthProvider {
  async verify(token: string | undefined): Promise<{ suiAddress: string } | null> {
    if (token?.startsWith(PREFIX)) {
      const suiAddress = token.slice(PREFIX.length);
      if (suiAddress) {
        return { suiAddress };
      }
    }
    return null;
  }

  async devSession(suiAddress?: string): Promise<{ token: string; suiAddress: string }> {
    const addr = suiAddress ?? DEV_DEFAULT_ADDR;
    return { token: `${PREFIX}${addr}`, suiAddress: addr };
  }
}
