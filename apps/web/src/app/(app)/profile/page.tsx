"use client";

import { countAnswered, ONBOARDING_SECTIONS } from "@soul/shared";
import { Pencil, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ConstellationField } from "@/components/pulse/constellation-field";
import { Eyebrow } from "@/components/pulse/eyebrow";
import { PulseLine } from "@/components/pulse/pulse-line";
import { AddressChip } from "@/components/soul/address-chip";
import { DisclosureNote } from "@/components/soul/disclosure-note";
import { EmptyState } from "@/components/soul/empty-state";
import { NamespaceBadge } from "@/components/soul/namespace-badge";
import { SoulMark } from "@/components/soul/soul-mark";
import { SoulOnboarding } from "@/components/soul/soul-onboarding";
import { StatCallout } from "@/components/soul/stat-callout";
import { StatusPill } from "@/components/soul/status-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type ContextResult, fetchContext, fetchProfile, type ProfileInfo } from "@/lib/auth";

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google (zkLogin)",
  dev: "Dev session",
};

const NAMESPACES = ["bio", "docs", "social"] as const;

function isNamespace(v: string): v is (typeof NAMESPACES)[number] {
  return (NAMESPACES as readonly string[]).includes(v);
}

function valueText(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v.join(", ") : (v ?? "");
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [context, setContext] = useState<ContextResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [p, c] = await Promise.all([fetchProfile(), fetchContext()]);
      setProfile(p);
      setContext(c);
    } catch (e) {
      // A failed fetch must not strand the page on an eternal skeleton.
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* ---------------- header ---------------- */}
      <header className="stagger space-y-3">
        <div className="animate-fade-up" style={{ "--i": 0 } as React.CSSProperties}>
          <Eyebrow index="09" tone="pulse">
            Profile
          </Eyebrow>
        </div>
        <h1
          className="type-etched animate-fade-up text-3xl sm:text-4xl"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          This is you, on-chain.
        </h1>
        <p
          className="animate-fade-up text-muted-foreground"
          style={{ "--i": 2 } as React.CSSProperties}
        >
          The handle, account, and context every AI tool sees when it recalls your soul.
        </p>
      </header>

      {loadError ? (
        <div className="flex flex-col items-start gap-4">
          <DisclosureNote title="Couldn't load your profile" tone="warning">
            {loadError}
          </DisclosureNote>
          <Button className="rounded-full border-white/15" onClick={load} variant="outline">
            Retry
          </Button>
        </div>
      ) : loading || !profile ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <div className="stagger space-y-6">
          {/* ---------------- identity — the centerpiece ---------------- */}
          <Card
            className="relative overflow-hidden animate-fade-up"
            style={{ "--i": 0 } as React.CSSProperties}
          >
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40">
              <ConstellationField density={0.45} form="drift" seed={7} />
            </div>
            <CardContent className="relative flex flex-col items-center gap-6 p-8 text-center sm:flex-row sm:text-left">
              <SoulMark className="size-16 shrink-0" />
              <div className="min-w-0 flex-1 space-y-3">
                <h2 className="truncate font-mono text-2xl tracking-tight">
                  {profile.handle ?? "unclaimed"}
                </h2>
                <dl className="space-y-1.5 font-mono text-xs">
                  <div className="flex flex-wrap items-baseline justify-center gap-x-2 sm:justify-start">
                    <dt className="text-muted-foreground uppercase tracking-[0.14em]">provider</dt>
                    <dd className="text-muted-foreground">
                      {profile.provider
                        ? (PROVIDER_LABEL[profile.provider] ?? profile.provider)
                        : "—"}
                    </dd>
                  </div>
                  {profile.createdAt ? (
                    <div className="flex flex-wrap items-baseline justify-center gap-x-2 sm:justify-start">
                      <dt className="text-muted-foreground uppercase tracking-[0.14em]">
                        member since
                      </dt>
                      <dd className="text-muted-foreground">
                        {new Date(profile.createdAt).toLocaleDateString()}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>
              {profile.account ? (
                <StatusPill tone={profile.account.active ? "success" : "warning"}>
                  {profile.account.active ? "Active" : "Frozen"}
                </StatusPill>
              ) : null}
            </CardContent>
          </Card>

          {/* ---------------- on-chain details ---------------- */}
          <Card className="animate-fade-up" style={{ "--i": 1 } as React.CSSProperties}>
            <CardContent className="divide-y divide-border p-0">
              <Row label="sui address">
                <AddressChip
                  head={8}
                  label="your Sui address"
                  tail={6}
                  value={profile.suiAddress}
                />
              </Row>
              {profile.account ? (
                <Row label="account object">
                  <AddressChip
                    head={8}
                    href={profile.account.explorerUrl}
                    label="MemWalAccount object id"
                    tail={6}
                    value={profile.account.objectId}
                  />
                </Row>
              ) : null}
            </CardContent>
          </Card>

          {/* ---------------- stats ---------------- */}
          <div
            className="grid animate-fade-up grid-cols-2 gap-4 sm:grid-cols-3"
            style={{ "--i": 2 } as React.CSSProperties}
          >
            <Card>
              <CardContent className="p-5">
                <dl>
                  <StatCallout
                    hint="AI tools with access"
                    label="Connected"
                    value={profile.connectedCount}
                  />
                </dl>
              </CardContent>
            </Card>
            <Card className="col-span-2 sm:col-span-2">
              <CardContent className="space-y-2.5 p-5">
                <p className="font-mono text-[0.68rem] text-muted-foreground uppercase tracking-[0.16em]">
                  Namespaces
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.namespaces.filter(isNamespace).length > 0 ? (
                    profile.namespaces
                      .filter(isNamespace)
                      .map((ns) => <NamespaceBadge key={ns} namespace={ns} />)
                  ) : (
                    <span className="font-mono text-muted-foreground text-xs">—</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <PulseLine className="opacity-40" />

          {/* ---------------- personal context (the soul) ---------------- */}
          <div className="animate-fade-up" style={{ "--i": 3 } as React.CSSProperties}>
            <PersonalContextCard
              context={context}
              editing={editing}
              onSaved={(c) => {
                setContext(c);
                setEditing(false);
              }}
              setEditing={setEditing}
            />
          </div>

          <DisclosureNote title="About ownership" tone="info">
            In this managed build, your on-chain account is operated by Soul on your behalf
            (custodial) and gas is sponsored for you. Your handle, context, and data remain yours
            and portable; the non-custodial path where your own zkLogin key signs is the next step.
          </DisclosureNote>
        </div>
      )}
    </div>
  );
}

