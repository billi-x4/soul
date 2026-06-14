/*
 * Soul MCP hosted transport — a stateless, spec-aligned Streamable-HTTP JSON-RPC endpoint that
 * serves the shared SOUL_TOOLS registry to remote MCP clients (Claude Desktop, Cursor, the Soul
 * MCP client). Stateless = horizontally scalable: every request is authenticated on its own via the
 * Bearer delegate key + x-memwal-account-id (see auth.ts), no session store.
 *
 * The local/stdio path (mcp/stdio.ts) uses the full SDK McpServer; this HTTP bridge shares the exact
 * same tool definitions and handlers so behaviour is identical across transports.
 */
import { Hono } from "hono";
import { z } from "zod";
import { McpAuthError, resolveMcpAuth } from "./auth";
import { SOUL_MCP_INFO } from "./server";
import { getTool, type McpAuthContext, SOUL_TOOLS } from "./tools";

const DEFAULT_PROTOCOL = "2025-06-18";

type JsonRpcId = string | number | null;

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
}

const rpcResult = (id: JsonRpcId, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: JsonRpcId, code: number, message: string) => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

function toolsListResult() {
  return {
    tools: SOUL_TOOLS.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: z.toJSONSchema(z.object(t.inputShape)),
      annotations: t.annotations,
    })),
  };
}

async function handleMessage(
  msg: JsonRpcMessage,
  getCtx: () => Promise<McpAuthContext>
): Promise<object | null> {
  const id: JsonRpcId = msg.id ?? null;
  const method = msg.method;
  const params = msg.params ?? {};
  if (!method) {
    return rpcError(id, -32_600, "Invalid Request: missing method.");
  }
  // Notifications carry no id and expect no response.
  if (method.startsWith("notifications/")) {
    return null;
  }
  switch (method) {
    case "initialize": {
      const requested = params.protocolVersion;
      return rpcResult(id, {
        protocolVersion: typeof requested === "string" ? requested : DEFAULT_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SOUL_MCP_INFO,
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      await getCtx(); // require a valid delegate key even to enumerate tools
      return rpcResult(id, toolsListResult());
    case "tools/call": {
      const ctx = await getCtx();
      const name = typeof params.name === "string" ? params.name : "";
      const tool = getTool(name);
      if (!tool) {
        return rpcError(id, -32_602, `Unknown tool: '${name}'.`);
      }
      const parsed = z.object(tool.inputShape).safeParse(params.arguments ?? {});
      if (!parsed.success) {
        return rpcError(id, -32_602, `Invalid arguments for ${name}: ${parsed.error.message}`);
      }
      try {
        const { text, structured } = await tool.handler(
          ctx,
          parsed.data as Parameters<typeof tool.handler>[1]
        );
        return rpcResult(id, {
          content: [{ type: "text", text }],
          structuredContent: structured,
        });
      } catch (e) {
        // Tool-level failures are reported as a tool result with isError (not a protocol error).
        return rpcResult(id, {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          isError: true,
        });
      }
    }
    default:
      return rpcError(id, -32_601, `Method not found: ${method}`);
  }
}

export const mcpHttpApp = new Hono();

mcpHttpApp.get("/", (c) =>
  c.json({
    name: SOUL_MCP_INFO.name,
    version: SOUL_MCP_INFO.version,
    transport: "streamable-http (stateless JSON-RPC 2.0)",
    tools: SOUL_TOOLS.map((t) => t.name),
    auth: "Authorization: Bearer <delegate key> + x-memwal-account-id",
  })
);

mcpHttpApp.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(rpcError(null, -32_700, "Parse error: body is not valid JSON."), 400);
  }

  const authHeader = c.req.header("Authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const accountId = c.req.header("x-memwal-account-id");

  let cached: McpAuthContext | undefined;
  let authErr: McpAuthError | undefined;
  const getCtx = async (): Promise<McpAuthContext> => {
    if (cached) {
      return cached;
    }
    if (authErr) {
      throw authErr;
    }
    try {
      cached = await resolveMcpAuth(bearer, accountId);
      return cached;
    } catch (e) {
      if (e instanceof McpAuthError) {
        authErr = e;
      }
      throw e;
    }
  };

  const dispatch = async (m: JsonRpcMessage): Promise<object | null> => {
    try {
      return await handleMessage(m, getCtx);
    } catch (e) {
      const id: JsonRpcId = m.id ?? null;
      if (e instanceof McpAuthError) {
        return rpcError(id, -32_001, e.message);
      }
      return rpcError(id, -32_603, `Internal error: ${(e as Error).message}`);
    }
  };

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((m) => dispatch(m as JsonRpcMessage)))).filter(
      (r): r is object => r !== null
    );
    return responses.length ? c.json(responses) : c.body(null, 202);
  }

  const response = await dispatch(body as JsonRpcMessage);
  return response ? c.json(response) : c.body(null, 202);
});
