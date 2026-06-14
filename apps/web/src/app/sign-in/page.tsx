"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { HeartField } from "@/components/pulse/heart-field";
import { DisclosureNote } from "@/components/soul/disclosure-note";
import { SoulMark } from "@/components/soul/soul-mark";
import { Button } from "@/components/ui/button";
import { devSignIn, getToken } from "@/lib/auth";
import { enokiConfigured, startGoogleSignIn } from "@/lib/enoki";

/**
 * The sign-in surface (the Enoki-session boundary; CLAUDE.md §7). Unauthenticated visits to any
 * app route land here (AppShell redirects); a successful sign-in continues to /overview.
 */
export default function SignInPage() {
  const router = useRouter();
  const [googleBusy, setGoogleBusy] = useState(false);
  const [devBusy, setDevBusy] = useState(false);
  const live = enokiConfigured();

  // Already signed in? The dashboard, not the gate, is your home.
  useEffect(() => {
    (async () => {
      if (await getToken()) {
        router.replace("/overview");
      }
    })();
  }, [router]);

  async function handleGoogle() {
    setGoogleBusy(true);
    try {
      await startGoogleSignIn(); // redirects to Google; resolves only on failure
    } catch (e) {
      toast.error((e as Error).message);
      setGoogleBusy(false);
    }
  }

  // Dev mode (no Enoki keys): the documented mock-adapter entry path (CLAUDE.md §7).
  async function handleDev() {
    setDevBusy(true);
    try {
      await devSignIn();
      router.replace("/overview");
    } catch (e) {
      toast.error((e as Error).message);
      setDevBusy(false);
    }
  }

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-black lg:grid-cols-2" id="main">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grain opacity-[0.03]" />

      {/* left: the sign-in, centered in its half */}
      <div className="relative flex items-center justify-center px-6 py-14">
        <SignInPanel
          devBusy={devBusy}
          googleBusy={googleBusy}
          live={live}
          onDev={handleDev}
          onGoogle={handleGoogle}
        />
      </div>

      {/* right: the beating soul — the hero's heart, verbatim (same container heights + seed,
          so the mini hearts render at the exact hero scale) */}
      <div className="relative order-first flex items-center justify-center lg:order-none">
        <div className="relative h-[46svh] w-full lg:h-[74svh]">
          <HeartField className="absolute inset-0" seed={17} />
        </div>
      </div>
    </main>
  );
}

function SignInPanel({
  live,
  googleBusy,
  devBusy,
  onGoogle,
  onDev,
}: {
  live: boolean;
  googleBusy: boolean;
  devBusy: boolean;
  onGoogle: () => void;
  onDev: () => void;
}) {
  return (
    <div className="relative w-full max-w-md animate-fade-up space-y-7 text-center">
      <div className="flex flex-col items-center gap-4">
        <SoulMark animate className="size-14" />
        <div className="space-y-2.5">
          <p className="eyebrow text-muted-foreground">[ your second soul ]</p>
          <h1 className="type-etched text-5xl">
            Step into the <span className="font-soul text-pulse-soft">void.</span>
          </h1>
          <p className="measure mx-auto text-balance text-muted-foreground">
            A portable, user-owned memory built from your own data. Sign in to create and own your
            soul. Your Soul. Your Data. Your Life.
          </p>
        </div>
      </div>

      {live ? (
        <div className="space-y-3">
          <Button
            className="glow-pulse w-full gap-2 rounded-full"
            disabled={googleBusy}
            isLoading={googleBusy}
            onClick={onGoogle}
            size="lg"
          >
            {!googleBusy && <GoogleGlyph />}
            Continue with Google
          </Button>
          <p className="font-mono text-[0.68rem] text-muted-foreground uppercase tracking-[0.14em]">
            no seed phrase · no wallet · no gas
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <Button
            className="glow-pulse w-full rounded-full"
            disabled={devBusy}
            isLoading={devBusy}
            onClick={onDev}
            size="lg"
          >
            Continue in dev mode
          </Button>
          <DisclosureNote className="text-left" title="Local dev session" tone="info">
            Google sign-in isn't configured here, so this creates a mock session against the local
            API. Set NEXT_PUBLIC_ENOKI_PUBLIC_KEY and NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable Enoki
            zkLogin.
          </DisclosureNote>
        </div>
      )}
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg aria-hidden className="size-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M23.06 12.25c0-.85-.07-1.46-.22-2.1H12v3.81h6.32c-.13 1.04-.82 2.6-2.36 3.66l-.02.14 3.43 2.66.24.02c2.18-2.01 3.45-4.96 3.45-8.19z"
        fill="#4285F4"
      />
      <path
        d="M12 23.5c3.12 0 5.74-1.03 7.65-2.8l-3.65-2.83c-.98.68-2.29 1.16-4 1.16-3.06 0-5.65-2.01-6.58-4.8l-.14.01-3.56 2.76-.05.13C3.56 20.96 7.49 23.5 12 23.5z"
        fill="#34A853"
      />
      <path
        d="M5.42 14.23c-.24-.72-.38-1.49-.38-2.28s.14-1.56.37-2.28l-.01-.15-3.6-2.8-.12.06A11.51 11.51 0 0 0 .5 11.95c0 1.85.44 3.6 1.23 5.16l3.69-2.88z"
        fill="#FBBC05"
      />
      <path
        d="M12 4.87c2.17 0 3.63.94 4.47 1.72l3.26-3.18C17.73 1.55 15.12.5 12 .5 7.49.5 3.56 3.04 1.73 6.79l3.68 2.88C6.35 6.88 8.94 4.87 12 4.87z"
        fill="#EA4335"
      />
    </svg>
  );
}
