/*
 * MCP delegate-key authentication. Resolves an incoming connection (Bearer delegate key +
 * x-memwal-account-id) to a namespace-scoped McpAuthContext.
 *
 * The bearer IS the delegate private key that was shown once at grant time. We never store it in
 * the clear: each connected app keeps the key encrypted at rest. To authenticate we look up the
 * account by its object id, then constant-time compare the presented key against each of that
 * account owner's ACTIVE app keys (<= 20). A frozen account or a revoked app fails closed.
 */
import { timingSafeEqual } from "node:crypto";
import { decryptSecretString } from "../pkg/crypto/at-rest";
import { services } from "../services/container";
import type { McpAuthContext } from "./tools";

export class McpAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpAuthError";
  }
}

export async function resolveMcpAuth(
  bearer: string | undefined,
  accountObjectId: string | undefined
): Promise<McpAuthContext> {
  if (!bearer) {
    throw new McpAuthError("Missing 'Authorization: Bearer <delegate key>' header.");
  }
  if (!accountObjectId) {
    throw new McpAuthError("Missing 'x-memwal-account-id' header.");
  }
  const account = await services.repo.getAccountByObjectId(accountObjectId);
  if (!account) {
    throw new McpAuthError("Unknown account id.");
  }
  if (!account.active) {
    throw new McpAuthError("This account is frozen; access is paused until it is unfrozen.");
  }

  const apps = await services.repo.listConnectedApps(account.userId);
  const presented = Buffer.from(bearer);
  for (const app of apps) {
    if (app.status !== "active" || app.delegateSecretEnc.length === 0) {
      continue;
    }
    let secret: string;
    try {
      secret = decryptSecretString(Buffer.from(app.delegateSecretEnc));
    } catch {
      continue;
    }
    const stored = Buffer.from(secret);
    if (stored.length === presented.length && timingSafeEqual(stored, presented)) {
      return {
        userId: account.userId,
        accountId: account.accountObjectId,
        delegateKeyHex: secret,
        allowedNamespaces: app.allowedNamespaces,
        appLabel: app.label,
      };
    }
  }
  throw new McpAuthError(
    "Delegate key not recognized for this account (it may have been revoked). Reconnect the tool to issue a new key."
  );
}
