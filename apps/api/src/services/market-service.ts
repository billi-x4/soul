/*
 * Marketplace service. What is sold or sent is ACCESS — a scoped, revocable delegate key on the
 * seller's `memwal::account` — never the memory bytes (CLAUDE.md decisions #3/#5). Payment is a
 * SUI transfer through the ChainService port (deterministic mock digest in dev; real sponsored
 * PTB in live mode). Key custody reuses grantApp + the at-rest crypto: purchase secrets are shown
 * ONCE and never stored; gift secrets are stored encrypted until the one-time claim, then wiped.
 */
import {
  MAX_CONNECTED_APPS,
  type Namespace,
  type SoulAcquisition,
  type SoulListing,
  type SoulSale,
} from "@soul/shared";
import { logger } from "@soul/logs";
import { config } from "../pkg/config";
import { decryptSecretString, encryptSecret } from "../pkg/crypto/at-rest";
import { toSoulAcquisition, toSoulListing, toSoulSale } from "../pkg/dto";
import { BadRequestError, ConflictError, NotFoundError } from "../pkg/errors/error";
import { getAccountOrThrow } from "./account-service";
import { services } from "./container";
import { grantApp, revokeConnectedApp } from "./permissions-service";
import type { AcquisitionRecord, AppRecord, UserRecord } from "./ports";

const DOT_SOUL_SUFFIX = /\.soul$/;

const shortAddr = (a: string) => `${a.slice(0, 10)}…`;
/** Rendered Soul handle (`<username>.soul`), or null until claimed. */
const handleOf = (u: UserRecord | null): string | null =>
  u?.username ? `${u.username}.soul` : null;
const txExplorerUrl = (digest: string | null | undefined): string | null =>
  digest ? `https://suiscan.xyz/${config.network}/tx/${digest}` : null;

async function getUserOrThrow(userId: string): Promise<UserRecord> {
  const user = await services.repo.getUserById(userId);
  if (!user) {
    throw new NotFoundError("User not found");
  }
  return user;
}

/** Live delegate-key state backing an acquisition; a missing app reads as revoked (honest). */
async function appStatus(a: AcquisitionRecord): Promise<AppRecord["status"]> {
  const app = await services.repo.getConnectedApp(a.sellerUserId, a.appId);
  return app?.status ?? "revoked";
}

// ---------- listings ----------

export async function createListing(
  userId: string,
  input: { title: string; scope: Namespace[]; priceMist: string }
): Promise<SoulListing> {
  const seller = await getUserOrThrow(userId);
  const listing = await services.repo.createListing({
    sellerUserId: userId,
    title: input.title,
    scope: input.scope,
    priceMist: input.priceMist,
  });
  await services.repo.addAudit({
    userId,
    action: "list",
    target: listing.id,
    metadata: { title: listing.title, scope: listing.scope, priceMist: listing.priceMist },
  });
  return toSoulListing(listing, { handle: handleOf(seller), suiAddress: seller.suiAddress }, true);
}

export async function browseListings(userId: string): Promise<SoulListing[]> {
  const listings = await services.repo.listActiveListings();
  return Promise.all(
    listings.map(async (l) => {
      const seller = await services.repo.getUserById(l.sellerUserId);
      return toSoulListing(
        l,
        { handle: handleOf(seller), suiAddress: seller?.suiAddress ?? "" },
        l.sellerUserId === userId
      );
    })
  );
}

export async function myListings(userId: string): Promise<SoulListing[]> {
  const me = await getUserOrThrow(userId);
  const listings = await services.repo.listListingsByUser(userId);
  return listings.map((l) =>
    toSoulListing(l, { handle: handleOf(me), suiAddress: me.suiAddress }, true)
  );
}

export async function cancelListing(userId: string, listingId: string): Promise<SoulListing> {
  const listing = await services.repo.getListing(listingId);
  if (!listing || listing.sellerUserId !== userId) {
    throw new NotFoundError("Listing not found");
  }
  if (listing.status !== "cancelled") {
    await services.repo.setListingStatus(listingId, "cancelled");
    // Already-sold delegate keys are untouched: cancelling only stops NEW purchases.
    await services.repo.addAudit({
      userId,
      action: "unlist",
      target: listingId,
      metadata: { title: listing.title },
    });
  }
  const seller = await getUserOrThrow(userId);
  return toSoulListing(
    { ...listing, status: "cancelled" },
    { handle: handleOf(seller), suiAddress: seller.suiAddress },
    true
  );
}

