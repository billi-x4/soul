/*
 * Live BlobStore adapter — raw Walrus blob read/write (@mysten/walrus 1.1.7 + @mysten/sui 2.17.0).
 *
 * This is the real "raw document" storage path: uploaded files (PDFs, exports) whose ciphertext or
 * bytes are written to Walrus directly, with the blob id mirrored into the Postgres `documents`
 * table (Source-of-Truth Matrix). MemWal-managed memory facts go through MemWalEngine instead; this
 * adapter is only for raw blobs that bypass the relayer.
 *
 * Client wiring: a single `SuiClient` (the concrete JSON-RPC client — exported as `SuiJsonRpcClient`
 * in @mysten/sui 2.17.0, aliased here to `SuiClient`) is extended with the Walrus client via
 * `.$extend(walrus(...))`, exposing `client.walrus.{readBlob,writeBlob}`. Writes route through the
 * Upload Relay (config.walrus.uploadRelay) to avoid the ~2200-reqs-per-blob direct-write cost
 * (CLAUDE.md §6 throughput); a tip (sendTip.max) pays the relay.
 *
 * Beta limitation (live-cutover blocker #4 — "Walrus write signer"): reads are free and need no
 * signer, but writes register + certify an on-chain Blob object and therefore require a FUNDED Sui
 * keypair holding WAL + SUI. That signer is supplied via WALRUS_SIGNER_KEY (Bech32 suiprivkey...).
 * When it is absent, `write()` throws — reads still work. The signer is never logged.
 */
import { SuiJsonRpcClient as SuiClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { walrus } from "@mysten/walrus";
import { config } from "../../pkg/config";
import type { BlobStore } from "../ports";

/** Max tip (in MIST) we authorize the Upload Relay to charge per blob write. */
const UPLOAD_RELAY_MAX_TIP = 1000;

/** The Sui client after the Walrus extension is attached (exposes `.walrus`). */
type WalrusExtendedClient = ReturnType<WalrusBlobStore["buildClient"]>;

export class WalrusBlobStore implements BlobStore {
  /**
   * Cached extended client, keyed by `${network}:${fullnode}`. The extended client is expensive to
   * construct (it loads the Walrus WASM + package config), so we build it once per process.
   */
  private readonly clients = new Map<string, WalrusExtendedClient>();

  /** Construct the Sui client and attach the Walrus extension (Upload Relay configured). */
  private buildClient() {
    const sui = new SuiClient({
      url: config.sui.fullnode,
      network: config.network,
    });
    return sui.$extend(
      walrus({
        uploadRelay: {
          host: config.walrus.uploadRelay,
          sendTip: { max: UPLOAD_RELAY_MAX_TIP },
        },
      })
    );
  }

  /** Get the cached extended client for the active network, building it on first use. */
  private client(): WalrusExtendedClient {
    const cacheKey = `${config.network}:${config.sui.fullnode}`;
    const cached = this.clients.get(cacheKey);
    if (cached) {
      return cached;
    }
    const created = this.buildClient();
    this.clients.set(cacheKey, created);
    return created;
  }

  /** Read a blob by id from Walrus. Free, no signer required. */
  async read(blobId: string): Promise<Uint8Array> {
    return await this.client().walrus.readBlob({ blobId });
  }

  /**
   * Write raw bytes to Walrus via the Upload Relay. Requires a funded signer (blocker #4):
   * WALRUS_SIGNER_KEY must be set, or this throws. The `opts.mime` hint is accepted for API
   * symmetry with the mock but is not persisted on the blob itself (mime lives in the
   * `documents` table row).
   */
  async write(bytes: Uint8Array, _opts?: { mime?: string }): Promise<{ blobId: string }> {
    if (!config.walrus.signerKey) {
      throw new Error("WALRUS_SIGNER_KEY required for raw blob writes (live-cutover blocker #4).");
    }
    // Bech32 `suiprivkey...` string is accepted directly by fromSecretKey.
    const signer = Ed25519Keypair.fromSecretKey(config.walrus.signerKey);
    // Blobs EXPIRE after this many epochs — production persistence must either set
    // WALRUS_WRITE_EPOCHS generously or run a periodic extension job before expiry.
    const { blobId } = await this.client().walrus.writeBlob({
      blob: bytes,
      deletable: false,
      epochs: config.walrus.writeEpochs,
      signer,
    });
    return { blobId };
  }
}
