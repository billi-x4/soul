"use client";

/*
 * Shared MCP connection-config presentation — used by the Permissions grant dialog and the
 * Marketplace buy/claim reveal (the two shown-once delegate-key ceremonies) plus the secret-less
 * template views. One implementation so the "this key is a password" rules hold everywhere:
 *   - copy is awaited and failure is reported honestly (a false "Copied" loses the key forever),
 *   - the shown-once dialog refuses to be destroyed by Esc / overlay click / X until the user
 *     confirms they saved the key (it is never retrievable again).
 */
import type { McpConnectionConfig } from "@soul/shared";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { AddressChip } from "@/components/soul/address-chip";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { copyText } from "@/lib/clipboard";

/** MCP config as routes return it — template variants carry a note. */
export type McpConfig = McpConnectionConfig & { note?: string };

/** Hosted-HTTP block. `secret` renders every header as a copyable chip (the real key). */
export function HostedBlock({ mcp, secret }: { mcp: McpConfig; secret: boolean }) {
  return (
    <div className="space-y-1.5">
      <p className="eyebrow text-muted-foreground">Hosted · HTTP</p>
      <div className="space-y-2 rounded-lg border border-white/10 bg-black/40 p-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-mono text-muted-foreground">URL</span>
          <AddressChip head={18} label="MCP URL" tail={8} value={mcp.hosted.url} />
        </div>
        {Object.entries(mcp.hosted.headers).map(([key, val]) => {
          const isPlaceholder = !secret && key.toLowerCase() === "authorization";
          return (
            <div className="flex items-center justify-between gap-2 text-xs" key={key}>
              <span className="font-mono text-muted-foreground">{key}</span>
              {isPlaceholder ? (
                <span className="break-all text-right font-mono text-muted-foreground">{val}</span>
              ) : (
                <AddressChip head={10} label={key} tail={6} value={val} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ToolPills({ tools }: { tools: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tools.map((t) => (
        <span
          className="rounded-full border border-white/10 px-2.5 py-0.5 font-mono text-muted-foreground text-xs"
          key={t}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

export function RawJsonCollapsible({ mcp }: { mcp: McpConfig }) {
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button className="px-0 text-muted-foreground" size="sm" variant="ghost">
          <ChevronDown aria-hidden className="size-4" />
          Raw JSON
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-2 max-h-60 overflow-auto rounded-md border border-white/10 bg-black/40 p-3 font-mono text-xs">
          {JSON.stringify(mcp, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Copy the full config JSON — awaited, with an honest error when the clipboard refuses. */
export function CopyConfigButton({ mcp }: { mcp: McpConfig }) {
  return (
    <Button
      className="rounded-full border-white/15"
      onClick={async () => {
        if (await copyText(JSON.stringify(mcp, null, 2))) {
          toast.success("Copied");
        } else {
          toast.error("Couldn't copy — select the Raw JSON below and copy it manually.");
        }
      }}
      variant="outline"
    >
      Copy config
    </Button>
  );
}

/**
 * Dialog for the one-time delegate-key reveal. The key inside is shown exactly once and never
 * stored, so a stray Esc or overlay click must not destroy it: the first close attempt switches
 * to an inline confirmation, and only "I saved the key" lets the dialog close.
 */
export function ShownOnceDialog({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  const [confirmingClose, setConfirmingClose] = useState(false);

  // A fresh reveal must never inherit the previous one's "did you save it?" banner.
  useEffect(() => {
    if (!open) {
      setConfirmingClose(false);
    }
  }, [open]);

  function requestClose() {
    setConfirmingClose(true);
  }

  function confirmClose() {
    setConfirmingClose(false);
    onClose();
  }

  return (
    <Dialog onOpenChange={(o) => !o && requestClose()} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="type-etched text-2xl">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {confirmingClose ? (
          <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3.5">
            <p className="text-sm leading-relaxed">
              This key is shown <span className="font-medium">once</span>. Once this dialog
              closes, it can never be displayed again. Did you copy it?
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                className="rounded-full border-white/15"
                onClick={() => setConfirmingClose(false)}
                size="sm"
                variant="outline"
              >
                Keep it open
              </Button>
              <Button
                className="rounded-full border border-destructive/40 bg-transparent text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive"
                onClick={confirmClose}
                size="sm"
                variant="outline"
              >
                I saved the key — close
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
