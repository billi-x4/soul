/*
 * Central, validated config for the Soul API.
 *
 * Network policy (Constitution VI v3.0.0): testnet-first build, mainnet at production cutover.
 * Contract IDs + relayer/Walrus endpoints below were verified on-chain + against live docs on
 * 2026-06-05 — RE-VERIFY before any deploy (beta caveat).
 *
 * `live` gates the ports-and-adapters layer: false → in-memory/mock adapters (runs with zero
 * external services); true → live Sui Stack adapters (requires real creds). See research.md.
 */
import { z } from "zod";

const Network = z.enum(["testnet", "mainnet"]);
export type Network = z.infer<typeof Network>;

/** Per-network constants (verified 2026-06-05; re-verify before deploy). */
export const NETWORKS = {
  testnet: {
    memwalPackageId: "0xcf6ad755a1cdff7217865c796778fabe5aa399cb0cf2eba986f4b582047229c6",
    memwalRegistryId: "0xe80f2feec1c139616a86c9f71210152e2a7ca552b20841f2e192f99f75864437",
    relayerUrl: "https://relayer-staging.memory.walrus.xyz",
    walrusUploadRelay: "https://upload-relay.testnet.walrus.space",
    walrusAggregator: "https://aggregator.walrus-testnet.walrus.space",
    suiFullnode: "https://fullnode.testnet.sui.io",
  },
  mainnet: {
    memwalPackageId: "0xcee7a6fd8de52ce645c38332bde23d4a30fd9426bc4681409733dd50958a24c6",
    memwalRegistryId: "0x0da982cefa26864ae834a8a0504b904233d49e20fcc17c373c8bed99c75a7edd",
    relayerUrl: "https://relayer.memory.walrus.xyz",
    walrusUploadRelay: "https://upload-relay.mainnet.walrus.space",
    walrusAggregator: "https://aggregator.walrus-mainnet.walrus.space",
    suiFullnode: "https://fullnode.mainnet.sui.io",
  },
} as const;

const boolish = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3004),
  DATABASE_URL: z.string().optional(),
  SUI_NETWORK: Network.default("testnet"),
  ENOKI_SECRET_KEY: z.string().optional(),
  ENOKI_PUBLIC_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  MEMWAL_RELAYER_URL: z.string().optional(),
  MEMWAL_ACCOUNT_REGISTRY: z.string().optional(),
  MEMWAL_PACKAGE_ID: z.string().optional(),
  /** Master key (hex/base64/any string) used to derive the at-rest delegate-key cipher. */
  SECRET_ENCRYPTION_KEY: z.string().optional(),
  /**
   * Dedicated session-signing secret. When set, session HMAC keys derive from it instead of
   * SECRET_ENCRYPTION_KEY, so sessions can be rotated (kill all tokens) WITHOUT re-keying
   * at-rest delegate-key custody and the derived on-chain owner keypairs.
   */
  SESSION_SIGNING_KEY: z.string().optional(),
  /**
   * Explicit opt-in for dev-login while live adapters are active (e.g. testnet smoke runs).
   * Without it, dev-login is refused whenever live identity is on — a deployed live API must
   * not mint sessions for arbitrary addresses.
   */
  SOUL_DEV_LOGIN: boolish,
  /** Storage duration (Walrus epochs) for raw blob writes; extend before expiry for persistence. */
  WALRUS_WRITE_EPOCHS: z.coerce.number().int().min(1).default(3),
  /** Funded Sui keypair (Bech32 suiprivkey...) that signs managed on-chain account ops. Optional:
   * when absent, the on-chain ChainService stays mock and the rest of the stack still runs. */
  SUI_SERVICE_KEY: z.string().optional(),
  /** Funded Walrus signer (Bech32 suiprivkey...) for RAW document blob writes. Optional. */
  WALRUS_SIGNER_KEY: z.string().optional(),
  /** false (default) = mock adapters; true = live Sui Stack (also requires real creds below). */
  SOUL_LIVE: boolish,
  /** Allowed browser origin(s) for CORS — comma-separated for multiple (Walrus portal + Vercel). */
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  /** Public origin of THIS API (for the MCP hosted URL handed to AI clients). */
  API_ORIGIN: z.string().optional(),
});

function build() {
  const env = EnvSchema.parse(process.env);
  const net = NETWORKS[env.SUI_NETWORK];
  // Live mode is only honored when the minimum live creds are actually present; otherwise we
  // transparently fall back to mock adapters so the app still runs.
  const live = env.SOUL_LIVE && Boolean(env.ENOKI_SECRET_KEY && env.DATABASE_URL);
  const isProd = env.NODE_ENV === "production";
  return {
    nodeEnv: env.NODE_ENV,
    isProd,
    port: env.PORT,
    webOrigins: env.WEB_ORIGIN.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    apiOrigin: env.API_ORIGIN ?? `http://localhost:${env.PORT}`,
    network: env.SUI_NETWORK,
    /** True only when SOUL_LIVE is set AND the required live credentials exist. */
    live,
    /**
     * Dev-login (mint a session for ANY address) is impersonation by definition. It is allowed
     * only in non-production AND only while identity is mock — unless SOUL_DEV_LOGIN explicitly
     * opts a live testnet deployment in (smoke tests). Production always refuses.
     */
    devLoginEnabled: !isProd && (!live || env.SOUL_DEV_LOGIN),
    databaseUrl: env.DATABASE_URL,
    enoki: {
      secretKey: env.ENOKI_SECRET_KEY,
      publicKey: env.ENOKI_PUBLIC_KEY,
      googleClientId: env.GOOGLE_CLIENT_ID,
    },
    memwal: {
      relayerUrl: env.MEMWAL_RELAYER_URL ?? net.relayerUrl,
      registryId: env.MEMWAL_ACCOUNT_REGISTRY ?? net.memwalRegistryId,
      packageId: env.MEMWAL_PACKAGE_ID ?? net.memwalPackageId,
    },
    walrus: {
      uploadRelay: net.walrusUploadRelay,
      aggregator: net.walrusAggregator,
      signerKey: env.WALRUS_SIGNER_KEY,
      writeEpochs: env.WALRUS_WRITE_EPOCHS,
    },
    sui: { fullnode: net.suiFullnode, serviceKey: env.SUI_SERVICE_KEY },
    secretEncryptionKey: env.SECRET_ENCRYPTION_KEY,
    sessionSigningKey: env.SESSION_SIGNING_KEY,
  };
}

export const config = build();
export type AppConfig = ReturnType<typeof build>;
