import type { Namespace } from "@soul/shared";
import { AtSign, FileText, type LucideIcon, UserRound } from "lucide-react";

/**
 * Per-namespace presentation metadata. Single source of truth for labels, icons, and the
 * warm, brand-cohesive accent each memory domain reads in. Consumed by NamespaceBadge,
 * the builder source picker, and the inspector filter rail.
 */
export interface NamespaceMeta {
  label: string;
  /** One honest sentence about what lives here. */
  description: string;
  Icon: LucideIcon;
  /** CSS custom property holding this namespace's accent color (theme-aware). */
  colorVar: string;
}

export const NAMESPACE_META = {
  bio: {
    label: "Bio",
    description: "Who you are — identity, story, the human core of your soul.",
    Icon: UserRound,
    colorVar: "var(--ns-bio)",
  },
  docs: {
    label: "Documents",
    description: "Files and long-form writing you've uploaded.",
    Icon: FileText,
    colorVar: "var(--ns-docs)",
  },
  social: {
    label: "Social",
    description: "Your own X, LinkedIn, and GitHub data — never anyone else's.",
    Icon: AtSign,
    colorVar: "var(--ns-social)",
  },
} satisfies Record<Namespace, NamespaceMeta>;
