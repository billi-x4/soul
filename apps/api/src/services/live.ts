/*
 * Live Sui-Stack service assembly. Loaded ONLY via dynamic import from container.ts when
 * config.live is true, so the beta SDKs and Postgres driver never load in dev/mock mode.
 *
 * Each slot is selected independently with graceful fallback: if a live adapter cannot initialize
 * (missing signer key, init error), that slot falls back to its mock and the app keeps running.
 * This is honest "real where possible":
 *   - repo  -> DrizzleRepo        when DATABASE_URL is present (always, in live mode).
 *   - auth  -> EnokiAuth          when ENOKI_SECRET_KEY is present (Google/zkLogin verify).
 *   - chain -> SuiChain           when SUI_SERVICE_KEY is present (managed gas-sponsored on-chain ops).
 *   - memory-> MemWalEngine       only when chain is live (it needs real on-chain account ids).
 *   - blobs -> WalrusBlobStore    when WALRUS_SIGNER_KEY is present (reads are always real; writes need a signer).
 */
import { logger } from "@soul/logs";
import { config } from "../pkg/config";
import type { Services } from "./container";
import { EnokiAuth } from "./identity/enoki-auth";
import { MockAuth } from "./identity/mock-auth";
import { MemWalEngine } from "./memwal/memwal-engine";
import { MockMemoryEngine } from "./memwal/mock-engine";
import type { AuthProvider, BlobStore, ChainService, MemoryEngine, SoulRepo } from "./ports";
import { DrizzleRepo } from "./repo/drizzle-repo";
import { InMemoryRepo } from "./repo/memory-repo";
import { MockChain } from "./sui/mock-chain";
import { SuiChain } from "./sui/sui-chain";
import { MockBlobStore } from "./walrus/mock-blob";
import { WalrusBlobStore } from "./walrus/walrus-blob";

interface Slot<T> {
  value: T;
  live: boolean;
}

function slot<T>(name: string, makeLive: () => T, makeMock: () => T): Slot<T> {
  try {
    const value = makeLive();
    logger.info(`[live] ${name}: live adapter active`);
    return { value, live: true };
  } catch (e) {
    logger.warn(`[live] ${name}: unavailable (${(e as Error).message}) — using mock`);
    return { value: makeMock(), live: false };
  }
}

export async function buildLiveServices(): Promise<Services> {
  const repo = slot<SoulRepo>(
    "repo",
    () => new DrizzleRepo(),
    () => new InMemoryRepo()
  );
  const auth = slot<AuthProvider>(
    "auth",
    () => new EnokiAuth(),
    () => new MockAuth()
  );
  const chain = slot<ChainService>(
    "chain",
    () => {
      if (!config.sui.serviceKey) {
        throw new Error("SUI_SERVICE_KEY not set");
      }
      return new SuiChain();
    },
    () => new MockChain()
  );
  const memory = slot<MemoryEngine>(
    "memory",
    () => {
      // MemWal needs real on-chain account ids; only go live when the chain is live.
      if (!chain.live) {
        throw new Error("chain is mock; live memory needs real on-chain accounts");
      }
      return new MemWalEngine();
    },
    () => new MockMemoryEngine()
  );
  const blobs = slot<BlobStore>(
    "blobs",
    // No signer gate here: Walrus READS are free and signerless, and existing users' blobs must
    // stay readable. Without WALRUS_SIGNER_KEY, write() itself throws an honest error — far
    // better than silently writing to an in-memory mock whose blob ids then get persisted in
    // Postgres as permanently dangling pointers.
    () => new WalrusBlobStore(),
    () => new MockBlobStore()
  );

  // Fail closed: in production the identity + persistence core MUST be live. Mock auth accepts any
  // "soul-dev.<address>" token (impersonation), and the in-memory repo is non-durable — neither is
  // acceptable for real users. On testnet/dev, partial-live with mock fallback is allowed.
  if (config.isProd && (!auth.live || !repo.live)) {
    throw new Error(
      "Production requires the live auth (Enoki) and repo (Postgres) adapters; refusing to run with mock identity/persistence."
    );
  }
  // In ANY environment, forgeable mock auth must never front a real Postgres full of user data —
  // a staging box that forgot SECRET_ENCRYPTION_KEY would otherwise be an impersonation hole.
  if (repo.live && !auth.live) {
    throw new Error(
      "Live repo (Postgres) with mock auth is an impersonation hole; fix the Enoki/session credentials or unset DATABASE_URL."
    );
  }

  const liveCount = [repo, auth, chain, memory, blobs].filter((s) => s.live).length;
  logger.info(
    `[live] ${liveCount}/5 adapters live (repo=${repo.live} auth=${auth.live} chain=${chain.live} memory=${memory.live} blobs=${blobs.live})`
  );

  return {
    repo: repo.value,
    auth: auth.value,
    chain: chain.value,
    memory: memory.value,
    blobs: blobs.value,
    // "live" = the identity + persistence core is real (the parts that change user-visible behavior).
    live: repo.live && auth.live,
    slots: {
      repo: repo.live,
      auth: auth.live,
      chain: chain.live,
      memory: memory.live,
      blobs: blobs.live,
    },
  };
}
