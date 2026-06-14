/*
 * Inspector routes (US3, FR-017..021). Browse/search (recall), detail, edit (re-remember+delete),
 * delete (de-index). All scoped to the owner via the primary delegate key. Edit/delete consult
 * the engine's capabilities: the live managed relayer has NO delete primitive (blocker #2), so
 * those paths answer honestly instead of pretending.
 */
import { isNamespace, MAX_MEMORY_EDIT_CHARS, NAMESPACES, type Namespace } from "@soul/shared";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { BadRequestError, NotFoundError } from "../pkg/errors/error";
import { getSession, requireSession } from "../pkg/middleware/session";
import { getAccountOrThrow, primaryDelegateKeyHex } from "../services/account-service";
import { services } from "../services/container";

export const memoryRoutes = new Hono()
  .use(requireSession)
  .get("/", async (c) => {
    const { userId } = getSession(c);
    const account = await getAccountOrThrow(userId);
    const ns = c.req.query("namespace");
    if (ns && !isNamespace(ns)) {
      throw new BadRequestError("Invalid namespace");
    }
    const namespaces: Namespace[] = ns ? [ns as Namespace] : [...NAMESPACES];
    const limitRaw = c.req.query("limit");
    let limit = 20;
    if (limitRaw !== undefined) {
      const n = Number(limitRaw);
      if (!Number.isFinite(n) || n < 1) {
        throw new BadRequestError("limit must be a positive number");
      }
      limit = Math.min(Math.floor(n), 100);
    }
    const items = await services.memory.recall({
      delegateKeyHex: primaryDelegateKeyHex(account),
      accountId: account.accountObjectId,
      namespaces,
      query: c.req.query("query") ?? "",
      limit,
    });
    // `browse:false` = the live relayer cannot list without a query; the UI uses this to show
    // "type to search" instead of a misleading "your soul is empty".
    return c.json({ items, capabilities: services.memory.capabilities });
  })
  .get("/:id", async (c) => {
    const { userId } = getSession(c);
    const account = await getAccountOrThrow(userId);
    const item = await services.memory.get({
      delegateKeyHex: primaryDelegateKeyHex(account),
      accountId: account.accountObjectId,
      id: c.req.param("id"),
    });
    if (!item) {
      throw new NotFoundError("Item not found");
    }
    return c.json(item);
  })
  .patch("/:id", async (c) => {
    if (!services.memory.capabilities.delete) {
      // Editing = replace + de-index the old fact; without a delete primitive the old fact
      // would survive alongside the new one. Refuse honestly rather than silently duplicate.
      throw new HTTPException(501, {
        message:
          "Editing is not yet available in managed-relayer mode (no de-index primitive). Delete-and-re-add lands when the MemWal beta supports it.",
      });
    }
    const { userId } = getSession(c);
    const account = await getAccountOrThrow(userId);
    const key = primaryDelegateKeyHex(account);
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { content?: string };
    if (!body.content?.trim()) {
      throw new BadRequestError("content is required");
    }
    if (body.content.length > MAX_MEMORY_EDIT_CHARS) {
      throw new BadRequestError(`content must be at most ${MAX_MEMORY_EDIT_CHARS} characters`);
    }
    const existing = await services.memory.get({
      delegateKeyHex: key,
      accountId: account.accountObjectId,
      id,
    });
    if (!existing) {
      throw new NotFoundError("Item not found");
    }
    // Remember the replacement BEFORE removing the original: if the write fails the user still
    // has the old fact, instead of losing it to a half-completed edit.
    const { jobId } = await services.memory.remember({
      delegateKeyHex: key,
      accountId: account.accountObjectId,
      namespace: existing.namespace,
      text: body.content,
      source: existing.source,
    });
    await services.memory.remove({ delegateKeyHex: key, accountId: account.accountObjectId, id });
    return c.json({ jobId }, 202);
  })
  .delete("/:id", async (c) => {
    const { userId } = getSession(c);
    const account = await getAccountOrThrow(userId);
    if (!services.memory.capabilities.delete) {
      throw new HTTPException(501, {
        message:
          "De-indexing is not yet available in managed-relayer mode. Revoke delegate keys (or freeze the account) to cut off access; per-fact deletion lands when the MemWal beta supports it.",
      });
    }
    await services.memory.remove({
      delegateKeyHex: primaryDelegateKeyHex(account),
      accountId: account.accountObjectId,
      id: c.req.param("id"),
    });
    return c.json({
      deleted: true,
      note: "Removed from your soul's index; the underlying stored copy is immutable.",
    });
  });
