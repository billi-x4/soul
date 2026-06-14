/*
 * Thin typed fetch wrapper for the Soul API. Attaches the dev/live bearer token, JSON-encodes
 * bodies (passes FormData through for uploads), and surfaces server error messages.
 */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3004";
// A production bundle silently pointed at localhost is a misbuild (NEXT_PUBLIC_* is baked at
// build time) — make it loud in the console instead of failing with opaque network errors.
if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_API_URL) {
  // biome-ignore lint/suspicious/noConsole: deliberate misconfiguration warning
  console.warn("Soul: NEXT_PUBLIC_API_URL was not set at build time; using http://localhost:3004.");
}
export const TOKEN_KEY = "soul.token";

export function getStoredToken(): string | null {
  return typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null;
}
export function setStoredToken(token: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(TOKEN_KEY, token);
  }
}
export function clearStoredToken(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

export interface SoulFetchOpts {
  method?: string;
  body?: unknown;
  token?: string | null;
}

/** Error with the HTTP status attached, so callers can tell 401s from outages. */
export class SoulApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SoulApiError";
    this.status = status;
  }
}

export async function soulFetch<T>(path: string, opts: SoulFetchOpts = {}): Promise<T> {
  const token = opts.token ?? getStoredToken();
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text || res.statusText;
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: { message?: string } };
      msg = parsed.message ?? parsed.error?.message ?? msg;
    } catch {
      /* not JSON */
    }
    throw new SoulApiError(msg, res.status);
  }
  return (await res.json()) as T;
}
