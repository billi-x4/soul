import "./pkg/load";
import { logger as appLogger } from "@soul/logs";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { mcpHttpApp } from "./mcp/http";
import { config } from "./pkg/config";
import { accountRoutes } from "./routes/account";
import { authRoutes } from "./routes/auth";
import { ingestRoutes } from "./routes/ingest";
import { marketRoutes } from "./routes/market";
import { mcpRoutes } from "./routes/mcp";
import { memoryRoutes } from "./routes/memory";
import { permissionsRoutes } from "./routes/permissions";
import { profileRoutes } from "./routes/profile";
import { portabilityRoutes } from "./routes/restore";
import { vaultRoutes } from "./routes/vault";
import { services } from "./services/container";

const app = new Hono();

app.onError((err, c) => {
  appLogger.error(
    {
      message: err.message,
      cause: err.cause,
      name: err.name,
      stack: err.stack,
      path: c.req.path,
      method: c.req.method,
      url: c.req.url,
    },
    "API Error occurred"
  );

  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  return c.json(
    {
      success: false,
      message: process.env.NODE_ENV === "production" ? "Internal Server Error" : err.message,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    },
    500
  );
});

app.use(
  "*",
  cors({
    // Comma-separated WEB_ORIGIN supports the real deployment shape: a Walrus Sites portal
    // origin AND a Vercel preview origin at once. Never reflect arbitrary origins.
    origin: config.webOrigins,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  })
);

app.use("*", logger());
app.use("*", prettyJSON());

app.get("/health", async (c) => {
  const compat = await services.memory.compatibility();
  return c.json({
    status: "ok",
    live: services.live,
    // Per-adapter truth: a partially-degraded live deployment (e.g. mock chain) is visible
    // here instead of hiding behind the single `live` boolean.
    slots: services.slots,
    network: config.network,
    memwalVersionOk: compat.ok,
  });
});

// Soul API surface. Feature routes — auth (Enoki zkLogin sessions), ingestion,
// memory (MemWal), permissions (delegate keys), and mcp-config — are added here
// via spec-driven development. See docs/soul-architecture/SKILL.md.
const routes = app
  .basePath("/api")
  .get("/status", (c) => c.json({ name: "soul-api", status: "ok" }))
  .route("/auth", authRoutes)
  .route("/account", accountRoutes)
  .route("/profile", profileRoutes)
  .route("/ingest", ingestRoutes)
  .route("/memory", memoryRoutes)
  // Zero-plaintext vault: client-encrypted envelopes; the server can never read them.
  .route("/vault", vaultRoutes)
  .route("/permissions", permissionsRoutes)
  // Marketplace: sell/send scoped, revocable ACCESS (delegate keys) — never the memory bytes.
  .route("/market", marketRoutes)
  // Soul's own hosted MCP server (stateless JSON-RPC, delegate-key auth) lives at POST /api/mcp;
  // the session-authed connection-config helper lives at GET /api/mcp/config/:appId.
  .route("/mcp", mcpHttpApp)
  .route("/mcp", mcpRoutes)
  .route("/portability", portabilityRoutes);

export type AppType = typeof routes;

export default {
  port: config.port,
  fetch: app.fetch,
  idleTimeout: 30,
  // Socket-level body ceiling (Bun defaults to ~128 MB). Chunked bodies carry no Content-Length,
  // so per-route header guards can't see them — this bounds what any request may make us buffer.
  // 64 MB = the largest legitimate payload (50 MB social export archive) + headroom.
  maxRequestBodySize: 64 * 1024 * 1024,
};
