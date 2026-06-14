import { describe, expect, it } from "vitest";
import type { AcquisitionRecord, AppRecord, ListingRecord } from "../services/ports";
import { toConnectedApp, toSoulAcquisition, toSoulListing, toSoulSale } from "./dto";

describe("dto mappers", () => {
  it("toConnectedApp never leaks the delegate-key secret", () => {
    const record: AppRecord = {
      id: "app-1",
      userId: "user-1",
      delegatePublicKey: "abcd",
      delegateAddress: "0xdel",
      delegateSecretEnc: new Uint8Array([1, 2, 3]),
      label: "Claude",
      allowedNamespaces: ["bio"],
      status: "active",
      createdAt: "2026-06-05T00:00:00.000Z",
      revokedAt: null,
    };
    const dto = toConnectedApp(record);
    expect(dto).toEqual({
      id: "app-1",
      label: "Claude",
      allowedNamespaces: ["bio"],
      status: "active",
      createdAt: "2026-06-05T00:00:00.000Z",
      revokedAt: null,
    });
    expect("delegateSecretEnc" in dto).toBe(false);
    expect(JSON.stringify(dto)).not.toContain("delegateSecretEnc");
  });

  const acquisition: AcquisitionRecord = {
    id: "acq-1",
    kind: "gift",
    listingId: null,
    title: "A soul from alice.soul",
    buyerUserId: "user-2",
    sellerUserId: "user-1",
    appId: "app-1",
    scope: ["bio"],
    priceMist: "0",
    txDigest: null,
    claimed: false,
    delegateSecretEnc: new Uint8Array([9, 9, 9]),
    createdAt: "2026-06-10T00:00:00.000Z",
  };

  it("toSoulListing maps the record with seller identity + mine flag", () => {
    const record: ListingRecord = {
      id: "listing-1",
      sellerUserId: "user-1",
      title: "Full-stack engineer, 8y of repos",
      scope: ["bio", "social"],
      priceMist: "1000000000",
      status: "active",
      salesCount: 2,
      createdAt: "2026-06-10T00:00:00.000Z",
    };
    const dto = toSoulListing(record, { handle: "alice.soul", suiAddress: "0xalice" }, true);
    expect(dto).toEqual({
      id: "listing-1",
      sellerHandle: "alice.soul",
      sellerAddress: "0xalice",
      title: "Full-stack engineer, 8y of repos",
      scope: ["bio", "social"],
      priceMist: "1000000000",
      status: "active",
      salesCount: 2,
      mine: true,
      createdAt: "2026-06-10T00:00:00.000Z",
    });
    expect(JSON.stringify(dto)).not.toContain("sellerUserId");
  });

  it("toSoulAcquisition never leaks the stored gift secret", () => {
    const dto = toSoulAcquisition(acquisition, {
      sellerHandle: "alice.soul",
      sellerAddress: "0xalice",
      sellerAccountObjectId: "0xacct",
      status: "active",
      explorerUrl: null,
    });
    expect(dto.id).toBe("acq-1");
    expect(dto.kind).toBe("gift");
    expect(dto.sellerAccountObjectId).toBe("0xacct");
    expect(dto.claimed).toBe(false);
    expect("delegateSecretEnc" in dto).toBe(false);
    expect(JSON.stringify(dto)).not.toContain("delegateSecretEnc");
  });

  it("toSoulSale never leaks the stored gift secret", () => {
    const dto = toSoulSale(acquisition, {
      buyerHandle: "bob.soul",
      buyerAddress: "0xbob",
      status: "revoked",
    });
    expect(dto.acquisitionId).toBe("acq-1");
    expect(dto.appId).toBe("app-1");
    expect(dto.status).toBe("revoked");
    expect("delegateSecretEnc" in dto).toBe(false);
    expect(JSON.stringify(dto)).not.toContain("delegateSecretEnc");
  });
});
