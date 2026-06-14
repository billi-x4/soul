"use client";

import { MAX_DELEGATE_KEYS } from "@soul/shared";
import { Activity } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Eyebrow } from "@/components/pulse/eyebrow";
import { PulseLine } from "@/components/pulse/pulse-line";
import { EmptyState } from "@/components/soul";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { soulFetch } from "@/lib/api";
import { fetchProfile, type ProfileInfo } from "@/lib/auth";

type AuditEntry = { action: string; target: string; createdAt: string };
type Job = {
  id: string;
  sourceType: string;
  namespace: string;
  status: string;
  error?: string | null;
};
type App = {
  id: string;
  label: string;
  allowedNamespaces: string[];
  status: string;
  createdAt: string;
};

const CHART_DAYS = 14;

const chartConfig = {
  events: { label: "Events", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Local-time day key (YYYY-MM-DD) so events group by the user's calendar day. */
function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  // null = that source failed to load; the page degrades per-section, never as a whole.
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [apps, setApps] = useState<App[] | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);

  const load = useCallback(async () => {
    const [auditR, jobsR, appsR, profileR] = await Promise.allSettled([
      soulFetch<{ entries: AuditEntry[] }>("/api/permissions/audit"),
      soulFetch<{ jobs: Job[] }>("/api/ingest/jobs"),
      soulFetch<{ apps: App[] }>("/api/permissions/apps"),
      fetchProfile(),
    ]);
    setAudit(auditR.status === "fulfilled" ? auditR.value.entries : null);
    setJobs(jobsR.status === "fulfilled" ? jobsR.value.jobs : null);
    setApps(appsR.status === "fulfilled" ? appsR.value.apps : null);
    setProfile(profileR.status === "fulfilled" ? profileR.value : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Audit events per local day for the last 14 days (real counts; missing days are zero). */
  const series = useMemo(() => {
    if (!audit) {
      return [];
    }
    const counts = new Map<string, number>();
    for (const entry of audit) {
      const key = dayKey(new Date(entry.createdAt));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const now = new Date();
    const days: { day: string; label: string; events: number }[] = [];
    for (let i = CHART_DAYS - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      days.push({
        day: dayKey(d),
        label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        events: counts.get(dayKey(d)) ?? 0,
      });
    }
    return days;
  }, [audit]);

  /** Real per-action counts (grant / revoke / freeze / unfreeze / ingest / restore), largest first. */
  const breakdown = useMemo(() => {
    if (!audit) {
      return [];
    }
    const counts = new Map<string, number>();
    for (const entry of audit) {
      counts.set(entry.action, (counts.get(entry.action) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count);
  }, [audit]);

  const maxAction = breakdown.reduce((m, b) => Math.max(m, b.count), 0);
  const totalEvents = series.reduce((sum, d) => sum + d.events, 0);
  const peakDay = series.reduce(
    (peak, d) => (d.events > peak.events ? d : peak),
    series[0] ?? { day: "", label: "", events: 0 }
  );
  const readyJobs = jobs?.filter((j) => j.status === "ready").length ?? 0;
  const errorJobs = jobs?.filter((j) => j.status === "error").length ?? 0;
  const activeGrants = apps?.filter((a) => a.status === "active").length ?? 0;

  return (
    <div className="stagger mx-auto max-w-4xl space-y-10">
      {/* ---- Header ---- */}
      <header className="animate-fade-up space-y-3" style={{ "--i": 0 } as CSSProperties}>
        <Eyebrow index="07" tone="pulse">
          Analytics
        </Eyebrow>
        <h1 className="type-etched text-3xl sm:text-4xl">Vitals &amp; usage.</h1>
        <p className="measure text-muted-foreground text-sm leading-relaxed">
          What your soul has been doing — every number below is counted from your real audit trail,
          jobs, and grants.
        </p>
        <PulseLine className="pt-1 opacity-40" />
      </header>

      {/* ---- Stat row (real counts) ---- */}
      <section
        aria-label="Soul vitals"
        className="animate-fade-up"
        style={{ "--i": 1 } as CSSProperties}
      >
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton className="h-28 rounded-2xl" key={i} />
            ))}
          </div>
        ) : (
          <dl className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            <StatBlock
              hint={audit ? "grants · revokes · ingests · restores" : "unavailable"}
              label="Audit events"
              value={audit ? String(audit.length) : "—"}
            />
            <StatBlock
              hint={jobs ? `${readyJobs} ready · ${errorJobs} error` : "unavailable"}
              label="Ingestion jobs"
              value={jobs ? String(jobs.length) : "—"}
            />
            <StatBlock
              hint={apps ? `of ${MAX_DELEGATE_KEYS} delegate keys` : "unavailable"}
              label="Active grants"
              value={apps ? String(activeGrants) : "—"}
            />
            <StatBlock
              hint={
                profile
                  ? profile.namespaces.length > 0
                    ? profile.namespaces.join(" · ")
                    : "none yet"
                  : "unavailable"
              }
              label="Namespaces"
              value={profile ? String(profile.namespaces.length) : "—"}
            />
          </dl>
        )}
      </section>

      {/* ---- Activity over time ---- */}
      <section className="animate-fade-up" style={{ "--i": 2 } as CSSProperties}>
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Pulse — last {CHART_DAYS} days
            </CardTitle>
            <CardDescription>
              Audit events per day: every grant, revoke, freeze, ingest, and restore.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-56 w-full rounded-xl" />
            ) : audit === null ? (
              <SourceDown what="your audit trail" />
            ) : audit.length < 3 ? (
              <EmptyState
                action={
                  <Button asChild className="rounded-full">
                    <Link href="/builder">Feed your soul</Link>
                  </Button>
                }
                description="Your soul is young — activity charts fill in as you use it. Every grant, revoke, ingest, and restore lands here."
                icon={Activity}
                title="Not enough activity to chart yet"
              />
            ) : (
              <>
                <p className="sr-only">
                  Audit events per day over the last {CHART_DAYS} days: total {totalEvents}, peak{" "}
                  {peakDay.events} on {peakDay.label}.
                </p>
                <ChartContainer className="aspect-auto h-56 w-full font-mono" config={chartConfig}>
                  <AreaChart
                    accessibilityLayer
                    data={series}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke="oklch(1 0 0 / 0.08)" vertical={false} />
                    <XAxis
                      axisLine={false}
                      dataKey="label"
                      interval="preserveStartEnd"
                      minTickGap={28}
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      tickMargin={8}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      width={28}
                    />
                    <ChartTooltip
                      content={<ChartTooltipContent />}
                      cursor={{ stroke: "oklch(1 0 0 / 0.15)" }}
                    />
                    <Area
                      activeDot={{ r: 3 }}
                      dataKey="events"
                      dot={false}
                      fill="var(--color-events)"
                      fillOpacity={0.08}
                      stroke="var(--color-events)"
                      strokeWidth={1.5}
                      type="monotone"
                    />
                  </AreaChart>
                </ChartContainer>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ---- Action breakdown ---- */}
      <section className="animate-fade-up" style={{ "--i": 3 } as CSSProperties}>
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Action breakdown
            </CardTitle>
            <CardDescription>
              All-time counts per audit action, straight from the log.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton className="h-4 w-full" key={i} />
                ))}
              </div>
            ) : audit === null ? (
              <SourceDown what="your audit trail" />
            ) : breakdown.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No actions recorded yet. They appear here the moment you ingest, grant, or revoke.
              </p>
            ) : (
              <ul className="space-y-3">
                {breakdown.map((row) => (
                  <li
                    className="grid grid-cols-[6.5rem_2.5rem_1fr] items-center gap-3 sm:grid-cols-[8rem_3rem_1fr]"
                    key={row.action}
                  >
                    <span className="truncate font-mono text-muted-foreground text-xs lowercase">
                      {row.action}
                    </span>
                    <span className="tabular text-right font-mono text-foreground text-xs">
                      {row.count}
                    </span>
                    <span aria-hidden className="h-1 overflow-hidden rounded-full bg-white/5">
                      <span
                        className="block h-full rounded-full bg-pulse/80"
                        style={{ width: `${maxAction > 0 ? (row.count / maxAction) * 100 : 0}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ---- Per-app recall metrics (honest placeholder; nothing is tracked today) ---- */}
      <section className="animate-fade-up" style={{ "--i": 4 } as CSSProperties}>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle as="h2" className="text-base">
                Per-app recall metrics
              </CardTitle>
              <span className="rounded-full border border-white/15 px-2.5 py-0.5 font-mono text-[0.62rem] text-muted-foreground uppercase tracking-[0.14em]">
                Not tracked yet
              </span>
            </div>
            <CardDescription>How often each connected tool recalls your soul.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="measure text-muted-foreground text-sm leading-relaxed">
              Per-app recall counts ship with the relayer usage export — nothing is recorded today,
              so there is nothing to chart. We would rather show you an empty card than a fake one.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/** Mono-labeled stat cell: etched number on void, hairline-separated by the parent grid. */
function StatBlock({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="bg-card p-5">
      <dt className="eyebrow text-[0.62rem] text-muted-foreground">{label}</dt>
      <dd className="type-etched tabular mt-2 text-4xl">
        {value}
        <span
          className="mt-1.5 block truncate font-mono text-[0.65rem] text-muted-foreground"
          title={hint}
        >
          {hint}
        </span>
      </dd>
    </div>
  );
}

/** Per-section degradation note when one of the Promise.allSettled sources failed. */
function SourceDown({ what }: { what: string }) {
  return (
    <p className="text-muted-foreground text-sm">
      Couldn&apos;t load {what}. Refresh the page to try again.
    </p>
  );
}
