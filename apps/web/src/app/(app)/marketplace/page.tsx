"use client";

import {
  MAX_CONNECTED_APPS,
  MIST_PER_SUI,
  type Namespace,
  type SoulAcquisition,
  type SoulListing,
  type SoulSale,
} from "@soul/shared";
import { Gift, KeyRound, Send, Store, Tag } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, type FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Eyebrow } from "@/components/pulse/eyebrow";
import { PulseDot } from "@/components/pulse/pulse-line";
import {
  AddressChip,
  CopyConfigButton,
  DisclosureNote,
  EmptyState,
  HostedBlock,
  type McpConfig as Mcp,
  NamespaceBadge,
  RawJsonCollapsible,
  ScopePills,
  ShownOnceDialog,
  SoulMark,
  StatusPill,
  toggleNamespace,
  ToolPills,
} from "@/components/soul";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { soulFetch } from "@/lib/api";
import { fetchProfile, soulHandle } from "@/lib/auth";

/* ------------------------------------------------------------------ types */

type MarketStatus = { live: boolean; network: string };

type Loadable<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

/** Shown-once reveal (purchase response or gift claim) — never retrievable again. */
type Reveal = { mcp: Mcp; sellerLabel: string; title: string };

/** Honest template view for already-claimed acquisitions — no secret inside. */
type TemplateView = { mcp: Mcp; sellerLabel: string; title: string };

/* ---------------------------------------------------------------- helpers */

