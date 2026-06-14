/*
 * Auth routes (US1, FR-001..005).
 *
 * Dev-mode: POST /auth/dev-login mints a mock session + ensures the user/account (no Google/Enoki).
 * Live cutover replaces dev-login with the Enoki zkLogin nonce/callback pair; the session contract
 * (bearer token → verified Sui address) stays the same.
 */
import { createHash } from "node:crypto";
import { Hono } from "hono";
import { config } from "../pkg/config";
import { BadRequestError } from "../pkg/errors/error";
import { getSession, requireSession } from "../pkg/middleware/session";
import { ensureUserAndAccount } from "../services/account-service";
import { services } from "../services/container";

export const authRoutes = new Hono()
  .post("/dev-login", async (c) => {
    // Minting a session for any address is impersonation, so this is allowed only in
    // non-production with mock identity (or an explicit SOUL_DEV_LOGIN opt-in for testnet
    // smoke runs against live adapters). Production must sign in with Google via /auth/login.
    if (!config.devLoginEnabled) {
      throw new BadRequestError("Dev sign-in is disabled in this environment. Use Google sign-in.");
    }
    const body = (await c.req.json().catch(() => ({}))) as { suiAddress?: string; seed?: string };
    // Optional dev-only seed → a distinct deterministic mock address, so multi-user flows
    // (e.g. the marketplace) can mint a SECOND user without inventing addresses by hand.
    const requested =
      body.suiAddress ??
      (body.seed
        ? `0x${createHash("sha256").update(`soul-dev-user:${body.seed}`).digest("hex")}`
        : undefined);
    const { token, suiAddress } = await services.auth.devSession(requested);
    const { user, account } = await ensureUserAndAccount(suiAddress, "dev");
    return c.json({
      token,
      suiAddress,
      userId: user.id,
      username: user.username ?? null,
      account: { objectId: account.accountObjectId, active: account.active },
    });
  })
  // Live Enoki zkLogin: the web client signs in with Google, gets the id_token (JWT), and POSTs it
  // here. We verify it via Enoki (-> Sui address) and mint a server session. Same token contract as
  // dev-login. Only enabled when the Enoki adapter is active (loginWithOAuth/issueSession present).
  .post("/login", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { jwt?: string };
    if (!(services.auth.loginWithOAuth && services.auth.issueSession)) {
      throw new BadRequestError("OAuth sign-in is not enabled in this environment.");
    }
    if (!body.jwt) {
      throw new BadRequestError("jwt is required");
    }
    let suiAddress: string;
    try {
      ({ suiAddress } = await services.auth.loginWithOAuth(body.jwt));
    } catch (e) {
      // Surface the real Enoki reason to the client (and logs) as a clean 401, not a 500.
      return c.json({ success: false, message: (e as Error).message }, 401);
    }
    // Provision first so the token can embed the user's CURRENT session epoch — that is what
    // makes POST /auth/logout able to invalidate it later.
    const { user, account } = await ensureUserAndAccount(suiAddress, "google");
    const { token } = await services.auth.issueSession(suiAddress, user.sessionEpoch);
    return c.json({
      token,
      suiAddress,
      userId: user.id,
      username: user.username ?? null,
      account: { objectId: account.accountObjectId, active: account.active },
    });
  })
  .get("/session", requireSession, async (c) => {
    const { userId, suiAddress } = getSession(c);
    const [user, account, ctx] = await Promise.all([
      services.repo.getUserById(userId),
      services.repo.getAccountByUserId(userId),
      services.repo.getPersonalContext(userId),
    ]);
    return c.json({
      userId,
      suiAddress,
      username: user?.username ?? null,
      provider: user?.authProvider ?? null,
      // True once the user has seen onboarding (completed or skipped); gates the one-time prompt.
      onboarded: ctx != null,
      account: account ? { objectId: account.accountObjectId, active: account.active } : null,
    });
  })
  // Real server-side sign-out: bumping the session epoch invalidates EVERY outstanding token
  // for this user (they all embed the old epoch) — the revocation lever for stolen tokens.
  // Dev sessions are epoch-less and unaffected (dev-only by construction).
  .post("/logout", requireSession, async (c) => {
    const { userId } = getSession(c);
    await services.repo.bumpSessionEpoch(userId);
    return c.json({ ok: true });
  });
