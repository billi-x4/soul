#!/usr/bin/env bun
/*
 * Generate a fresh Ed25519 Sui keypair for SUI_SERVICE_KEY or WALRUS_SIGNER_KEY and append it
 * (COMMENTED OUT) to apps/api/.env.local. Fund the printed address on testnet, then uncomment the
 * line and restart. Commented-by-default so generating a key never silently flips an unfunded
 * on-chain adapter live and breaks sign-in.
 *
 *   bun scripts/gen-service-key.ts SUI_SERVICE_KEY
 *   bun scripts/gen-service-key.ts WALRUS_SIGNER_KEY
 */
import { appendFileSync, readFileSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const varName = process.argv[2] ?? "SUI_SERVICE_KEY";
if (!["SUI_SERVICE_KEY", "WALRUS_SIGNER_KEY"].includes(varName)) {
  console.error("Usage: bun scripts/gen-service-key.ts [SUI_SERVICE_KEY|WALRUS_SIGNER_KEY]");
  process.exit(1);
}

const envPath = `${import.meta.dir}/../.env.local`;
const current = readFileSync(envPath, "utf8");
if (new RegExp(`^\\s*${varName}=\\S`, "m").test(current)) {
  console.error(
    `${varName} is already set (uncommented) in apps/api/.env.local. Remove it first to regenerate.`
  );
  process.exit(1);
}

const kp = Ed25519Keypair.generate();
const address = kp.toSuiAddress();
const needs = varName === "WALRUS_SIGNER_KEY" ? "testnet SUI + WAL" : "testnet SUI";
appendFileSync(
  envPath,
  `\n# ${varName}: fund ${address} (${needs}), then uncomment the line below and restart.\n# ${varName}=${kp.getSecretKey()}\n`
);

console.log(`Generated ${varName} and appended it (commented) to apps/api/.env.local.`);
console.log(`Fund this address on TESTNET, then uncomment: ${address}`);
