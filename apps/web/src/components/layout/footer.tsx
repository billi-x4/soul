import Link from "next/link";
import { PulseLine } from "@/components/pulse/pulse-line";
import { SoulWordmark } from "@/components/soul/soul-mark";

const GROUPS: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/overview", label: "Open app" },
      { href: "/builder", label: "Soul Builder" },
      { href: "/marketplace", label: "Marketplace" },
      { href: "#how", label: "How it works" },
    ],
  },
  {
    title: "Ownership",
    links: [
      { href: "/permissions", label: "Permissions" },
      { href: "/portability", label: "Portability proof" },
      { href: "#ownership", label: "What you own" },
    ],
  },
  {
    title: "Protocol",
    links: [
      { href: "https://sui.io", label: "Sui", external: true },
      { href: "https://www.walrus.xyz", label: "Walrus", external: true },
      { href: "https://seal.mystenlabs.com", label: "Seal", external: true },
      { href: "https://docs.sui.io", label: "Docs", external: true },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-white/8 border-t bg-[oklch(0.105_0.004_285)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="space-y-4">
            <SoulWordmark />
            <p className="max-w-xs text-muted-foreground text-sm leading-relaxed">
              A portable, verifiable personal memory layer on the Sui Stack, backed by Walrus.
              Create it. Own it. Use it. Sell it.
            </p>
            <p className="eyebrow text-muted-foreground">Your Soul · Your Data · Your Life</p>
          </div>
          {GROUPS.map((group) => (
            <nav aria-label={group.title} className="space-y-3" key={group.title}>
              <p className="eyebrow text-muted-foreground">{group.title}</p>
              <ul className="space-y-2.5">
                {group.links.map((l) => (
                  <li key={l.label}>
                    {l.external ? (
                      <a
                        className="text-muted-foreground text-sm transition-colors hover:text-foreground"
                        href={l.href}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {l.label}
                      </a>
                    ) : l.href.startsWith("#") ? (
                      <a
                        className="text-muted-foreground text-sm transition-colors hover:text-foreground"
                        href={l.href}
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link
                        className="text-muted-foreground text-sm transition-colors hover:text-foreground"
                        href={l.href}
                      >
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <PulseLine className="opacity-60" />

        <div className="flex flex-col gap-1.5 pb-8 pt-4 text-muted-foreground text-xs sm:flex-row sm:items-center sm:justify-between">
          <span className="font-mono">Your Soul. Your Data. Your Life.</span>
          <span>
            Testnet build. Sui objects and Walrus blobs are public — privacy comes from Seal
            encryption, nothing else.
          </span>
        </div>
      </div>
    </footer>
  );
}
