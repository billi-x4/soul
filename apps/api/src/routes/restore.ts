/*
 * Portability routes (US6, FR-033..036). Verify integrity, restore from the owned store, and prove
 * ownership independently of the Soul app. Zero-plaintext vault items are covered too: every
 * envelope is re-read from Walrus and hash-checked — proof the private data is portable without
 * Soul (decryptable with the passphrase alone).
 */
import { isNamespace, type Namespace } from "@soul/shared";
import { Hono } from "hono";
import { BadRequestError } from "../pkg/errors/error";
import { getSession, requireSession } from "../pkg/middleware/session";
import { getAccountOrThrow, primaryDelegateKeyHex } from "../services/account-service";
import { services } from "../services/container";
import { verifyVault } from "../services/vault-service";

export const portabilityRoutes = new Hono()
  .use(requireSession)
  .get("/verify", async (c) => {
    const { userId } = getSession(c);
    const account = await getAccountOrThrow(userId);
    const result = await services.memory.verify({
      delegateKeyHex: primaryDelegateKeyHex(account),
      accountId: account.accountObjectId,
    });
    const vault = await verifyVault(userId);
    return c.json({ ...result, intact: result.intact && vault.intact, vault });
  })
  .post("/restore", async (c) => {
    const { userId } = getSession(c);
    const account = await getAccountOrThrow(userId);
    const body = (await c.req.json().catch(() => ({}))) as { namespace?: string };
    if (body.namespace && !isNamespace(body.namespace)) {
      throw new BadRequestError("Invalid namespace");
    }
    const result = await services.memory.restore({
      delegateKeyHex: primaryDelegateKeyHex(account),
      accountId: account.accountObjectId,
      namespace: body.namespace as Namespace | undefined,
    });
    // Vault items restore by re-reading each envelope from Walrus (their index lives in the
    // repo, not the relayer) — counted separately so the proof stays honest about the mechanism.
    const vaultCheck = await verifyVault(userId);
    const vault = { restored: vaultCheck.verified, total: vaultCheck.total };
    await services.repo.addAudit({
      userId,
      action: "restore",
      target: body.namespace ?? "all",
      metadata: { ...result, vault },
    });
    return c.json({ ...result, vault });
  })
  .get("/ownership", async (c) => {
    const { userId } = getSession(c);
    const account = await getAccountOrThrow(userId);
    return c.json({
      accountObjectId: account.accountObjectId,
      ownerAddress: account.ownerAddress,
      explorerUrl: services.chain.explorerUrl(account.accountObjectId),
    });
  });
