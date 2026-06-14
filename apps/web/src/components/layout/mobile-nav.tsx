"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { SoulWordmark } from "@/components/soul/soul-mark";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** Marketing nav below md: the same section anchors, in a sheet. */
export function MobileNav({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button aria-label="Open menu" className="size-10 md:hidden" size="icon" variant="ghost">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-72 bg-sidebar" side="left">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <div className="px-1 py-2">
          <SoulWordmark />
        </div>
        <nav aria-label="Sections" className="mt-4 flex flex-col gap-1">
          {links.map((l) => (
            <a
              className="rounded-lg px-3 py-2.5 text-muted-foreground text-sm transition-colors hover:bg-sidebar-accent/50 hover:text-foreground"
              href={l.href}
              key={l.href}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </a>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
