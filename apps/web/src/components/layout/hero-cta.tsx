"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { fetchSession, getToken, type SessionInfo } from "@/lib/auth";
import { cn } from "@/lib/utils";

/** Auth-aware landing hero CTA: "Create your soul" for guests, "Open your soul" once in. */
export function HeroCta() {
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

  const signedIn = Boolean(session);
  const handle = session?.username ? `${session.username}.soul` : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* the ONE filled red element in this viewport — it carries the glow */}
        <Link
          className={cn(buttonVariants({ size: "lg" }), "glow-pulse gap-2 rounded-full px-7")}
          href={signedIn ? "/overview" : "/sign-in"}
        >
          {signedIn ? "Open your soul" : "Create your soul"}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
        <a
          className={cn(
            buttonVariants({ size: "lg", variant: "outline" }),
            "rounded-full border-white/20 bg-transparent px-6 hover:bg-white/5"
          )}
          href="#how"
        >
          See how it works
        </a>
      </div>
      {signedIn ? (
        <p className="text-muted-foreground text-sm">
          {handle ? (
            <>
              Welcome back, <span className="font-mono text-foreground text-xs">{handle}</span>.
            </>
          ) : (
            "You're signed in. Pick up where you left off."
          )}
        </p>
      ) : (
        <p className="font-mono text-[0.7rem] text-muted-foreground uppercase tracking-[0.14em]">
          Google sign-in · no seed phrase · no gas
        </p>
      )}
    </div>
  );
}
