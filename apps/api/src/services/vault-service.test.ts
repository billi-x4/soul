/*
 * Zero-plaintext vault tests — run against the dev-mode container (mock adapters, in-memory
 * repo). Two properties matter above all and are asserted directly:
 *   1. ZERO PLAINTEXT: what the server stores (the blob in the BlobStore) never contains the
 *      user's content — only the AES-256-GCM envelope sealed "in the browser".
 *   2. PORTABILITY: the stored blob is EXACTLY the envelope JSON, so the owner can fetch it from
 *      any Walrus aggregator and decrypt it with the passphrase alone, without Soul.
 * The crypto helpers themselves (PBKDF2 + AES-GCM via WebCrypto) are exercised end-to-end the
 * way the web app uses them — Node ≥19 ships the same globalThis.crypto as the browser.
 */
import { createHash } from "node:crypto";
import {
  createVaultParams,
  decryptPayload,
  encryptPayload,
  envelopeJson,
  unlockVaultKey,
  type VaultEnvelope,
} from "@soul/shared";
import { describe, expect, it } from "vitest";
import { ensureUserAndAccount } from "./account-service";
import { services } from "./container";
import type { UserRecord } from "./ports";
import {
  addVaultItem,
  getVaultItemDetail,
  removeVaultItem,
  setupVault,
  vaultStatus,
  verifyVault,
} from "./vault-service";

let seq = 0;
async function makeUser(): Promise<UserRecord> {
  seq += 1;
  const addr = `0x${createHash("sha256").update(`vault-test-${seq}`).digest("hex")}`;
  const { user } = await ensureUserAndAccount(addr, "dev");
  return user;
}

/** The full client-side ritual, exactly as the web app performs it. */
async function clientSetup(passphrase = "correct horse battery staple") {
  const { params, key } = await createVaultParams(passphrase);
  return { params, key, passphrase };
}

describe("vault crypto (the browser-side ritual)", () => {
  it("round-trips a payload and rejects the wrong passphrase", async () => {
    const { params, key, passphrase } = await clientSetup();
    const envelope = await encryptPayload(key, { kind: "text", text: "my secret memory" });

    // The right passphrase re-derives a key that opens both the check value and the envelope.
    const unlocked = await unlockVaultKey(passphrase, params);
    expect(unlocked).not.toBeNull();
    const payload = await decryptPayload(unlocked as CryptoKey, envelope);
    expect(payload.text).toBe("my secret memory");

    // A wrong passphrase fails the key-check — it never gets near an envelope.
    expect(await unlockVaultKey("wrong passphrase", params)).toBeNull();
  });

  it("envelopes never contain the plaintext", async () => {
    const { key } = await clientSetup();
    const envelope = await encryptPayload(key, { kind: "text", text: "find-me-if-you-can" });
    expect(envelopeJson(envelope)).not.toContain("find-me-if-you-can");
  });
});

describe("vault-service", () => {
  it("sets up once; a second setup is refused (re-keying would orphan envelopes)", async () => {
    const user = await makeUser();
    const { params } = await clientSetup();
    expect((await vaultStatus(user.id)).configured).toBe(false);
    await setupVault(user.id, params);
    const status = await vaultStatus(user.id);
    expect(status.configured).toBe(true);
    expect(status.params?.saltB64).toBe(params.saltB64);
    await expect(setupVault(user.id, params)).rejects.toMatchObject({ status: 409 });
  });

  it("refuses items before setup and rejects malformed envelopes", async () => {
    const user = await makeUser();
    const bad = { v: 1, scheme: "aes-256-gcm", ivB64: "x", ctB64: "y" };
    await expect(
      addVaultItem({
        userId: user.id,
        namespace: "bio",
        label: "n",
        kind: "text",
        sizeBytes: 1,
        envelope: bad,
      })
    ).rejects.toMatchObject({ status: 409 }); // no vault yet

    const { params, key } = await clientSetup();
    await setupVault(user.id, params);
    await expect(
      addVaultItem({
        userId: user.id,
        namespace: "bio",
        label: "n",
        kind: "text",
        sizeBytes: 1,
        envelope: bad, // iv is not 12 bytes of base64
      })
    ).rejects.toMatchObject({ status: 400 });

    const envelope = await encryptPayload(key, { kind: "text", text: "ok" });
    await expect(
      addVaultItem({
        userId: user.id,
        namespace: "bio",
        label: "",
        kind: "text",
        sizeBytes: 2,
        envelope,
      })
    ).rejects.toMatchObject({ status: 400 }); // label required
  });

  it("stores the envelope RAW (portable), lists, decrypts end-to-end, verifies, deletes", async () => {
    const user = await makeUser();
    const { params, key, passphrase } = await clientSetup();
    await setupVault(user.id, params);

    const secret = "the relayer must never see this";
    const envelope = await encryptPayload(key, { kind: "text", text: secret });
    const item = await addVaultItem({
      userId: user.id,
      namespace: "docs",
      label: "test note",
      kind: "text",
      sizeBytes: secret.length,
      envelope,
    });

    // ZERO PLAINTEXT + PORTABILITY: the stored blob is exactly the envelope JSON — nothing else,
    // nothing wrapped, nothing readable.
    const blob = await services.blobs.read(item.walrusBlobId);
    const stored = new TextDecoder().decode(blob);
    expect(stored).toBe(envelopeJson(envelope));
    expect(stored).not.toContain(secret);

    // A fresh "device": re-derive from passphrase + server-held params, decrypt the detail.
    const status = await vaultStatus(user.id);
    const rederived = await unlockVaultKey(passphrase, status.params as NonNullable<typeof status.params>);
    const detail = await getVaultItemDetail(user.id, item.id);
    const payload = await decryptPayload(rederived as CryptoKey, detail.envelope as VaultEnvelope);
    expect(payload.text).toBe(secret);

    // Portability proof: every envelope re-read + hash-checked.
    const proof = await verifyVault(user.id);
    expect(proof).toMatchObject({ intact: true, verified: 1, total: 1 });

    // The ingest audit records the add without any content beyond the label.
    const audit = await services.repo.listAudit(user.id);
    const entry = audit.find((a) => a.metadata?.zeroPlaintext === true);
    expect(entry?.action).toBe("ingest");

    // Delete is REAL here (the index is ours, not the relayer's).
    await removeVaultItem(user.id, item.id);
    expect((await services.repo.listVaultItems(user.id)).length).toBe(0);
    await expect(getVaultItemDetail(user.id, item.id)).rejects.toMatchObject({ status: 404 });
  });

  it("scopes items to their owner", async () => {
    const alice = await makeUser();
    const mallory = await makeUser();
    const { params, key } = await clientSetup();
    await setupVault(alice.id, params);
    const envelope = await encryptPayload(key, { kind: "text", text: "alice only" });
    const item = await addVaultItem({
      userId: alice.id,
      namespace: "bio",
      label: "alice note",
      kind: "text",
      sizeBytes: 10,
      envelope,
    });
    await expect(getVaultItemDetail(mallory.id, item.id)).rejects.toMatchObject({ status: 404 });
    await expect(removeVaultItem(mallory.id, item.id)).rejects.toMatchObject({ status: 404 });
    expect((await services.repo.listVaultItems(alice.id)).length).toBe(1);
  });
});
