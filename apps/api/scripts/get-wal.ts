#!/usr/bin/env bun
/*
 * Swap testnet SUI -> WAL using the funded service key (SUI_SERVICE_KEY / WALRUS_SIGNER_KEY in
 * apps/api/.env.local). Calls the Walrus testnet wal_exchange::exchange_all_for_wal. Reads the key
 * straight from the env file so the secret never leaves the process.
 *
 *   bun scripts/get-wal.ts            # swap 1 SUI
 *   bun scripts/get-wal.ts 0.5        # swap 0.5 SUI
 */
import { readFileSync } from "node:fs";
import { SuiJsonRpcClient as SuiClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { toBase64 } from "@mysten/sui/utils";

const RPC = "https://fullnode.testnet.sui.io";
const PKG = "0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f";
const EXCHANGE = "0xf4d164ea2def5fe07dc573992a029e010dba09b1a8dcbc44c5c2e79567f39073";
const INIT_SHARED_VERSION = 400185624;
const WAL = "0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL";

const sui = Number(process.argv[2] ?? "1");
const AMOUNT = BigInt(Math.round(sui * 1e9)); // MIST

async function rpc(method: string, params: unknown[]): Promise<any> {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return r.json();
}

const env = readFileSync(`${import.meta.dir}/../.env.local`, "utf8");
const key = env.match(/^\s*(?:SUI_SERVICE_KEY|WALRUS_SIGNER_KEY)=(\S+)/m)?.[1];
if (!key) {
  console.error("No uncommented SUI_SERVICE_KEY / WALRUS_SIGNER_KEY found in apps/api/.env.local.");
  process.exit(1);
}
const kp = Ed25519Keypair.fromSecretKey(key);
const addr = kp.toSuiAddress();

const balRes = await rpc("suix_getBalance", [addr, "0x2::sui::SUI"]);
const suiBal = BigInt(balRes?.result?.totalBalance ?? "0");
console.log(`address: ${addr}`);
console.log(`SUI balance: ${Number(suiBal) / 1e9}`);
if (suiBal < AMOUNT + 60_000_000n) {
  console.error(
    `Not enough SUI to swap ${sui} (need ~${sui + 0.06} for swap + gas). Fund the address first.`
  );
  process.exit(1);
}

const client = new SuiClient({ url: RPC, network: "testnet" });
const tx = new Transaction();
tx.setSender(addr);
const suiCoin = tx.splitCoins(tx.gas, [AMOUNT])[0]!;
const walCoin = tx.moveCall({
  target: `${PKG}::wal_exchange::exchange_all_for_wal`,
  arguments: [
    tx.sharedObjectRef({
      objectId: EXCHANGE,
      mutable: true,
      initialSharedVersion: INIT_SHARED_VERSION,
    }),
    suiCoin,
  ],
})[0]!;
tx.transferObjects([walCoin], addr);

const bytes = await tx.build({ client });
const { signature } = await kp.signTransaction(bytes);
const exec = await rpc("sui_executeTransactionBlock", [
  toBase64(bytes),
  [signature],
  { showEffects: true, showBalanceChanges: true },
  "WaitForLocalExecution",
]);

const status = exec?.result?.effects?.status?.status;
console.log(`tx status: ${status}  digest: ${exec?.result?.digest}`);
if (status !== "success") {
  console.error("FAILED:", JSON.stringify(exec?.result?.effects?.status ?? exec?.error));
  process.exit(1);
}
const walRes = await rpc("suix_getBalance", [addr, WAL]);
console.log(`WAL balance now: ${Number(BigInt(walRes?.result?.totalBalance ?? "0")) / 1e9}`);
console.log(`explorer: https://suiscan.xyz/testnet/tx/${exec?.result?.digest}`);
