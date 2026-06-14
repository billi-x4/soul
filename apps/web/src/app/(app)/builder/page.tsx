"use client";

import { CloudUpload, FileText, Inbox, Lock, Sparkles } from "lucide-react";
import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { toast } from "sonner";
import { Eyebrow } from "@/components/pulse/eyebrow";
import { PulseDot } from "@/components/pulse/pulse-line";
import {
  DisclosureNote,
  EmptyState,
  NAMESPACE_META,
  NamespaceBadge,
  StatusPill,
  type StatusTone,
  VaultGate,
} from "@/components/soul";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { MAX_INGEST_TEXT_CHARS, type Namespace, type VaultStatus } from "@soul/shared";
import { soulFetch } from "@/lib/api";
import {
  addPrivateFile,
  addPrivateText,
  fetchVaultStatus,
  getUnlockedKey,
} from "@/lib/vault";
import { cn } from "@/lib/utils";

const NAMESPACES = ["bio", "docs", "social"] as const;
type Job = {
  id: string;
  sourceType: string;
  namespace: string;
  status: string;
  error?: string | null;
};

/** Map an ingestion job status to a StatusPill tone (ready->success, error->danger, else pending). */
const statusTone = (s: string): StatusTone =>
  s === "ready" ? "success" : s === "error" ? "danger" : "pending";

/** Human label for a source type, falling back to the raw value. */
const SOURCE_LABEL: Record<string, string> = {
  paste: "Pasted text",
  text: "Pasted text",
  document: "Document",
  github: "GitHub",
  social: "X / LinkedIn",
};

/** Type guard so NAMESPACE_META can be indexed safely under noUncheckedIndexedAccess. */
const isKnownNamespace = (n: string): n is (typeof NAMESPACES)[number] =>
  (NAMESPACES as readonly string[]).includes(n);

/** The three ingest sources, as pill tabs. GitHub lives inside Social. */
const SOURCE_TABS = [
  { value: "paste", label: "Paste", Icon: Sparkles },
  { value: "document", label: "Document", Icon: FileText },
  { value: "social", label: "Social", Icon: CloudUpload },
] as const;

