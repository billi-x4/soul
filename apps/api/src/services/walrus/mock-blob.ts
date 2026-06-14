/*
 * Mock BlobStore for dev-mode — content-addressed in-memory blobs. The live adapter writes to
 * Walrus via the Upload Relay and reads via the aggregator.
 */
import { createHash } from "node:crypto";
import type { BlobStore } from "../ports";

export class MockBlobStore implements BlobStore {
  private blobs = new Map<string, Uint8Array>();

  async write(bytes: Uint8Array): Promise<{ blobId: string }> {
    const blobId = `blob_${createHash("sha256").update(bytes).digest("hex").slice(0, 40)}`;
    this.blobs.set(blobId, bytes);
    return { blobId };
  }

  async read(blobId: string): Promise<Uint8Array> {
    const b = this.blobs.get(blobId);
    if (!b) {
      throw new Error(`blob not found: ${blobId}`);
    }
    return b;
  }
}
