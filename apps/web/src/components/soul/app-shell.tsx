"use client";

import {
  Activity,
  ChartLine,
  DownloadCloud,
  KeyRound,
  LogOut,
  type LucideIcon,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Search,
  Sparkles,
  Store,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { ConstellationField } from "@/components/pulse/constellation-field";
import { PulseDot } from "@/components/pulse/pulse-line";
import { ClaimUsername } from "@/components/soul/claim-username";
import { SoulMark, SoulWordmark } from "@/components/soul/soul-mark";
import { SoulOnboarding } from "@/components/soul/soul-onboarding";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SoulApiError } from "@/lib/api";
import { fetchSession, getToken, type SessionInfo, signOut, soulHandle } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  badge?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Soul",
    items: [
      { href: "/overview", label: "Overview", hint: "Vitals & activity", icon: Activity },
      { href: "/builder", label: "Builder", hint: "Import your data", icon: Sparkles },
      { href: "/inspector", label: "Memories", hint: "Browse & search", icon: Search },
    ],
  },
  {
    label: "Access",
    items: [
      { href: "/connect", label: "Connect AI", hint: "MCP clients", icon: Plug },
      { href: "/permissions", label: "Permissions", hint: "Grant & revoke", icon: KeyRound },
    ],
  },
  {
    label: "Economy",
    items: [
      {
        href: "/marketplace",
        label: "Marketplace",
        hint: "Buy & sell souls",
        icon: Store,
      },
      { href: "/analytics", label: "Analytics", hint: "Usage insights", icon: ChartLine },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/portability", label: "Portability", hint: "Restore proof", icon: DownloadCloud },
      { href: "/profile", label: "Profile", hint: "Identity & settings", icon: UserRound },
    ],
  },
];

/**
 * Authenticated app shell (the Enoki-session boundary; CLAUDE.md §7). Unauthenticated visitors
 * are redirected to /sign-in — the gate itself lives at app/sign-in/page.tsx.
 * Gating order is load-bearing: token → session → username claim → onboarding → app.
 */
