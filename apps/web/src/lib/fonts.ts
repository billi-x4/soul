import { Archivo, Spectral } from "next/font/google";
import localFont from "next/font/local";

/**
 * Soul "PULSE" type system (see DESIGN.md):
 * - Archivo (variable, wght 100–900 + wdth) → display voice. The signature is
 *   weight ~220 at huge sizes: type etched into the void, not stamped on it.
 * - Geist Sans  → UI / body (precise, quiet)
 * - Geist Mono  → addresses, object IDs, keys, hashes, eyebrow kickers
 * - Spectral italic → the single human word per page ("soul.")
 */
export const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  display: "swap",
});

export const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  display: "swap",
});

export const fontDisplay = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const fontSoul = Spectral({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["italic"],
  variable: "--font-spectral",
  display: "swap",
});
