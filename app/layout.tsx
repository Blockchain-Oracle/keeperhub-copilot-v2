import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

import { LocaleProvider } from "@/components/shell/locale-context";
import { fontVariables } from "@/lib/fonts";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: { default: t("title"), template: t("titleTemplate") },
    description: t("description"),
  };
}

/*
 * Portaldot's root layout (references/portaldot-mcp/packages/web/app/layout.tsx):
 * dark is forced — there is no light palette — and Neue Montreal arrives from
 * Fontshare before first paint.
 *
 * Languages (decisions 41–42): the page's language is the person's pick, else
 * their browser's. The screens' messages and the language picker live here,
 * above the landing page and the app alike, and the font variables sit on
 * <html> so each language's script font can be chosen in CSS.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={locale} className={`dark ${fontVariables}`}>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=neue-montreal@400,500,700,400i,500i&display=swap"
        />
      </head>
      <body>
        <NextIntlClientProvider>
          <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