const SIDEBAR_KEY = "soul.sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Restore the sidebar state after mount (localStorage is unavailable during SSR).
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === "collapsed");
  }, []);

  function toggleSidebar() {
    setCollapsed((c) => {
      window.localStorage.setItem(SIDEBAR_KEY, c ? "expanded" : "collapsed");
      return !c;
    });
  }

  const loadSession = useCallback(async () => {
    setLoading(true);
    setSessionError(null);
    const token = await getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      setSession(await fetchSession());
    } catch (e) {
      // Only a real auth rejection invalidates the token; an API outage must
      // not destroy the session (a transient 500 ≠ signed out).
      if (e instanceof SoulApiError && (e.status === 401 || e.status === 403)) {
        signOut();
      } else {
        setSessionError((e as Error).message);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  // No session and no transient error → the visitor belongs on the sign-in page.
  const unauthenticated = !(loading || session || sessionError);
  useEffect(() => {
    if (unauthenticated) {
      router.replace("/sign-in");
    }
  }, [unauthenticated, router]);

  function handleSignOut() {
    signOut();
    router.replace("/sign-in");
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-background" id="main">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <SoulMark animate className="size-10" />
          <span className="font-mono text-xs uppercase tracking-[0.18em]">waking your soul…</span>
        </div>
      </main>
    );
  }

  if (sessionError && !session) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-6" id="main">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <SoulMark className="size-10" />
          <div className="space-y-1.5">
            <h1 className="font-medium text-xl">Couldn't reach your soul</h1>
            <p className="text-muted-foreground text-sm">{sessionError}</p>
          </div>
          <Button className="rounded-full" onClick={() => void loadSession()} variant="outline">
            Retry
          </Button>
        </div>
      </main>
    );
  }

  // Redirecting to /sign-in (effect above) — keep the loading frame so nothing flashes.
  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center bg-background" id="main">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <SoulMark animate className="size-10" />
          <span className="font-mono text-xs uppercase tracking-[0.18em]">
            taking you to sign in…
          </span>
        </div>
      </main>
    );
  }

  // First run: the user must claim their Soul handle before entering the app.
  if (!session.username) {
    return <ClaimUsername onClaimed={(username) => setSession({ ...session, username })} />;
  }

  // One-time (skippable) personal-context questionnaire that seeds the soul.
  if (!session.onboarded) {
    return <OnboardingGate onDone={() => setSession({ ...session, onboarded: true })} />;
  }

  return (
    <div
      className={cn(
        "min-h-screen bg-background transition-[grid-template-columns] duration-200 lg:grid",
        collapsed ? "lg:grid-cols-[4.25rem_1fr]" : "lg:grid-cols-[16.5rem_1fr]"
      )}
    >
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col overflow-hidden border-sidebar-border border-r bg-sidebar lg:flex">
        <NavRail
          collapsed={collapsed}
          onNavigate={() => {}}
          onToggle={toggleSidebar}
          pathname={pathname}
        />
        <SidebarFooter collapsed={collapsed} onSignOut={handleSignOut} session={session} />
      </aside>

      <div className="flex min-h-screen flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-white/8 border-b bg-background/80 px-4 backdrop-blur lg:hidden">
          <Sheet onOpenChange={setMobileNav} open={mobileNav}>
            <SheetTrigger asChild>
              <Button aria-label="Open navigation" className="size-10" size="icon" variant="ghost">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="flex w-72 flex-col bg-sidebar p-0" side="left">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <NavRail onNavigate={() => setMobileNav(false)} pathname={pathname} />
              <SidebarFooter onSignOut={handleSignOut} session={session} />
            </SheetContent>
          </Sheet>
          <SoulWordmark />
          <Link
            aria-label="Your profile"
            className="grid size-10 place-items-center rounded-full border border-white/10"
            href="/profile"
          >
            <UserRound aria-hidden className="size-4 text-muted-foreground" />
          </Link>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10" id="main">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function NavRail({
  pathname,
  onNavigate,
  collapsed = false,
  onToggle,
}: {
  pathname: string | null;
  onNavigate: () => void;
  collapsed?: boolean;
  /** Present only on the desktop rail — the mobile sheet never collapses. */
  onToggle?: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden p-3">
      <div
        className={cn(
          "mb-5 flex items-center",
          collapsed ? "flex-col gap-2" : "justify-between gap-2"
        )}
      >
        <Link
          aria-label="Soul overview"
          className="flex items-center rounded-lg px-1 py-2"
          href="/overview"
          onClick={onNavigate}
        >
          {collapsed ? <SoulMark className="size-7" /> : <SoulWordmark />}
        </Link>
        {onToggle ? (
          <Button
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onToggle}
            size="icon"
            variant="ghost"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </Button>
        ) : null}
      </div>
      <nav className={cn("flex flex-col", collapsed ? "gap-4" : "gap-5")}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {collapsed ? (
              <>
                <p className="sr-only">{group.label}</p>
                <div aria-hidden className="mx-2 mb-2 border-white/8 border-t" />
              </>
            ) : (
              <p className="eyebrow mb-1.5 px-3 text-[0.65rem] text-muted-foreground">
                {group.label}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = pathname?.startsWith(item.href);
                const Icon = item.icon;
                const link = (
                  <Link
                    aria-current={active ? "page" : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    className={cn(
                      "group relative flex items-center rounded-lg text-sm transition-colors",
                      collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                    href={item.href}
                    key={item.href}
                    onClick={onNavigate}
                  >
                    {/* the red tick — active route's vital sign */}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute left-0 h-4 w-0.5 rounded-full bg-pulse transition-opacity",
                        active ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <Icon
                      aria-hidden
                      className={cn(
                        "size-4 shrink-0",
                        active
                          ? "text-pulse-soft"
                          : "text-muted-foreground group-hover:text-foreground"
                      )}
                      strokeWidth={1.75}
                    />
                    {collapsed ? null : (
                      <>
                        <span className="font-medium leading-tight">{item.label}</span>
                        {item.badge ? (
                          <span className="ml-auto rounded-full border border-gold/40 px-1.5 py-px font-mono text-[0.58rem] text-gold uppercase tracking-[0.1em]">
                            {item.badge}
                          </span>
                        ) : null}
                      </>
                    )}
                  </Link>
                );
                return collapsed ? (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">
                      {item.label}
                      {item.badge ? ` · ${item.badge}` : ""}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  link
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}

function SidebarFooter({
  session,
  onSignOut,
  collapsed = false,
}: {
  session: SessionInfo;
  onSignOut: () => void;
  collapsed?: boolean;
}) {
  const frozen = session.account ? !session.account.active : false;

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 border-sidebar-border border-t p-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              aria-label={`Your profile — ${soulHandle(session)}`}
              className="relative grid size-9 place-items-center rounded-lg hover:bg-sidebar-accent/50"
              href="/profile"
            >
              <SoulMark className="size-6" />
              <span
                aria-hidden
                className={cn(
                  "absolute top-1 right-1 size-1.5 rounded-full",
                  frozen ? "bg-warning" : "bg-success"
                )}
              />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">
            {soulHandle(session)} · {frozen ? "frozen" : "active"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Sign out"
              className="size-9 text-muted-foreground hover:text-foreground"
              onClick={onSignOut}
              size="icon"
              variant="ghost"
            >
              <LogOut className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Sign out</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-sidebar-border border-t p-3">
      <Link
        className="flex min-w-0 items-center justify-between gap-2 rounded-lg px-1 py-1 hover:bg-sidebar-accent/50"
        href="/profile"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <SoulMark className="size-7 shrink-0" />
          <span className="truncate font-mono text-xs">{soulHandle(session)}</span>
        </span>
        <span
          className={cn(
            "flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-[0.12em]",
            frozen ? "text-warning" : "text-success"
          )}
        >
          {frozen ? "frozen" : <PulseDot label="account active" />}
        </span>
      </Link>
      <Button
        className="w-full rounded-full border-white/15"
        onClick={onSignOut}
        size="sm"
        variant="outline"
      >
        Sign out
      </Button>
    </div>
  );
}

function OnboardingGate({ onDone }: { onDone: () => void }) {
  return (
    <main
      className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-6 py-12"
      id="main"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60">
        <ConstellationField form="drift" seed={31} />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grain opacity-[0.03]" />
      <div className="relative w-full max-w-xl animate-fade-up space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <SoulMark animate className="size-12" />
          <div className="space-y-1.5">
            <h1 className="type-etched text-4xl">Shape your soul</h1>
            <p className="measure mx-auto text-balance text-muted-foreground">
              Answer a few questions so your soul knows who you are. The more you share, the better
              every AI tool understands you. You can skip and finish later in your profile.
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-card p-6">
          <SoulOnboarding
            allowSkip
            initialAnswers={{}}
            onExit={() => onDone()}
            submitLabel="Finish & enter"
          />
        </div>
      </div>
    </main>
  );
}
