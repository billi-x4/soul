"use client";

import { NAMESPACES, type Namespace } from "@soul/shared";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  DownloadCloud,
  KeyRound,
  Layers,
  type LucideIcon,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { ConstellationField } from "@/components/pulse/constellation-field";
import { Eyebrow } from "@/components/pulse/eyebrow";
import { PulseDot } from "@/components/pulse/pulse-line";
import {
  AddressChip,
  EmptyState,
  NamespaceBadge,
  ProvenanceTag,
  StatCallout,
} from "@/components/soul";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { soulFetch } from "@/lib/api";
import { fetchProfile, type ProfileInfo, soulHandle } from "@/lib/auth";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------- types */

// Response shapes mirror inspector (GET /api/memory) and permissions
// (GET /api/permissions/apps, GET /api/permissions/audit) exactly.
type MemoryRow = {
  id: string;
  namespace: string;
  snippet?: string;
  content?: string;
  source: string;
  createdAt: string;
};
type AppRow = {
  id: string;
  label: string;
  allowedNamespaces: string[];
  status: string;
  createdAt: string;
};
type AuditRow = { action: string; target: string; createdAt: string };

type Loadable<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error" };

const HEX_ID = /^0x[0-9a-f]+$/i;

/** A target reads as an on-chain identifier when it looks like a 0x hash or a long opaque id. */
function looksLikeId(value: string) {
  return HEX_ID.test(value) || (value.length >= 16 && !value.includes(" "));
}

/** Narrow an item's loosely-typed namespace string to a known Namespace for presentation. */
function asNamespace(value: string): Namespace | null {
  return (NAMESPACES as readonly string[]).includes(value) ? (value as Namespace) : null;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) {
    return iso;
  }
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) {
    return "just now";
  }
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  return new Date(iso).toLocaleDateString();
}

function settle<T, U>(result: PromiseSettledResult<T>, pick: (value: T) => U): Loadable<U> {
  return result.status === "fulfilled"
    ? { status: "ready", data: pick(result.value) }
    : { status: "error" };
}

/* ------------------------------------------------------------ static data */

const QUICK_ACTIONS: { href: string; icon: LucideIcon; label: string; hint: string }[] = [
  {
    href: "/builder",
    icon: Sparkles,
    label: "Import data",
    hint: "Paste notes, upload documents, or import your own social data (X, LinkedIn, GitHub).",
  },
  {
    href: "/permissions",
    icon: KeyRound,
    label: "Connect an AI",
    hint: "Mint a scoped delegate key for Claude Desktop, Cursor, or any MCP client.",
  },
  {
    href: "/portability",
    icon: DownloadCloud,
    label: "Verify ownership",
    hint: "Run the restore proof — rebuild your index straight from Walrus.",
  },
];

/* ----------------------------------------------------------------- page */

