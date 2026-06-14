/*
 * Account routes (US1, FR-002/005). Idempotent provisioning of one MemWalAccount per user.
 */
import { NAMESPACES } from "@soul/shared";
import { Hono } from "hono";
import { getSession, requireAddress, requireSession } from "../pkg/middleware/session";
import { ensureUserAndAccount } from "../services/account-service";
import { services } from "../services/container";

export const accountRoutes = new Hono()
  .post("/provision", requireAddress, async (c) => {
    const suiAddress = c.get("suiAddress") as string;
    const { account, created } = await ensureUserAndAccount(suiAddress);
    return c.json({
      account: {
        objectId: account.accountObjectId,
        ownerAddress: account.ownerAddress,
        active: account.active,
      },
      created,
    });
  })
  .get("/", requireSession, async (c) => {
    const { userId } = getSession(c);
    const account = await services.repo.getAccountByUserId(userId);
    const connectedCount = await services.repo.countActiveApps(userId);
    return c.json({
      objectId: account?.accountObjectId ?? null,
      ownerAddress: account?.ownerAddress ?? null,
      active: account?.active ?? false,
      namespaces: [...NAMESPACES],
      connectedCount,
    });
  });
