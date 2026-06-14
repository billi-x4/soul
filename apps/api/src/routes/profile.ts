/*
 * Profile + Soul-username routes.
 *
 * The Soul handle (rendered `<username>.soul`) is each person's portable identity. It is claimed once
 * on first sign-in, unique, and shown across the app beside the wallet address. GET /profile returns
 * the full identity (handle, provider, wallet, on-chain account). POST /profile/username claims it.
 */
import { NAMESPACES, type OnboardingAnswers } from "@soul/shared";
import { Hono } from "hono";
import { BadRequestError, ConflictError } from "../pkg/errors/error";
import { getSession, requireSession } from "../pkg/middleware/session";
import { services } from "../services/container";
import { loadPersonalContext, savePersonalContext } from "../services/personal-context-service";

/** Per-answer / total ceilings: answers are written verbatim to a Walrus blob on every save. */
const MAX_ANSWER_CHARS = 8_000;
const MAX_ANSWERS_TOTAL_CHARS = 64_000;
const MAX_ANSWER_KEYS = 100;
const MAX_ANSWER_KEY_CHARS = 200;
const MAX_ANSWER_LIST_ITEMS = 100;

/**
 * Keep only well-formed answer values (string, or string[] for multi-selects) within size caps.
 * Anything else (numbers, nested objects, oversized payloads) is a 400 BEFORE any side effect —
 * unvalidated values used to reach countAnswered post-blob-write and 500 with an orphaned blob.
 */
function parseAnswers(raw: unknown): OnboardingAnswers {
  if (raw === undefined || raw === null) {
    return {};
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new BadRequestError("answers must be an object");
  }
  const entries = Object.entries(raw);
  if (entries.length > MAX_ANSWER_KEYS) {
    throw new BadRequestError(`answers may have at most ${MAX_ANSWER_KEYS} entries`);
  }
  const out: OnboardingAnswers = {};
  let total = 0;
  for (const [key, value] of entries) {
    if (key.length > MAX_ANSWER_KEY_CHARS) {
      throw new BadRequestError("answer keys are too long");
    }
    const ok =
      typeof value === "string" ||
      (Array.isArray(value) &&
        value.length <= MAX_ANSWER_LIST_ITEMS &&
        value.every((v) => typeof v === "string"));
    if (!ok) {
      throw new BadRequestError(`answer "${key}" must be a string or a short list of strings`);
    }
    const size = typeof value === "string" ? value.length : value.join("").length;
    if (size > MAX_ANSWER_CHARS) {
      throw new BadRequestError(`answer "${key}" is too long (max ${MAX_ANSWER_CHARS} characters)`);
    }
    // Keys count toward the blob budget too — the whole object is serialized to Walrus.
    total += key.length + size;
    out[key] = value;
  }
  if (total > MAX_ANSWERS_TOTAL_CHARS) {
    throw new BadRequestError("answers are too large overall");
  }
  return out;
}

/** 3–20 chars, lowercase alphanumeric, internal hyphens allowed, must start/end alphanumeric. */
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{1,18}[a-z0-9])$/;
const RESERVED = new Set([
  "admin",
  "root",
  "soul",
  "api",
  "www",
  "app",
  "support",
  "help",
  "about",
  "settings",
  "profile",
  "builder",
  "inspector",
  "permissions",
  "connect",
  "portability",
  "auth",
  "mcp",
  "login",
  "logout",
  "me",
  "you",
  "system",
  "null",
  "undefined",
]);

/** Normalize raw input: trim, lowercase, drop a trailing ".soul" the user may have typed. */
function normalize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\.soul$/, "");
}

function validate(username: string): string | null {
  if (!USERNAME_RE.test(username)) {
    return "Use 3–20 lowercase letters, numbers, or hyphens (must start and end with a letter or number).";
  }
  if (RESERVED.has(username)) {
    return "That handle is reserved. Please choose another.";
  }
  return null;
}

export const profileRoutes = new Hono()
  .use(requireSession)
  .get("/", async (c) => {
    const { userId, suiAddress } = getSession(c);
    const [user, account, connectedCount] = await Promise.all([
      services.repo.getUserById(userId),
      services.repo.getAccountByUserId(userId),
      services.repo.countActiveApps(userId),
    ]);
    return c.json({
      username: user?.username ?? null,
      handle: user?.username ? `${user.username}.soul` : null,
      suiAddress,
      provider: user?.authProvider ?? null,
      createdAt: user?.createdAt ?? null,
      namespaces: [...NAMESPACES],
      connectedCount,
      account: account
        ? {
            objectId: account.accountObjectId,
            ownerAddress: account.ownerAddress,
            active: account.active,
            createdAt: account.createdAt,
            explorerUrl: services.chain.explorerUrl(account.accountObjectId),
          }
        : null,
    });
  })
  // Live availability check for the claim UI.
  .get("/check", async (c) => {
    const raw = c.req.query("username") ?? "";
    const username = normalize(raw);
    const error = validate(username);
    if (error) {
      return c.json({ available: false, reason: error, username });
    }
    const existing = await services.repo.getUserByUsername(username);
    return c.json({
      available: !existing,
      reason: existing ? "That handle is already taken." : undefined,
      username,
    });
  })
  .post("/username", async (c) => {
    const { userId } = getSession(c);
    const body = (await c.req.json().catch(() => ({}))) as { username?: string };
    if (!body.username) {
      throw new BadRequestError("A username is required.");
    }
    const username = normalize(body.username);
    const error = validate(username);
    if (error) {
      throw new BadRequestError(error);
    }
    const user = await services.repo.getUserById(userId);
    if (user?.username) {
      // Handles are permanent: idempotent if unchanged, rejected if a change is attempted.
      if (user.username === username) {
        return c.json({ username, handle: `${username}.soul` });
      }
      throw new ConflictError("Your Soul handle is already set and cannot be changed.");
    }
    const taken = await services.repo.getUserByUsername(username);
    if (taken) {
      throw new ConflictError("That handle is already taken. Please choose another.");
    }
    try {
      await services.repo.setUsername(userId, username);
    } catch {
      // Two users racing for the same handle: the availability check above passed for both,
      // but the users.username UNIQUE constraint lets only one through — 409, not a raw 500.
      throw new ConflictError("That handle was just taken. Please choose another.");
    }
    return c.json({ username, handle: `${username}.soul` });
  })
  // Personal context — answers live on Walrus (read back here), metadata in Postgres, recall in MemWal.
  .get("/context", async (c) => {
    const { userId } = getSession(c);
    return c.json(await loadPersonalContext(userId));
  })
  .put("/context", async (c) => {
    const { userId } = getSession(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      answers?: unknown;
      completed?: boolean;
    };
    const answers = parseAnswers(body.answers);
    return c.json(await savePersonalContext(userId, answers, Boolean(body.completed)));
  });
