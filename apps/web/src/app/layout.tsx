import type { Metadata, Viewport } from "next";
import { TailwindIndicator } from "@/components/tailwind-indicator";
import { Toaster } from "@/components/ui/sonner";
import { VercelAnalytics } from "@/lib/analytics/vercel";
import { fontDisplay, fontSoul, geistMono, geistSans } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import { Providers } from "@/providers/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "Soul — Your Second Soul",
  description:
    "Create your soul once from your own data. Own it on Sui. Use it in every AI tool over MCP, and grant or revoke each app's access on-chain. Your Soul. Your Data. Your Life.",
  applicationName: "Soul",
  openGraph: {
    title: "Soul — Create it. Own it. Use it. Sell it.",
    description:
      "A portable, verifiable personal memory layer on the Sui Stack, backed by Walrus. Your Soul. Your Data. Your Life.",
    type: "website",
  },
};
interface RootLayoutProps {
  children: React.ReactNode;
}

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "oklch(0.13 0.005 285)",
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    // The void is the brand: Soul ships dark-only (see DESIGN.md).
    <html className="dark" lang="en" suppressHydrationWarning>
      <head>{/* */}</head>

      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          geistSans.variable,
          geistMono.variable,
          fontDisplay.variable,
          fontSoul.variable
        )}
      >
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Providers attribute="class" defaultTheme="dark" forcedTheme="dark">
          {children}
          <TailwindIndicator />
          <Toaster />
        </Providers>
        <VercelAnalytics />
      </body>
    </html>
  );
}
