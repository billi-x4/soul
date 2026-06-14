/*
 * Personal-context pipeline — the user's "soul", stored on the Sui stack.
 *
 *   save: structured answers JSON -> Walrus blob (durable, portable source of truth)
 *         -> Postgres mirrors only { walrusBlobId, answeredCount, completed } (metadata/index)
 *         -> compiled narrative -> MemWal `bio` (recallable memory; best-effort)
 *   load: read the Walrus blob via its id and reconstruct the answers (this is the portability proof
 *         in miniature — the soul is rebuilt from Walrus, not from Postgres).
 */
import { logger } from "@soul/logs";
import { compilePersonalContext, countAnswered, type OnboardingAnswers } from "@soul/shared";
import { decryptSecret, encryptSecret } from "../pkg/crypto/at-rest";
import { primaryDelegateKeyHex } from "./account-service";
import { services } from "./container";
import { ingest } from "./ingestion";

export interface LoadedContext {
  answers: OnboardingAnswers;
  completed: boolean;
  exists: boolean;
  blobId: string | null;
  answeredCount: number;
}

export async function loadPersonalContext(userId: string): Promise<LoadedContext> {
  const meta = await services.repo.getPersonalContext(userId);
  if (!meta) {
    return { answers: {}, completed: false, exists: false, blobId: null, answeredCount: 0 };
  }
  let answers: OnboardingAnswers = {};
  if (meta.walrusBlobId) {
    try {
      const bytes = await services.blobs.read(meta.walrusBlobId);
      const parsed = JSON.parse(decodeContextBlob(Buffer.from(bytes)));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        answers = parsed as OnboardingAnswers;
      }
    } catch (e) {
      logger.warn(
        { message: (e as Error).message, blobId: meta.walrusBlobId },
        "Failed to read personal-context blob from Walrus"
      );
    }
  }
  return {
    answers,
    completed: meta.completed,
    exists: true,
    blobId: meta.walrusBlobId,
    answeredCount: meta.answeredCount,
  };
}

/**
 * Read back a context blob. New blobs are AES-256-GCM (at-rest cipher); blobs written before the
 * encryption fix are plaintext JSON — fall back so existing souls keep loading.
 */
function decodeContextBlob(bytes: Buffer): string {
  try {
    return decryptSecret(bytes).toString("utf8");
  } catch {
    return bytes.toString("utf8");
  }
}

export async function savePersonalContext(
  userId: string,
  answers: OnboardingAnswers,
  completed: boolean
): Promise<LoadedContext> {
  // Derive the count BEFORE any side effect: if the answers are malformed this throws without
  // having minted an orphaned Walrus blob.
  const answeredCount = countAnswered(answers);
  // 1. The soul's durable form: the structured answers as a Walrus blob — ENCRYPTED, because
  //    Walrus blobs are public and discoverable (CLAUDE.md decision #4).
  const { blobId } = await services.blobs.write(encryptSecret(JSON.stringify(answers)), {
    mime: "application/octet-stream",
  });
  // 2. Postgres mirrors only the pointer + lightweight flags.
  const meta = await services.repo.upsertPersonalContext({
    userId,
    walrusBlobId: blobId,
    answeredCount,
    completed,
  });
  // 3. The recallable soul: weave the narrative into MemWal `bio` (best-effort) once completed.
  if (completed) {
    void ingestPersonalContext(userId, answers);
  }
  return { answers, completed: meta.completed, exists: true, blobId, answeredCount };
}

/** Compile + ingest the context into the user's `bio` namespace so it becomes recallable. */
async function ingestPersonalContext(userId: string, answers: OnboardingAnswers): Promise<void> {
  try {
    const text = compilePersonalContext(answers);
    if (!text.trim()) {
      return;
    }
    const account = await services.repo.getAccountByUserId(userId);
    if (!account?.primaryDelegateSecretEnc) {
      return;
    }
    await ingest({
      userId,
      account,
      delegateKeyHex: primaryDelegateKeyHex(account),
      namespace: "bio",
      sourceType: "paste",
      text,
      sourceLabel: "onboarding",
    });
  } catch (e) {
    logger.warn(
      { message: (e as Error).message },
      "Personal-context bio ingest failed (non-fatal)"
    );
  }
}
