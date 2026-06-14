/*
 * Marketplace routes. What changes hands is ACCESS — a scoped, revocable delegate key on the
 * seller's account — never the memory bytes. Purchase keys are revealed ONCE in the buy response;
 * gift keys exactly once at claim time. GET /status discloses simulated-vs-real payments.
 */
import {
  isNamespace,
  MAX_LISTING_TITLE_CHARS,
  MAX_PRICE_MIST_DIGITS,
  type Namespace,
} from "@soul/shared";
import { Hono } from "hono";
import { config } from "../pkg/config";
import { BadRequestError } from "../pkg/errors/error";
import { getSession, requireSession } from "../pkg/middleware/session";
import { services } from "../services/container";
import {
  acquisitionConfigContext,
  browseListings,
  buyListing,
  cancelListing,
  claimAcquisition,
  createListing,
  listAcquisitions,
  listSales,
  myListings,
  sendSoul,
} from "../services/market-service";
import { buildMcpConfig } from "../services/mcp-config";

const PRICE_MIST_RE = /^[0-9]+$/;

const parseScope = (raw: unknown): Namespace[] => {
  // De-duplicate: a scope array like ["bio","bio"] must not render or store twice.
  const scope = [...new Set(Array.isArray(raw) ? raw.filter(isNamespace) : [])];
  if (scope.length === 0) {
    throw new BadRequestError("scope must include at least one valid area");
  }
  return scope;
};

const parseTitle = (raw: unknown, field: string): string => {
  const title = typeof raw === "string" ? raw.trim() : "";
  if (title.length > MAX_LISTING_TITLE_CHARS) {
    throw new BadRequestError(`${field} must be at most ${MAX_LISTING_TITLE_CHARS} characters`);
  }
  return title;
};

export const marketRoutes = new Hono()
  .use(requireSession)
  .get("/listings", async (c) => {
    const { userId } = getSession(c);
    return c.json({ listings: await browseListings(userId) });
  })
  .get("/listings/mine", async (c) => {
    const { userId } = getSession(c);
    return c.json({ listings: await myListings(userId) });
  })
  .post("/listings", async (c) => {
    const { userId } = getSession(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      title?: string;
      scope?: unknown;
      priceMist?: string;
    };
    const title = parseTitle(body.title, "title");
    if (!title) {
      throw new BadRequestError("A title is required");
    }
    const scope = parseScope(body.scope);
    if (!(typeof body.priceMist === "string" && PRICE_MIST_RE.test(body.priceMist))) {
      throw new BadRequestError("priceMist must be a whole number of MIST as a string");
    }
    // Digit cap keeps prices inside what Number/BigInt display math and real SUI supply allow —
    // a 400-digit price would otherwise render as "0 SUI" in confirmation UIs.
    if (body.priceMist.length > MAX_PRICE_MIST_DIGITS) {
      throw new BadRequestError("priceMist is implausibly large");
    }
    if (BigInt(body.priceMist) <= 0n) {
      throw new BadRequestError("priceMist must be greater than 0 (use /send for gifts)");
    }
    const listing = await createListing(userId, { title, scope, priceMist: body.priceMist });
    return c.json({ listing });
  })
  .delete("/listings/:id", async (c) => {
    const { userId } = getSession(c);
    const listing = await cancelListing(userId, c.req.param("id"));
    return c.json({ listing });
  })
  .post("/listings/:id/buy", async (c) => {
    const { userId } = getSession(c);
    const { acquisition, sellerAccountObjectId, delegatePrivateKeyHex } = await buyListing(
      userId,
      c.req.param("id")
    );
    // The delegate key is INSIDE mcp, shown once, never stored for purchases.
    return c.json({
      acquisition,
      mcp: buildMcpConfig(sellerAccountObjectId, delegatePrivateKeyHex),
    });
  })
  .post("/send", async (c) => {
    const { userId } = getSession(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      to?: string;
      scope?: unknown;
      title?: string;
    };
    if (!body.to?.trim()) {
      throw new BadRequestError("A recipient handle or address is required");
    }
    const scope = parseScope(body.scope);
    const title = parseTitle(body.title, "title") || undefined;
    // No secret in this response: the recipient claims the key once via /acquisitions/:id/claim.
    const acquisition = await sendSoul(userId, { to: body.to, scope, title });
    return c.json({ acquisition });
  })
  .get("/acquisitions", async (c) => {
    const { userId } = getSession(c);
    return c.json({ acquisitions: await listAcquisitions(userId) });
  })
  .post("/acquisitions/:id/claim", async (c) => {
    const { userId } = getSession(c);
    const { sellerAccountObjectId, delegatePrivateKeyHex } = await claimAcquisition(
      userId,
      c.req.param("id")
    );
    // One-time reveal: the stored secret was wiped the moment it was decrypted.
    return c.json({ mcp: buildMcpConfig(sellerAccountObjectId, delegatePrivateKeyHex) });
  })
  .get("/acquisitions/:id/config", async (c) => {
    const { userId } = getSession(c);
    const { sellerAccountObjectId } = await acquisitionConfigContext(userId, c.req.param("id"));
    return c.json({
      mcp: {
        ...buildMcpConfig(sellerAccountObjectId),
        note: "The delegate-key secret was revealed once at buy/claim time and is never retrievable again. Ask the seller/sender for fresh access if it was lost.",
      },
    });
  })
  .get("/sales", async (c) => {
    const { userId } = getSession(c);
    return c.json({ sales: await listSales(userId) });
  })
  // Honesty disclosure for the web: in dev mode payments are simulated by the mock chain.
  .get("/status", (c) => c.json({ live: services.live, network: config.network }));