// ---------- buy ----------

export async function buyListing(
  buyerUserId: string,
  listingId: string
): Promise<{
  acquisition: SoulAcquisition;
  sellerAccountObjectId: string;
  /** Shown ONCE in the buy response; never stored for purchases. */
  delegatePrivateKeyHex: string;
}> {
  const listing = await services.repo.getListing(listingId);
  if (!listing) {
    throw new NotFoundError("Listing not found");
  }
  if (listing.status !== "active") {
    throw new ConflictError("This listing has been cancelled and can no longer be purchased.");
  }
  if (listing.sellerUserId === buyerUserId) {
    throw new BadRequestError("You already own this soul — it is yours to grant, not to buy.");
  }
  const [buyer, seller] = await Promise.all([
    getUserOrThrow(buyerUserId),
    getUserOrThrow(listing.sellerUserId),
  ]);
  const sellerAccount = await services.repo.getAccountByUserId(listing.sellerUserId);
  if (!sellerAccount) {
    throw new ConflictError("The seller's Soul account is not provisioned yet.");
  }
  if (!sellerAccount.active) {
    throw new ConflictError(
      "The seller's soul is frozen — all access is paused until they unfreeze it, so it cannot be purchased right now."
    );
  }
  if ((await services.repo.countActiveApps(listing.sellerUserId)) >= MAX_CONNECTED_APPS) {
    throw new ConflictError(
      `The seller's account is at its ${MAX_CONNECTED_APPS}-key cap; they must revoke a key before more access can be sold.`
    );
  }

  // Payment first (SUI transfer buyer → seller), then mint the scoped delegate key.
  const { digest } = await services.chain.transferSui({
    fromAddress: buyer.suiAddress,
    toAddress: seller.suiAddress,
    amountMist: listing.priceMist,
  });

  // Everything after payment is fallible (cap races, on-chain add_delegate_key, persistence).
  // If any of it fails, compensate: refund the transfer best-effort, then surface an honest
  // error — the buyer must never end up charged with no key.
  const buyerName = handleOf(buyer) ?? shortAddr(buyer.suiAddress);
  let app: AppRecord | null = null;
  let delegatePrivateKeyHex: string;
  let acquisition: AcquisitionRecord;
  try {
    // Cross-user grant: the key is minted ON THE SELLER's account (explicit seller identity).
    ({ app, delegatePrivateKeyHex } = await grantApp({
      userId: listing.sellerUserId,
      account: sellerAccount,
      label: `license:${buyerName}`,
      allowedNamespaces: listing.scope,
    }));

    // Purchase secrets are revealed once in this response and NEVER stored (claimed=true).
    acquisition = await services.repo.createAcquisition({
      kind: "purchase",
      listingId: listing.id,
      title: listing.title,
      buyerUserId,
      sellerUserId: listing.sellerUserId,
      appId: app.id,
      scope: listing.scope,
      priceMist: listing.priceMist,
      txDigest: digest,
      claimed: true,
      delegateSecretEnc: null,
    });
  } catch (e) {
    // If the key was already minted on-chain, revoke it — otherwise it sits as an orphaned
    // ACTIVE grant on the seller's account, eating one of their key slots.
    if (app) {
      try {
        await revokeConnectedApp(listing.sellerUserId, sellerAccount, app.id);
      } catch (revokeErr) {
        logger.error(
          { appId: app.id, message: (revokeErr as Error).message },
          "Orphaned purchase key could not be revoked after a failed purchase"
        );
      }
    }
    let refunded = false;
    try {
      await services.chain.transferSui({
        fromAddress: seller.suiAddress,
        toAddress: buyer.suiAddress,
        amountMist: listing.priceMist,
      });
      refunded = true;
    } catch (refundErr) {
      // Never log secrets; digests and ids are public on-chain data.
      logger.error(
        { listingId: listing.id, paymentDigest: digest, message: (refundErr as Error).message },
        "Purchase refund failed after key grant error — manual reconciliation needed"
      );
    }
    throw new ConflictError(
      refunded
        ? `The purchase could not be completed (${(e as Error).message}) — your payment was refunded.`
        : `The purchase could not be completed (${(e as Error).message}) and the automatic refund also failed; contact support with payment digest ${digest}.`
    );
  }

  // From here the buyer HAS paid and the acquisition is persisted: the response below carries
  // the never-stored one-time key, so bookkeeping must not be able to destroy it. Best-effort.
  try {
    await services.repo.incrementListingSales(listing.id);
    const sellerName = handleOf(seller) ?? shortAddr(seller.suiAddress);
    await services.repo.addAudit({
      userId: listing.sellerUserId,
      action: "purchase",
      target: listing.id,
      metadata: { role: "seller", buyer: buyerName, priceMist: listing.priceMist, digest },
    });
    await services.repo.addAudit({
      userId: buyerUserId,
      action: "purchase",
      target: listing.id,
      metadata: { role: "buyer", seller: sellerName, priceMist: listing.priceMist, digest },
    });
  } catch (bookkeepingErr) {
    logger.error(
      { listingId: listing.id, acquisitionId: acquisition.id, message: (bookkeepingErr as Error).message },
      "Purchase bookkeeping failed after the acquisition was persisted (sale counted/audited late)"
    );
  }

  return {
    acquisition: toSoulAcquisition(acquisition, {
      sellerHandle: handleOf(seller),
      sellerAddress: seller.suiAddress,
      sellerAccountObjectId: sellerAccount.accountObjectId,
      status: app.status,
      explorerUrl: txExplorerUrl(digest),
    }),
    sellerAccountObjectId: sellerAccount.accountObjectId,
    delegatePrivateKeyHex,
  };
}

