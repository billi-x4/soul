"use client";

import { MAX_CONNECTED_APPS, MAX_DELEGATE_KEYS, type Namespace } from "@soul/shared";
import { KeyRound, Link2, ShieldAlert, ShieldCheck } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { Eyebrow } from "@/components/pulse/eyebrow";
import { PulseLine } from "@/components/pulse/pulse-line";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { soulFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

type App = {
  id: string;
  label: string;
  allowedNamespaces: string[];
  status: string;
  createdAt: string;
};

const HEX_ID = /^0x[0-9a-f]+$/i;

/** A target reads as an on-chain identifier when it looks like a 0x hash or a long opaque id. */
function looksLikeId(value: string) {
  return HEX_ID.test(value) || (value.length >= 16 && !value.includes(" "));
}

/** Segment numbers 1..MAX so keys never derive from a map index. */
const KEY_SEGMENTS = Array.from({ length: MAX_DELEGATE_KEYS }, (_, i) => i + 1);

/** Twenty hairline segments — one per on-chain delegate-key slot. Lit segments are in use. */
function KeyCapacityBar({ used }: { used: number }) {
  return (
    <div
      aria-label={`${used} of ${MAX_DELEGATE_KEYS} on-chain delegate-key slots in use`}
      className="flex gap-1"
      role="img"
    >
      {KEY_SEGMENTS.map((seg) => (
        <span
          aria-hidden
          className={cn(
            "h-1.5 min-w-0 flex-1 rounded-full",
            seg <= used ? "bg-pulse" : "bg-white/10"
          )}
          key={`key-slot-${seg}`}
        />
      ))}
    </div>
  );
}

type LoadState = "loading" | "ready" | "error";

export default function PermissionsPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [apps, setApps] = useState<App[]>([]);
  const [audit, setAudit] = useState<{ action: string; target: string; createdAt: string }[]>([]);
  const [label, setLabel] = useState("");
  const [selected, setSelected] = useState<Namespace[]>(["bio"]);
  const [busy, setBusy] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [freezeBusy, setFreezeBusy] = useState(false);
  const [mcp, setMcp] = useState<Mcp | null>(null);
  const [frozen, setFrozen] = useState(false);

  const load = useCallback(async (mode: "initial" | "refresh" = "refresh") => {
    if (mode === "initial") {
      setLoadState("loading");
    }
    try {
      const [a, au, acc] = await Promise.all([
        soulFetch<{ apps: App[] }>("/api/permissions/apps"),
        soulFetch<{ entries: { action: string; target: string; createdAt: string }[] }>(
          "/api/permissions/audit"
        ),
        soulFetch<{ active: boolean }>("/api/account"),
      ]);
      setApps(a.apps);
      setAudit(au.entries);
      setFrozen(!acc.active);
      setLoadState("ready");
    } catch (e) {
      // On the first load there is nothing on screen yet — show a real error state instead of
      // a toast over misleading "no tools connected" empties.
      if (mode === "initial") {
        setLoadState("error");
      }
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load("initial");
  }, [load]);

  const grant = (e: FormEvent) => {
    e.preventDefault();
    (async () => {
      if (!label.trim()) {
        toast.error("Enter a label");
        return;
      }
      if (selected.length === 0) {
        toast.error("Select at least one area");
        return;
      }
      setBusy(true);
      try {
        const r = await soulFetch<{ app: App; mcp: Mcp }>("/api/permissions/apps", {
          method: "POST",
          body: { label: label.trim(), allowedNamespaces: selected },
        });
        setMcp(r.mcp);
        setLabel("");
        toast.success("Connected — copy the config to your AI tool");
        load();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    })();
  };

  async function revoke(id: string) {
    if (revokingId) {
      return; // a revoke is an on-chain transaction — never double-fire
    }
    setRevokingId(id);
    try {
      await soulFetch(`/api/permissions/apps/${id}`, { method: "DELETE" });
      toast.success("Revoked — that tool can no longer reach your soul");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRevokingId(null);
    }
  }

  async function toggleFreeze() {
    if (freezeBusy) {
      return;
    }
    setFreezeBusy(true);
    try {
      await soulFetch(`/api/permissions/${frozen ? "unfreeze" : "freeze"}`, { method: "POST" });
      toast.success(frozen ? "Unfrozen" : "Frozen — all access paused");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setFreezeBusy(false);
    }
  }

  const activeCount = apps.filter((a) => a.status === "active").length;
  // One on-chain slot is permanently Soul's own web key, so tools cap at MAX_CONNECTED_APPS.
  const atCap = activeCount >= MAX_CONNECTED_APPS;

  if (loadState === "loading") {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (loadState === "error") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-start gap-4">
        <h1 className="type-etched text-3xl">Permissions</h1>
        <DisclosureNote title="Couldn't load your connections" tone="warning">
          The permissions list didn't load — your keys and grants are unchanged on-chain.
        </DisclosureNote>
        <Button className="rounded-full border-white/15" onClick={() => load("initial")} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="stagger mx-auto max-w-3xl space-y-8">
      {/* ---------------- header ---------------- */}
      <header className="animate-fade-up space-y-3" style={{ "--i": 0 } as React.CSSProperties}>
        <Eyebrow index="05" tone="pulse">
          Permissions
        </Eyebrow>
        <h1 className="type-etched text-3xl sm:text-4xl">Who may touch your soul.</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Every connected AI holds one scoped delegate key on your Sui account. Granting is a
          transaction. Revoking is, too.
        </p>
      </header>

      {frozen ? (
        <DisclosureNote title="Account frozen" tone="warning">
          Every connection is paused on-chain. No AI tool can reach your soul right now. Unfreeze
          from the Emergency card below to resume the tools you have granted.
        </DisclosureNote>
      ) : null}

      {/* ---------------- key capacity ---------------- */}
      <Card className="animate-fade-up" style={{ "--i": 1 } as React.CSSProperties}>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="eyebrow text-muted-foreground">Delegate keys</p>
              <p className="font-mono text-2xl tabular">
                {activeCount}{" "}
                <span className="text-muted-foreground">/ {MAX_CONNECTED_APPS} tools</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {frozen ? <StatusPill tone="warning">Frozen</StatusPill> : null}
              {atCap ? (
                <StatusPill tone="danger">At on-chain cap</StatusPill>
              ) : (
                <span className="font-mono text-muted-foreground text-xs">
                  {MAX_CONNECTED_APPS - activeCount} slots free
                </span>
              )}
            </div>
          </div>
          {/* +1: Soul's own primary web key permanently occupies one of the 20 on-chain slots. */}
          <KeyCapacityBar used={activeCount + 1} />
          <p className="text-muted-foreground text-xs leading-relaxed">
            Your <span className="font-mono">memwal::account</span> holds at most{" "}
            {MAX_DELEGATE_KEYS} delegate keys on-chain; one is Soul's own web key, leaving{" "}
            {MAX_CONNECTED_APPS} for tools. Each is a separate, revocable grant.
          </p>
        </CardContent>
      </Card>

      {/* ---------------- grant a key ---------------- */}
      <Card className="animate-fade-up" style={{ "--i": 2 } as React.CSSProperties}>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Grant a new key
          </CardTitle>
          <CardDescription>
            Mint a scoped delegate key for one AI client and choose the areas it may read.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={grant}>
            <div className="max-w-sm space-y-1.5">
              <Label htmlFor="tool-label">Tool name</Label>
              <Input
                id="tool-label"
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Claude Desktop"
                value={label}
              />
            </div>

            <fieldset className="space-y-2.5">
              <legend className="font-medium text-sm">Areas this tool may access</legend>
              <ScopePills
                idPrefix="ns"
                onToggle={(n) => setSelected((s) => toggleNamespace(s, n))}
                selected={selected}
              />
              <p className="text-muted-foreground text-xs leading-relaxed">
                Scope is enforced by the relayer; the key itself lives on-chain. The key reads only
                the areas you light up here.
              </p>
            </fieldset>

            {/* the page's single red fill */}
            <Button className="rounded-full" disabled={atCap} isLoading={busy} type="submit">
              <KeyRound aria-hidden />
              Grant access
            </Button>
            {atCap ? (
              <p className="text-muted-foreground text-xs">
                All {MAX_CONNECTED_APPS} connectable key slots are in use. Revoke a tool to connect
                another.
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {/* ---------------- connected apps ---------------- */}
      <Card className="animate-fade-up" style={{ "--i": 3 } as React.CSSProperties}>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Connected tools
          </CardTitle>
          <CardDescription>
            Each tool holds one on-chain delegate key. Revoke kills its access for real.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {apps.length === 0 ? (
            <EmptyState
              description="Grant an AI client a key above to mint its first scoped delegate key."
              icon={Link2}
              title="No tools connected yet"
            />
          ) : (
            <ul className="divide-y divide-border">
              {apps.map((a) => {
                const active = a.status === "active";
                return (
                  <li
                    className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0"
                    key={a.id}
                  >
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm">{a.label}</span>
                        <StatusPill tone={active ? "success" : "neutral"}>
                          {active ? "Active" : "Revoked"}
                        </StatusPill>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {a.allowedNamespaces.map((ns) => (
                          <NamespaceBadge key={ns} namespace={ns as Namespace} />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <time
                        className="font-mono text-muted-foreground text-xs"
                        dateTime={a.createdAt}
                      >
                        {new Date(a.createdAt).toLocaleDateString()}
                      </time>
                      {active ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              className="rounded-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              isLoading={revokingId === a.id}
                              size="sm"
                              variant="outline"
                            >
                              Revoke
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Revoke {a.label}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the delegate key on-chain. That tool can no longer
                                reach your soul. You can connect it again later, but it will get a
                                fresh key.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-full border-white/15">
                                Keep connected
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="rounded-full border border-destructive/40 bg-transparent text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => revoke(a.id)}
                              >
                                Revoke access
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
          )}
        </CardContent>
      </Card>

      <PulseLine className="opacity-40" />

      {/* ---------------- audit log ---------------- */}
      <Card className="animate-fade-up" style={{ "--i": 4 } as React.CSSProperties}>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Activity
          </CardTitle>
          <CardDescription>
            Your latest grants, revokes, and freezes (most recent 100).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-muted-foreground text-sm">No activity yet.</p>
          ) : (
            <ol className="space-y-3">
              {audit.map((a, i) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  key={`${a.createdAt}-${i}`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground capitalize">{a.action}</span>
                    {a.target ? (
                      looksLikeId(a.target) ? (
                        <AddressChip label={`${a.action} target`} value={a.target} />
                      ) : (
                        <span className="text-muted-foreground">{a.target}</span>
                      )
                    ) : null}
                  </span>
                  <time
                    className="font-mono text-muted-foreground text-xs tabular"
                    dateTime={a.createdAt}
                  >
                    {new Date(a.createdAt).toLocaleString()}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* ---------------- emergency ---------------- */}
      <Card className="animate-fade-up" style={{ "--i": 5 } as React.CSSProperties}>
        <CardHeader>
          <CardTitle as="h2" className="flex items-center gap-2 text-base">
            <ShieldAlert aria-hidden className="size-4 text-destructive" />
            Emergency
          </CardTitle>
          <CardDescription>
            Freeze pauses ALL delegate keys at once — an on-chain{" "}
            <span className="font-mono text-xs">deactivate_account</span>. No connected client can
            reach your soul until you unfreeze. Your grants are kept and resume when you lift the
            freeze.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {frozen ? (
            <Button
              className="rounded-full border-white/15"
              isLoading={freezeBusy}
              onClick={toggleFreeze}
              variant="outline"
            >
              <ShieldCheck aria-hidden />
              Unfreeze account
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  className="rounded-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  isLoading={freezeBusy}
                  variant="outline"
                >
                  Freeze all access
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Freeze every connection?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Freezing pauses every tool at once. No connected client can reach your soul
                    until you unfreeze. Your connections are kept and resume when you lift the
                    freeze.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-full border-white/15">
                    Keep active
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="rounded-full border border-destructive/40 bg-transparent text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive"
                    onClick={toggleFreeze}
                  >
                    Freeze all access
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardContent>
      </Card>

      {/* ---------------- grant-success: the delegate key is shown once ---------------- */}
      <ShownOnceDialog
        description="Add this connection to your MCP-aware client (Claude Desktop, Cursor) via the hosted URL, or run the local stdio server."
        onClose={() => setMcp(null)}
        open={mcp !== null}
        title="Delegate key — shown once"
      >
        {mcp ? (
          <div className="space-y-4">
            <DisclosureNote
              className="border-destructive/30 bg-destructive/10 [&>svg]:text-destructive"
              title="This key is a password"
              tone="warning"
            >
              The delegate key in the headers below opens the areas you scoped. It is shown a
              single time — copy it now. We do not store it in plaintext, so you cannot retrieve
              it again.
            </DisclosureNote>

            <div className="space-y-3">
              <HostedBlock mcp={mcp} secret />

              <div className="space-y-1.5">
                <p className="eyebrow text-muted-foreground">Local · stdio</p>
                <div className="space-y-2 rounded-lg border border-white/10 bg-black/40 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-muted-foreground">Command</span>
                    <span className="flex min-w-0 items-center gap-1">
                      <code className="truncate font-mono text-foreground/80">
                        {mcp.stdio.command} {mcp.stdio.args.join(" ")}
                      </code>
                      <CopyButton
                        value={`${mcp.stdio.command} ${mcp.stdio.args.join(" ")}`}
                        variant="ghost"
                      />
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-muted-foreground">Credentials</span>
                    <span className="flex min-w-0 items-center gap-1">
                      <code
                        className="truncate font-mono text-foreground/80"
                        title={mcp.stdio.credentialsPath}
                      >
                        {mcp.stdio.credentialsPath}
                      </code>
                      <CopyButton value={mcp.stdio.credentialsPath} variant="ghost" />
                    </span>
                  </div>
                </div>
              </div>

              <ToolPills tools={mcp.tools} />
            </div>

            <Separator />

            <RawJsonCollapsible mcp={mcp} />

            <CopyConfigButton mcp={mcp} />
          </div>
        ) : null}
      </ShownOnceDialog>
    </div>
  );
}
