"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { fetchSession, getToken, type SessionInfo } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * Auth-aware header CTA on the marketing surface: "Sign in" for guests, or the user's Soul handle
 * linking into the app once signed in. `undefined` = still resolving (avoids a flash/layout shift).
 */
export function HeaderAccount() {
  const [session, setSession] = useState<SessionInfo | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) {
        setSession(null);
        return;
      }
      try {
        setSession(await fetchSession());
      } catch {
        setSession(null);
      }
    })();
  }, []);

  if (session === undefined) {
    return <span aria-hidden className="h-9 w-[5.5rem] animate-pulse rounded-full bg-muted" />;
  }

  // Outlined bone, not filled red: the hero CTA owns the page's single red fill.
  if (!session) {
    return (
      <Link
        className={cn(
          buttonVariants({ size: "sm", variant: "outline" }),
          "rounded-full border-white/20 bg-transparent px-4 hover:bg-white/5"
        )}
        href="/sign-in"
      >
        Sign in
      </Link>
    );
  }

  return (
    <Link
      className={cn(
        buttonVariants({ size: "sm", variant: "outline" }),
        "gap-1.5 rounded-full border-white/20 bg-transparent px-4 hover:bg-white/5"
      )}
      href="/overview"
    >
      <span className="max-w-[10rem] truncate font-mono text-xs">
        {session.username ? `${session.username}.soul` : "Open app"}
      </span>
      <ArrowRight aria-hidden className="size-3.5" />
    </Link>
  );
}
