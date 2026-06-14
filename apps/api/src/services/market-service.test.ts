/*
 * Marketplace service tests — run against the dev-mode container (mock adapters, in-memory repo).
 * The unit under test is the flow logic: listings, the buy path (payment + cross-user grant +
 * audit), gifts with one-time encrypted-at-rest claim, and recipient resolution.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ensureUserAndAccount } from "./account-service";
import { services } from "./container";
import {
  browseListings,
  buyListing,
  cancelListing,
  claimAcquisition,
  createListing,
  listAcquisitions,
  listSales,
  myListings,
  sendSoul,
} from "./market-service";
import type { AccountRecord, UserRecord } from "./ports";

const HEX64 = /^[0-9a-f]{64}$/;
const DIGEST64 = /^0x[0-9a-f]{64}$/;

let seq = 0;
async function makeUser(username?: string): Promise<{ user: UserRecord; account: AccountRecord }> {
  seq += 1;
  const addr = `0x${createHash("sha256").update(`market-test-${seq}`).digest("hex")}`;
  const { user, account } = await ensureUserAndAccount(addr, "dev");
  if (username) {
    await services.repo.setUsername(user.id, username);
    user.username = username;
  }
  return { user, account };
}

const list = (sellerId: string, priceMist = "1000000000") =>
  createListing(sellerId, { title: "Test soul", scope: ["bio"], priceMist });

describe("market-service listings", () => {
  it("create + browse: active listings newest-first with the mine flag", async () => {
    const seller = await makeUser("marketalice");
    const buyer = await makeUser();
    const listing = await list(seller.user.id);
    expect(listing.sellerHandle).toBe("marketalice.soul");
    expect(listing.mine).toBe(true);

    const asBuyer = await browseListings(buyer.user.id);
    const seen = asBuyer.find((l) => l.id === listing.id);
    expect(seen?.mine).toBe(false);
    expect(seen?.sellerAddress).toBe(seller.user.suiAddress);

    const asSeller = await browseListings(seller.user.id);
    expect(asSeller.find((l) => l.id === listing.id)?.mine).toBe(true);

    const mine = await myListings(seller.user.id);
    expect(mine.some((l) => l.id === listing.id)).toBe(true);

    const audit = await services.repo.listAudit(seller.user.id);
    expect(audit.some((a) => a.action === "list" && a.target === listing.id)).toBe(true);
  });

  it("cancel is owner-only, audits unlist, and hides the listing from browse", async () => {
    const seller = await makeUser();
    const stranger = await makeUser();
    const listing = await list(seller.user.id);

    await expect(cancelListing(stranger.user.id, listing.id)).rejects.toMatchObject({
      status: 404,
    });

    const cancelled = await cancelListing(seller.user.id, listing.id);
    expect(cancelled.status).toBe("cancelled");
    expect((await browseListings(seller.user.id)).some((l) => l.id === listing.id)).toBe(false);
    // ... but it still shows in the seller's own list (all statuses).
    expect((await myListings(seller.user.id)).some((l) => l.id === listing.id)).toBe(true);
    const audit = await services.repo.listAudit(seller.user.id);
    expect(audit.some((a) => a.action === "unlist" && a.target === listing.id)).toBe(true);
  });
});

describe("market-service buy", () => {
  it("happy path: payment digest, key minted on the SELLER's account, audit both sides", async () => {
    const seller = await makeUser("marketbob");
    const buyer = await makeUser("marketcarol");
    const listing = await list(seller.user.id, "2000000000");

    const { acquisition, sellerAccountObjectId, delegatePrivateKeyHex } = await buyListing(
      buyer.user.id,
      listing.id
    );

    // The one-time key is a real hex secret bound to the seller's account object.
    expect(delegatePrivateKeyHex).toMatch(HEX64);
    expect(sellerAccountObjectId).toBe(seller.account.accountObjectId);

    // The delegate key lives on the SELLER's account, labeled for the buyer, scoped to the listing.
    const sellerApps = await services.repo.listConnectedApps(seller.user.id);
    const minted = sellerApps.find((a) => a.label === "license:marketcarol.soul");
    expect(minted?.status).toBe("active");
    expect(minted?.allowedNamespaces).toEqual(["bio"]);

    // Acquisition: claimed at birth (secret shown once, never stored).
    expect(acquisition.kind).toBe("purchase");
    expect(acquisition.claimed).toBe(true);
    expect(acquisition.priceMist).toBe("2000000000");
    expect(acquisition.txDigest).toMatch(DIGEST64);
    const record = await services.repo.getAcquisition(acquisition.id);
    expect(record?.delegateSecretEnc ?? null).toBeNull();

    // salesCount incremented.
    expect((await services.repo.getListing(listing.id))?.salesCount).toBe(1);

    // Audit on BOTH sides.
    const sellerAudit = await services.repo.listAudit(seller.user.id);
    const buyerAudit = await services.repo.listAudit(buyer.user.id);
    expect(
      sellerAudit.some(
        (a) => a.action === "purchase" && a.target === listing.id && a.metadata?.role === "seller"
      )
    ).toBe(true);
    expect(
      buyerAudit.some(
        (a) => a.action === "purchase" && a.target === listing.id && a.metadata?.role === "buyer"
      )
    ).toBe(true);

    // Both ledgers see it: buyer's acquisitions + seller's sales, status read live (active).
    const acqs = await listAcquisitions(buyer.user.id);
    expect(acqs.find((a) => a.id === acquisition.id)?.status).toBe("active");
    const sales = await listSales(seller.user.id);
    expect(sales.find((s) => s.acquisitionId === acquisition.id)?.buyerHandle).toBe(
      "marketcarol.soul"
    );
  });

  it("rejects buying your own listing (400)", async () => {
    const seller = await makeUser();
    const listing = await list(seller.user.id);
    await expect(buyListing(seller.user.id, listing.id)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a cancelled listing (409) and an unknown one (404)", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const listing = await list(seller.user.id);
    await cancelListing(seller.user.id, listing.id);
    await expect(buyListing(buyer.user.id, listing.id)).rejects.toMatchObject({ status: 409 });
    await expect(buyListing(buyer.user.id, "listing-nope")).rejects.toMatchObject({ status: 404 });
  });

  it("rejects when the seller's soul is frozen (409)", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const listing = await list(seller.user.id);
    await services.repo.setAccountActive(seller.user.id, false);
    await expect(buyListing(buyer.user.id, listing.id)).rejects.toMatchObject({ status: 409 });
    await services.repo.setAccountActive(seller.user.id, true);
  });

  it("rejects when the seller's account is at the 20-key cap (409)", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const listing = await list(seller.user.id);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        services.repo.createConnectedApp({
          userId: seller.user.id,
          delegatePublicKey: `pub-${i}`,
          delegateAddress: `0xdel-${i}`,
          delegateSecretEnc: new Uint8Array([1]),
          label: `tool-${i}`,
          allowedNamespaces: ["bio"],
        })
      )
    );
    await expect(buyListing(buyer.user.id, listing.id)).rejects.toMatchObject({ status: 409 });
  });
});

describe("market-service send + claim (gifts)", () => {
  it("send stores the secret encrypted; claim reveals once and WIPES it", async () => {
    const sender = await makeUser("marketdave");
    const recipient = await makeUser("marketeve");

    const gift = await sendSoul(sender.user.id, { to: "marketeve.soul", scope: ["bio"] });
    expect(gift.kind).toBe("gift");
    expect(gift.priceMist).toBe("0");
    expect(gift.claimed).toBe(false);
    // No secret in the DTO; the at-rest record holds it ENCRYPTED until the claim.
    expect(JSON.stringify(gift)).not.toContain("delegateSecretEnc");
    const before = await services.repo.getAcquisition(gift.id);
    expect((before?.delegateSecretEnc?.length ?? 0) > 0).toBe(true);

    // Audit both sides.
    expect(
      (await services.repo.listAudit(sender.user.id)).some(
        (a) => a.action === "gift" && a.metadata?.role === "sender"
      )
    ).toBe(true);
    expect(
      (await services.repo.listAudit(recipient.user.id)).some(
        (a) => a.action === "gift" && a.metadata?.role === "recipient"
      )
    ).toBe(true);

    const { delegatePrivateKeyHex, sellerAccountObjectId } = await claimAcquisition(
      recipient.user.id,
      gift.id
    );
    expect(delegatePrivateKeyHex).toMatch(HEX64);
    expect(sellerAccountObjectId).toBe(sender.account.accountObjectId);

    // The stored secret is gone the moment it was revealed.
    const after = await services.repo.getAcquisition(gift.id);
    expect(after?.claimed).toBe(true);
    expect(after?.delegateSecretEnc ?? null).toBeNull();
  });

  it("double-claim is a 409", async () => {
    const sender = await makeUser();
    const recipient = await makeUser("marketfrank");
    const gift = await sendSoul(sender.user.id, { to: "marketfrank", scope: ["bio"] });
    await claimAcquisition(recipient.user.id, gift.id);
    await expect(claimAcquisition(recipient.user.id, gift.id)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("claim after the sender revoked the key is a 409", async () => {
    const sender = await makeUser();
    const recipient = await makeUser("marketgrace");
    const gift = await sendSoul(sender.user.id, { to: "marketgrace", scope: ["bio"] });
    const record = await services.repo.getAcquisition(gift.id);
    await services.repo.revokeApp(sender.user.id, record?.appId ?? "");
    await expect(claimAcquisition(recipient.user.id, gift.id)).rejects.toMatchObject({
      status: 409,
    });
    // Revoked acquisitions read their status LIVE from the backing connected app.
    const acqs = await listAcquisitions(recipient.user.id);
    expect(acqs.find((a) => a.id === gift.id)?.status).toBe("revoked");
  });

  it("resolves recipients by handle, handle.soul, and 0x address; unknown is a 404", async () => {
    const sender = await makeUser();
    const recipient = await makeUser("markethana");

    const byHandle = await sendSoul(sender.user.id, { to: "markethana", scope: ["bio"] });
    const byDotSoul = await sendSoul(sender.user.id, { to: "markethana.soul", scope: ["docs"] });
    const byAddress = await sendSoul(sender.user.id, {
      to: recipient.user.suiAddress,
      scope: ["social"],
    });
    for (const gift of [byHandle, byDotSoul, byAddress]) {
      expect(gift.kind).toBe("gift");
    }
    expect((await listAcquisitions(recipient.user.id)).length).toBeGreaterThanOrEqual(3);

    await expect(
      sendSoul(sender.user.id, { to: "nobody-here.soul", scope: ["bio"] })
    ).rejects.toMatchObject({ status: 404 });
    // Sending to yourself is refused.
    await expect(
      sendSoul(sender.user.id, { to: sender.user.suiAddress, scope: ["bio"] })
    ).rejects.toMatchObject({ status: 400 });
  });
});
