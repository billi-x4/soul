/*
 * Ingestion routes (US2, FR-007..015). Each returns 202 + a job to poll (eventual consistency).
 * Empty input rejected; documents deduped by content hash and capped at 10MB; own-data only.
 */
import { createHash } from "node:crypto";
import { isNamespace, MAX_INGEST_TEXT_CHARS } from "@soul/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import { toIngestionJob } from "../pkg/dto";
import { BadRequestError, NotFoundError } from "../pkg/errors/error";
import { getSession, requireSession } from "../pkg/middleware/session";
import { getAccountOrThrow, primaryDelegateKeyHex } from "../services/account-service";
import { services } from "../services/container";
import { ingest, storeDocument } from "../services/ingestion";
import { importGithub } from "../services/ingestion/github";
import { extractDocument } from "../services/ingestion/parsers";
import { importSocialArchive } from "../services/ingestion/social";

const MAX_DOC_BYTES = 10 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
/** GitHub usernames: 1-39 alphanumeric/hyphen chars — anything else never reaches Octokit. */
const GITHUB_USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/;

/**
 * Reject oversized uploads from the Content-Length header BEFORE buffering the body —
 * parseBody() reads the whole request into memory, so the post-hoc size check alone lets a
 * client make the server allocate arbitrarily large buffers. The header can be absent
 * (chunked encoding), so the post-buffer check stays as the second line of defense.
 */
function rejectOversizedBody(c: Context, maxBytes: number, label: string): void {
  const len = Number(c.req.header("content-length"));
  if (Number.isFinite(len) && len > maxBytes + 1024 * 1024) {
    throw new BadRequestError(label);
  }
}

export const ingestRoutes = new Hono()
  .use(requireSession)
  .post("/text", async (c) => {
    const { userId } = getSession(c);
    const body = (await c.req.json().catch(() => ({}))) as { namespace?: string; text?: string };
    if (!isNamespace(body.namespace)) {
      throw new BadRequestError("Invalid or missing namespace");
    }
    if (!body.text?.trim()) {
      throw new BadRequestError("Text is required");
    }
    // Bounded: the relayer charges by analyze chunks (~10 pts each, ~60 pts/min budget), so an
    // unbounded paste would also be a self-inflicted rate-limit DoS.
    if (body.text.length > MAX_INGEST_TEXT_CHARS) {
      throw new BadRequestError(
        `Text is too long (max ${MAX_INGEST_TEXT_CHARS.toLocaleString()} characters). Upload it as a document instead.`
      );
    }
    const account = await getAccountOrThrow(userId);
    const job = await ingest({
      userId,
      account,
      delegateKeyHex: primaryDelegateKeyHex(account),
      namespace: body.namespace,
      sourceType: "paste",
      text: body.text,
      sourceLabel: "Pasted text",
    });
    return c.json(toIngestionJob(job), 202);
  })
  .post("/document", async (c) => {
    const { userId } = getSession(c);
    rejectOversizedBody(c, MAX_DOC_BYTES, "Document exceeds the 10MB limit");
    const form = await c.req.parseBody();
    const file = form.file;
    const namespace = form.namespace;
    if (!(file instanceof File)) {
      throw new BadRequestError("A file is required");
    }
    if (!isNamespace(namespace)) {
      throw new BadRequestError("Invalid or missing namespace");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > MAX_DOC_BYTES) {
      throw new BadRequestError("Document exceeds the 10MB limit");
    }
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const text = await extractDocument(file.name, file.type, bytes);
    if (!text.trim()) {
      throw new BadRequestError("Unsupported or empty document");
    }
    const account = await getAccountOrThrow(userId);
    await storeDocument({
      userId,
      namespace,
      filename: file.name,
      mime: file.type || "application/octet-stream",
      bytes,
      contentHash,
    });
    const job = await ingest({
      userId,
      account,
      delegateKeyHex: primaryDelegateKeyHex(account),
      namespace,
      sourceType: "document",
      text,
      sourceLabel: file.name,
    });
    return c.json(toIngestionJob(job), 202);
  })
  .post("/github", async (c) => {
    const { userId } = getSession(c);
    const body = (await c.req.json().catch(() => ({}))) as { username?: string };
    const username = body.username?.trim();
    if (!username) {
      throw new BadRequestError("A GitHub username is required");
    }
    if (!GITHUB_USERNAME_RE.test(username)) {
      throw new BadRequestError("That doesn't look like a GitHub username");
    }
    const account = await getAccountOrThrow(userId);
    const text = await importGithub(username);
    // GitHub is a social source: its facts live in the `social` namespace.
    const job = await ingest({
      userId,
      account,
      delegateKeyHex: primaryDelegateKeyHex(account),
      namespace: "social",
      sourceType: "github",
      text,
      sourceLabel: `github:${username}`,
    });
    return c.json(toIngestionJob(job), 202);
  })
  .post("/social", async (c) => {
    const { userId } = getSession(c);
    rejectOversizedBody(c, MAX_ARCHIVE_BYTES, "Export archive exceeds the 50MB limit");
    const form = await c.req.parseBody();
    const file = form.archive;
    const platform = form.platform;
    if (!(file instanceof File)) {
      throw new BadRequestError("An export archive is required");
    }
    if (platform !== "x" && platform !== "linkedin") {
      throw new BadRequestError("platform must be 'x' or 'linkedin'");
    }
    if (file.size > MAX_ARCHIVE_BYTES) {
      throw new BadRequestError("Export archive exceeds the 50MB limit");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const account = await getAccountOrThrow(userId);
    const text = await importSocialArchive(platform, bytes);
    const job = await ingest({
      userId,
      account,
      delegateKeyHex: primaryDelegateKeyHex(account),
      namespace: "social",
      sourceType: "social",
      text,
      sourceLabel: `${platform} export`,
    });
    return c.json(toIngestionJob(job), 202);
  })
  .get("/jobs", async (c) => {
    const { userId } = getSession(c);
    const jobs = await services.repo.listJobs(userId);
    return c.json({ jobs: jobs.map(toIngestionJob) });
  })
  .get("/jobs/:id", async (c) => {
    const { userId } = getSession(c);
    const job = await services.repo.getJob(userId, c.req.param("id"));
    if (!job) {
      throw new NotFoundError("Job not found");
    }
    return c.json(toIngestionJob(job));
  });
