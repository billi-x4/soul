"use client";

import { ExternalLink } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Eyebrow } from "@/components/pulse/eyebrow";
import { PulseLine } from "@/components/pulse/pulse-line";
import { AddressChip, DisclosureNote, StatusPill } from "@/components/soul";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { soulFetch } from "@/lib/api";

type VaultProof = { intact: boolean; verified: number; total: number; missing: string[] };
type Verify = {
  intact: boolean;
  verified: number;
  total: number;
  missing: string[];
  /** Zero-plaintext envelopes re-read from Walrus and hash-checked. */
  vault?: VaultProof;
};
type Restore = {
  restored: number;
  skipped: number;
  total: number;
  /** Private envelopes proven restorable from Walrus alone (passphrase decrypts them). */
  vault?: { restored: number; total: number };
};
type Ownership = { accountObjectId: string; ownerAddress: string; explorerUrl: string };

type Loading = "verify" | "restore" | "ownership" | null;

export default function PortabilityPage() {
  const [verify, setVerify] = useState<Verify | null>(null);
  const [restore, setRestore] = useState<Restore | null>(null);
  const [ownership, setOwnership] = useState<Ownership | null>(null);
  const [loading, setLoading] = useState<Loading>(null);

  async function run<T>(key: Loading, fn: () => Promise<T>, set: (v: T) => void, msg?: string) {
    if (loading) {
      return; // one portability op at a time — concurrent restores would race the index
    }
    setLoading(key);
    try {
      const r = await fn();
      set(r);
      if (msg) {
        toast.success(msg);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(null);
    }
  }
  const anyBusy = loading !== null;

  return (
    <div className="stagger mx-auto max-w-3xl space-y-8">
      <header className="animate-fade-up space-y-3" style={{ "--i": 0 } as React.CSSProperties}>
        <Eyebrow index="08" tone="pulse">
          Portability
        </Eyebrow>
        <h1 className="type-etched text-3xl sm:text-4xl">Proof you can leave.</h1>
        <p className="measure text-balance text-muted-foreground text-sm leading-relaxed">
          Three receipts that show your soul survives without us — verify it is intact, rebuild it
          from your own Walrus store, and prove the Sui account that owns it.
        </p>
      </header>

      <PulseLine className="animate-fade-up opacity-40" />

      {/* ---- 01 / VERIFY ------------------------------------------------ */}
      <Card className="animate-fade-up" style={{ "--i": 1 } as React.CSSProperties}>
        <CardHeader className="gap-2">
          <Eyebrow index="01" tone="smoke">
            Verify
          </Eyebrow>
          <CardTitle as="h2" className="text-lg tracking-tight">
            Integrity check
          </CardTitle>
          <CardDescription>
            Confirm every memory and document is accounted for in your store.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            className="rounded-full border-white/15"
            disabled={anyBusy}
            isLoading={loading === "verify"}
            onClick={() =>
              run("verify", () => soulFetch<Verify>("/api/portability/verify"), setVerify)
            }
            variant="outline"
          >
            Verify soul
          </Button>

          {verify ? (
            <div className="rounded-lg border border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-white/8 border-b px-4 py-2.5">
                <span className="font-mono text-[0.65rem] text-muted-foreground uppercase tracking-[0.18em]">
                  Receipt / verify
                </span>
                {verify.intact ? (
                  <span className="-rotate-3 shrink-0 rounded-sm border border-pulse/50 px-2 py-0.5 font-mono text-[0.65rem] text-pulse uppercase tracking-[0.2em]">
                    Intact
                  </span>
                ) : (
                  <StatusPill tone="warning">Issues found</StatusPill>
                )}
              </div>
              <dl className="divide-y divide-white/8 px-4">
                <ReceiptRow hint="items confirmed in your store" label="Verified">
                  {verify.verified} / {verify.total}
                </ReceiptRow>
                <ReceiptRow
                  hint={
                    verify.missing.length === 1 ? "item unaccounted for" : "items unaccounted for"
                  }
                  label="Missing"
                >
                  {verify.missing.length}
                </ReceiptRow>
                {verify.vault ? (
                  <ReceiptRow
                    hint="zero-plaintext envelopes re-read from Walrus, hash-checked"
                    label="Private vault"
                  >
                    {verify.vault.verified} / {verify.vault.total}
                  </ReceiptRow>
                ) : null}
                {verify.missing.length > 0 ? (
                  <div className="space-y-2 py-3">
                    <dt className="font-mono text-[0.68rem] text-muted-foreground uppercase tracking-[0.14em]">
                      Missing references
                    </dt>
                    <dd className="flex flex-wrap gap-2">
                      {verify.missing.map((id) => (
                        <AddressChip key={id} label="missing reference" value={id} />
                      ))}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ---- 02 / RESTORE ----------------------------------------------- */}
      <Card className="animate-fade-up" style={{ "--i": 2 } as React.CSSProperties}>
        <CardHeader className="gap-2">
          <Eyebrow index="02" tone="smoke">
            Restore
          </Eyebrow>
          <CardTitle as="h2" className="text-lg tracking-tight">
            Rebuild from Walrus
          </CardTitle>
          <CardDescription>
            Rebuild your soul&apos;s index from your owned Walrus store. The index here is just a
            cache: if it were wiped, this is how it comes back.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            className="rounded-full"
            disabled={anyBusy}
            isLoading={loading === "restore"}
            onClick={() =>
              run(
                "restore",
                () => soulFetch<Restore>("/api/portability/restore", { method: "POST", body: {} }),
                setRestore,
                "Restore complete"
              )
            }
          >
            Restore from Walrus
          </Button>

          {restore ? (
            <div className="rounded-lg border border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-white/8 border-b px-4 py-2.5">
                <span className="font-mono text-[0.65rem] text-muted-foreground uppercase tracking-[0.18em]">
                  Receipt / restore
                </span>
                <StatusPill tone={restore.skipped > 0 ? "info" : "success"}>
                  {restore.skipped > 0 ? "Restored with skips" : "Restored"}
                </StatusPill>
              </div>
              <dl className="divide-y divide-white/8 px-4">
                <ReceiptRow hint="items rebuilt from Walrus" label="Restored">
                  {restore.restored} / {restore.total}
                </ReceiptRow>
                <ReceiptRow hint="already present, left untouched" label="Skipped">
                  {restore.skipped}
                </ReceiptRow>
                {restore.vault ? (
                  <ReceiptRow
                    hint="private envelopes proven restorable — your passphrase alone decrypts them"
                    label="Private vault"
                  >
                    {restore.vault.restored} / {restore.vault.total}
                  </ReceiptRow>
                ) : null}
              </dl>
              <p className="border-white/8 border-t px-4 py-2.5 text-muted-foreground text-xs leading-relaxed">
                Restored memories are indexed asynchronously — recently rebuilt items can take a
                moment before they are searchable again.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ---- 03 / OWNERSHIP --------------------------------------------- */}
      <Card className="animate-fade-up" style={{ "--i": 3 } as React.CSSProperties}>
        <CardHeader className="gap-2">
          <Eyebrow index="03" tone="smoke">
            Ownership
          </Eyebrow>
          <CardTitle as="h2" className="text-lg tracking-tight">
            On-chain proof
          </CardTitle>
          <CardDescription>Your soul is owned by your on-chain Sui account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            className="rounded-full border-white/15"
            disabled={anyBusy}
            isLoading={loading === "ownership"}
            onClick={() =>
              run(
                "ownership",
                () => soulFetch<Ownership>("/api/portability/ownership"),
                setOwnership
              )
            }
            variant="outline"
          >
            Show ownership
          </Button>

          {ownership ? (
            <div className="rounded-lg border border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-white/8 border-b px-4 py-2.5">
                <span className="font-mono text-[0.65rem] text-muted-foreground uppercase tracking-[0.18em]">
                  Receipt / ownership
                </span>
                <Button asChild size="sm" variant="link">
                  <a href={ownership.explorerUrl} rel="noreferrer" target="_blank">
                    <ExternalLink aria-hidden className="size-3.5" />
                    View on explorer
                  </a>
                </Button>
              </div>
              <dl className="divide-y divide-white/8 px-4">
                <ReceiptRow hint="memwal::account on Sui" label="Account object">
                  <AddressChip
                    href={ownership.explorerUrl}
                    label="account object ID"
                    value={ownership.accountObjectId}
                  />
                </ReceiptRow>
                <ReceiptRow hint="your Sui address, via zkLogin" label="Owner address">
                  <AddressChip label="owner address" value={ownership.ownerAddress} />
                </ReceiptRow>
              </dl>
            </div>
          ) : null}

          <DisclosureNote title="Why this matters" tone="info">
            The account object lives on Sui and the encrypted data lives on Walrus, both independent
            of this app. This proves your soul is decentralized and can be reconstructed without us.
          </DisclosureNote>
        </CardContent>
      </Card>
    </div>
  );
}

/** One label→value line of a receipt — mono ledger voice, value right-aligned. */
function ReceiptRow({
  children,
  hint,
  label,
}: {
  children: ReactNode;
  hint?: string;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5 py-3">
      <dt className="font-mono text-[0.68rem] text-muted-foreground uppercase tracking-[0.14em]">
        {label}
        {hint ? (
          <span className="block font-sans text-[0.7rem] text-muted-foreground normal-case tracking-normal">
            {hint}
          </span>
        ) : null}
      </dt>
      <dd className="tabular font-mono text-foreground text-sm">{children}</dd>
    </div>
  );
}
