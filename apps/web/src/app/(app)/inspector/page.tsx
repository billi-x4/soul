"use client";

import {
  NAMESPACES,
  type Namespace,
  type VaultItemMeta,
  type VaultStatus,
} from "@soul/shared";
import { Download, Eye, FileLock2, Layers, Lock, Pencil, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
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
  ProvenanceTag,
  VaultGate,
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
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { soulFetch } from "@/lib/api";
import {
  decryptPrivateItem,
  deletePrivateItem,
  fetchVaultStatus,
  getUnlockedKey,
  listPrivateItems,
  payloadToBlob,
} from "@/lib/vault";

type Item = {
  id: string;
  namespace: string;
  snippet?: string;
  content?: string;
  source: string;
  createdAt: string;
};
/** Namespace filters + the zero-plaintext vault view (decrypted locally, never recalled). */
const TABS = ["all", ...NAMESPACES, "private"] as const;

/** How long a keystroke rests before we hit /api/memory (Enter submits immediately). */
const SEARCH_DEBOUNCE_MS = 300;

/** Narrow an item's loosely-typed namespace string to a known Namespace for presentation. */
function asNamespace(value: string): Namespace | null {
  return (NAMESPACES as readonly string[]).includes(value) ? (value as Namespace) : null;
}

/** Generous browse window (the API caps at 100); past this the user should search. */
const BROWSE_LIMIT = 100;

export default function InspectorPage() {
  const [ns, setNs] = useState("all");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [editing, setEditing] = useState<Item | null>(null);
  const [editText, setEditText] = useState("");
  const [searching, setSearching] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // The last query that produced the current results, so empty state reads correctly.
  const [activeQuery, setActiveQuery] = useState("");
  // `browse:false` = the live relayer can't list without a query; changes the empty state.
  const [canBrowse, setCanBrowse] = useState(true);
  // Monotonic request id: a slow earlier recall must never clobber a newer result.
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    if (ns === "private") {
      return; // the vault view lists/filters locally — nothing to recall from the engine
    }
    const params = new URLSearchParams();
    if (ns !== "all") {
      params.set("namespace", ns);
    }
    if (query.trim()) {
      params.set("query", query.trim());
    }
    params.set("limit", String(BROWSE_LIMIT));
    const seq = ++requestSeq.current;
    setSearching(true);
    try {
      const r = await soulFetch<{ items: Item[]; capabilities?: { browse: boolean } }>(
        `/api/memory?${params.toString()}`
      );
      if (seq !== requestSeq.current) {
        return; // a newer search is already in flight or landed — drop this stale response
      }
      setItems(r.items);
      setActiveQuery(query.trim());
      setCanBrowse(r.capabilities?.browse ?? true);
    } catch (e) {
      if (seq === requestSeq.current) {
        toast.error((e as Error).message);
      }
    } finally {
      if (seq === requestSeq.current) {
        setSearching(false);
        setLoaded(true);
      }
    }
  }, [ns, query]);

  // Live search, debounced per keystroke; the cleanup cancels stale timers.
  useEffect(() => {
    const timer = setTimeout(load, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [load]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    load();
  };

  async function del(id: string) {
    setDeletingId(id);
    try {
      const r = await soulFetch<{ note: string }>(`/api/memory/${id}`, { method: "DELETE" });
      toast.success(r.note);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  async function saveEdit() {
    if (!editing) {
      return;
    }
    setSaving(true);
    try {
      await soulFetch(`/api/memory/${editing.id}`, {
        method: "PATCH",
        body: { content: editText },
      });
      toast.success("Updated — reprocessing…");
      setEditing(null);
      setTimeout(load, 800);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stagger mx-auto max-w-3xl space-y-8">
      <header className="stagger space-y-3">
        <div className="animate-fade-up" style={{ "--i": 0 } as CSSProperties}>
          <Eyebrow index="03" tone="pulse">
            Memories
          </Eyebrow>
        </div>
        <h1
          className="type-etched animate-fade-up text-3xl sm:text-4xl"
          style={{ "--i": 1 } as CSSProperties}
        >
          Every fact, <span className="font-soul text-pulse-soft">yours</span> to read.
        </h1>
        <p
          className="measure animate-fade-up text-muted-foreground"
          style={{ "--i": 2 } as CSSProperties}
        >
          Browse and search what Soul knows. Every fact carries its provenance, so you always know
          where a memory came from.
        </p>
      </header>

      <div className="animate-fade-up" style={{ "--i": 3 } as CSSProperties}>
        <DisclosureNote title="Editing and deleting in managed beta">
          Soul removes an item from your index right away. Full de-indexing from the underlying
          memory store lands when the MemWal beta supports it, so a recall may briefly still surface
          a deleted or edited memory.
        </DisclosureNote>
      </div>

      <section
        aria-label="Search and filter memory"
        className="animate-fade-up space-y-4"
        style={{ "--i": 4 } as CSSProperties}
      >
        <form className="relative" onSubmit={onSearch} role="search">
          <Label className="sr-only" htmlFor="inspector-search">
            Search memory
          </Label>
          <Search
            aria-hidden
            className="-translate-y-1/2 absolute top-1/2 left-4 size-4 text-muted-foreground"
          />
          <Input
            className="h-11 rounded-full border-white/15 pr-11 pl-11 font-mono text-sm shadow-none"
            id="inspector-search"
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              ns === "private"
                ? "Filter private items by label…"
                : "Describe what you're looking for…"
            }
            value={query}
          />
          {searching ? (
            <span className="-translate-y-1/2 absolute top-1/2 right-4 inline-flex">
              <PulseDot label="searching" />
            </span>
          ) : null}
        </form>

        <Tabs onValueChange={setNs} value={ns}>
          <TabsList
            aria-label="Filter by namespace"
            className="h-auto w-auto flex-wrap justify-start gap-1.5 rounded-none bg-transparent p-0"
          >
            {TABS.map((t) => {
              const meta = t === "all" || t === "private" ? null : NAMESPACE_META[t];
              const Icon = t === "private" ? Lock : (meta?.Icon ?? Layers);
              return (
                <TabsTrigger
                  className="rounded-full border border-white/10 px-3.5 py-1.5 font-mono text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em] transition-colors hover:border-white/25 hover:text-foreground data-[state=active]:border-white/25 data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  key={t}
                  value={t}
                >
                  <Icon aria-hidden className="size-3.5" />
                  {meta ? meta.label : t === "private" ? "Private" : "All"}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </section>

      <section
        aria-label="Memory items"
        className="animate-fade-up space-y-3"
        style={{ "--i": 5 } as CSSProperties}
      >
        {ns === "private" ? (
          <PrivateVault filter={query.trim().toLowerCase()} />
        ) : (
          <>
        <p className="sr-only" role="status">
          {searching ? null : `${items.length} ${items.length === 1 ? "memory" : "memories"} shown`}
        </p>
        {!loaded ? (
          <p className="font-mono text-[0.68rem] text-muted-foreground uppercase tracking-[0.16em]">
            loading your memories…
          </p>
        ) : items.length === 0 ? (
          activeQuery ? (
            <EmptyState
              description={`No memory matched "${activeQuery}". Try a broader phrase or clear the search.`}
              icon={Search}
              title="No matches"
            />
          ) : !canBrowse ? (
            <EmptyState
              description="In live managed mode the relayer recalls by meaning, not by list — type what you're looking for above and your memories will surface."
              icon={Search}
              title="Search to recall"
            />
          ) : ns !== "all" ? (
            <EmptyState
              description="Nothing in this area yet — switch to All, or add to it from the builder."
              icon={Layers}
              title="This area is empty"
            />
          ) : (
            <EmptyState
              action={
                <Button asChild className="rounded-full border-white/15" variant="outline">
                  <Link href="/builder">Open the builder</Link>
                </Button>
              }
              description="Nothing here yet. Build your soul from the builder, and items will appear with full provenance."
              icon={Layers}
              title="No memory yet"
            />
          )
        ) : (
          <>
            <p className="font-mono text-[0.68rem] text-muted-foreground uppercase tracking-[0.16em]">
              {items.length === 1 ? "1 fact" : `${items.length} facts`} in view
            </p>
            <ul className="space-y-3">
              {items.map((it) => {
                const namespace = asNamespace(it.namespace);
                return (
                  <li key={it.id}>
                    <Card className="gap-0 border-white/10 py-0 shadow-none">
                      <CardContent className="space-y-4 p-5">
                        <p className="measure text-[0.9375rem] leading-relaxed">
                          {it.snippet ?? it.content}
                        </p>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-white/8 border-t pt-3">
                          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                            {namespace ? <NamespaceBadge namespace={namespace} /> : null}
                            <ProvenanceTag at={it.createdAt} source={it.source} />
                          </div>
                          <div className="flex items-center gap-1">
                            <Dialog
                              onOpenChange={(o) => {
                                if (!o) {
                                  setEditing(null);
                                }
                              }}
                              open={editing?.id === it.id}
                            >
                              <DialogTrigger asChild>
                                <Button
                                  aria-label="Edit memory"
                                  className="size-8 rounded-full text-muted-foreground hover:text-foreground"
                                  onClick={() => {
                                    setEditing(it);
                                    setEditText(it.content ?? it.snippet ?? "");
                                  }}
                                  size="icon"
                                  variant="ghost"
                                >
                                  <Pencil aria-hidden className="size-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Edit memory</DialogTitle>
                                  <DialogDescription>
                                    Saving re-encrypts and reprocesses this item, so it may take a
                                    moment to reappear in search.
                                  </DialogDescription>
                                </DialogHeader>
                                <Label className="sr-only" htmlFor="inspector-edit">
                                  Memory content
                                </Label>
                                <Textarea
                                  id="inspector-edit"
                                  onChange={(e) => setEditText(e.target.value)}
                                  rows={6}
                                  value={editText}
                                />
                                <DialogFooter>
                                  <Button
                                    className="rounded-full"
                                    isLoading={saving}
                                    onClick={saveEdit}
                                  >
                                    Save
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  aria-label="Delete memory"
                                  className="size-8 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  size="icon"
                                  variant="ghost"
                                >
                                  <Trash2 aria-hidden className="size-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete this memory?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This removes the item from your index. It cannot be undone from
                                    here.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="rounded-full border-white/15">
                                    Keep it
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    className="rounded-full border border-destructive/40 bg-transparent text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive"
                                    disabled={deletingId === it.id}
                                    onClick={() => del(it.id)}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </>
        )}
          </>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ vault */

/**
 * The zero-plaintext view. Items are listed by their plaintext label (the one thing Soul can
 * read); content decrypts HERE, with the session vault key, on explicit request. Nothing in
 * this view ever round-trips plaintext — that is the entire point.
 */
function PrivateVault({ filter }: { filter: string }) {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [items, setItems] = useState<VaultItemMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, k, list] = await Promise.all([
        fetchVaultStatus(),
        getUnlockedKey(),
        listPrivateItems(),
      ]);
      setStatus(s);
      setVaultKey(k);
      setItems(list);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function reveal(item: VaultItemMeta) {
    if (!vaultKey) {
      return;
    }
    setWorkingId(item.id);
    try {
      const payload = await decryptPrivateItem(vaultKey, item.id);
      setRevealed((r) => ({ ...r, [item.id]: payload.text ?? "" }));
    } catch {
      toast.error("Couldn't decrypt this item — the envelope may be damaged.");
    } finally {
      setWorkingId(null);
    }
  }

  async function download(item: VaultItemMeta) {
    if (!vaultKey) {
      return;
    }
    setWorkingId(item.id);
    try {
      const payload = await decryptPrivateItem(vaultKey, item.id);
      const url = URL.createObjectURL(payloadToBlob(payload));
      const a = document.createElement("a");
      a.href = url;
      a.download = payload.filename ?? item.label;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't decrypt this file — the envelope may be damaged.");
    } finally {
      setWorkingId(null);
    }
  }

  async function del(id: string) {
    setWorkingId(id);
    try {
      const r = await deletePrivateItem(id);
      toast.success(r.note);
      setRevealed((prev) => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWorkingId(null);
    }
  }

  if (!loaded || !status) {
    return (
      <p className="font-mono text-[0.68rem] text-muted-foreground uppercase tracking-[0.16em]">
        checking your vault…
      </p>
    );
  }

  if (!status.configured) {
    return (
      <EmptyState
        action={
          <Button asChild className="rounded-full border-white/15" variant="outline">
            <Link href="/builder">Open the builder</Link>
          </Button>
        }
        description="Switch the builder to Private mode to create your vault — content is encrypted in your browser before anything leaves it."
        icon={FileLock2}
        title="No private vault yet"
      />
    );
  }

  if (!vaultKey) {
    return (
      <Card className="border-white/10 py-0 shadow-none">
        <CardContent className="p-6">
          <VaultGate onUnlocked={(key) => setVaultKey(key)} status={status} />
        </CardContent>
      </Card>
    );
  }

  const visible = filter ? items.filter((i) => i.label.toLowerCase().includes(filter)) : items;

  return (
    <div className="space-y-3">
      <DisclosureNote title="Decrypted here, never recalled" tone="info">
        These items were encrypted in your browser. They are not semantically indexed and never
        surface to connected AI tools — they decrypt only here, with your session key.
      </DisclosureNote>
      {visible.length === 0 ? (
        <EmptyState
          description={
            filter
              ? `No private item label matched "${filter}".`
              : "Nothing sealed yet. Use the builder's Private mode to add zero-plaintext memories."
          }
          icon={FileLock2}
          title={filter ? "No matches" : "Your vault is empty"}
        />
      ) : (
        <>
          <p className="font-mono text-[0.68rem] text-muted-foreground uppercase tracking-[0.16em]">
            {visible.length === 1 ? "1 sealed item" : `${visible.length} sealed items`}
          </p>
          <ul className="space-y-3">
            {visible.map((item) => (
              <li key={item.id}>
                <Card className="gap-0 border-white/10 py-0 shadow-none">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Lock aria-hidden className="size-4 text-pulse-soft" strokeWidth={1.75} />
                      <p className="font-medium text-[0.9375rem]">{item.label}</p>
                      <span className="font-mono text-[0.65rem] text-muted-foreground uppercase tracking-[0.12em]">
                        {item.kind} · {(item.sizeBytes / 1024).toFixed(1)} kB
                      </span>
                    </div>
                    {revealed[item.id] !== undefined ? (
                      <p className="measure whitespace-pre-wrap border-white/8 border-l-2 pl-4 text-[0.9375rem] leading-relaxed">
                        {revealed[item.id]}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-white/8 border-t pt-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                        <NamespaceBadge namespace={item.namespace} />
                        <ProvenanceTag at={item.createdAt} source="private vault" />
                      </div>
                      <div className="flex items-center gap-1">
                        {item.kind === "text" ? (
                          <Button
                            aria-label="Decrypt and reveal"
                            className="size-8 rounded-full text-muted-foreground hover:text-foreground"
                            disabled={workingId === item.id}
                            onClick={() =>
                              revealed[item.id] !== undefined
                                ? setRevealed((r) => {
                                    const { [item.id]: _, ...rest } = r;
                                    return rest;
                                  })
                                : reveal(item)
                            }
                            size="icon"
                            variant="ghost"
                          >
                            <Eye aria-hidden className="size-4" />
                          </Button>
                        ) : (
                          <Button
                            aria-label="Decrypt and download"
                            className="size-8 rounded-full text-muted-foreground hover:text-foreground"
                            disabled={workingId === item.id}
                            onClick={() => download(item)}
                            size="icon"
                            variant="ghost"
                          >
                            <Download aria-hidden className="size-4" />
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              aria-label="Delete private item"
                              className="size-8 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                              size="icon"
                              variant="ghost"
                            >
                              <Trash2 aria-hidden className="size-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this private item?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes it from your index. The encrypted envelope on Walrus
                                is immutable, but without your passphrase it stays unreadable to
                                anyone, forever.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-full border-white/15">
                                Keep it
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="rounded-full border border-destructive/40 bg-transparent text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive"
                                disabled={workingId === item.id}
                                onClick={() => del(item.id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
