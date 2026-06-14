"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SoulMark } from "@/components/soul/soul-mark";
import { Button } from "@/components/ui/button";
import { loginWithJwt } from "@/lib/auth";
import { completeGoogleSignIn } from "@/lib/enoki";

/**
 * Enoki zkLogin callback: completes the Google round-trip, exchanges the verified JWT for a Soul
 * session, and enters the app. Errors fall back to the sign-in screen.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) {
      return;
    }
    ran.current = true;
    (async () => {
      try {
        const jwt = await completeGoogleSignIn();
        await loginWithJwt(jwt);
        router.replace("/overview");
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [router]);

  return (
    <main
      className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-6"
      id="main"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative flex flex-col items-center gap-4 text-center">
        <SoulMark animate className="size-12" />
        {error ? (
          <>
            <div className="space-y-1">
              <p className="font-medium">Sign-in didn't complete</p>
              <p className="measure text-muted-foreground text-sm">{error}</p>
            </div>
            <Button asChild className="rounded-full">
              <Link href="/sign-in">Back to sign in</Link>
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">Finishing your sign-in…</p>
        )}
      </div>
    </main>
  );
}
