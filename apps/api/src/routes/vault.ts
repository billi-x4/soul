/*
 * Zero-plaintext vault routes. Content arrives ALREADY ENCRYPTED (sealed in the browser with a
 * passphrase-derived AES-256-GCM key); these routes only ever see envelopes. There is no
 * eventual consistency here — no relayer is involved, so a stored item is immediately "ready".
 * The matching trade-off: private items are never semantically indexed and never surface in
 * AI recall/MCP. See services/vault-service.ts.
 */
import { isNamespace, type Namespace } from "@soul/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import { toVaultItemMeta } from "../pkg/dto";
import { BadRequestError } from "../pkg/errors/error";
import { getSession, requireSession } from "../pkg/middleware/session";
import { services } from "../services/container";
import {
  addVaultItem,
  getVaultItemDetail,
  removeVaultItem,
  setupVault,
  vaultStatus,
} from "../services/vault-service";

/** Envelope wire ceiling + JSON/body overhead headroom (see MAX_VAULT_ENVELOPE_BYTES math). */
const MAX_BODY_BYTES = 21 * 1024 * 1024;

/**
 * Reject oversized uploads from Content-Length BEFORE buffering (same guard as ingest.ts).
 * Chunked bodies carry no Content-Length and skip this — they are bounded by the server-wide
 * `maxRequestBodySize` (src/index.ts) and then by the envelope cap after parse.
 */
function rejectOversizedBody(c: Context): void {
  const len = Number(c.req.header("content-length"));
  if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
    throw new BadRequestError("Encrypted payload exceeds the 20 MB limit");
  }
}

export const vaultRoutes = new Hono()
  .use(requireSession)
  // Vault status + the public KDF params a new device needs to re-derive the key.
  .get("/", async (c) => {
    const { userId } = getSession(c);
    return c.json(await vaultStatus(userId));
  })
  // One-time setup. The passphrase itself NEVER appears in this request.
  .post("/", async (c) => {
    const { userId } = getSession(c);
    const body = (await c.req.json().catch(() => ({}))) as { params?: unknown };
    const vault = await setupVault(userId, body.params);
    return c.json({ configured: true, createdAt: vault.createdAt }, 201);
  })
  .get("/items", async (c) => {
    const { userId } = getSession(c);
    const ns = c.req.query("namespace");
    if (ns && !isNamespace(ns)) {
      throw new BadRequestError("Invalid namespace");
    }
    const items = await services.repo.listVaultItems(userId, ns as Namespace | undefined);
    return c.json({ items: items.map(toVaultItemMeta) });
  })
  .post("/items", async (c) => {
    const { userId } = getSession(c);
    rejectOversizedBody(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      namespace?: string;
      label?: string;
      kind?: string;
      sizeBytes?: number;
      envelope?: unknown;
    };
    if (!isNamespace(body.namespace)) {
      throw new BadRequestError("Invalid or missing namespace");
    }
    const item = await addVaultItem({
      userId,
      namespace: body.namespace,
      label: body.label ?? "",
      kind: body.kind as "text" | "file",
      sizeBytes: body.sizeBytes ?? 0,
      envelope: body.envelope,
    });
    // 201, not 202: no relayer, no job — the envelope is stored and listed immediately.
    return c.json(toVaultItemMeta(item), 201);
  })
  .get("/items/:id", async (c) => {
    const { userId } = getSession(c);
    const { item, envelope } = await getVaultItemDetail(userId, c.req.param("id"));
    return c.json({ ...toVaultItemMeta(item), envelope });
  })
  .delete("/items/:id", async (c) => {
    const { userId } = getSession(c);
    await removeVaultItem(userId, c.req.param("id"));
    return c.json({
      deleted: true,
      note: "Removed from your index. The encrypted envelope on Walrus is immutable — but without your passphrase it is unreadable to anyone, forever.",
    });
  });
