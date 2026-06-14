/*
 * Soul MCP Host (HOST role). Manages a registry of named MCP client connections so Soul can
 * orchestrate several MCP servers at once (its own hosted memory server plus external systems a user
 * connects). This is the scalable host surface: connect / list / route a tool call / disconnect, with
 * lifecycle and isolation per connection.
 */
import { logger } from "@soul/logs";
import { SoulMcpClient } from "./client";

export type McpConnectionSpec =
  | { kind: "http"; url: string; headers?: Record<string, string> }
  | { kind: "stdio"; command: string; args?: string[]; env?: Record<string, string> };

interface Connection {
  client: SoulMcpClient;
  spec: McpConnectionSpec;
}

export class McpHost {
  private connections = new Map<string, Connection>();

  /** Open (or replace) a named connection to an MCP server. */
  async connect(name: string, spec: McpConnectionSpec): Promise<void> {
    await this.disconnect(name);
    const client = new SoulMcpClient(`soul-host:${name}`);
    if (spec.kind === "http") {
      await client.connectHttp(spec.url, spec.headers ?? {});
    } else {
      await client.connectStdio(spec.command, spec.args ?? [], spec.env ?? {});
    }
    this.connections.set(name, { client, spec });
    logger.info(`[mcp-host] connected '${name}' (${spec.kind})`);
  }

  list(): string[] {
    return [...this.connections.keys()];
  }

  get(name: string): SoulMcpClient {
    const conn = this.connections.get(name);
    if (!conn) {
      throw new Error(`No MCP connection named '${name}'. Open it with host.connect() first.`);
    }
    return conn.client;
  }

  /** List the tools exposed by every connected server, keyed by connection name. */
  async listAllTools(): Promise<Record<string, string[]>> {
    const out: Record<string, string[]> = {};
    for (const [name, conn] of this.connections) {
      try {
        out[name] = (await conn.client.listTools()).map((t) => t.name);
      } catch (e) {
        logger.warn(`[mcp-host] listTools failed for '${name}': ${(e as Error).message}`);
        out[name] = [];
      }
    }
    return out;
  }

  /** Route a tool call to a named connection. */
  callTool(name: string, tool: string, args: Record<string, unknown> = {}): Promise<unknown> {
    return this.get(name).callTool(tool, args);
  }

  async disconnect(name: string): Promise<void> {
    const conn = this.connections.get(name);
    if (conn) {
      await conn.client.close().catch(() => {});
      this.connections.delete(name);
      logger.info(`[mcp-host] disconnected '${name}'`);
    }
  }

  async disconnectAll(): Promise<void> {
    await Promise.all([...this.connections.keys()].map((n) => this.disconnect(n)));
  }
}
