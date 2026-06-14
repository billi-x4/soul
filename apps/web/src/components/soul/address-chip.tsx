"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

function shorten(value: string, head: number, tail: number) {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/**
 * AddressChip — renders a Sui address / object ID / blob ID in mono, shortened, with
 * copy-on-click. Cryptographic identifiers are always mono so they read as real on-chain data.
 */
export function AddressChip({
  value,
  label,
  href,
  head = 6,
  tail = 4,
  className,
}: {
  value: string;
  /** Accessible name, e.g. "Account object ID". */
  label?: string;
  /** Optional explorer link; when set, the value becomes a link and copy stays separate. */
  href?: string;
  head?: number;
  tail?: number;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (await copyText(value)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } else {
      toast.error("Couldn't copy to the clipboard.");
    }
  }

  const short = shorten(value, head, tail);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 py-0.5 pr-1 pl-2 font-mono text-muted-foreground text-xs",
        className
      )}
    >
      {href ? (
        <a
          className="rounded-sm text-foreground/80 underline-offset-2 hover:text-foreground hover:underline focus-visible:underline"
          href={href}
          rel="noreferrer"
          target="_blank"
          title={value}
        >
          {short}
        </a>
      ) : (
        <span className="text-foreground/80" title={value}>
          {short}
        </span>
      )}
      <button
        aria-label={copied ? "Copied" : `Copy ${label ?? "value"}`}
        // p-2/-m-2 keeps the visual size but grows the hit target to ≥36px (WCAG 2.5.8)
        className="-m-2 grid size-5 place-items-center rounded-sm p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        onClick={copy}
        type="button"
      >
        {copied ? (
          <Check aria-hidden className="size-3 text-success" />
        ) : (
          <Copy aria-hidden className="size-3" />
        )}
      </button>
    </span>
  );
}
