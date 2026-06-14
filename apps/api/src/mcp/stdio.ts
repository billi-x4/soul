#!/usr/bin/env bun
/*
 * Soul MCP server over stdio — the local integration for Claude Desktop / Cursor.
 *
 * Reads the delegate credentials from the environment, resolves the namespace-scoped context, and
 * serves the SDK McpServer over stdio. Add to a client config, e.g.:
 *   { "command": "bun", "args": ["run", "apps/api/src/mcp/stdio.ts"],
 *     "env": { "SOUL_MCP_ACCOUNT_ID": "0x...", "SOUL_MCP_DELEGATE_KEY": "<delegate key>" } }
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveMcpAuth } from "./auth";
import { createSoulMcpServer } from "./server";

async function main(): Promise<void> {
  const accountId = process.env.SOUL_MCP_ACCOUNT_ID;
  const delegateKey = process.env.SOUL_MCP_DELEGATE_KEY;
  if (!(accountId && delegateKey)) {
    console.error(
      "Soul MCP (stdio): set SOUL_MCP_ACCOUNT_ID and SOUL_MCP_DELEGATE_KEY (from the Permissions page)."
    );
    process.exit(1);
  }
  const ctx = await resolveMcpAuth(delegateKey, accountId);
  const server = createSoulMcpServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for the JSON-RPC stream; log to stderr only.
  console.error(`Soul MCP server (stdio) ready — connection "${ctx.appLabel}".`);
}

main().catch((e) => {
  console.error("Soul MCP (stdio) failed:", e);
  process.exit(1);
});
