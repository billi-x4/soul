# Soul MCP — Host / Client / Server architecture

Soul exposes a person's portable, user-owned memory to AI tools through the
[Model Context Protocol](https://modelcontextprotocol.io). This document describes the three roles
Soul implements and how to connect to them securely.

All code lives under [apps/api/src/mcp/](../apps/api/src/mcp/).

---

## Roles

### Server — `server.ts` · `http.ts` · `stdio.ts`

Soul serves four memory tools, scoped to the namespaces a connection was granted. There is
intentionally **no `ask` tool** (the model reasons over `recall` results itself).

**Zero-plaintext vault items are out of MCP's reach by design.** Private memories are encrypted
in the owner's browser and never indexed by the relayer, so `memwal_recall` cannot surface them
to any connected client — including Soul's own tools. The recall tool description states this.

| Tool | Effect | Annotations |
|---|---|---|
| `memwal_recall` | Semantic search over granted namespaces | read-only, idempotent |
| `memwal_remember` | Store one fact in a granted namespace | write |
| `memwal_analyze` | Extract + store facts from a long document | write |
| `memwal_restore` | Rebuild the index from Walrus (portability) | idempotent |

Two transports, one shared tool registry ([tools.ts](../apps/api/src/mcp/tools.ts)) so behaviour is
identical:

- **Hosted (Streamable HTTP, stateless JSON-RPC 2.0)** — `POST /api/mcp`. Every request is
  authenticated on its own, so the endpoint is horizontally scalable with no session store. Built on
  Hono ([http.ts](../apps/api/src/mcp/http.ts)); the SDK `McpServer` ([server.ts](../apps/api/src/mcp/server.ts))
  backs the stdio path and in-process tests.
- **Local (stdio)** — for Claude Desktop / Cursor. Runs the full official-SDK `McpServer`
  ([stdio.ts](../apps/api/src/mcp/stdio.ts)).

### Client — `client.ts`

`SoulMcpClient` is a thin wrapper over the official MCP SDK `Client`. It connects to **any** MCP
server over Streamable HTTP, stdio, or an in-memory transport, and exposes `listTools` / `callTool`.
Soul uses it to self-test its own server and to consume external MCP systems.

### Host — `host.ts`

`McpHost` manages a registry of named client connections so Soul can orchestrate several MCP servers
at once (its own memory server plus any external systems a user connects): `connect` / `list` /
`listAllTools` / `callTool(name, tool, args)` / `disconnect`. Each connection is isolated and has its
own lifecycle.

---

## Security model

- **Authentication** ([auth.ts](../apps/api/src/mcp/auth.ts)): a request presents the **delegate
  private key** (shown once at grant time) as `Authorization: Bearer <key>` plus
  `x-memwal-account-id`. Soul looks the account up by object id, then **constant-time** compares the
  presented key against the account owner's active delegate keys (each stored encrypted at rest, AES-256-GCM).
- **Fail closed**: a frozen account (`deactivate_account`) or a revoked app rejects every call. Revoke
  also drops the at-rest secret.
- **Namespace scope**: `recall` is intersected with the grant; `remember` / `analyze` / `restore`
  assert the target namespace is granted. Out-of-scope calls return a tool error, never data.
- **No secret leakage**: delegate keys, JWTs, and the session key are never logged or returned.

---

## Connect an AI client

Grant a tool on the **Permissions** page; you receive a one-time config. Then:

### Hosted HTTP

```json
{
  "url": "https://<your-api-origin>/api/mcp",
  "headers": {
    "Authorization": "Bearer <delegate-key shown once>",
    "x-memwal-account-id": "0x<your account object id>"
  }
}
```

### Local stdio (Claude Desktop / Cursor)

```json
{
  "command": "bun",
  "args": ["run", "apps/api/src/mcp/stdio.ts"],
  "env": {
    "SOUL_MCP_ACCOUNT_ID": "0x<your account object id>",
    "SOUL_MCP_DELEGATE_KEY": "<delegate-key shown once>"
  }
}
```

> `memwal_logout` in the official MemWal client wipes local creds but does **not** revoke the on-chain
> delegate key. Real revocation happens on the Permissions page (`remove_delegate_key`).

---

## Verify it

```bash
pnpm --filter @soul/api mcp:selftest
```

Wires a Soul MCP **server** to a Soul MCP **client** over an in-memory transport and checks the full
handshake (`initialize` → `tools/list` → `tools/call`), structured results, and namespace-scope
enforcement — with zero external services.
