"use client";

import { MEMWAL_MCP_TOOLS } from "@soul/shared";
import { Check, ChevronDown, Copy, Globe, Plug, Terminal } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Eyebrow } from "@/components/pulse/eyebrow";
import { PulseDot } from "@/components/pulse/pulse-line";
import { AddressChip, DisclosureNote, EmptyState, StatusPill } from "@/components/soul";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { soulFetch } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

type App = { id: string; label: string; status: string };
type Mcp = {
  hosted: { url: string; headers: Record<string, string> };
  stdio: { command: string; args: string[]; credentialsPath: string };
  tools: string[];
  note?: string;
};

/** Flat terminal surfaces lifted from the landing page's config card — no shadows, no gradients. */
const BAR_BG = "bg-[oklch(0.16_0.005_285)]";
const WELL_BG = "bg-[oklch(0.115_0.004_285)]";

const PILL_TRIGGER =
  "rounded-full border border-white/10 px-3.5 py-1.5 text-muted-foreground data-[state=active]:border-white/25 data-[state=active]:bg-white/5 data-[state=active]:text-foreground data-[state=active]:shadow-none";

function configFileName(label?: string) {
  const slug = (label ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "soul"}.mcp.json`;
}

export default function ConnectPage() {
  const [apps, setApps] = useState<App[]>([]);
  const [cfg, setCfg] = useState<Mcp | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await soulFetch<{ apps: App[] }>("/api/permissions/apps");
      setApps(r.apps.filter((a) => a.status === "active"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function show(id: string) {
    try {
      const r = await soulFetch<Mcp>(`/api/mcp/config/${id}`);
      setCfg(r);
      setSelected(id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function copyConfig() {
    if (!cfg) return;
    if (!(await copyText(JSON.stringify(cfg, null, 2)))) {
      toast.error("Couldn't copy — select the JSON and copy it manually.");
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
    toast.success("Config copied");
  }

  const selectedApp = apps.find((a) => a.id === selected) ?? null;

  return (
    <div className="stagger mx-auto max-w-5xl space-y-10">
      {/* ---------------- header ---------------- */}
      <header className="animate-fade-up space-y-3" style={{ "--i": 0 } as CSSProperties}>
        <Eyebrow index="04" tone="pulse">
          Connect
        </Eyebrow>
        <h1 className="type-etched text-3xl sm:text-4xl">Plug your soul in.</h1>
        <p className="measure text-muted-foreground">
          Paste one config into an MCP-aware client — Claude Desktop, Cursor — and your soul is on
          call until you revoke the key.
        </p>
      </header>

      <div className="stagger grid items-start gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* ---------------- left · active tools ---------------- */}
        <div className="animate-fade-up space-y-4" style={{ "--i": 1 } as CSSProperties}>
          <Card>
            <CardHeader>
              <div className="flex items-baseline justify-between gap-3">
                <CardTitle as="h2" className="text-base">
                  Active tools
                </CardTitle>
                <span
                  aria-label={`${apps.length} active tools`}
                  className="font-mono text-muted-foreground text-xs"
                >
                  {String(apps.length).padStart(2, "0")}
                </span>
              </div>
              <CardDescription>
                Pick a tool to view the MCP config to paste into your client.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {apps.length === 0 ? (
                <EmptyState
                  action={
                    <Button
                      asChild
                      className="rounded-full border-white/15"
                      size="sm"
                      variant="outline"
                    >
                      <Link href="/permissions">Go to Permissions</Link>
                    </Button>
                  }
                  description="Grant a delegate key to an AI client on the Permissions page, then return here to view its connection config."
                  icon={Plug}
                  title="No active tools yet"
                />
              ) : (
                <ul className="divide-y divide-border">
                  {apps.map((a) => {
                    const isSelected = selected === a.id;
                    return (
                      <li
                        className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                        key={a.id}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <PulseDot label="active" />
                          <span className="truncate font-medium text-sm">{a.label}</span>
                        </span>
                        <Button
                          aria-pressed={isSelected}
                          className={cn(
                            "rounded-full",
                            isSelected
                              ? "border-pulse/40 text-pulse-soft hover:text-pulse-soft"
                              : "border-white/15"
                          )}
                          onClick={() => show(a.id)}
                          size="sm"
                          variant="outline"
                        >
                          {isSelected ? "Viewing" : "View config"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
          <p className="px-1 text-muted-foreground text-xs leading-relaxed">
            Connect a new tool by granting a delegate key on the{" "}
            <Link
              className="underline underline-offset-2 transition-colors hover:text-foreground"
              href="/permissions"
            >
              Permissions
            </Link>{" "}
            page.
          </p>
        </div>

        {/* ---------------- right · config terminal ---------------- */}
        <div className="animate-fade-up space-y-6" style={{ "--i": 2 } as CSSProperties}>
          <section
            aria-label="MCP connection config"
            className="overflow-hidden rounded-2xl border border-white/10"
          >
            {/* mono header bar */}
            <div className={cn("border-white/8 border-b px-4 py-2", BAR_BG)}>
              <div className="flex min-h-7 items-center justify-between gap-3">
                <span className="truncate font-mono text-muted-foreground text-xs">
                  {cfg ? configFileName(selectedApp?.label) : "soul.mcp.json"}
                </span>
                {cfg ? (
                  <Button
                    className="h-7 rounded-full border-white/15 px-3 text-xs"
                    onClick={copyConfig}
                    size="sm"
                    variant="outline"
                  >
                    {copied ? (
                      <Check aria-hidden className="size-3.5" />
                    ) : (
                      <Copy aria-hidden className="size-3.5" />
                    )}
                    {copied ? "Copied" : "Copy config"}
                  </Button>
                ) : (
                  <span className="font-mono text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
                    awaiting selection
                  </span>
                )}
              </div>
              {cfg?.note ? (
                <p className="mt-2 text-muted-foreground text-xs leading-relaxed">{cfg.note}</p>
              ) : null}
            </div>

            {/* dark well */}
            {cfg ? (
              <div className={cn("space-y-5 p-4 sm:p-5", WELL_BG)}>
                <Tabs className="gap-5" defaultValue="hosted">
                  <TabsList className="h-auto justify-start gap-2 rounded-full bg-transparent p-0">
                    <TabsTrigger className={PILL_TRIGGER} value="hosted">
                      <Globe aria-hidden />
                      Hosted (HTTP)
                    </TabsTrigger>
                    <TabsTrigger className={PILL_TRIGGER} value="stdio">
                      <Terminal aria-hidden />
                      Local (stdio)
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent className="space-y-4" value="hosted">
                    <ConfigRow label="URL">
                      <AddressChip head={28} label="hosted URL" tail={8} value={cfg.hosted.url} />
                    </ConfigRow>
                    <Separator className="bg-white/10" />
                    <div className="space-y-3">
                      <p className="font-mono text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
                        Headers
                      </p>
                      {Object.entries(cfg.hosted.headers).map(([key, value]) => {
                        const isAuthorization = key.toLowerCase() === "authorization";
                        return (
                          <ConfigRow key={key} label={key}>
                            {isAuthorization ? (
                              <span className="break-all text-right font-mono text-muted-foreground text-xs">
                                {value}
                              </span>
                            ) : (
                              <AddressChip head={24} label={key} tail={8} value={value} />
                            )}
                          </ConfigRow>
                        );
                      })}
                    </div>
                  </TabsContent>

                  <TabsContent className="space-y-4" value="stdio">
                    <ConfigRow label="Command">
                      <AddressChip head={28} label="command" tail={8} value={cfg.stdio.command} />
                    </ConfigRow>
                    <Separator className="bg-white/10" />
                    <ConfigRow label="Args">
                      <AddressChip
                        head={28}
                        label="args"
                        tail={8}
                        value={cfg.stdio.args.join(" ")}
                      />
                    </ConfigRow>
                    <Separator className="bg-white/10" />
                    <ConfigRow label="Credentials path" sensitive>
                      <AddressChip
                        head={28}
                        label="credentials path"
                        tail={8}
                        value={cfg.stdio.credentialsPath}
                      />
                    </ConfigRow>
                  </TabsContent>
                </Tabs>

                {/* raw JSON */}
                <div className="border-white/8 border-t pt-4">
                  <button
                    aria-expanded={rawOpen}
                    className="flex items-center gap-1.5 rounded-sm font-mono text-muted-foreground text-xs transition-colors hover:text-foreground"
                    onClick={() => setRawOpen((o) => !o)}
                    type="button"
                  >
                    <ChevronDown
                      aria-hidden
                      className={cn(
                        "size-3.5 transition-transform motion-safe:duration-200",
                        rawOpen && "rotate-180"
                      )}
                    />
                    {rawOpen ? "Hide raw JSON" : "Show raw JSON"}
                  </button>
                  {rawOpen ? (
                    <pre
                      aria-label="Raw MCP config JSON (scrollable)"
                      className="mt-3 max-h-80 overflow-auto rounded-md border border-white/8 bg-black/40 p-3 font-mono text-muted-foreground text-xs leading-relaxed"
                      tabIndex={0}
                    >
                      {JSON.stringify(cfg, null, 2)}
                    </pre>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className={cn("grid min-h-[14rem] place-items-center p-8", WELL_BG)}>
                <p className="max-w-xs text-center font-mono text-muted-foreground text-xs leading-relaxed">
                  {apps.length === 0
                    ? "// grant a delegate key first — its config renders here"
                    : "// pick a tool on the left — its config renders here"}
                </p>
              </div>
            )}

            {/* honest footer — logout is not revoke */}
            <p
              className={cn(
                "border-white/8 border-t px-4 py-3 text-muted-foreground text-xs leading-relaxed",
                BAR_BG
              )}
            >
              <span className="font-mono text-foreground/80">memwal_logout</span> wipes this
              client's local credentials only — it does{" "}
              <span className="font-medium text-foreground">not</span> revoke the on-chain delegate
              key.{" "}
              <Link
                className="underline underline-offset-2 transition-colors hover:text-foreground"
                href="/permissions"
              >
                Revoke on Permissions
              </Link>{" "}
              to kill access for real.
            </p>
          </section>

          {cfg ? (
            <DisclosureNote
              title="This config is a template — it does not contain your key"
              tone="info"
            >
              Your real delegate key was shown exactly once, when access was granted. Replace the
              Authorization placeholder with the key you saved — or revoke and re-grant on the{" "}
              <Link
                className="underline underline-offset-2 transition-colors hover:text-foreground"
                href="/permissions"
              >
                Permissions
              </Link>{" "}
              page to mint a new one.
            </DisclosureNote>
          ) : null}

          {/* the six tools */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <CardTitle as="h2" className="text-base">
                  What your client gains
                </CardTitle>
                <span className="font-mono text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
                  6 tools · no ask
                </span>
              </div>
              <CardDescription>
                Four memory tools plus two session tools. There is no ask tool — for question
                answering, the client recalls memories and reasons over them. Zero-plaintext vault
                items never surface here: they are encrypted in your browser and never indexed, so
                no connected tool can recall them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-wrap gap-2">
                {MEMWAL_MCP_TOOLS.map((tool) => (
                  <li
                    className="rounded-full border border-white/10 px-3 py-1 font-mono text-muted-foreground text-xs"
                    key={tool}
                  >
                    {tool}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ConfigRow({
  label,
  sensitive,
  children,
}: {
  label: string;
  sensitive?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-foreground/85 text-xs">{label}</span>
        {sensitive ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <StatusPill tone="warning">Sensitive</StatusPill>
            </TooltipTrigger>
            <TooltipContent>Keep this secret. Revoke the key to cut access.</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {children}
    </div>
  );
}
