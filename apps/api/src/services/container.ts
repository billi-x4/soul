/*
 * Dependency-injection container: selects MOCK (dev) vs LIVE (Sui Stack) adapters.
 *
 * `config.live` is true only when SOUL_LIVE=true AND the minimum live creds (DATABASE_URL +
 * ENOKI_SECRET_KEY) are present. In live mode the heavy Sui-Stack adapters and Postgres driver are
 * loaded via a dynamic import of ./live so they never load in dev/mock mode (and so tests/smoke run
 * with zero external services). Each live slot falls back to its mock independently (see ./live).
 * Routes depend on `services`, never on a concrete adapter.
 */
import { logger } from "@soul/logs";
import { config } from "../pkg/config";
import { MockAuth } from "./identity/mock-auth";
import { MockMemoryEngine } from "./memwal/mock-engine";
import type { AuthProvider, BlobStore, ChainService, MemoryEngine, SoulRepo } from "./ports";
import { InMemoryRepo } from "./repo/memory-repo";
import { MockChain } from "./sui/mock-chain";
import { MockBlobStore } from "./walrus/mock-blob";

export interface Services {
  repo: SoulRepo;
  memory: MemoryEngine;
  auth: AuthProvider;
  chain: ChainService;
  blobs: BlobStore;
  /** True when the identity + persistence core runs against the live Sui Stack (vs. dev mocks). */
  live: boolean;
  /** Per-adapter live/mock status — surfaced on /health so partial degradation is visible. */
  slots: { repo: boolean; auth: boolean; chain: boolean; memory: boolean; blobs: boolean };
}

function buildMockServices(): Services {
  return {
    repo: new InMemoryRepo(),
    memory: new MockMemoryEngine(),
    auth: new MockAuth(),
    chain: new MockChain(),
    blobs: new MockBlobStore(),
    live: false,
    slots: { repo: false, auth: false, chain: false, memory: false, blobs: false },
  };
}

async function buildServices(): Promise<Services> {
  if (config.live) {
    try {
      const { buildLiveServices } = await import("./live");
      return await buildLiveServices();
    } catch (e) {
      // Fail closed in production: never silently degrade to forgeable mock auth.
      if (config.isProd) {
        throw e;
      }
      logger.error(
        { message: (e as Error).message },
        "Live Sui-Stack adapters failed to initialize; falling back to mock adapters (dev only)."
      );
    }
  } else if (config.isProd) {
    throw new Error(
      "Refusing to start in production with mock adapters. Set SOUL_LIVE=true plus live credentials (DATABASE_URL, ENOKI_SECRET_KEY, SECRET_ENCRYPTION_KEY)."
    );
  }
  return buildMockServices();
}

export const services = await buildServices();