/** Namespace (memory area) picker. Options carry each area's label and tinted icon. */
function NamespaceSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Namespace</Label>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger className="w-full sm:w-56" id={id}>
          <SelectValue placeholder="Choose a namespace" />
        </SelectTrigger>
        <SelectContent>
          {NAMESPACES.map((n) => {
            const meta = NAMESPACE_META[n];
            const Icon = meta.Icon;
            return (
              <SelectItem key={n} value={n}>
                <Icon aria-hidden style={{ color: meta.colorVar }} />
                {meta.label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Hairline form panel for one ingest source: icon ring + title + description + the form. */
function SourcePanel({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Sparkles;
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden
            className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-white/10 text-muted-foreground"
          >
            <Icon className="size-4" strokeWidth={1.5} />
          </span>
          <div className="space-y-1">
            <CardTitle as="h2">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const MAX_DOC_BYTES = 10 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;

export default function BuilderPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [text, setText] = useState("");
  const [pasteNs, setPasteNs] = useState("bio");
  const [docNs, setDocNs] = useState("docs");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [username, setUsername] = useState("");
  const [platform, setPlatform] = useState("x");
  const [archive, setArchive] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped after a successful upload to remount that file input (state alone won't clear it).
  const [docEpoch, setDocEpoch] = useState(0);
  const [archiveEpoch, setArchiveEpoch] = useState(0);
  // Privacy mode: "managed" goes through the relayer (semantic recall, plaintext disclosed);
  // "private" seals content IN THIS BROWSER first — zero plaintext leaves the tab.
  const [privacy, setPrivacy] = useState<"managed" | "private">("managed");
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [privateLabel, setPrivateLabel] = useState("");

  const loadVault = useCallback(async () => {
    setVaultError(null);
    try {
      const [status, key] = await Promise.all([fetchVaultStatus(), getUnlockedKey()]);
      setVaultStatus(status);
      setVaultKey(key);
    } catch (e) {
      // Keep a retry path: without this, a transient failure would pin Private mode
      // on the "checking" placeholder forever.
      setVaultError((e as Error).message);
    }
  }, []);

  // Resolve the vault state lazily, the first time Private mode is opened.
  useEffect(() => {
    if (privacy !== "private" || vaultStatus || vaultError) {
      return;
    }
    void loadVault();
  }, [privacy, vaultStatus, vaultError, loadVault]);

  const refreshJobs = useCallback(async () => {
    try {
      const r = await soulFetch<{ jobs: Job[] }>("/api/ingest/jobs");
      setJobs(r.jobs);
    } catch {
      /* ignore polling errors */
    }
  }, []);

  const inFlight = jobs.filter((j) => statusTone(j.status) === "pending").length;
  const polling = inFlight > 0;

  // One initial load; `run` refreshes after each successful submit.
  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  // Poll only while a job is pending/processing. The post-submit refresh updates
  // `jobs`, which flips `polling` and starts the interval for new jobs.
  useEffect(() => {
    if (!polling) {
      return;
    }
    const t = setInterval(refreshJobs, 1500);
    return () => clearInterval(t);
  }, [polling, refreshJobs]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await refreshJobs();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const submitText = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (!text.trim()) {
        throw new Error("Enter some text");
      }
      if (text.length > MAX_INGEST_TEXT_CHARS) {
        throw new Error(
          `That's over ${MAX_INGEST_TEXT_CHARS.toLocaleString()} characters — upload it as a document instead`
        );
      }
      if (privacy === "private") {
        if (!vaultKey) {
          throw new Error("Unlock your vault first");
        }
        // Sealed locally BEFORE the request — the API only ever sees the envelope.
        await addPrivateText({
          key: vaultKey,
          namespace: pasteNs as Namespace,
          label: privateLabel.trim() || "Private note",
          text,
        });
        setText("");
        setPrivateLabel("");
        toast.success("Sealed in your browser and stored — find it under Memories → Private.");
        return;
      }
      await soulFetch("/api/ingest/text", { method: "POST", body: { namespace: pasteNs, text } });
      setText("");
      toast.success("Added — processing…");
    });
  };

  const submitDoc = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (!docFile) {
        throw new Error("Choose a file");
      }
      if (docFile.size > MAX_DOC_BYTES) {
        throw new Error("That file is over the 10 MB limit");
      }
      if (privacy === "private") {
        if (!vaultKey) {
          throw new Error("Unlock your vault first");
        }
        await addPrivateFile({ key: vaultKey, namespace: docNs as Namespace, file: docFile });
        setDocFile(null);
        setDocEpoch((n) => n + 1);
        toast.success("Encrypted in your browser and stored — find it under Memories → Private.");
        return;
      }
      const fd = new FormData();
      fd.append("file", docFile);
      fd.append("namespace", docNs);
      await soulFetch("/api/ingest/document", { method: "POST", body: fd });
      setDocFile(null);
      setDocEpoch((n) => n + 1);
      toast.success("Document uploaded — processing…");
    });
  };

  const submitSocial = (e: FormEvent) => {
    e.preventDefault();
    // GitHub is one of the social sources — a username import instead of an archive upload.
    if (platform === "github") {
      run(async () => {
        if (!username.trim()) {
          throw new Error("Enter a GitHub username");
        }
        await soulFetch("/api/ingest/github", { method: "POST", body: { username } });
        toast.success("GitHub import started…");
      });
      return;
    }
    run(async () => {
      if (!archive) {
        throw new Error("Choose your export archive");
      }
      if (archive.size > MAX_ARCHIVE_BYTES) {
        throw new Error("That archive is over the 50 MB limit");
      }
      const fd = new FormData();
      fd.append("archive", archive);
      fd.append("platform", platform);
      await soulFetch("/api/ingest/social", { method: "POST", body: fd });
      setArchive(null);
      setArchiveEpoch((n) => n + 1);
      toast.success("Import started…");
    });
  };

  return (
    <div className="stagger space-y-8">
      {/* ---------------- header ---------------- */}
      <header className="animate-fade-up space-y-3" style={{ "--i": 0 } as CSSProperties}>
        <Eyebrow index="02" tone="pulse">
          Builder
        </Eyebrow>
        <h1 className="type-etched text-3xl sm:text-4xl">
          Feed your <span className="font-soul text-pulse-soft">soul.</span>
        </h1>
        <p className="measure text-muted-foreground">
          Bring your own data — pasted notes, documents, your own social exports (X, LinkedIn,
          GitHub). Soul distills it into encrypted, searchable memory you own.
        </p>
      </header>

      {/* privacy mode — the trust decision comes before the source decision.
          Toggle buttons (aria-pressed), not radio ARIA: each button is independently
          Tab-focusable, which matches actual behavior (no roving tabindex / arrow keys). */}
      <div
        className="animate-fade-up flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Privacy mode"
        style={{ "--i": 1 } as CSSProperties}
      >
        {(
          [
            { value: "managed", label: "Managed", Icon: Sparkles, hint: "semantic recall" },
            { value: "private", label: "Private", Icon: Lock, hint: "zero-plaintext" },
          ] as const
        ).map((mode) => (
          <button
            aria-pressed={privacy === mode.value}
            className={cn(
              "flex items-center gap-2 rounded-full border px-4 py-2 font-mono text-[0.7rem] uppercase tracking-[0.12em] transition-colors",
              privacy === mode.value
                ? "border-white/30 bg-card text-foreground"
                : "border-white/10 text-muted-foreground hover:border-white/25 hover:text-foreground"
            )}
            key={mode.value}
            onClick={() => setPrivacy(mode.value)}
            type="button"
          >
            <mode.Icon
              aria-hidden
              className={cn("size-3.5", privacy === mode.value && "text-pulse-soft")}
              strokeWidth={1.75}
            />
            {mode.label}
            <span className="text-white/30">·</span>
            <span className="normal-case tracking-normal">{mode.hint}</span>
          </button>
        ))}
      </div>

      <div className="animate-fade-up" style={{ "--i": 1 } as CSSProperties}>
        {privacy === "managed" ? (
          <DisclosureNote title="Managed mode" tone="warning">
            In the default managed mode, the service reads your content in plain form to organize
            it. It is encrypted before storage, but it is not hidden from the service. Add nothing
            you would not share with the service.
          </DisclosureNote>
        ) : (
          <DisclosureNote title="Private mode — zero plaintext" tone="info">
            Content is encrypted in this browser with a key derived from your passphrase before
            anything is sent. Soul, the relayer, and Walrus only ever see ciphertext. The
            trade-off: private memories are not semantically indexed, so they never surface in
            search-by-meaning or to connected AI tools — you read them here, after unlocking.
          </DisclosureNote>
        )}
      </div>

      <div
        className="animate-fade-up grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)]"
        style={{ "--i": 2 } as CSSProperties}
      >
        {/* ---------------- source picker + form ---------------- */}
        {privacy === "private" && !vaultKey ? (
          // The vault boundary: set up or unlock before any private form is reachable.
          <Card>
            <CardContent className="p-6">
              {vaultStatus ? (
                <VaultGate
                  onUnlocked={(key) => {
                    setVaultKey(key);
                    setVaultStatus((s) => (s ? { ...s, configured: true } : s));
                  }}
                  status={vaultStatus}
                />
              ) : vaultError ? (
                <div className="space-y-3">
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Couldn&apos;t reach your vault: {vaultError}
                  </p>
                  <Button
                    className="rounded-full border-white/15"
                    onClick={() => void loadVault()}
                    variant="outline"
                  >
                    Retry
                  </Button>
                </div>
              ) : (
                <p className="font-mono text-[0.68rem] text-muted-foreground uppercase tracking-[0.16em]">
                  checking your vault…
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
        <Tabs className="gap-4" defaultValue="paste">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 sm:grid-cols-3">
            {SOURCE_TABS.map((s) => (
              <TabsTrigger
                className="h-auto rounded-full border border-white/10 px-3 py-2 text-muted-foreground data-[state=active]:border-white/30 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-none [&[data-state=active]_svg]:text-pulse-soft"
                key={s.value}
                value={s.value}
              >
                <s.Icon aria-hidden strokeWidth={1.75} />
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="paste">
            <SourcePanel
              description={
                privacy === "private"
                  ? "Sealed in your browser before it leaves this tab."
                  : "A bio, notes, anything about you."
              }
              icon={privacy === "private" ? Lock : Sparkles}
              title={privacy === "private" ? "Paste text — private" : "Paste text"}
            >
              <form className="space-y-4" onSubmit={submitText}>
                <NamespaceSelect id="paste-ns" onChange={setPasteNs} value={pasteNs} />
                {privacy === "private" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="paste-label">Label</Label>
                    <Input
                      id="paste-label"
                      maxLength={160}
                      onChange={(e) => setPrivateLabel(e.target.value)}
                      placeholder="Private note"
                      value={privateLabel}
                    />
                    <p className="font-mono text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]">
                      soul reads the label, area, and size — never the text
                    </p>
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="paste-text">Text</Label>
                  <Textarea
                    id="paste-text"
                    onChange={(e) => setText(e.target.value)}
                    placeholder="My name is…"
                    rows={6}
                    value={text}
                  />
                </div>
                <Button className="rounded-full" isLoading={busy} type="submit">
                  {privacy === "private" ? "Encrypt & store" : "Add to soul"}
                </Button>
              </form>
            </SourcePanel>
          </TabsContent>

          <TabsContent value="document">
            <SourcePanel
              description={
                privacy === "private"
                  ? "Encrypted in your browser; stored as a sealed file you can decrypt and download."
                  : "PDF, Word (.docx), text, or markdown."
              }
              icon={privacy === "private" ? Lock : FileText}
              title={privacy === "private" ? "Upload a document — private" : "Upload a document"}
            >
              <form className="space-y-4" onSubmit={submitDoc}>
                <NamespaceSelect id="doc-ns" onChange={setDocNs} value={docNs} />
                <div className="space-y-1.5">
                  <Label htmlFor="doc-file">File</Label>
                  <Input
                    accept={privacy === "private" ? undefined : ".pdf,.docx,.txt,.md"}
                    id="doc-file"
                    key={`doc-${docEpoch}`}
                    onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                    type="file"
                  />
                  <p className="font-mono text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]">
                    {privacy === "private"
                      ? "any file type — 10 MB max · filename stays readable"
                      : "pdf · docx · txt · md — 10 MB max"}
                  </p>
                </div>
                <Button className="rounded-full" isLoading={busy} type="submit">
                  {privacy === "private" ? "Encrypt & store" : "Upload"}
                </Button>
              </form>
            </SourcePanel>
          </TabsContent>

          <TabsContent value="social">
            <SourcePanel
              description={
                <>
                  Your own X or LinkedIn &ldquo;download your data&rdquo; export, or your public
                  GitHub profile. Your own data only.
                </>
              }
              icon={CloudUpload}
              title="Self-import X / LinkedIn / GitHub"
            >
              {privacy === "private" ? (
                <DisclosureNote title="Social imports are managed-only" tone="info">
                  Soul's server fetches and parses these sources, so they can't be sealed in your
                  browser first. Switch to Managed to import them — or paste the parts you care
                  about as a private note instead.
                </DisclosureNote>
              ) : (
              <form className="space-y-4" onSubmit={submitSocial}>
                <div className="space-y-1.5">
                  <Label htmlFor="social-platform">Platform</Label>
                  <Select onValueChange={setPlatform} value={platform}>
                    <SelectTrigger className="w-full sm:w-56" id="social-platform">
                      <SelectValue placeholder="Choose a platform" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="x">X</SelectItem>
                      <SelectItem value="linkedin">LinkedIn</SelectItem>
                      <SelectItem value="github">GitHub</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {platform === "github" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="gh-username">GitHub username</Label>
                    <Input
                      id="gh-username"
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="your-github-username"
                      value={username}
                    />
                    <p className="font-mono text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]">
                      public profile + repositories
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="social-archive">Export archive</Label>
                    <Input
                      accept=".zip,.json,.txt"
                      id="social-archive"
                      key={`archive-${archiveEpoch}`}
                      onChange={(e) => setArchive(e.target.files?.[0] ?? null)}
                      type="file"
                    />
                    <p className="font-mono text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]">
                      zip · json · txt — 50 MB max
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 font-mono text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]">
                  imports land in
                  <NamespaceBadge namespace="social" />
                </div>
                <Button className="rounded-full" isLoading={busy} type="submit">
                  Import
                </Button>
              </form>
              )}
            </SourcePanel>
          </TabsContent>
        </Tabs>
        )}

        {/* ---------------- ingestion feed ---------------- */}
        <Card className="lg:sticky lg:top-10">
          <CardHeader className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Eyebrow className="text-[0.68rem]" tone="smoke">
                Eventual consistency
              </Eyebrow>
              {inFlight > 0 ? (
                <span className="flex items-center gap-2 font-mono text-[0.65rem] text-pulse-soft uppercase tracking-[0.14em]">
                  <PulseDot label="ingestion in progress" />
                  processing
                </span>
              ) : null}
            </div>
            <CardTitle as="h2" className="text-base">
              Ingestion feed
            </CardTitle>
            <CardDescription>
              Jobs run async — new facts can take a few seconds after &ldquo;ready&rdquo; to become
              queryable. Private (zero-plaintext) items skip this queue: no relayer touches them,
              so they appear instantly under Memories&nbsp;→&nbsp;Private.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <EmptyState
                description="Nothing imported yet. Paste some text or upload a file to begin building your soul."
                icon={Inbox}
                title="No imports yet"
              />
            ) : (
              <ol className="space-y-0">
                {jobs.map((j) => {
                  const tone = statusTone(j.status);
                  return (
                    <li
                      className="relative border-white/8 border-l pb-5 pl-5 last:border-transparent last:pb-0"
                      key={j.id}
                    >
                      {/* timeline node — decorative; status is carried by the pill's text */}
                      <span aria-hidden className="-left-[4.5px] absolute top-1">
                        {tone === "pending" ? (
                          <PulseDot />
                        ) : (
                          <span
                            className={cn(
                              "block size-2 rounded-full",
                              tone === "danger" ? "bg-destructive" : "bg-success"
                            )}
                          />
                        )}
                      </span>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span className="font-medium text-sm">
                          {SOURCE_LABEL[j.sourceType] ?? j.sourceType}
                        </span>
                        {isKnownNamespace(j.namespace) ? (
                          <NamespaceBadge namespace={j.namespace} />
                        ) : (
                          <span className="font-mono text-muted-foreground text-xs">
                            {j.namespace}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5">
                        <StatusPill tone={tone}>{j.status}</StatusPill>
                      </div>
                      {j.error ? (
                        <p className="mt-1.5 text-destructive text-xs leading-relaxed">{j.error}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
