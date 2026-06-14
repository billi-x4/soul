/*
 * Permissions routes (US4, FR-022..028). Grant returns the MCP config (delegate key shown once).
 */
import { isNamespace } from "@soul/shared";
import { Hono } from "hono";
import { toAuditEntry, toConnectedApp } from "../pkg/dto";
import { BadRequestError } from "../pkg/errors/error";
import { getSession, requireSession } from "../pkg/middleware/session";
import { getAccountOrThrow } from "../services/account-service";
import { services } from "../services/container";
import { buildMcpConfig } from "../services/mcp-config";
import { grantApp, revokeConnectedApp, setFreeze } from "../services/permissions-service";

/** Default + ceiling for the audit listing — the log grows forever, responses must not. */
const AUDIT_DEFAULT_LIMIT = 100;
const AUDIT_MAX_LIMIT = 500;

export const permissionsRoutes = new Hono()
  .use(requireSession)
  .post("/apps", async (c) => {
    const { userId } = getSession(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      label?: string;
      allowedNamespaces?: unknown;
    };
    if (!body.label?.trim()) {
      throw new BadRequestError("A label is required");
    }
    const allowed = [
      ...new Set(Array.isArray(body.allowedNamespaces) ? body.allowedNamespaces.filter(isNamespace) : []),
    ];
    if (allowed.length === 0) {
      throw new BadRequestError("allowedNamespaces must include at least one valid area");
    }
    const account = await getAccountOrThrow(userId);
    const { app, delegatePrivateKeyHex } = await grantApp({
      userId,
      account,
      label: body.label.trim(),
      allowedNamespaces: allowed,
    });
    // The delegate key INSIDE this config is shown exactly once, then never retrievable.
    return c.json({
      app: toConnectedApp(app),
      mcp: buildMcpConfig(account.accountObjectId, delegatePrivateKeyHex),
    });
  })
  .get("/apps", async (c) => {
    const { userId } = getSession(c);
    const apps = await services.repo.listConnectedApps(userId);
    return c.json({ apps: apps.map(toConnectedApp) });
  })
  .delete("/apps/:id", async (c) => {
    const { userId } = getSession(c);
    const account = await getAccountOrThrow(userId);
    await revokeConnectedApp(userId, account, c.req.param("id"));
    return c.json({ revoked: true });
  })
  .post("/freeze", async (c) => {
    const { userId } = getSession(c);
    const account = await getAccountOrThrow(userId);
    await setFreeze(userId, account, false);
    return c.json({ frozen: true });
  })
  .post("/unfreeze", async (c) => {
    const { userId } = getSession(c);
    const account = await getAccountOrThrow(userId);
    await setFreeze(userId, account, true);
    return c.json({ frozen: false });
  })
  .get("/audit", async (c) => {
    const { userId } = getSession(c);
    const limitRaw = c.req.query("limit");
    let limit = AUDIT_DEFAULT_LIMIT;
    if (limitRaw !== undefined) {
      const n = Number(limitRaw);
      if (!Number.isFinite(n) || n < 1) {
        throw new BadRequestError("limit must be a positive number");
      }
      limit = Math.min(Math.floor(n), AUDIT_MAX_LIMIT);
    }
    const entries = await services.repo.listAudit(userId, limit);
    return c.json({ entries: entries.map(toAuditEntry) });
  });
