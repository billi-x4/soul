#!/usr/bin/env bun
/*
 * Diagnose why POST /api/auth/login -> Enoki getZkLogin returns 400. Calls Enoki getApp() with the
 * server SECRET key (and the public keys) and reports the app's configured auth providers, client
 * IDs, allowed origins, and networks, then checks them against GOOGLE_CLIENT_ID. Prints no secrets.
 */
import { readFileSync } from "node:fs";
import { EnokiClient } from "@mysten/enoki";

function valFrom(file: string, name: string): string | undefined {
  try {
    const m = readFileSync(file, "utf8").match(new RegExp(`^\\s*${name}=(.+)$`, "m"));
    return m?.[1]?.trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

const apiEnv = `${import.meta.dir}/../.env.local`;
const webEnv = `${import.meta.dir}/../../web/.env.local`;

const secret = valFrom(apiEnv, "ENOKI_SECRET_KEY");
const apiPub = valFrom(apiEnv, "ENOKI_PUBLIC_KEY");
const webPub = valFrom(webEnv, "NEXT_PUBLIC_ENOKI_PUBLIC_KEY");
const apiGoogle = valFrom(apiEnv, "GOOGLE_CLIENT_ID");
const webGoogle = valFrom(webEnv, "NEXT_PUBLIC_GOOGLE_CLIENT_ID");

const tag = (k?: string) => (k ? `${k.slice(0, 14)}…(${k.length})` : "MISSING");
console.log("ENOKI_SECRET_KEY:        ", tag(secret));
console.log("ENOKI_PUBLIC_KEY (api):  ", tag(apiPub));
console.log("NEXT_PUBLIC_ENOKI (web): ", tag(webPub));
console.log("public keys api==web:    ", apiPub && webPub ? apiPub === webPub : "n/a");
console.log("GOOGLE_CLIENT_ID (api):  ", apiGoogle ?? "MISSING");
console.log("GOOGLE_CLIENT_ID api==web:", apiGoogle && webGoogle ? apiGoogle === webGoogle : "n/a");
console.log("");

for (const [label, key] of [
  ["secret", secret],
  ["public", apiPub],
] as const) {
  if (!key) {
    console.log(`[${label}] no key`);
    continue;
  }
  try {
    const app = await new EnokiClient({ apiKey: key }).getApp();
    console.log(`[${label}] getApp OK:`);
    console.log(JSON.stringify(app, null, 2));
    const providers = (app as any).authenticationProviders ?? (app as any).authProviders ?? [];
    const googleIds = providers
      .filter((p: any) => (p.providerType ?? p.provider) === "google")
      .map((p: any) => p.clientId);
    console.log(
      `   google client IDs on this app: ${googleIds.length ? googleIds.join(", ") : "(none)"}`
    );
    if (apiGoogle) {
      console.log(`   matches GOOGLE_CLIENT_ID?  ${googleIds.includes(apiGoogle)}`);
    }
  } catch (e: any) {
    console.log(`[${label}] getApp ERROR: ${e?.message}`);
    console.log("   detail:", JSON.stringify(e?.errors ?? e?.cause ?? e?.status ?? {}, null, 2));
  }
  console.log("");
}
