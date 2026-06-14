/*
 * Permissions service (US4, FR-022..028). Mint/grant/revoke delegate keys + freeze, with custody
 * (encrypt at rest, drop on revoke) and audit. The on-chain cap is MAX_DELEGATE_KEYS (20), but one
 * slot is held by Soul's own primary web key, so apps cap out at MAX_CONNECTED_APPS (19). The
 * delegate private key is returned ONCE from grantApp for client setup, then never retrievable.
 */
import { MAX_CONNECTED_APPS, MAX_DELEGATE_KEYS, type Namespace } from "@soul/shared";
import { encryptSecret } from "../pkg/crypto/at-rest";
import { ConflictError, NotFoundError } from "../pkg/errors/error";
import { services } from "./container";
import type { AccountRecord, AppRecord } from "./ports";

export async function grantApp(args: {
  userId: string;
  account: AccountRecord;
  label: string;
  allowedNamespaces: Namespace[];
}): Promise<{ app: AppRecord; delegatePrivateKeyHex: string }> {
  const { userId, account, label, allowedNamespaces } = args;
  // MAX_CONNECTED_APPS, not MAX_DELEGATE_KEYS: the primary soul-web key occupies one of the 20
  // on-chain slots, so granting the 20th app would fail on-chain AFTER side effects (payment).
  if ((await services.repo.countActiveApps(userId)) >= MAX_CONNECTED_APPS) {
    throw new ConflictError(
      `Connected-tool limit (${MAX_CONNECTED_APPS} of ${MAX_DELEGATE_KEYS} on-chain key slots; one is Soul's own web key) reached; revoke one first.`
    );
  }
  const dk = await services.chain.generateDelegateKey();
  await services.chain.addDelegateKey({
    accountObjectId: account.accountObjectId,
    publicKey: dk.publicKey,
    delegateAddress: dk.address,
    label,
    ownerAddress: account.ownerAddress,
  });
  const app = await services.repo.createConnectedApp({
    userId,
    delegatePublicKey: Buffer.from(dk.publicKey).toString("hex"),
    delegateAddress: dk.address,
    delegateSecretEnc: encryptSecret(dk.privateKeyHex),
    label,
    allowedNamespaces,
  });
  await services.repo.addAudit({
    userId,
    action: "grant",
    target: app.id,
    metadata: { label, allowedNamespaces },
  });
  return { app, delegatePrivateKeyHex: dk.privateKeyHex };
}

export async function revokeConnectedApp(
  userId: string,
  account: AccountRecord,
  appId: string
): Promise<void> {
  const app = await services.repo.getConnectedApp(userId, appId);
  if (!app) {
    throw new NotFoundError("Connected app not found");
  }
  const publicKey = Uint8Array.from(Buffer.from(app.delegatePublicKey, "hex"));
  await services.chain.removeDelegateKey({
    accountObjectId: account.accountObjectId,
    publicKey,
    ownerAddress: account.ownerAddress,
  });
  await services.repo.revokeApp(userId, appId);
  // A revoked key's stored gift secret (unclaimed sends) is dead weight — wipe it too
  // (Principle IX: encrypted at rest, dropped on revoke).
  await services.repo.wipeAcquisitionSecretsForApp(appId);
  await services.repo.addAudit({ userId, action: "revoke", target: appId });
}

export async function setFreeze(
  userId: string,
  account: AccountRecord,
  active: boolean
): Promise<void> {
  await services.chain.setAccountActive({
    accountObjectId: account.accountObjectId,
    active,
    ownerAddress: account.ownerAddress,
  });
  await services.repo.setAccountActive(userId, active);
  await services.repo.addAudit({
    userId,
    action: active ? "unfreeze" : "freeze",
    target: account.accountObjectId,
  });
}