function PersonalContextCard({
  context,
  editing,
  setEditing,
  onSaved,
}: {
  context: ContextResult | null;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onSaved: (c: ContextResult) => void;
}) {
  const answers = context?.answers ?? {};
  const answered = countAnswered(answers);

  if (editing) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-1">
            <CardTitle as="h2" className="font-medium text-lg tracking-tight">
              Your personal context
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              This is the soul your AI tools recall. Update anything, then save.
            </p>
          </div>
          <SoulOnboarding
            initialAnswers={answers}
            onCancel={() => setEditing(false)}
            onExit={(_completed, a, result) =>
              onSaved(result ?? { answers: a, completed: true, exists: true })
            }
            submitLabel="Save"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle as="h2" className="font-medium text-lg tracking-tight">
              Your personal context
            </CardTitle>
            <p className="text-muted-foreground text-sm">The context that forms your soul.</p>
          </div>
          {answered > 0 ? (
            <Button
              className="gap-1.5 rounded-full border-white/15"
              onClick={() => setEditing(true)}
              size="sm"
              variant="outline"
            >
              <Pencil aria-hidden className="size-3.5" />
              Edit
            </Button>
          ) : null}
        </div>

        {answered === 0 ? (
          <EmptyState
            action={
              <Button className="rounded-full" onClick={() => setEditing(true)}>
                Build your context
              </Button>
            }
            description="Add your background, skills, projects, and goals so every AI tool understands you."
            icon={Sparkles}
            title="Your soul is waiting"
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <StatusPill tone={context?.completed ? "success" : "warning"}>
                {context?.completed ? "Complete" : "In progress"}
              </StatusPill>
              <span className="font-mono text-muted-foreground text-xs">{answered} answers</span>
              {context?.blobId ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
                  <span>Stored on Walrus</span>
                  <AddressChip head={8} label="Walrus blob id" tail={6} value={context.blobId} />
                </span>
              ) : null}
            </div>
            <dl className="space-y-6">
              {ONBOARDING_SECTIONS.map((section, idx) => {
                const items = section.questions
                  .map((q) => ({ q, text: valueText(answers[q.id]) }))
                  .filter((i) => i.text);
                if (items.length === 0) {
                  return null;
                }
                return (
                  <div className="space-y-2.5" key={section.id}>
                    <p className="font-mono text-[0.65rem] text-muted-foreground uppercase tracking-[0.16em]">
                      <span className="text-pulse-soft">{String(idx + 1).padStart(2, "0")}</span>
                      <span aria-hidden className="px-1.5 opacity-50">
                        /
                      </span>
                      {section.title}
                    </p>
                    {items.map(({ q, text }) => (
                      <div className="grid gap-0.5" key={q.id}>
                        <dt className="text-muted-foreground text-xs">{q.label}</dt>
                        <dd className="text-sm leading-relaxed">{text}</dd>
                      </div>
                    ))}
                  </div>
                );
              })}
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4">
      <span className="font-mono text-[0.68rem] text-muted-foreground uppercase tracking-[0.16em]">
        {label}
      </span>
      {children}
    </div>
  );
}
