/*
 * In-process MCP self-test: wires a Soul MCP SERVER to a Soul MCP CLIENT over an in-memory transport
 * pair and exercises the full handshake (initialize -> tools/list -> tools/call). Proves the
 * Server + Client + SDK + tool registry integrate, with zero external services. Run mock:
 *   SOUL_LIVE=false bun scripts/mcp-selftest.ts
 */
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { NAMESPACES } from "@soul/shared";
import { SoulMcpClient } from "../src/mcp/client";
import { createSoulMcpServer } from "../src/mcp/server";
import type { McpAuthContext } from "../src/mcp/tools";

const ctx: McpAuthContext = {
  userId: "u_selftest",
  accountId: "0xselftest",
  delegateKeyHex: "00".repeat(32),
  allowedNamespaces: [...NAMESPACES],
  appLabel: "selftest",
};

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) {
    failures++;
  }
}

async function main(): Promise<void> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createSoulMcpServer(ctx);
  await server.connect(serverTransport);

  const client = new SoulMcpClient();
  await client.connect(clientTransport);

  const tools = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  check("tools/list returns the four memory tools", names.length === 4, names.join(", "));
  check(
    "tool names match the MemWal surface",
    JSON.stringify(names) ===
      JSON.stringify(["memwal_analyze", "memwal_recall", "memwal_remember", "memwal_restore"])
  );

  const remembered = (await client.callTool("memwal_remember", {
    text: "Self-test fact: the sky is the limit.",
    namespace: "bio",
  })) as { structuredContent?: { jobId?: string } };
  check("memwal_remember returns a jobId", Boolean(remembered.structuredContent?.jobId));

  const recalled = (await client.callTool("memwal_recall", {
    query: "self-test",
    limit: 3,
  })) as { isError?: boolean; structuredContent?: { count?: number } };
  check("memwal_recall executes without protocol error", recalled.isError !== true);
  check(
    "memwal_recall returns a structured count",
    typeof recalled.structuredContent?.count === "number"
  );

  // Scope enforcement: a namespace outside the grant must be rejected at the tool layer.
  const scopedCtxClient = new SoulMcpClient();
  const [c2, s2] = InMemoryTransport.createLinkedPair();
  const scopedServer = createSoulMcpServer({ ...ctx, allowedNamespaces: ["bio"] });
  await scopedServer.connect(s2);
  await scopedCtxClient.connect(c2);
  const denied = (await scopedCtxClient.callTool("memwal_remember", {
    text: "should be blocked",
    namespace: "social",
  })) as { isError?: boolean };
  check("out-of-scope namespace is rejected", denied.isError === true);
  await scopedCtxClient.close();

  await client.close();

  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("mcp-selftest crashed:", e);
  process.exit(1);
});
