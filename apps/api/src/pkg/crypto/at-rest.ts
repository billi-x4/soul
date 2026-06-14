/*
 * At-rest encryption for the delegate-key secret (Constitution Principle IX).
 *
 * Delegate keys let the API call the relayer on a user's behalf; they MUST be encrypted at rest,
 * never logged, scoped per app, and dropped on revoke. This module is the only place that handles
 * the plaintext secret. AES-256-GCM with a per-record random IV; output = iv(12) | tag(16) | ct.
 *
 * The master key is derived (scrypt) from SECRET_ENCRYPTION_KEY. In dev (no key set) a fixed,
 * clearly-non-production key is used so the flow runs locally — NEVER rely on this in production.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { config } from "../config";

const IV_LEN = 12;
const TAG_LEN = 16;
const DEV_FALLBACK = "soul-dev-insecure-master-key-do-not-use-in-prod";

let cachedKey: Buffer | null = null;

function masterKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }
  // Fail closed: the dev fallback key is only acceptable in pure dev/mock mode. As soon as any live
  // adapter or production is in play, a real SECRET_ENCRYPTION_KEY is mandatory (the fallback is in
  // the source tree, so deriving from it against real data would make every at-rest secret readable).
  const secret = config.secretEncryptionKey ?? (config.isProd || config.live ? null : DEV_FALLBACK);
  if (!secret) {
    throw new Error(
      "SECRET_ENCRYPTION_KEY is required when running live or in production (delegate-key custody)."
    );
  }
  // Static salt is acceptable here: the secret is the entropy source, and we need a stable key.
  cachedKey = scryptSync(secret, "soul:at-rest:v1", 32);
  return cachedKey;
}

/** Encrypt plaintext (a delegate-key secret) → opaque buffer suitable for the `bytea` column. */
export function encryptSecret(plaintext: string | Buffer): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const data = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext;
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

/** Decrypt a buffer produced by {@link encryptSecret}. Returns the raw secret bytes. */
export function decryptSecret(blob: Buffer): Buffer {
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** Convenience: decrypt to a UTF-8 string (e.g. a hex delegate private key). */
export function decryptSecretString(blob: Buffer): string {
  return decryptSecret(blob).toString("utf8");
}
