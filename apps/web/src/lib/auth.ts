/*
 * Auth/session helpers.
 *
 * Dev mode: a mock session token from POST /api/auth/dev-login, stored in localStorage. The API
 * client reads it via getToken(). Live cutover replaces devSignIn() with the Enoki zkLogin flow;
 * the token contract (bearer → verified Sui address) is unchanged. See CLAUDE.md §7.
 */
import type { OnboardingAnswers } from "@soul/shared";
import { clearStoredToken, getStoredToken, setStoredToken, soulFetch } from "@/lib/api";
import { lockVault } from "@/lib/vault";

/** Used by the API client to attach the bearer token. */
export function getToken(): Promise<string | null> {
  return Promise.resolve(getStoredToken());
}

export interface DevLoginResult {
  token: string;
  suiAddress: string;
  userId: string;
  username?: string | null;
  account: { objectId: string; active: boolean };
}

export async function devSignIn(): Promise<DevLoginResult> {
  const result = await soulFetch<DevLoginResult>("/api/auth/dev-login", {
    method: "POST",
    body: {},
  });
  setStoredToken(result.token);
  return result;
}

/** Live sign-in: exchange a verified Enoki/Google JWT for a Soul session. */
export async function loginWithJwt(jwt: string): Promise<DevLoginResult> {
  const result = await soulFetch<DevLoginResult>("/api/auth/login", {
    method: "POST",
    body: { jwt },
  });
  setStoredToken(result.token);
  return result;
}

export function signOut(): void {
  // Server-side first (best-effort): bump the session epoch so EVERY outstanding token for this
  // user — including a stolen one — is invalidated, not just the copy in this browser.
  const token = getStoredToken();
  if (token) {
    soulFetch("/api/auth/logout", { method: "POST", token }).catch(() => {
      /* offline sign-out still clears local state */
    });
  }
  clearStoredToken();
  // The vault key is per-person, not per-machine: lock it whenever the session ends.
  lockVault();
  // Best-effort: also drop the Enoki zkLogin session (Google JWT in sessionStorage),
  // so "Sign out" on a shared machine can't silently mint a fresh Soul session.
  import("@/lib/enoki")
    .then((m) => m.enokiLogout())
    .catch(() => {
      /* enoki not configured — nothing to clear */
    });
}

export interface SessionInfo {
  userId: string;
  suiAddress: string;
  /** The Soul handle (without the `.soul` suffix); null until claimed. */
  username: string | null;
  provider?: string | null;
  /** True once the user has seen onboarding (completed or skipped). */
  onboarded?: boolean;
  account: { objectId: string; active: boolean } | null;
}

export async function fetchSession(): Promise<SessionInfo> {
  return soulFetch<SessionInfo>("/api/auth/session");
}

/** Render a handle for display: `name.soul`, or a shortened address fallback. */
export function soulHandle(session: Pick<SessionInfo, "username" | "suiAddress">): string {
  if (session.username) {
    return `${session.username}.soul`;
  }
  return `${session.suiAddress.slice(0, 6)}…${session.suiAddress.slice(-4)}`;
}

export async function checkUsername(
  username: string
): Promise<{ available: boolean; reason?: string; username: string }> {
  return soulFetch(`/api/profile/check?username=${encodeURIComponent(username)}`);
}

export async function claimUsername(
  username: string
): Promise<{ username: string; handle: string }> {
  return soulFetch("/api/profile/username", { method: "POST", body: { username } });
}

export interface ProfileInfo {
  username: string | null;
  handle: string | null;
  suiAddress: string;
  provider: string | null;
  createdAt: string | null;
  namespaces: string[];
  connectedCount: number;
  account: {
    objectId: string;
    ownerAddress: string;
    active: boolean;
    createdAt: string;
    explorerUrl: string;
  } | null;
}

export async function fetchProfile(): Promise<ProfileInfo> {
  return soulFetch<ProfileInfo>("/api/profile");
}

export interface ContextResult {
  answers: OnboardingAnswers;
  completed: boolean;
  exists: boolean;
  /** Walrus blob id holding the answers (the soul's on-chain storage). */
  blobId?: string | null;
  answeredCount?: number;
}

export async function fetchContext(): Promise<ContextResult> {
  return soulFetch<ContextResult>("/api/profile/context");
}

/** Save onboarding answers. `completed=false` records a skip (so the prompt won't re-show). */
export async function saveContext(
  answers: OnboardingAnswers,
  completed: boolean
): Promise<ContextResult> {
  return soulFetch<ContextResult>("/api/profile/context", {
    method: "PUT",
    body: { answers, completed },
  });
}