function fade(i: number): CSSProperties {
  return { "--i": i } as CSSProperties;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Display a market participant: `name.soul` when a handle exists, short address otherwise. */
function displayHandle(handle: string | null, address: string) {
  if (handle) {
    return handle.endsWith(".soul") ? handle : `${handle}.soul`;
  }
  return shortAddr(address);
}

/**
 * MIST string → human SUI, up to 4 decimals — BigInt math so a hostile/huge listing price can
 * never render as a misleading "0" (Number overflows to Infinity past ~1.8e308).
 */
function formatSui(mist: string): string {
  let value: bigint;
  try {
    value = BigInt(mist);
  } catch {
    return "0";
  }
  const per = BigInt(MIST_PER_SUI);
  // A nonzero price must never display as "0" — "Buy for 0 SUI" would misrepresent the charge.
  if (value > 0n && value < 100_000n) {
    return "<0.0001";
  }
  const whole = value / per;
  // 4 displayed decimals = the first 4 digits of the 9-digit MIST fraction, rounded down.
  const frac = ((value % per) / 100_000n).toString().padStart(4, "0").replace(/0+$/, "");
  const wholeStr = whole.toLocaleString("en-US");
  return frac ? `${wholeStr}.${frac}` : wholeStr;
}

const SUI_DECIMAL = /^\d+(\.\d+)?$/;

/** Parse a SUI decimal string to a MIST string without float drift. Null = invalid or ≤ 0. */
function suiToMist(input: string): string | null {
  const trimmed = input.trim();
  if (!SUI_DECIMAL.test(trimmed)) {
    return null;
  }
  const [whole = "0", frac = ""] = trimmed.split(".");
  if (frac.length > 9) {
    return null; // finer than MIST
  }
  const mist = BigInt(whole) * BigInt(MIST_PER_SUI) + BigInt(frac.padEnd(9, "0") || "0");
  if (mist <= 0n) {
    return null;
  }
  return mist.toString();
}

/* ------------------------------------------------------------- primitives */

/** Pill tab trigger — same grammar as the Builder's source tabs. */
const PILL_TAB =
  "h-auto rounded-full border border-white/10 px-3.5 py-2 text-muted-foreground data-[state=active]:border-white/30 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-none [&[data-state=active]_svg]:text-pulse-soft";

const MARKET_TABS = [
  { value: "browse", label: "Browse", Icon: Store },
  { value: "mine", label: "My listings", Icon: Tag },
  { value: "acquired", label: "Acquired", Icon: Gift },
  { value: "send", label: "Send", Icon: Send },
] as const;

const SKELETON_KEYS = ["one", "two", "three"] as const;

function CardGridSkeleton() {
  return (
    <div aria-hidden className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {SKELETON_KEYS.map((k) => (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-card p-5" key={k}>
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-7 w-24" />
        </div>
      ))}
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div aria-hidden className="space-y-5">
      {SKELETON_KEYS.map((k) => (
        <div className="flex items-center justify-between gap-4" key={k}>
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Per-tab error degradation — the rest of the market keeps working. */
function TabError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <DisclosureNote title="Couldn't load this section" tone="warning">
      {message} —{" "}
      <button
        className="underline underline-offset-2 transition-colors hover:text-foreground"
        onClick={onRetry}
        type="button"
      >
        try again
      </button>
      .
    </DisclosureNote>
  );
}

/** PAID (gold, with price) vs GIFT (mono) — gold is reserved for value. */
function KindTag({ kind, priceMist }: { kind: "purchase" | "gift"; priceMist: string }) {
  if (kind === "purchase") {
    return (
      <span className="font-mono text-[0.65rem] text-gold uppercase tracking-[0.14em]">
        paid · {formatSui(priceMist)} SUI
      </span>
    );
  }
  return (
    <span className="font-mono text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
      gift
    </span>
  );
}

/* ------------------------------------------------------------------ page */

export default function MarketplacePage() {
  const [tab, setTab] = useState("browse");
  const [me, setMe] = useState<{ handle: string } | null>(null);

  const [market, setMarket] = useState<Loadable<MarketStatus>>({ status: "loading" });
  const [browse, setBrowse] = useState<Loadable<SoulListing[]>>({ status: "loading" });
  const [mine, setMine] = useState<Loadable<SoulListing[]>>({ status: "loading" });
  const [sales, setSales] = useState<Loadable<SoulSale[]>>({ status: "loading" });
  const [acquired, setAcquired] = useState<Loadable<SoulAcquisition[]>>({ status: "loading" });

  // create-listing form
  const [listTitle, setListTitle] = useState("");
  const [listScope, setListScope] = useState<Namespace[]>(["bio"]);
  const [listPrice, setListPrice] = useState("");
  const [creating, setCreating] = useState(false);

  // send form
  const [sendTo, setSendTo] = useState("");
  const [sendScope, setSendScope] = useState<Namespace[]>(["bio"]);
  const [sendTitle, setSendTitle] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ recipient: string } | null>(null);

  // per-row busy markers + dialogs
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [configId, setConfigId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [template, setTemplate] = useState<TemplateView | null>(null);

  /* ------------------------------------------------------------- loaders */

  const loadStatus = useCallback(async () => {
    try {
      const r = await soulFetch<MarketStatus>("/api/market/status");
      setMarket({ status: "ready", data: r });
    } catch (e) {
      setMarket({ status: "error", message: (e as Error).message });
    }
  }, []);

  const loadBrowse = useCallback(async () => {
    try {
      const r = await soulFetch<{ listings: SoulListing[] }>("/api/market/listings");
      setBrowse({ status: "ready", data: r.listings });
    } catch (e) {
      setBrowse({ status: "error", message: (e as Error).message });
    }
  }, []);

  const loadMine = useCallback(async () => {
    try {
      const r = await soulFetch<{ listings: SoulListing[] }>("/api/market/listings/mine");
      setMine({ status: "ready", data: r.listings });
    } catch (e) {
      setMine({ status: "error", message: (e as Error).message });
    }
  }, []);

  const loadSales = useCallback(async () => {
    try {
      const r = await soulFetch<{ sales: SoulSale[] }>("/api/market/sales");
      setSales({ status: "ready", data: r.sales });
    } catch (e) {
      setSales({ status: "error", message: (e as Error).message });
    }
  }, []);

  const loadAcquired = useCallback(async () => {
    try {
      const r = await soulFetch<{ acquisitions: SoulAcquisition[] }>("/api/market/acquisitions");
      setAcquired({ status: "ready", data: r.acquisitions });
    } catch (e) {
      setAcquired({ status: "error", message: (e as Error).message });
    }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const p = await fetchProfile();
      setMe({ handle: soulHandle({ username: p.username, suiAddress: p.suiAddress }) });
    } catch {
      /* non-blocking — the market works without the handle */
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadProfile();
    loadBrowse();
    loadMine();
    loadSales();
    loadAcquired();
  }, [loadStatus, loadProfile, loadBrowse, loadMine, loadSales, loadAcquired]);

  /* ----------------------------------------------------------- mutations */

  async function buy(listing: SoulListing) {
    if (buyingId) {
      return; // one purchase at a time — a double-fire must not double-charge
    }
    setBuyingId(listing.id);
    try {
      const r = await soulFetch<{ acquisition: SoulAcquisition; mcp: Mcp }>(
        `/api/market/listings/${listing.id}/buy`,
        { method: "POST" }
      );
      setReveal({
        mcp: r.mcp,
        sellerLabel: displayHandle(listing.sellerHandle, listing.sellerAddress),
        title: listing.title,
      });
      loadBrowse();
      loadAcquired();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBuyingId(null);
    }
  }

  const createListing = (e: FormEvent) => {
    e.preventDefault();
    (async () => {
      if (!listTitle.trim()) {
        toast.error("Give your listing a title");
        return;
      }
      if (listScope.length === 0) {
        toast.error("Select at least one area");
        return;
      }
      const priceMist = suiToMist(listPrice);
      if (!priceMist) {
        toast.error("Enter a price above 0 SUI — up to 9 decimal places");
        return;
      }
      setCreating(true);
      try {
        await soulFetch("/api/market/listings", {
          method: "POST",
          body: { title: listTitle.trim(), scope: listScope, priceMist },
        });
        setListTitle("");
        setListPrice("");
        toast.success("Listed — your soul is on the market");
        loadMine();
        loadBrowse();
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setCreating(false);
      }
    })();
  };

  async function cancelListing(id: string) {
    try {
      await soulFetch(`/api/market/listings/${id}`, { method: "DELETE" });
      toast.success("Listing cancelled — keys already sold are unaffected");
      loadMine();
      loadBrowse();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function claim(a: SoulAcquisition) {
    if (claimingId) {
      return; // the reveal is one-time — never let a double-click race the claim
    }
    setClaimingId(a.id);
    try {
      const r = await soulFetch<{ mcp: Mcp }>(`/api/market/acquisitions/${a.id}/claim`, {
        method: "POST",
      });
      setReveal({
        mcp: r.mcp,
        sellerLabel: displayHandle(a.sellerHandle, a.sellerAddress),
        title: a.title,
      });
      loadAcquired();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setClaimingId(null);
    }
  }

  async function viewConfig(a: SoulAcquisition) {
    setConfigId(a.id);
    try {
      const r = await soulFetch<{ mcp: Mcp }>(`/api/market/acquisitions/${a.id}/config`);
      setTemplate({
        mcp: r.mcp,
        sellerLabel: displayHandle(a.sellerHandle, a.sellerAddress),
        title: a.title,
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConfigId(null);
    }
  }

  const submitSend = (e: FormEvent) => {
    e.preventDefault();
    (async () => {
      const to = sendTo.trim();
      if (!to) {
        toast.error("Enter a recipient — handle, handle.soul, or 0x address");
        return;
      }
      if (sendScope.length === 0) {
        toast.error("Select at least one area");
        return;
      }
      setSending(true);
      setSent(null);
      try {
        const body: { to: string; scope: Namespace[]; title?: string } = { to, scope: sendScope };
        if (sendTitle.trim()) {
          body.title = sendTitle.trim();
        }
        await soulFetch("/api/market/send", { method: "POST", body });
        setSent({ recipient: to });
        setSendTo("");
        setSendTitle("");
        loadSales();
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setSending(false);
      }
    })();
  };

  const devMode = market.status === "ready" && !market.data.live;

  /* -------------------------------------------------------------- render */

  return (
    <div className="stagger space-y-8">
      {/* ---------------- header ---------------- */}
      <header className="animate-fade-up space-y-4" style={fade(0)}>
        <Eyebrow index="06" tone="pulse">
          Marketplace
        </Eyebrow>
        <h1 className="type-etched text-3xl sm:text-4xl">Your soul has a price. You set it.</h1>
        <p className="measure text-muted-foreground">
          Sell or send scoped, revocable access to your soul. What changes hands is a delegate key
          on the owner's account — read-only recall over the areas they chose — never the memory
          itself. Revoking the key on-chain kills access for real.
        </p>
        {market.status === "ready" ? (
          market.data.live ? (
            <p className="flex items-center gap-2.5 font-mono text-muted-foreground text-xs uppercase tracking-[0.14em]">
              <PulseDot label="payments live" />
              payments settle on Sui {market.data.network}
            </p>
          ) : (
            <DisclosureNote title="Dev mode — payments are simulated" tone="info">
              Payments are simulated by the mock chain adapter; on live testnet they settle as
              sponsored SUI transfers.
            </DisclosureNote>
          )
        ) : null}
        {market.status === "error" ? (
          <p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.14em]">
            market status unavailable —{" "}
            <button
              className="underline underline-offset-2 transition-colors hover:text-foreground"
              onClick={loadStatus}
              type="button"
            >
              retry
            </button>
          </p>
        ) : null}
      </header>

      {/* ---------------- tabs ---------------- */}
      <div className="animate-fade-up" style={fade(1)}>
        <Tabs className="gap-6" onValueChange={setTab} value={tab}>
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
            {MARKET_TABS.map((t) => (
              <TabsTrigger className={PILL_TAB} key={t.value} value={t.value}>
                <t.Icon aria-hidden strokeWidth={1.75} />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ================ BROWSE ================ */}
          <TabsContent className="space-y-5" value="browse">
            {browse.status === "loading" ? <CardGridSkeleton /> : null}
            {browse.status === "error" ? (
              <TabError message={browse.message} onRetry={loadBrowse} />
            ) : null}
            {browse.status === "ready" ? (
              browse.data.length === 0 ? (
                <EmptyState
                  action={
                    <Button
                      className="rounded-full border-white/15"
                      onClick={() => setTab("mine")}
                      size="sm"
                      variant="outline"
                    >
                      <Tag aria-hidden />
                      List your soul
                    </Button>
                  }
                  description="No souls listed yet — be the first."
                  icon={Store}
                  title="The market is empty"
                />
              ) : (
                <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {browse.data.map((l) => {
                    const seller = displayHandle(l.sellerHandle, l.sellerAddress);
                    const price = formatSui(l.priceMist);
                    return (
                      <li
                        className="flex flex-col gap-4 rounded-2xl border border-white/12 bg-card p-5"
                        key={l.id}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span aria-hidden className="shrink-0">
                              <SoulMark className="size-8" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-mono text-sm">{seller}</p>
                              <p className="truncate text-muted-foreground text-xs">{l.title}</p>
                            </div>
                          </div>
                          {l.mine ? (
                            <span className="font-mono text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
                              yours
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {l.scope.map((ns) => (
                            <NamespaceBadge key={ns} namespace={ns} />
                          ))}
                        </div>
                        <dl className="space-y-2 border-white/8 border-y py-3.5 text-sm">
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Access</dt>
                            <dd className="font-mono text-xs">read-only · recall</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Revocable</dt>
                            <dd className="font-mono text-xs">by the seller · on-chain</dd>
                          </div>
                        </dl>
                        <div className="mt-auto flex items-center justify-between gap-3">
                          <p className="font-mono text-gold text-xl tabular-nums">
                            {price} <span className="text-sm">SUI</span>
                          </p>
                          {l.mine ? (
                            <Button
                              className="rounded-full border-white/20"
                              disabled
                              size="sm"
                              variant="outline"
                            >
                              Yours
                            </Button>
                          ) : (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                {/* the single red fill of this tab */}
                                <Button
                                  className="rounded-full"
                                  isLoading={buyingId === l.id}
                                  size="sm"
                                >
                                  Buy
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Buy this license for {price} SUI?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Buying mints a delegate key on the seller's account, scoped to{" "}
                                    {l.scope.join(" · ")} — you get read-only recall, never the
                                    memory bytes. The seller can revoke it on-chain at any time.
                                    {devMode ? " Payment is simulated in dev mode." : ""}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="rounded-full border-white/15">
                                    Keep browsing
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    className="rounded-full"
                                    onClick={() => buy(l)}
                                  >
                                    Buy for {price} SUI
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : null}
          </TabsContent>

          {/* ================ MY LISTINGS ================ */}
          <TabsContent className="space-y-6" value="mine">
            {/* create */}
            <Card>
              <CardHeader>
                <CardTitle as="h2" className="text-base">
                  Create a listing
                </CardTitle>
                <CardDescription>
                  Sell scoped, read-only access to your soul
                  {me ? (
                    <>
                      {" "}
                      as <span className="font-mono">{me.handle}</span>
                    </>
                  ) : null}
                  . A buyer gets a revocable delegate key on your account — never your data.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-5" onSubmit={createListing}>
                  <div className="max-w-sm space-y-1.5">
                    <Label htmlFor="listing-title">Title</Label>
                    <Input
                      id="listing-title"
                      maxLength={120}
                      onChange={(e) => setListTitle(e.target.value)}
                      placeholder="e.g. Full-stack engineer — 8y of repos"
                      value={listTitle}
                    />
                  </div>
                  <fieldset className="space-y-2.5">
                    <legend className="font-medium text-sm">Areas a buyer may read</legend>
                    <ScopePills
                      idPrefix="list-ns"
                      onToggle={(n) => setListScope((s) => toggleNamespace(s, n))}
                      selected={listScope}
                    />
                  </fieldset>
                  <div className="max-w-[12rem] space-y-1.5">
                    <Label htmlFor="listing-price">Price (SUI)</Label>
                    <Input
                      id="listing-price"
                      inputMode="decimal"
                      onChange={(e) => setListPrice(e.target.value)}
                      placeholder="12.5"
                      value={listPrice}
                    />
                  </div>
                  {/* the single red fill of this tab */}
                  <Button className="rounded-full" isLoading={creating} type="submit">
                    <Tag aria-hidden />
                    Create listing
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* own listings */}
            <Card>
              <CardHeader>
                <CardTitle as="h2" className="text-base">
                  Your listings
                </CardTitle>
                <CardDescription>
                  A listing stays on the market until you cancel it. Cancelling never touches keys
                  already sold.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {mine.status === "loading" ? <RowsSkeleton /> : null}
                {mine.status === "error" ? (
                  <TabError message={mine.message} onRetry={loadMine} />
                ) : null}
                {mine.status === "ready" ? (
                  mine.data.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No listings yet — create one above and it appears in Browse for every
                      signed-in soul.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {mine.data.map((l) => {
                        const active = l.status === "active";
                        return (
                          <li
                            className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0"
                            key={l.id}
                          >
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-sm">{l.title}</span>
                                <StatusPill tone={active ? "success" : "neutral"}>
                                  {active ? "Active" : "Cancelled"}
                                </StatusPill>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {l.scope.map((ns) => (
                                  <NamespaceBadge key={ns} namespace={ns} />
                                ))}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="font-mono text-gold text-sm tabular-nums">
                                {formatSui(l.priceMist)} SUI
                              </span>
                              <span className="font-mono text-muted-foreground text-xs">
                                {l.salesCount} sold
                              </span>
                              {active ? (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      className="rounded-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                      size="sm"
                                      variant="outline"
                                    >
                                      Cancel
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>
                                        Cancel &ldquo;{l.title}&rdquo;?
                                      </AlertDialogTitle>
                                      <AlertDialogDescription>
                                        The listing comes off the market. Keys already sold are
                                        unaffected — revoke those any time on the Permissions page.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel className="rounded-full border-white/15">
                                        Keep listed
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        className="rounded-full border border-destructive/40 bg-transparent text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => cancelListing(l.id)}
                                      >
                                        Cancel listing
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )
                ) : null}
              </CardContent>
            </Card>

            {/* sales */}
            <Card>
              <CardHeader>
                <CardTitle as="h2" className="text-base">
                  Sales
                </CardTitle>
                <CardDescription>
                  Every license you have sold or gifted, and its live key status.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {sales.status === "loading" ? <RowsSkeleton /> : null}
                {sales.status === "error" ? (
                  <TabError message={sales.message} onRetry={loadSales} />
                ) : null}
                {sales.status === "ready" ? (
                  sales.data.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No sales yet — active listings appear in Browse, and gifts you send count here
                      too.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {sales.data.map((s) => {
                        const active = s.status === "active";
                        return (
                          <li
                            className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0"
                            key={s.acquisitionId}
                          >
                            <div className="min-w-0 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-sm">
                                  {displayHandle(s.buyerHandle, s.buyerAddress)}
                                </span>
                                <KindTag kind={s.kind} priceMist={s.priceMist} />
                                <StatusPill tone={active ? "success" : "neutral"}>
                                  {active ? "Active" : "Revoked"}
                                </StatusPill>
                              </div>
                              {s.txDigest ? (
                                <AddressChip label="payment tx digest" value={s.txDigest} />
                              ) : null}
                            </div>
                            <time
                              className="font-mono text-muted-foreground text-xs"
                              dateTime={s.createdAt}
                            >
                              {new Date(s.createdAt).toLocaleDateString()}
                            </time>
                          </li>
                        );
                      })}
                    </ul>
                  )
                ) : null}
                <p className="border-white/8 border-t pt-3.5 text-muted-foreground text-xs leading-relaxed">
                  Every sale mints a delegate key that counts against your {MAX_CONNECTED_APPS}-key
                  cap — revoke any time in{" "}
                  <Link
                    className="underline underline-offset-2 transition-colors hover:text-foreground"
                    href="/permissions"
                  >
                    Permissions
                  </Link>
                  .
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================ ACQUIRED ================ */}
          <TabsContent value="acquired">
            <Card>
              <CardHeader>
                <CardTitle as="h2" className="text-base">
                  Souls you hold a key to
                </CardTitle>
                <CardDescription>
                  Purchases and gifts. Each is a delegate key on the seller's account — the seller
                  can revoke it, and the status here tells the truth.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {acquired.status === "loading" ? <RowsSkeleton /> : null}
                {acquired.status === "error" ? (
                  <TabError message={acquired.message} onRetry={loadAcquired} />
                ) : null}
                {acquired.status === "ready" ? (
                  acquired.data.length === 0 ? (
                    <EmptyState
                      action={
                        <Button
                          className="rounded-full border-white/15"
                          onClick={() => setTab("browse")}
                          size="sm"
                          variant="outline"
                        >
                          <Store aria-hidden />
                          Browse souls
                        </Button>
                      }
                      description="Buy a license in Browse, or have a friend send you their soul — it lands here."
                      icon={Gift}
                      title="Nothing acquired yet"
                    />
                  ) : (
                    <ul className="divide-y divide-border">
                      {acquired.data.map((a) => {
                        const seller = displayHandle(a.sellerHandle, a.sellerAddress);
                        const active = a.status === "active";
                        return (
                          <li className="space-y-2.5 py-4 first:pt-0 last:pb-0" key={a.id}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <span className="font-medium text-sm">{a.title}</span>
                                <span className="font-mono text-muted-foreground text-xs">
                                  {seller}
                                </span>
                                <KindTag kind={a.kind} priceMist={a.priceMist} />
                                <StatusPill tone={active ? "success" : "neutral"}>
                                  {active ? "Active" : "Revoked"}
                                </StatusPill>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {a.txDigest ? (
                                  <AddressChip
                                    href={a.explorerUrl ?? undefined}
                                    label="payment tx digest"
                                    value={a.txDigest}
                                  />
                                ) : null}
                                <time
                                  className="font-mono text-muted-foreground text-xs"
                                  dateTime={a.createdAt}
                                >
                                  {new Date(a.createdAt).toLocaleDateString()}
                                </time>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {a.scope.map((ns) => (
                                <NamespaceBadge key={ns} namespace={ns} />
                              ))}
                            </div>
                            {active ? (
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-muted-foreground text-xs leading-relaxed">
                                  plug this into Claude/Cursor — your AI recalls {seller}'s soul,
                                  scoped to {a.scope.join(" · ")}
                                </p>
                                {a.claimed ? (
                                  <Button
                                    className="rounded-full border-white/15"
                                    isLoading={configId === a.id}
                                    onClick={() => viewConfig(a)}
                                    size="sm"
                                    variant="outline"
                                  >
                                    View config template
                                  </Button>
                                ) : (
                                  <Button
                                    className="rounded-full border-pulse/40 text-pulse-soft hover:text-pulse-soft"
                                    isLoading={claimingId === a.id}
                                    onClick={() => claim(a)}
                                    size="sm"
                                    variant="outline"
                                  >
                                    <KeyRound aria-hidden />
                                    Reveal key — shown once
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <p className="text-destructive text-xs leading-relaxed">
                                The seller revoked this key — your AI can no longer recall this
                                soul.
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================ SEND ================ */}
          <TabsContent value="send">
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle as="h2" className="text-base">
                  Send your soul
                </CardTitle>
                <CardDescription>
                  Sending mints a scoped delegate key on your account for the recipient — free,
                  revocable in Permissions, and it counts against your {MAX_CONNECTED_APPS}-key cap.
                  They reveal the key once from their Acquired tab.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-5" onSubmit={submitSend}>
                  <div className="max-w-sm space-y-1.5">
                    <Label htmlFor="send-to">Recipient</Label>
                    <Input
                      id="send-to"
                      onChange={(e) => setSendTo(e.target.value)}
                      placeholder="handle, handle.soul, or 0x…"
                      value={sendTo}
                    />
                  </div>
                  <fieldset className="space-y-2.5">
                    <legend className="font-medium text-sm">Areas they may read</legend>
                    <ScopePills
                      idPrefix="send-ns"
                      onToggle={(n) => setSendScope((s) => toggleNamespace(s, n))}
                      selected={sendScope}
                    />
                  </fieldset>
                  <div className="max-w-sm space-y-1.5">
                    <Label htmlFor="send-title">
                      Note <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="send-title"
                      maxLength={120}
                      onChange={(e) => setSendTitle(e.target.value)}
                      placeholder="e.g. my work soul — for our pairing sessions"
                      value={sendTitle}
                    />
                  </div>
                  {/* the single red fill of this tab */}
                  <Button className="rounded-full" isLoading={sending} type="submit">
                    <Send aria-hidden />
                    Send access
                  </Button>
                </form>
                {sent ? (
                  <div className="mt-5 space-y-1 rounded-lg border border-success/25 bg-success/10 p-3.5 text-sm">
                    <p className="font-medium text-success">Sent.</p>
                    <p className="text-muted-foreground leading-relaxed">
                      <span className="font-mono">{sent.recipient}</span> will find it in their
                      Acquired tab and reveal the key once. It lives on your account — revoke any
                      time in{" "}
                      <Link
                        className="underline underline-offset-2 transition-colors hover:text-foreground"
                        href="/permissions"
                      >
                        Permissions
                      </Link>
                      .
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ---------------- shown-once: the license key ---------------- */}
      <ShownOnceDialog
        description={
          reveal ? (
            <>
              Access to <span className="font-mono">{reveal.sellerLabel}</span>'s soul. Add the
              hosted connection to your MCP-aware client (Claude Desktop, Cursor).
            </>
          ) : null
        }
        onClose={() => setReveal(null)}
        open={reveal !== null}
        title="Soul license — shown once"
      >
        {reveal ? (
          <div className="space-y-4">
            <DisclosureNote
              className="border-destructive/30 bg-destructive/10 [&>svg]:text-destructive"
              title="This key is a password"
              tone="warning"
            >
              The delegate key in the headers below opens the areas you licensed. It is shown a
              single time — copy it now. We do not store it for you, so it cannot be shown again.
            </DisclosureNote>

            <HostedBlock mcp={reveal.mcp} secret />

            <ToolPills tools={reveal.mcp.tools} />

            <Separator />

            <RawJsonCollapsible mcp={reveal.mcp} />

            <div className="flex flex-wrap items-center gap-3">
              <CopyConfigButton mcp={reveal.mcp} />
              {/* Switch the tab underneath WITHOUT closing — only the guarded close path may
                  destroy the one-time key. */}
              <Button className="px-0" onClick={() => setTab("acquired")} variant="link">
                Open Acquired behind this dialog
              </Button>
            </div>
          </div>
        ) : null}
      </ShownOnceDialog>

      {/* ---------------- config template (already claimed) ---------------- */}
      <Dialog onOpenChange={(o) => !o && setTemplate(null)} open={template !== null}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="type-etched text-2xl">Connection config — template</DialogTitle>
            <DialogDescription>
              {template ? (
                <>
                  {template.title} · <span className="font-mono">{template.sellerLabel}</span>
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {template ? (
            <div className="space-y-4">
              <DisclosureNote title="This template does not contain your key" tone="info">
                {template.mcp.note ??
                  "The delegate key was shown exactly once, when this soul was acquired. Replace the Authorization placeholder with the key you saved — if it was lost, ask the sender to send again, or buy a new license."}
              </DisclosureNote>

              <HostedBlock mcp={template.mcp} secret={false} />

              <RawJsonCollapsible mcp={template.mcp} />

              <CopyConfigButton mcp={template.mcp} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
