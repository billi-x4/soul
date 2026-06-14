"use client";

/*
 * Client-side Enoki zkLogin (Google). The user signs in with Google through Enoki, which returns a
 * verified id_token (JWT) and derives their Sui account — no seed phrase, no wallet, no gas. We hand
 * the JWT to the API (/api/auth/login), which verifies it server-side via Enoki and mints a session.
 *
 * EnokiFlow persists its zkLogin session in sessionStorage, so it is instantiated lazily on the
 * client only. (EnokiFlow is the simplest path for our JWT-exchange model; the dapp-kit
 * registerEnokiWallets provider tree is the heavier alternative for transaction signing.)
 */
import { EnokiFlow } from "@mysten/enoki";

type EnokiNetwork = "mainnet" | "testnet" | "devnet";

const NETWORK: EnokiNetwork =
  process.env.NEXT_PUBLIC_SUI_NETWORK === "mainnet" ? "mainnet" : "testnet";

let flow: EnokiFlow | null = null;

function getFlow(): EnokiFlow | null {
  if (typeof window === "undefined") {
    return null;
  }
  const apiKey = process.env.NEXT_PUBLIC_ENOKI_PUBLIC_KEY;
  if (!apiKey) {
    return null;
  }
  if (!flow) {
    flow = new EnokiFlow({ apiKey });
  }
  return flow;
}

/** True when the public Enoki + Google keys are configured, so live sign-in can be offered. */
export function enokiConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_ENOKI_PUBLIC_KEY && process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  );
}

/** Begin Google zkLogin: redirects the browser to Google's consent screen. */
export async function startGoogleSignIn(): Promise<void> {
  const f = getFlow();
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!(f && clientId)) {
    throw new Error("Enoki sign-in is not configured.");
  }
  const url = await f.createAuthorizationURL({
    provider: "google",
    clientId,
    redirectUrl: `${window.location.origin}/auth/callback`,
    network: NETWORK,
  });
  window.location.href = url;
}

/** Complete the callback: returns the verified Google id_token (JWT) to exchange with the API. */
export async function completeGoogleSignIn(): Promise<string> {
  const f = getFlow();
  if (!f) {
    throw new Error("Enoki sign-in is not configured.");
  }
  await f.handleAuthCallback();
  const session = await f.getSession();
  const jwt = session?.jwt;
  if (!jwt) {
    throw new Error("Sign-in did not complete. Please try again.");
  }
  return jwt;
}

export async function enokiLogout(): Promise<void> {
  await getFlow()
    ?.logout()
    .catch(() => {
      /* best effort */
    });
}
