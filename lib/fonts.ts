/*
 * Type — Portaldot's stack (references/portaldot-mcp/packages/web/app/layout.tsx).
 *
 * Geist and Geist Mono come through next/font. The display face, Neue Montreal,
 * is not here: Portaldot loads it from Fontshare with a <link> in the root
 * layout, and `--font-display` in globals.css names it first.
 *
 * Languages (decision 41): Geist also carries the Latin marks Turkish and
 * Vietnamese need and Cyrillic for Russian. Japanese, Korean, Chinese and Hindi
 * use the system's own fonts for their script (globals.css `:lang` rules):
 * every phone and computer ships them, nothing downloads, and next/font's
 * hundreds of CJK font slices broke the dev server.
 */
import { Geist, Geist_Mono } from "next/font/google";

export const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext", "cyrillic", "vietnamese"] });
export const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "latin-ext", "cyrillic", "vietnamese"] });

/** Every font's CSS variable, set on <html> so the language rules in globals.css can see them. */
export const fontVariables = [geistSans, geistMono].map((font) => font.variable).join(" ");