// ---------- send (gift) ----------

/** Resolve `handle`, `handle.soul`, or `0x…` to a user. */
async function resolveRecipient(to: string): Promise<UserRecord> {
  const raw = to.trim();
  const recipient = raw.startsWith("0x")
    ? await services.repo.getUserBySuiAddress(raw)
    : await services.repo.getUserByUsername(raw.toLowerCase().replace(DOT_SOUL_SUFFIX, ""));
  if (!recipient) {
    throw new NotFoundError("No Soul lives at that handle or address.");
  }
  return recipient;
}

export async function sendSoul(
  senderUserId: string,
  input: { to: string; scope: Namespace[]; title?: string }
): Promise<SoulAcquisition> {
  const recipient = await resolveRecipient(input.to);
  if (recipient.id === senderUserId) {
    throw new BadRequestError("You already own this soul — you cannot send it to yourself.");
  }
  const sender = await getUserOrThrow(senderUserId);
  const senderAccount = await getAccountOrThrow(senderUserId);
  if (!senderAccount.active) {
    throw new ConflictError("Your soul is frozen; unfreeze it before sending access.");
  }
  if ((await services.repo.countActiveApps(senderUserId)) >= MAX_CONNECTED_APPS) {
    throw new ConflictError(
      `Connected-tool limit (${MAX_CONNECTED_APPS}) reached; revoke one before sending more access.`
    );
  }

  const recipientName = handleOf(recipient) ?? shortAddr(recipient.suiAddress);
  const senderName = handleOf(sender) ?? shortAddr(sender.suiAddress);
  const { app, delegatePrivateKeyHex } = await grantApp({
    userId: senderUserId,
    account: senderAccount,
    label: `gift:${recipientName}`,
    allowedNamespaces: input.scope,
  });

  // The gift secret is stored ENCRYPTED at rest until the recipient's one-time claim (Principle IX).
  const acquisition = await services.repo.createAcquisition({
    kind: "gift",
    listingId: null,
    title: input.title?.trim() || `A soul from ${senderName}`,
    buyerUserId: recipient.id,
    sellerUserId: senderUserId,
    appId: app.id,
    scope: input.scope,
    priceMist: "0",
    txDigest: null,
    claimed: false,
    delegateSecretEnc: encryptSecret(delegatePrivateKeyHex),
  });

  await services.repo.addAudit({
    userId: senderUserId,
    action: "gift",
    target: acquisition.id,
    metadata: { role: "sender", to: recipientName, scope: input.scope },
  });
  await services.repo.addAudit({
    userId: recipient.id,
    action: "gift",
    target: acquisition.id,
    metadata: { role: "recipient", from: senderName, scope: input.scope },
  });

  return toSoulAcquisition(acquisition, {
    sellerHandle: handleOf(sender),
    sellerAddress: sender.suiAddress,
    sellerAccountObjectId: senderAccount.accountObjectId,
    status: app.status,
    explorerUrl: null,
  });
}

