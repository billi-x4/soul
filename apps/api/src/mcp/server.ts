/*
 * Soul MCP Server (SERVER role). Builds an official-SDK McpServer wired to Soul's memory tools for a
 * single, already-authenticated connection (McpAuthContext). Used by:
 *   - the local stdio entry (mcp/stdio.ts) for Claude Desktop / Cursor, and
 *   - in-process self-tests via the in-memory transport.
 * The hosted HTTP path (mcp/http.ts) serves the SAME tool registry over a stateless JSON-RPC bridge.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type McpAuthContext, SOUL_TOOLS } from "./tools";

export const SOUL_MCP_INFO = { name: "soul-mcp-server", version: "1.0.0" } as const;

export function createSoulMcpServer(ctx: McpAuthContext): McpServer {
  const server = new McpServer(SOUL_MCP_INFO, {
    capabilities: { tools: {} },
    instructions:
      "Soul exposes a person's portable, user-owned memory. Use memwal_recall to ground answers in " +
      "what the user has chosen to remember; memwal_remember / memwal_analyze to add facts they ask " +
      "you to keep. All access is scoped to the namespaces this connection was granted and can be " +
      "revoked on-chain by the user at any time.",
  });

  for (const tool of SOUL_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputShape,
        annotations: tool.annotations,
      },
      async (args: Record<string, unknown>) => {
        try {
          const { text, structured } = await tool.handler(
            ctx,
            args as Parameters<typeof tool.handler>[1]
          );
          return {
            content: [{ type: "text" as const, text }],
            structuredContent: structured,
          };
        } catch (e) {
          return {
            content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
            isError: true,
          };
        }
      }
    );
  }

  return server;
}
