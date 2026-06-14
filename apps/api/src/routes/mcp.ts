/*
 * MCP connection-config route (US5, FR-029/030). Six tools, no `ask`. The delegate-key secret is
 * only shown once at grant time (encrypted at rest, never retrievable), so this config carries a
 * placeholder + note rather than the secret.
 */
import { MEMWAL_MCP_TOOLS } from "@soul/shared";
import { Hono } from "hono";
import { config } from "../pkg/config";
import { BadRequestError, NotFoundError } from "../pkg/errors/error";
import { getSession, requireSession } from "../pkg/middleware/session";
import { getAccountOrThrow } from "../services/account-service";
import { services } from "../services/container";

export const mcpRoutes = new Hono().use(requireSession).get("/config/:appId", async (c) => {
  const { userId } = getSession(c);
  const account = await getAccountOrThrow(userId);
  const app = await services.repo.getConnectedApp(userId, c.req.param("appId"));
  if (!app) {
    throw new NotFoundError("Connected app not found");
  }
  if (app.status !== "active") {
    throw new BadRequestError("This app's access has been revoked");
  }
  return c.json({
    hosted: {
      url: `${config.apiOrigin}/api/mcp`,
      headers: {
        Authorization: "Bearer <delegate-key shown once at connect time>",
        "x-memwal-account-id": account.accountObjectId,
      },
    },
    stdio: {
      command: "npx",
      args: ["-y", "@mysten-incubation/memwal-mcp"],
      credentialsPath: "~/.memwal/credentials.json",
    },
    tools: [...MEMWAL_MCP_TOOLS],
    note: "The delegate-key secret was shown once when this tool was connected and is never retrievable again. Reconnect the tool to issue a new key.",
  });
});
