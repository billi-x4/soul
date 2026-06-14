/*
 * Soul MCP tool registry — the single source of truth for the tools Soul exposes over MCP.
 *
 * Defined as data (name + zod input + annotations + handler) so BOTH transports share one
 * implementation: the SDK McpServer (stdio + in-process) in server.ts, and the stateless
 * Streamable-HTTP JSON-RPC bridge in http.ts. Each handler runs against an McpAuthContext that was
 * resolved from the caller's delegate key (auth.ts) and is namespace-scoped to that grant.
 *
 * Tooling matches the MemWal MCP surface (the four MEMORY tools; no `ask`). The session tools
 * (login/logout) are unnecessary here because the hosted server is pre-authenticated per request
 * via the Bearer delegate key.
 */
import { NAMESPACES, type Namespace } from "@soul/shared";
import { z } from "zod";
import { services } from "../services/container";

/** Per-request authorization context, resolved from the delegate key + account id (see auth.ts). */
export interface McpAuthContext {
  userId: string;
  accountId: string;
  /** The delegate private key (hex) Soul uses to call MemWal on the connected app's behalf. */
  delegateKeyHex: string;
  /** Relayer-enforced namespace scope for this grant. */
  allowedNamespaces: Namespace[];
  appLabel: string;
}

export interface ToolResult {
  text: string;
  structured: Record<string, unknown>;
}

interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

/** A registered Soul MCP tool. The stored handler is type-erased (args validated by callers). */
export interface SoulTool {
  name: string;
  title: string;
  description: string;
  inputShape: z.ZodRawShape;
  annotations: ToolAnnotations;
  handler: (ctx: McpAuthContext, args: Record<string, unknown>) => Promise<ToolResult>;
}

/**
 * Builder that keeps each tool's handler strongly typed at its definition site (args inferred from
 * the Zod shape) while erasing it into the homogeneous SoulTool registry. Safe because every caller
 * (server.ts / http.ts) validates args against `inputShape` before invoking the handler.
 */
function defineTool<S extends z.ZodRawShape>(t: {
  name: string;
  title: string;
  description: string;
  inputShape: S;
  annotations: ToolAnnotations;
  handler: (ctx: McpAuthContext, args: z.infer<z.ZodObject<S>>) => Promise<ToolResult>;
}): SoulTool {
  return {
    name: t.name,
    title: t.title,
    description: t.description,
    inputShape: t.inputShape,
    annotations: t.annotations,
    handler: (ctx, args) => t.handler(ctx, args as z.infer<z.ZodObject<S>>),
  };
}

/** Intersect a requested namespace list with the grant's allowed scope. */
function scope(ctx: McpAuthContext, requested?: Namespace[]): Namespace[] {
  const allowed = new Set(ctx.allowedNamespaces);
  if (!requested || requested.length === 0) {
    return [...ctx.allowedNamespaces];
  }
  return requested.filter((n) => allowed.has(n));
}

function assertInScope(ctx: McpAuthContext, namespace: Namespace): void {
  if (!ctx.allowedNamespaces.includes(namespace)) {
    throw new Error(
      `This connection is not permitted to access the '${namespace}' namespace. Allowed: ${ctx.allowedNamespaces.join(", ") || "(none)"}.`
    );
  }
}

const namespaceEnum = z.enum(NAMESPACES);