// ---------- acquisitions (the buyer/recipient's side) ----------

export async function listAcquisitions(userId: string): Promise<SoulAcquisition[]> {
  const records = await services.repo.listAcquisitionsByBuyer(userId);
  return Promise.all(
    records.map(async (a) => {
      const [seller, sellerAccount, status] = await Promise.all([
        services.repo.getUserById(a.sellerUserId),
        services.repo.getAccountByUserId(a.sellerUserId),
        appStatus(a),
      ]);
      return toSoulAcquisition(a, {
        sellerHandle: handleOf(seller),
        sellerAddress: seller?.suiAddress ?? "",
        sellerAccountObjectId: sellerAccount?.accountObjectId ?? "",
        status,
        explorerUrl: txExplorerUrl(a.txDigest),
      });
    })
  );
}

async function getOwnedAcquisitionOrThrow(
  userId: string,
  acquisitionId: string
): Promise<AcquisitionRecord> {
  const acq = await services.repo.getAcquisition(acquisitionId);
  if (!acq || acq.buyerUserId !== userId) {
    throw new NotFoundError("Acquisition not found");
  }
  return acq;
}

/**
 * One-time reveal for gifts: decrypt the stored secret, wipe it + mark claimed, and hand the
 * caller what it needs to build the MCP config. 409 on re-claim or after the key was revoked.
 */
export async function claimAcquisition(
  userId: string,
  acquisitionId: string
): Promise<{ sellerAccountObjectId: string; delegatePrivateKeyHex: string }> {
  const acq = await getOwnedAcquisitionOrThrow(userId, acquisitionId);
  if (acq.claimed || !acq.delegateSecretEnc || acq.delegateSecretEnc.length === 0) {
    throw new ConflictError(
      "The key was already revealed once — ask the sender to send again if it was lost."
    );
  }
  if ((await appStatus(acq)) !== "active") {
    throw new ConflictError(
      "This access was revoked by the sender; the key can no longer be claimed."
    );
  }
  const sellerAccount = await services.repo.getAccountByUserId(acq.sellerUserId);
  if (!sellerAccount) {
    throw new ConflictError("The sender's Soul account no longer exists.");
  }
  // Copy the ciphertext BEFORE winning the claim — the claim wipes the stored secret (and the
  // in-memory repo shares this very record instance). Then win the claim atomically: two
  // concurrent claims both pass the checks above, but only one gets `won` — the secret is
  // revealed exactly once (Principle IX).
  const secretEnc = Buffer.from(acq.delegateSecretEnc);
  const won = await services.repo.claimAcquisition(acq.id);
  if (!won) {
    throw new ConflictError(
      "The key was already revealed once — ask the sender to send again if it was lost."
    );
  }
  const delegatePrivateKeyHex = decryptSecretString(secretEnc);
  return { sellerAccountObjectId: sellerAccount.accountObjectId, delegatePrivateKeyHex };
}

/** Template-config context (no secret — same honesty pattern as routes/mcp.ts). */
export async function acquisitionConfigContext(
  userId: string,
  acquisitionId: string
): Promise<{ sellerAccountObjectId: string }> {
  const acq = await getOwnedAcquisitionOrThrow(userId, acquisitionId);
  if ((await appStatus(acq)) !== "active") {
    throw new BadRequestError("This soul's access has been revoked");
  }
  const sellerAccount = await services.repo.getAccountByUserId(acq.sellerUserId);
  if (!sellerAccount) {
    throw new NotFoundError("The seller's Soul account no longer exists.");
  }
  return { sellerAccountObjectId: sellerAccount.accountObjectId };
}

// ---------- sales (the seller's side) ----------

export async function listSales(userId: string): Promise<SoulSale[]> {
  const records = await services.repo.listAcquisitionsBySeller(userId);
  return Promise.all(
    records.map(async (a) => {
      const [buyer, status] = await Promise.all([
        services.repo.getUserById(a.buyerUserId),
        appStatus(a),
      ]);
      return toSoulSale(a, {
        buyerHandle: handleOf(buyer),
        buyerAddress: buyer?.suiAddress ?? "",
        status,
      });
    })
  );
}
