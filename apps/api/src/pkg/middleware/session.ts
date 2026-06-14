/*
 * Session middleware — the Enoki-session seam (Constitution Principle I; CLAUDE.md §7).
 *
 * Reads the bearer token, verifies it via the AuthProvider (mock in dev, Enoki zkLogin in live),
 * and resolves the Sui address → user. `requireAddress` only needs a valid token (used by
 * provisioning, before a user row exists); `requireSession` additionally requires an existing user.
 */
import type { Context, MiddlewareHandler } from "hono";
import { services } from "../../services/container";
import { UnauthorizedError } from "../errors/error";

declare module "hono" {
  interface ContextVariableMap {
    suiAddress?: string;
  }
}

function bearer(c: Context): string | undefined {
  const h = c.req.header("Authorization");
  return h?.startsWith("Bearer ") ? h.slice("Bearer ".length) : undefined;
}

/** Verify the token → set suiAddress. Does NOT require an existing user (used by /account/provision). */
export const requireAddress: MiddlewareHandler = async (c, next) => {
  const verified = await services.auth.verify(bearer(c));
  if (!verified) {
    throw new UnauthorizedError();
  }
  // Honor logout here too: when a user row already exists, an epoch-bearing token minted before
  // their last sign-out is dead on every endpoint, including provisioning.
  if (verified.epoch !== undefined) {
    const user = await services.repo.getUserBySuiAddress(verified.suiAddress);
    if (user && verified.epoch !== user.sessionEpoch) {
      throw new UnauthorizedError("Session was signed out. Sign in again.");
    }
  }
  c.set("suiAddress", verified.suiAddress);
  await next();
};

/** requireAddress + resolve the user id (the user must already exist). */
export const requireSession: MiddlewareHandler = async (c, next) => {
  const verified = await services.auth.verify(bearer(c));
  if (!verified) {
    throw new UnauthorizedError();
  }
  const user = await services.repo.getUserBySuiAddress(verified.suiAddress);
  if (!user) {
    throw new UnauthorizedError("Not provisioned; sign in first.");
  }
  // Epoch check = stateless revocation: tokens minted before the user's last logout carry an
  // older epoch and die here. Epoch-less tokens (dev sessions) opt out by design.
  if (verified.epoch !== undefined && verified.epoch !== user.sessionEpoch) {
    throw new UnauthorizedError("Session was signed out. Sign in again.");
  }
  c.set("suiAddress", verified.suiAddress);
  c.set("userId", user.id);
  await next();
};

export function getSession(c: Context): { userId: string; suiAddress: string } {
  return { userId: c.get("userId") as string, suiAddress: c.get("suiAddress") as string };
}