export const SOUL_TOOLS: SoulTool[] = [
  defineTool({
    name: "memwal_recall",
    title: "Recall from Soul",
    description: [
      "Semantic search over the user's owned memory (their 'soul'), scoped to the namespaces this",
      "connection was granted. Returns the most relevant facts with provenance and similarity distance.",
      "Zero-plaintext vault items are excluded by design: they are client-side encrypted and never",
      "indexed, so no connected tool (including this one) can recall them.",
      "",
      "Args:",
      "  - query (string): what to recall, in natural language.",
      "  - namespaces (string[], optional): restrict to a subset of the granted namespaces (bio|docs|social).",
      "  - limit (number, optional, 1-50, default 10): max results.",
      "Returns JSON: { count, items: [{ id, namespace, snippet, source, distance }] }.",
    ].join("\n"),
    inputShape: {
      query: z.string().min(1, "query is required").max(500).describe("Natural-language search"),
      namespaces: z
        .array(namespaceEnum)
        .optional()
        .describe("Subset of granted namespaces to search"),
      limit: z.number().int().min(1).max(50).default(10).describe("Max results"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (ctx, { query, namespaces, limit }) => {
      const ns = scope(ctx, namespaces);
      if (ns.length === 0) {
        return {
          text: "No namespaces in scope for this connection.",
          structured: { count: 0, items: [] },
        };
      }
      const items = await services.memory.recall({
        delegateKeyHex: ctx.delegateKeyHex,
        accountId: ctx.accountId,
        namespaces: ns,
        query,
        limit,
      });
      const structured = {
        count: items.length,
        items: items.map((i) => ({
          id: i.id,
          namespace: i.namespace,
          snippet: i.snippet ?? i.content ?? "",
          source: i.source,
          distance: i.distance,
        })),
      };
      return { text: JSON.stringify(structured, null, 2), structured };
    },
  }),
  defineTool({
    name: "memwal_remember",
    title: "Remember to Soul",
    description: [
      "Store a new fact in the user's memory in a granted namespace. Eventually consistent: returns a",
      "job id; the fact becomes recallable once the relayer finishes processing.",
      "",
      "Args:",
      "  - text (string): the fact to remember.",
      "  - namespace (string): one of the granted namespaces (bio|docs|social).",
      "Returns JSON: { jobId, namespace }.",
    ].join("\n"),
    inputShape: {
      text: z.string().min(1, "text is required").max(20_000).describe("The fact to store"),
      namespace: namespaceEnum.describe("Target namespace (must be granted)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (ctx, { text, namespace }) => {
      assertInScope(ctx, namespace);
      const { jobId } = await services.memory.remember({
        delegateKeyHex: ctx.delegateKeyHex,
        accountId: ctx.accountId,
        namespace,
        text,
        source: ctx.appLabel,
      });
      const structured = { jobId, namespace };
      return { text: JSON.stringify(structured), structured };
    },
  }),
  defineTool({
    name: "memwal_analyze",
    title: "Analyze into Soul",
    description: [
      "Extract structured facts from a longer, messy block of text and remember them in a granted",
      "namespace. Use for documents or transcripts. Eventually consistent: returns job ids.",
      "",
      "Args:",
      "  - text (string): the source content to analyze.",
      "  - namespace (string): one of the granted namespaces (bio|docs|social).",
      "Returns JSON: { jobIds, factCount, namespace }.",
    ].join("\n"),
    inputShape: {
      text: z
        .string()
        .min(1, "text is required")
        .max(100_000)
        .describe("Source content to analyze"),
      namespace: namespaceEnum.describe("Target namespace (must be granted)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (ctx, { text, namespace }) => {
      assertInScope(ctx, namespace);
      const { jobIds, factCount } = await services.memory.analyze({
        delegateKeyHex: ctx.delegateKeyHex,
        accountId: ctx.accountId,
        namespace,
        text,
        source: ctx.appLabel,
      });
      const structured = { jobIds, factCount, namespace };
      return { text: JSON.stringify(structured), structured };
    },
  }),
  defineTool({
    name: "memwal_restore",
    title: "Restore Soul index",
    description: [
      "Rebuild the recall index for the granted namespaces from the user's owned Walrus store, proving",
      "the memory is portable and decentralized. Idempotent.",
      "",
      "Args:",
      "  - namespace (string, optional): restrict to one granted namespace; omit to restore all granted.",
      "Returns JSON: { restored, skipped, total }.",
    ].join("\n"),
    inputShape: {
      namespace: namespaceEnum.optional().describe("Restrict to one granted namespace"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (ctx, { namespace }) => {
      if (namespace) {
        assertInScope(ctx, namespace);
      }
      const result = await services.memory.restore({
        delegateKeyHex: ctx.delegateKeyHex,
        accountId: ctx.accountId,
        namespace,
      });
      return { text: JSON.stringify(result), structured: { ...result } };
    },
  }),
];

export function getTool(name: string): SoulTool | undefined {
  return SOUL_TOOLS.find((t) => t.name === name);
}
