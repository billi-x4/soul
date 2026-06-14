/*
 * Live AuthProvider — Enoki zkLogin (Google) server-side verification + stateless sessions.
 *
 * Flow (resolves live-cutover blocker #1):
 *   1. The web client signs in with Google via Enoki zkLogin and obtains the Google id_token (JWT).
 *   2. It POSTs the JWT to /api/auth/login. loginWithOAuth() calls EnokiClient.getZkLogin({ jwt }),
 *      which verifies the JWT and derives the user's Sui address. No private key ever touches Soul.
 *   3. issueSession() mints a stateless, HMAC-signed bearer token (address + expiry). verify() checks
 *      the HMAC (constant-time) and expiry. The "bearer -> verified address" contract is unchanged,
 *      so every existing route keeps working.
 *
 * The session secret is derived (scrypt) from SECRET_ENCRYPTION_KEY, the same master secret used for
 * at-rest key custody. Tokens are signed, not stored: no session table, horizontally scalable.
 */
import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { EnokiClient } from "@mysten/enoki";
import { config } from "../../pkg/config";
import type { AuthProvider } from "../ports";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEV_FALLBACK = "soul-dev-insecure-master-key-do-not-use-in-prod";

/** Thrown when Enoki rejects the sign-in JWT; carries the real Enoki reason for the client. */
export class EnokiVerifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnokiVerifyError";
  }
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export class EnokiAuth implements AuthProvider {
  private readonly enoki: EnokiClient;
  private readonly sessionKey: Buffer;

  constructor() {
    if (!config.enoki.secretKey) {
      throw new Error("ENOKI_SECRET_KEY is required for live Enoki auth.");
    }
    this.enoki = new EnokiClient({ apiKey: config.enoki.secretKey });
    // Fail closed: never sign sessions with the in-source dev key when live or in production.
    // Prefer the dedicated SESSION_SIGNING_KEY so sessions can be rotated (kill all tokens)
    // without re-keying at-rest custody / derived on-chain owners (which use the master key).
    const secret =
      config.sessionSigningKey ??
      config.secretEncryptionKey ??
      (config.isProd || config.live ? null : DEV_FALLBACK);
    if (!secret) {
      throw new Error(
        "SESSION_SIGNING_KEY or SECRET_ENCRYPTION_KEY is required for live session signing."
      );
    }
    this.sessionKey = scryptSync(secret, "soul:session:v1", 32);
  }

  private sign(payload: string): string {
    return b64url(createHmac("sha256", this.sessionKey).update(payload).digest());
  }

  async issueSession(suiAddress: string, epoch?: number): Promise<{ token: string }> {
    // `v` is the session epoch: bumping users.session_epoch (logout) invalidates the token.
    // Omitted for epoch-less sessions (dev), which opt out of revocation by design.
    const payload = b64url(
      Buffer.from(
        JSON.stringify({ a: suiAddress, e: Date.now() + SESSION_TTL_MS, ...(epoch !== undefined && { v: epoch }) })
      )
    );
    return { token: `soul-s.${payload}.${this.sign(payload)}` };
  }

  async verify(token: string | undefined): Promise<{ suiAddress: string; epoch?: number } | null> {
    if (!token?.startsWith("soul-s.")) {
      return null;
    }
    const [, payload, mac] = token.split(".");
    if (!(payload && mac)) {
      return null;
    }
    const expected = this.sign(payload);
    // Constant-time comparison; lengths must match for timingSafeEqual.
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return null;
    }
    try {
      const {
        a: suiAddress,
        e,
        v,
      } = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
        a: string;
        e: number;
        v?: number;
      };
      if (!suiAddress || typeof e !== "number" || Date.now() > e) {
        return null;
      }
      return { suiAddress, epoch: typeof v === "number" ? v : undefined };
    } catch {
      return null;
    }
  }

  async loginWithOAuth(jwt: string): Promise<{ suiAddress: string }> {
    try {
      const res = await this.enoki.getZkLogin({ jwt });
      if (!res?.address) {
        throw new Error("Enoki did not return a Sui address for this sign-in.");
      }
      return { suiAddress: res.address };
    } catch (e) {
      // EnokiClientError carries the real reason in .errors[].message / .code / .status — surface it.
      const err = e as { status?: number; code?: string; errors?: { message?: string }[] };
      const detail = err.errors?.[0]?.message ?? err.code ?? (e as Error).message;
      throw new EnokiVerifyError(
        `Enoki zkLogin verification failed (HTTP ${err.status ?? "?"}): ${detail}`
      );
    }
  }

  /**
   * Signed, real session for testing without a browser. Minting a session for an arbitrary
   * address is impersonation, so this is gated centrally: non-production AND (mock identity OR
   * an explicit SOUL_DEV_LOGIN opt-in for live testnet smoke runs). Epoch-less by design —
   * dev sessions opt out of logout-revocation.
   */
  async devSession(suiAddress?: string): Promise<{ token: string; suiAddress: string }> {
    if (!config.devLoginEnabled) {
      throw new Error("Dev sessions are disabled in this environment. Sign in with Google.");
    }
    const addr =
      suiAddress ?? `0x${scryptSync("soul-dev-user", "soul:devaddr", 32).toString("hex")}`;
    const { token } = await this.issueSession(addr);
    return { token, suiAddress: addr };
  }
}
