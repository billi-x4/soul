"use client";

import { Check, Loader2, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { checkUsername, claimUsername } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { SoulMark } from "./soul-mark";

type Availability = { state: "idle" | "checking" | "ok" | "bad"; reason?: string };

/**
 * First-run identity step: the user claims their Soul handle (`<name>.soul`). Live availability
 * check, then a one-time claim. Shown by AppShell once a session exists but no handle is set.
 */
export function ClaimUsername({ onClaimed }: { onClaimed: (username: string) => void }) {
  const [value, setValue] = useState("");
  const [avail, setAvail] = useState<Availability>({ state: "idle" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (value.length < 3) {
      setAvail({
        state: value.length === 0 ? "idle" : "bad",
        reason: value.length === 0 ? undefined : "At least 3 characters.",
      });
      return;
    }
    setAvail({ state: "checking" });
    // `stale` guards the in-flight fetch, not just the timer: without it a slow check for an
    // earlier value can land late and mark the CURRENT (different) handle as available.
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const r = await checkUsername(value);
        if (!stale) {
          setAvail(r.available ? { state: "ok" } : { state: "bad", reason: r.reason });
        }
      } catch {
        if (!stale) {
          setAvail({ state: "idle" });
        }
      }
    }, 400);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [value]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (avail.state !== "ok") {
      return;
    }
    setBusy(true);
    try {
      const r = await claimUsername(value);
      toast.success(`Welcome, ${r.handle}`);
      onClaimed(r.username);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-6"
      id="main"
    >
      <div aria-hidden className="bg-aurora pointer-events-none absolute inset-0" />
      <div aria-hidden className="bg-grain pointer-events-none absolute inset-0 opacity-[0.04]" />
      <form
        className="relative w-full max-w-md animate-fade-up space-y-6 text-center"
        onSubmit={submit}
      >
        <div className="flex flex-col items-center gap-4">
          <SoulMark animate className="size-14" />
          <div className="space-y-2.5">
            <p className="eyebrow text-muted-foreground">[ first run / identity ]</p>
            <h1 className="type-etched text-4xl">Name your soul.</h1>
            <p className="measure mx-auto text-balance text-muted-foreground">
              This is your portable identity across every AI tool. Choose it carefully, it's yours
              and it's permanent.
            </p>
          </div>
        </div>

        <div className="space-y-2 text-left">
          <label className="font-medium text-sm" htmlFor="soul-username">
            Your handle
          </label>
          <div
            className={cn(
              "flex items-center rounded-full border bg-card pr-4 transition-colors focus-within:ring-2 focus-within:ring-ring",
              avail.state === "bad" && "border-destructive/50",
              avail.state === "ok" && "border-success/50"
            )}
          >
            <input
              autoCapitalize="none"
              autoComplete="off"
              autoFocus
              className="min-w-0 flex-1 bg-transparent px-4 py-2.5 font-mono text-base outline-none placeholder:text-muted-foreground"
              id="soul-username"
              onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="yourname"
              spellCheck={false}
              value={value}
            />
            <span className="font-mono font-medium text-muted-foreground">.soul</span>
            <span className="ml-2 grid w-4 place-items-center">
              {avail.state === "checking" && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
              {avail.state === "ok" && <Check className="size-4 text-success" />}
              {avail.state === "bad" && <X className="size-4 text-destructive" />}
            </span>
          </div>
          <p className="min-h-4 text-xs" role="status">
            {avail.state === "ok" && (
              <span className="text-success">{value}.soul is available.</span>
            )}
            {avail.state === "bad" && <span className="text-destructive">{avail.reason}</span>}
            {(avail.state === "idle" || avail.state === "checking") && (
              <span className="text-muted-foreground">
                3–20 lowercase letters, numbers, or hyphens.
              </span>
            )}
          </p>
        </div>

        <Button
          className="glow-pulse w-full rounded-full"
          disabled={avail.state !== "ok" || busy}
          isLoading={busy}
          size="lg"
          type="submit"
        >
          {busy ? "Claiming" : `Claim ${value ? `${value}.soul` : "your handle"}`}
        </Button>
      </form>
    </main>
  );
}
