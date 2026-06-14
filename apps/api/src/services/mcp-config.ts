/*
 * Single builder for the MCP connection config handed to AI clients — used by the permissions
 * grant, marketplace buy/claim (real key, shown once), and the secret-less template variants
 * (mcp config + acquisition config). Six tools, no `ask` (sui-stack SKILL L4b).
 */
import { type McpConnectionConfig, MEMWAL_MCP_TOOLS } from "@soul/shared";
import { config } from "../pkg/config";

/** Authorization placeholder used by template (secret-less) variants. */
export const DELEGATE_KEY_PLACEHOLDER = "Bearer <delegate-key shown once>";

/**
 * Build the MCP connection config for an account. Pass the real delegate key hex for the
 * shown-once reveal, or omit it for an honest template with a placeholder Authorization.
 */
export function buildMcpConfig(
  accountObjectId: string,
  delegateKeyHex?: string
): McpConnectionConfig {
  return {
    hosted: {
      url: `${config.apiOrigin}/api/mcp`,
      headers: {
        Authorization: delegateKeyHex ? `Bearer ${delegateKeyHex}` : DELEGATE_KEY_PLACEHOLDER,
        "x-memwal-account-id": accountObjectId,
      },
    },
    stdio: {
      command: "npx",
      args: ["-y", "@mysten-incubation/memwal-mcp"],
      credentialsPath: "~/.memwal/credentials.json",
    },
    tools: [...MEMWAL_MCP_TOOLS],
  };
}
