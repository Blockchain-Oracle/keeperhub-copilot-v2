/*
 * Type.
 *
 * The display face is Anek Latin, which is what KeeperHub itself sets
 * everything in (references/keeperhub/lib/fonts.ts). It replaces Neue Montreal,
 * a Portaldot inheritance that arrived over an external Fontshare stylesheet —
 * so headlines now match the platform and two network hops are gone.
 *
 * Geist and Geist Mono stay for body text and for numbers, addresses and
 * hashes, which are mono and tabular throughout.
 *
 * Languages (decision 41): Geist carries the Latin marks Turkish and Vietnamese
 * need and Cyrillic for Russian. Japanese, Korean, Chinese and Hindi use the
 * system's own fonts for their script (globals.css `:lang` rules): every phone
 * and computer ships them, nothing downloads, and next/font's hundreds of CJK
 * font slices broke the dev server.
 */
import { Anek_Latin, Geist, Geist_Mono } from "next/font/google";

export const display = Anek_Latin({
  variable: "--font-anek-latin",
  subsets: ["latin", "latin-ext"],
  weight: "variable",
  display: "swap",
});

export const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext", "cyrillic", "vietnamese"] });
export const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "latin-ext", "cyrillic", "vietnamese"] });

/** Every font's CSS variable, set on <html> so the language rules in globals.css can see them. */
export const fontVariables = [display, geistSans, geistMono].map((font) => font.variable).join(" ");
