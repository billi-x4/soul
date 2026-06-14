/*
 * Soul MCP Client (CLIENT role). A thin, typed wrapper over the official MCP SDK Client that can
 * connect to ANY MCP server over Streamable HTTP or stdio. Soul uses it to (a) self-test its own
 * hosted server and (b) consume external MCP systems through the Host (host.ts) — the "secure
 * connection to external systems" surface.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export interface McpToolInfo {
  name: string;
  description?: string;
}

export class SoulMcpClient {
  private client: Client;
  private transport: Transport | null = null;

  constructor(name = "soul-mcp-client", version = "1.0.0") {
    this.client = new Client({ name, version }, { capabilities: {} });
  }

  /** Connect to a remote MCP server over Streamable HTTP (optionally with auth headers). */
  async connectHttp(url: string, headers: Record<string, string> = {}): Promise<void> {
    this.transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers },
    });
    await this.client.connect(this.transport);
  }

  /** Connect to a local MCP server launched as a subprocess over stdio. */
  async connectStdio(
    command: string,
    args: string[] = [],
    env: Record<string, string> = {}
  ): Promise<void> {
    this.transport = new StdioClientTransport({ command, args, env });
    await this.client.connect(this.transport);
  }

  /** Attach to a pre-built transport (e.g. an in-memory pair for in-process self-tests). */
  async connect(transport: Transport): Promise<void> {
    this.transport = transport;
    await this.client.connect(transport);
  }

  async listTools(): Promise<McpToolInfo[]> {
    const { tools } = await this.client.listTools();
    return tools.map((t) => ({ name: t.name, description: t.description }));
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    return this.client.callTool({ name, arguments: args });
  }

  async close(): Promise<void> {
    await this.client.close();
    this.transport = null;
  }
}
