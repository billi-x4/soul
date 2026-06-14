/*
 * Mock ChainService for dev-mode — deterministic fake object ids + Ed25519-shaped delegate keys,
 * no real Sui transactions. The live adapter builds memwal::account PTBs and sponsors them via Enoki.
 */
import { createHash, randomBytes } from "node:crypto";
import { config } from "../../pkg/config";
import type { ChainService } from "../ports";

const objId = (s: string) => `0x${createHash("sha256").update(s).digest("hex")}`;

export class MockChain implements ChainService {
  async createAccount(ownerAddress: string): Promise<{ accountObjectId: string }> {
    return { accountObjectId: objId(`account:${ownerAddress}`) };
  }

  async generateDelegateKey(): Promise<{
    privateKeyHex: string;
    publicKey: Uint8Array;
    address: string;
  }> {
    const priv = randomBytes(32);
    const publicKey = new Uint8Array(createHash("sha256").update(priv).digest());
    const address = objId(`delegate:${Buffer.from(publicKey).toString("hex")}`);
    return { privateKeyHex: priv.toString("hex"), publicKey, address };
  }

  async addDelegateKey(): Promise<void> {
    /* mock no-op */
  }

  async removeDelegateKey(): Promise<void> {
    /* mock no-op */
  }

  async setAccountActive(): Promise<void> {
    /* mock no-op */
  }

  async transferSui(args: {
    fromAddress: string;
    toAddress: string;
    amountMist: string;
  }): Promise<{ digest: string }> {
    // Deterministic synthetic payment digest — no real SUI moves in dev mode.
    return {
      digest: objId(`transfer:${args.fromAddress}:${args.toAddress}:${args.amountMist}`),
    };
  }

  explorerUrl(objectId: string): string {
    return `https://suiscan.xyz/${config.network}/object/${objectId}`;
  }
}
