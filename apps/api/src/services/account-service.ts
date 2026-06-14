/*
 * Account provisioning (US1, FR-002/005) + primary delegate-key access.
 *
 * Idempotent: exactly one MemWalAccount per user. On first provision we create the on-chain
 * account, mint Soul's OWN primary delegate key (used for the owner's web-UI memory ops), add it
 * on-chain, and store it encrypted-at-rest (Principle IX). The owner's address is the identity;
 * connected external apps get their own delegate keys via the permissions flow.
 */
import { decryptSecretString, encryptSecret } from "../pkg/crypto/at-rest";
import { ConflictError } from "../pkg/errors/error";
import { services } from "./container";
import type { AccountRecord, UserRecord } from "./ports";

export async function ensureUserAndAccount(
  suiAddress: string,
  provider?: string
): Promise<{ user: UserRecord; account: AccountRecord; created: boolean }> {
  const { repo, chain } = services;
  let user = await repo.getUserBySuiAddress(suiAddress);
  if (!user) {
    try {
      user = await repo.createUser({ suiAddress, authProvider: provider });
    } catch (e) {
      // Concurrent first logins race on the users.sui_address UNIQUE constraint; the loser
      // adopts the row the winner created instead of surfacing a 500.
      user = await repo.getUserBySuiAddress(suiAddress);
      if (!user) {
        throw e;
      }
    }
  }

  // Backfill the sign-in provider for users created before it was recorded (or any time it's missing).
  if (provider && !user.authProvider) {
    await repo.setAuthProvider(user.id, provider);
    user.authProvider = provider;
  }

  const existing = await repo.getAccountByUserId(user.id);
  if (existing) {
    return { user, account: existing, created: false };
  }

  const { accountObjectId } = await chain.createAccount(suiAddress);
  const dk = await chain.generateDelegateKey();
  await chain.addDelegateKey({
    accountObjectId,
    publicKey: dk.publicKey,
    delegateAddress: dk.address,
    label: "soul-web",
    ownerAddress: suiAddress,
  });
  let account: AccountRecord;
  try {
    account = await repo.createAccount({
      userId: user.id,
      accountObjectId,
      ownerAddress: suiAddress,
      active: true,
      primaryDelegatePublicKey: Buffer.from(dk.publicKey).toString("hex"),
      primaryDelegateSecretEnc: encryptSecret(dk.privateKeyHex),
    });
  } catch (e) {
    // Concurrent first logins race on the memwal_accounts.user_id UNIQUE constraint; the loser
    // keeps the winner's row so the user ends up with exactly ONE account. (The losing on-chain
    // account object becomes an orphan — acceptable; on-chain state is owner-scoped.)
    const winner = await repo.getAccountByUserId(user.id);
    if (!winner) {
      throw e;
    }
    return { user, account: winner, created: false };
  }
  await repo.ensureNamespaces(user.id);
  return { user, account, created: true };
}

export async function getAccountOrThrow(userId: string): Promise<AccountRecord> {
  const account = await services.repo.getAccountByUserId(userId);
  if (!account) {
    // 409 with a actionable message — not a raw 500 — when provisioning hasn't happened yet.
    throw new ConflictError("Your Soul account is not provisioned yet; sign in again to set it up.");
  }
  return account;
}

/** Decrypt Soul's primary delegate key (hex) for the owner's own memory operations. Never logged. */
export function primaryDelegateKeyHex(account: AccountRecord): string {
  if (!account.primaryDelegateSecretEnc) {
    throw new Error("No primary delegate key for account");
  }
  return decryptSecretString(Buffer.from(account.primaryDelegateSecretEnc));
}