export default function OverviewPage() {
  const [profile, setProfile] = useState<Loadable<ProfileInfo>>({ status: "loading" });
  const [apps, setApps] = useState<Loadable<AppRow[]>>({ status: "loading" });
  const [memories, setMemories] = useState<Loadable<MemoryRow[]>>({ status: "loading" });
  const [audit, setAudit] = useState<Loadable<AuditRow[]>>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [profileR, appsR, memoryR, auditR] = await Promise.allSettled([
        fetchProfile(),
        soulFetch<{ apps: AppRow[] }>("/api/permissions/apps"),
        // limit=100 (the API max) + client-side sort: the endpoint is relevance recall and
        // returns oldest-first for an empty query, so recency is derived here.
        soulFetch<{ items: MemoryRow[] }>("/api/memory?limit=100"),
        soulFetch<{ entries: AuditRow[] }>("/api/permissions/audit"),
      ]);
      if (cancelled) {
        return;
      }
      setProfile(settle(profileR, (p) => p));
      setApps(settle(appsR, (r) => r.apps));
      setMemories(
        settle(memoryR, (r) =>
          [...r.items]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5)
        )
      );
      setAudit(settle(auditR, (r) => r.entries));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = profile.status === "ready" ? profile.data : null;
  const frozen = ready?.account ? !ready.account.active : false;
  const activeApps =
    apps.status === "ready" ? apps.data.filter((a) => a.status === "active").length : null;
  // The page's single red fill exists only while the soul is empty.
  const showImportCta = memories.status === "ready" && memories.data.length === 0;

  return (
    <div className="stagger space-y-8">
      {/* ---------------- 1 · Header band ---------------- */}
      <header
        className="relative animate-fade-up overflow-hidden"
        style={{ "--i": 0 } as CSSProperties}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-30">
          <ConstellationField density={0.5} form="drift" seed={41} />
        </div>
        <div className="relative flex flex-wrap items-start justify-between gap-6 py-2">
          <div className="space-y-3">
            <Eyebrow index="01" tone="pulse">
              Overview
            </Eyebrow>
            <h1 className="type-etched text-3xl sm:text-4xl">
              Your soul is <span className="font-soul text-pulse-soft">alive.</span>
            </h1>
            <p className="text-muted-foreground text-sm">
              {ready ? (
                <>
                  Welcome back,{" "}
                  <span className="font-mono text-foreground">
                    {soulHandle({ username: ready.username, suiAddress: ready.suiAddress })}
                  </span>
                  {" — here's what your second soul has been up to."}
                </>
              ) : (
                "Welcome back — here's what your second soul has been up to."
              )}
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end">
            {profile.status === "loading" ? (
              <Skeleton className="h-7 w-28 rounded-full" />
            ) : ready?.account ? (
              frozen ? (
                <Link
                  className="inline-flex items-center gap-2 rounded-full border border-warning/40 px-3.5 py-1.5 font-mono text-[0.65rem] text-warning uppercase tracking-[0.14em] transition-colors hover:border-warning/70"
                  href="/permissions"
                >
                  <span aria-hidden className="size-1.5 rounded-full bg-warning" />
                  frozen · manage
                </Link>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3.5 py-1.5 font-mono text-[0.65rem] text-success uppercase tracking-[0.14em]">
                  <PulseDot label="account active" />
                  active
                </span>
              )
            ) : (
              <span className="inline-flex items-center rounded-full border border-white/10 px-3.5 py-1.5 font-mono text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
                —
              </span>
            )}
            {showImportCta ? (
              <Link
                className={cn(buttonVariants(), "glow-pulse gap-2 rounded-full")}
                href="/builder"
              >
                Import data
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {/* ---------------- 2 · Vitals ---------------- */}
      <section className="animate-fade-up" style={{ "--i": 1 } as CSSProperties}>
        <h2 className="sr-only">Vitals</h2>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 lg:grid-cols-4">
          <Vital
            hint="active delegate keys"
            label="Connected AI apps"
            loading={apps.status === "loading"}
            value={activeApps !== null ? activeApps : null}
          />
          <Vital
            hint="areas of your soul"
            label="Namespaces"
            loading={profile.status === "loading"}
            value={ready ? ready.namespaces.length : null}
          />
          <Vital
            hint="on-chain state"
            label="Account status"
            loading={profile.status === "loading"}
            value={
              ready?.account ? (
                <span className={frozen ? "text-warning" : "text-success"}>
                  {frozen ? "frozen" : "active"}
                </span>
              ) : null
            }
          />
          <Vital
            hint="soul created"
            label="Member since"
            loading={profile.status === "loading"}
            value={
              ready?.createdAt
                ? new Date(ready.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    year: "numeric",
                  })
                : null
            }
          />
        </dl>
      </section>

      {/* ---------------- 3 · Memories + activity ---------------- */}
      <div
        className="grid animate-fade-up items-start gap-6 lg:grid-cols-2"
        style={{ "--i": 2 } as CSSProperties}
      >
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle as="h2" className="text-base">
                Recent memories
              </CardTitle>
              <Link
                className="font-mono text-muted-foreground text-xs transition-colors hover:text-foreground"
                href="/inspector"
              >
                Browse all →
              </Link>
            </div>
            <CardDescription>The last things your soul learned.</CardDescription>
          </CardHeader>
          <CardContent>
            {memories.status === "loading" ? (
              <ListSkeleton />
            ) : memories.status === "error" ? (
              <SectionUnavailable />
            ) : memories.data.length === 0 ? (
              <EmptyState
                action={
                  <Link
                    className={cn(
                      buttonVariants({ size: "sm", variant: "outline" }),
                      "rounded-full border-white/15"
                    )}
                    href="/builder"
                  >
                    Open the builder
                  </Link>
                }
                description="Nothing here yet. Import your own data and the first facts will appear with full provenance."
                icon={Layers}
                title="No memory yet"
              />
            ) : (
              <ul className="divide-y divide-border">
                {memories.data.map((it) => {
                  const namespace = asNamespace(it.namespace);
                  return (
                    <li className="space-y-2 py-3 first:pt-0 last:pb-0" key={it.id}>
                      <p className="line-clamp-2 text-sm leading-relaxed">
                        {it.snippet ?? it.content}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {namespace ? <NamespaceBadge namespace={namespace} /> : null}
                        <ProvenanceTag at={it.createdAt} source={it.source} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle as="h2" className="text-base">
                Activity
              </CardTitle>
              <Link
                className="font-mono text-muted-foreground text-xs transition-colors hover:text-foreground"
                href="/analytics"
              >
                All activity →
              </Link>
            </div>
            <CardDescription>Grants, revokes, and freezes — in order.</CardDescription>
          </CardHeader>
          <CardContent>
            {audit.status === "loading" ? (
              <ListSkeleton />
            ) : audit.status === "error" ? (
              <SectionUnavailable />
            ) : audit.data.length === 0 ? (
              <EmptyState
                description="Grants, revokes, and freezes will appear here the moment they happen on-chain."
                icon={Activity}
                title="No activity yet"
              />
            ) : (
              <ol className="divide-y divide-border">
                {audit.data.slice(0, 6).map((a, i) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm first:pt-0 last:pb-0"
                    key={`${a.createdAt}-${i}`}
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground capitalize">{a.action}</span>
                      {a.target ? (
                        looksLikeId(a.target) ? (
                          <AddressChip label={`${a.action} target`} value={a.target} />
                        ) : (
                          <span className="truncate text-muted-foreground">{a.target}</span>
                        )
                      ) : null}
                    </span>
                    <time
                      className="shrink-0 font-mono text-muted-foreground text-xs"
                      dateTime={a.createdAt}
                    >
                      {relativeTime(a.createdAt)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------------- 4 · Quick actions ---------------- */}
      <section className="animate-fade-up" style={{ "--i": 3 } as CSSProperties}>
        <h2 className="sr-only">Quick actions</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                className="group rounded-2xl border border-white/10 bg-card p-5 transition-colors hover:border-white/25"
                href={action.href}
                key={action.href}
              >
                <Icon
                  aria-hidden
                  className="size-5 text-muted-foreground transition-colors group-hover:text-pulse-soft"
                  strokeWidth={1.5}
                />
                <p className="mt-3 flex items-center gap-1.5 font-medium text-sm">
                  {action.label}
                  <ArrowUpRight
                    aria-hidden
                    className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100"
                  />
                </p>
                <p className="mt-1 text-muted-foreground text-xs leading-relaxed">{action.hint}</p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* --------------------------------------------------------- local helpers */

function Vital({
  label,
  hint,
  loading,
  value,
}: {
  label: string;
  hint?: string;
  loading: boolean;
  value: ReactNode | null;
}) {
  // StatCallout renders div > dt + dd, so it sits directly under the <dl>
  // (dl > div > dt+dd is valid) — no extra wrapper div in between.
  return (
    <StatCallout
      className="bg-card p-5"
      hint={hint}
      label={label}
      value={
        loading ? (
          <Skeleton className="h-7 w-14" />
        ) : (
          <span className="font-mono">{value ?? "—"}</span>
        )
      }
    />
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}

function SectionUnavailable() {
  return (
    <p className="text-muted-foreground text-sm">
      — couldn't load right now. Your soul is unharmed; refresh to retry.
    </p>
  );
}
