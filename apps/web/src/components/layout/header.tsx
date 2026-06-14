import Link from "next/link";
import { HeaderAccount } from "@/components/layout/header-account";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SoulWordmark } from "@/components/soul/soul-mark";

const LINKS = [
  { href: "#product", label: "Product" },
  { href: "#how", label: "How it works" },
  { href: "#ecosystem", label: "Ecosystem" },
  { href: "#marketplace", label: "Marketplace" },
  { href: "#ownership", label: "Ownership" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-white/8 border-b bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <span className="flex items-center gap-1">
          <MobileNav links={LINKS} />
          <Link aria-label="Soul home" className="shrink-0" href="/">
            <SoulWordmark />
          </Link>
        </span>
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a
              className="rounded-full px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
              href={l.href}
              key={l.href}
            >
              {l.label}
            </a>
          ))}
        </nav>
        <HeaderAccount />
      </div>
    </header>
  );
}
