/*
 * Live ChainService adapter — managed-custodial MemWalAccount ops on Sui L1.
 *
 * @mysten/sui 2.17.0 (Transaction PTBs + Ed25519 + JSON-RPC client). Builds `memwal::account`
 * programmable transactions (create_account / add_delegate_key / remove_delegate_key /
 * deactivate_account / reactivate_account) and executes them as NATIVE Sui sponsored transactions.
 *
 * MANAGED-CUSTODIAL MODE (resolves live-cutover blocker #3 server-side):
 *   The MemWal contract enforces ONE account per owner address, so every user must have a UNIQUE
 *   on-chain owner. We derive a deterministic per-user owner keypair from SECRET_ENCRYPTION_KEY + the
 *   user's identity address (scrypt). That derived key is the account SENDER/OWNER and signs the
 *   account's mutations; it never needs to hold SUI because gas is sponsored by ONE funded service
 *   key (config.sui.serviceKey) via a native Sui sponsored transaction (the owner signs the tx data,
 *   the service key signs the gas data, both signatures are submitted). This is custodial by design
 *   and disclosed in the UI. The non-custodial path (the user's own zkLogin session signs via a
 *   /prepare + /execute round-trip) remains the post-MVP upgrade (live-cutover §3).
 *
 *   The owner keypair is re-derivable from the identity address alone, so `addDelegateKey` /
 *   `removeDelegateKey` / `setAccountActive` receive `ownerAddress` and re-derive the same signer.
 *
 * The constructor THROWS when the service key (or master key) is missing so live.ts can fall back to
 * MockChain. Secrets (service key, derived owner keys, signatures) are never logged.
 */

import { scryptSync } from "node:crypto";
import { bcs } from "@mysten/sui/bcs";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiJsonRpcClient as SuiClient, type SuiObjectChange } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { toBase64, toHex } from "@mysten/sui/utils";
import { config } from "../../pkg/config";
import { BadRequestError } from "../../pkg/errors/error";
import type { ChainService } from "../ports";

/** The well-known Sui `Clock` shared object id (0x6). */
const CLOCK = "0x6";

interface ExecuteResult {
  error?: unknown;
  result?: {
    digest: string;
    effects?: { status?: { status?: string; error?: string } };
    objectChanges?: SuiObjectChange[];
  };
}

export class SuiChain implements ChainService {
  private readonly sui: SuiClient;
  /** Funded gas sponsor (pays for every managed on-chain op). */
  private readonly service: Ed25519Keypair;
  private readonly serviceAddress: string;
  /** Master secret used to derive per-user owner keypairs. */
  private readonly masterKey: string;
  private readonly pkg: string;
  private readonly registry: string;
  private readonly ownerCache = new Map<string, Ed25519Keypair>();

  constructor() {
    if (!config.sui.serviceKey) {
      throw new Error("SUI_SERVICE_KEY required for live on-chain account ops.");
    }
    if (!config.secretEncryptionKey) {
      throw new Error("SECRET_ENCRYPTION_KEY required to derive per-user on-chain owners.");
    }
    this.sui = new SuiClient({ url: config.sui.fullnode, network: config.network });
    this.service = Ed25519Keypair.fromSecretKey(config.sui.serviceKey);
    this.serviceAddress = this.service.toSuiAddress();
    this.masterKey = config.secretEncryptionKey;
    this.pkg = config.memwal.packageId;
    this.registry = config.memwal.registryId;
  }

  /** Deterministic per-user owner keypair (the on-chain account owner). Cached per identity address. */
  private ownerKeypair(ownerAddress: string): Ed25519Keypair {
    const cached = this.ownerCache.get(ownerAddress);
    if (cached) {
      return cached;
    }
    const seed = scryptSync(this.masterKey, `soul:owner:v1:${ownerAddress}`, 32);
    const kp = Ed25519Keypair.fromSecretKey(new Uint8Array(seed));
    this.ownerCache.set(ownerAddress, kp);
    return kp;
  }

