import type { ReactNode } from "react";
import { AppShell } from "@/components/soul/app-shell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
