"use client";

/*
 * Namespace checkbox pills — the scope picker shared by the Permissions grant form and the
 * Marketplace listing/send forms (identical grammar everywhere a key's reach is chosen).
 */
import { NAMESPACES, type Namespace } from "@soul/shared";
import { NAMESPACE_META } from "@/components/soul/namespace-meta";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function ScopePills({
  idPrefix,
  onToggle,
  selected,
}: {
  idPrefix: string;
  onToggle: (n: Namespace) => void;
  selected: Namespace[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {NAMESPACES.map((n) => {
        const meta = NAMESPACE_META[n];
        const Icon = meta.Icon;
        const checked = selected.includes(n);
        return (
          <Label
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 transition-colors",
              checked
                ? "border-pulse/40 bg-pulse/10 text-foreground"
                : "border-white/15 text-muted-foreground hover:border-white/30 hover:text-foreground"
            )}
            htmlFor={`${idPrefix}-${n}`}
            key={n}
            title={meta.description}
          >
            <Checkbox checked={checked} id={`${idPrefix}-${n}`} onCheckedChange={() => onToggle(n)} />
            <Icon aria-hidden className="size-3.5" />
            <span className="text-sm">{meta.label}</span>
          </Label>
        );
      })}
    </div>
  );
}

/** Toggle a namespace in a selection list. */
export function toggleNamespace(list: Namespace[], n: Namespace): Namespace[] {
  return list.includes(n) ? list.filter((x) => x !== n) : [...list, n];
}