  /**
   * Native sponsored execution: the derived owner is the sender, the funded service key is the gas
   * owner. Both sign the same transaction bytes. Returns the digest + object changes.
   */
  private async signAndExecute(
    tx: Transaction,
    owner: Ed25519Keypair
  ): Promise<{ digest: string; objectChanges: SuiObjectChange[] }> {
    tx.setSender(owner.toSuiAddress());
    tx.setGasOwner(this.serviceAddress);
    const bytes = await tx.build({ client: this.sui });
    const ownerSig = (await owner.signTransaction(bytes)).signature;
    const sponsorSig = (await this.service.signTransaction(bytes)).signature;
    const res = await fetch(config.sui.fullnode, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sui_executeTransactionBlock",
        params: [
          toBase64(bytes),
          [ownerSig, sponsorSig],
          { showEffects: true, showObjectChanges: true },
          "WaitForLocalExecution",
        ],
      }),
    });
    const json = (await res.json()) as ExecuteResult;
    if (json.error) {
      throw new Error(`executeTransactionBlock RPC error: ${JSON.stringify(json.error)}`);
    }
    const status = json.result?.effects?.status;
    if (status?.status !== "success") {
      throw new Error(`On-chain transaction failed: ${status?.error ?? JSON.stringify(status)}`);
    }
    return { digest: json.result?.digest ?? "", objectChanges: json.result?.objectChanges ?? [] };
  }

  async createAccount(ownerAddress: string): Promise<{ accountObjectId: string }> {
    const owner = this.ownerKeypair(ownerAddress);
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.pkg}::account::create_account`,
      arguments: [tx.object(this.registry), tx.object(CLOCK)],
    });
    const { digest, objectChanges } = await this.signAndExecute(tx, owner);
    const created = objectChanges.find(
      (c): c is Extract<SuiObjectChange, { type: "created" }> =>
        c.type === "created" && c.objectType.includes("::account::")
    );
    if (!created) {
      throw new Error(
        `create_account succeeded (digest ${digest}) but no ::account:: object was created in object changes.`
      );
    }
    return { accountObjectId: created.objectId };
  }

  async generateDelegateKey(): Promise<{
    privateKeyHex: string;
    publicKey: Uint8Array;
    address: string;
  }> {
    const kp = Ed25519Keypair.generate();
    // getSecretKey() returns Bech32 `suiprivkey...`; decode to the raw 32-byte seed and hex-encode it
    // (the MemWal SDK expects a raw private-key hex, not the Bech32 form).
    const { secretKey } = decodeSuiPrivateKey(kp.getSecretKey());
    return {
      privateKeyHex: toHex(secretKey),
      publicKey: kp.getPublicKey().toRawBytes(),
      address: kp.toSuiAddress(),
    };
  }

  async addDelegateKey(args: {
    accountObjectId: string;
    publicKey: Uint8Array;
    delegateAddress: string;
    label: string;
    ownerAddress: string;
  }): Promise<void> {
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.pkg}::account::add_delegate_key`,
      arguments: [
        tx.object(args.accountObjectId),
        tx.pure(bcs.vector(bcs.u8()).serialize(args.publicKey)),
        tx.pure.address(args.delegateAddress),
        tx.pure.string(args.label),
        tx.object(CLOCK),
      ],
    });
    await this.signAndExecute(tx, this.ownerKeypair(args.ownerAddress));
  }

  async removeDelegateKey(args: {
    accountObjectId: string;
    publicKey: Uint8Array;
    ownerAddress: string;
  }): Promise<void> {
    const tx = new Transaction();
    // remove_delegate_key(account, vector<u8>, &mut TxContext) — no Clock.
    tx.moveCall({
      target: `${this.pkg}::account::remove_delegate_key`,
      arguments: [
        tx.object(args.accountObjectId),
        tx.pure(bcs.vector(bcs.u8()).serialize(args.publicKey)),
      ],
    });
    await this.signAndExecute(tx, this.ownerKeypair(args.ownerAddress));
  }

  async setAccountActive(args: {
    accountObjectId: string;
    active: boolean;
    ownerAddress: string;
  }): Promise<void> {
    const target = args.active
      ? `${this.pkg}::account::reactivate_account`
      : `${this.pkg}::account::deactivate_account`;
    const tx = new Transaction();
    // (de|re)activate_account(account, &mut TxContext) — no Clock.
    tx.moveCall({ target, arguments: [tx.object(args.accountObjectId)] });
    await this.signAndExecute(tx, this.ownerKeypair(args.ownerAddress));
  }

  /**
   * Marketplace payment (managed-custodial): the buyer's derived owner keypair owns the SUI and
   * signs the transfer; the service key sponsors gas (same sponsored pattern as account mutations).
   * The payment coin is split from a buyer-owned SUI coin — NOT from the gas coin, which belongs
   * to the sponsor in a sponsored transaction.
   *
   * BOTH endpoints are resolved through the derived-owner mapping, keeping marketplace money
   * entirely inside the managed-custodial domain: a purchase lands in the seller's DERIVED
   * wallet, so a compensating refund (seller → buyer) can actually claw back the same funds.
   * Paying out from the derived wallet to the user's identity address is a separate,
   * user-initiated withdrawal step (post-MVP).
   */
  async transferSui(args: {
    fromAddress: string;
    toAddress: string;
    amountMist: string;
  }): Promise<{ digest: string }> {
    const owner = this.ownerKeypair(args.fromAddress);
    const ownerAddress = owner.toSuiAddress();
    const recipientAddress = this.ownerKeypair(args.toAddress).toSuiAddress();
    const amount = BigInt(args.amountMist);

    // Collect coins (paginated) until they cover the amount — a buyer whose SUI is split
    // across many small coins must not be rejected just because no single coin is big enough.
    const selected: string[] = [];
    let collected = 0n;
    let cursor: string | null | undefined;
    for (let page = 0; page < 10 && collected < amount; page++) {
      const coins = await this.sui.getCoins({
        owner: ownerAddress,
        coinType: "0x2::sui::SUI",
        cursor,
      });
      for (const c of coins.data) {
        selected.push(c.coinObjectId);
        collected += BigInt(c.balance);
        if (collected >= amount) {
          break;
        }
      }
      if (!coins.hasNextPage) {
        break;
      }
      cursor = coins.nextCursor;
    }
    if (collected < amount) {
      throw new BadRequestError(
        `Your Soul wallet (${ownerAddress}) holds ${collected} MIST but this purchase needs ${args.amountMist} MIST on ${config.network}; fund it before buying.`
      );
    }

    const [primary, ...rest] = selected;
    if (!primary) {
      throw new BadRequestError(
        `Your Soul wallet (${ownerAddress}) holds no SUI on ${config.network}; fund it before buying.`
      );
    }
    const tx = new Transaction();
    if (rest.length > 0) {
      tx.mergeCoins(
        tx.object(primary),
        rest.map((id) => tx.object(id))
      );
    }
    const [payment] = tx.splitCoins(tx.object(primary), [tx.pure.u64(amount)]);
    tx.transferObjects([payment], tx.pure.address(recipientAddress));
    const { digest } = await this.signAndExecute(tx, owner);
    return { digest };
  }

  explorerUrl(objectId: string): string {
    return `https://suiscan.xyz/${config.network}/object/${objectId}`;
  }
}
