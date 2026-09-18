import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { ReceiptStamp } from "@/components/cards/receipt-card";
import { GridPulse } from "@/components/ui/grid-pulse";
import { KeeperHubMark } from "@/components/ui/keeperhub-mark";

/*
 * Any address the app does not have (Abu, 2026-09-18: there was no page of
 * our own, only Next's plain one).
 *
 * The landing's paint: the hero's grid under a wash of the mark's green, and
 * the closing call to action's receipt — meta strip, perforation, display
 * headline — stamped 404 the way a failed card is stamped VOID. Three ways
 * on: the app, the landing, the guide. The logo goes home, as it does in the
 * app's header.
 *
 * Text: messages/en/pages.json (decision 41).
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pages.notFound");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function NotFound() {
  const t = await getTranslations("pages.notFound");

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-background">
      <GridPulse className="-z-10" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 80% 55% at 50% -10%, color-mix(in oklab, var(--neon) 7%, transparent), transparent)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at center 45%, transparent 0%, color-mix(in oklab, var(--background) 82%, transparent) 95%)",
        }}
      />

      <header className="px-5 pt-5 sm:px-8 sm:pt-7">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
        >
          <KeeperHubMark className="h-5 text-neon" />
          KeeperHub Copilot
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="relative w-full max-w-2xl">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 translate-y-6 scale-95 rounded-[28px] blur-3xl"
            style={{ background: "radial-gradient(closest-side, color-mix(in oklch, var(--primary) 22%, transparent), transparent 70%)" }}
          />

          <div className="overflow-hidden rounded-3xl bg-card p-1 shadow-[0_36px_80px_-30px_oklch(0_0_0_/_70%)] ring-[1.5px] ring-card-bezel">
            <div className="receipt-watermark relative rounded-[calc(var(--radius)*1.5)] border border-border bg-card">
              <div className="flex items-center justify-between gap-3 px-6 py-3 font-mono text-[10px] tracking-[0.22em] text-fg-muted uppercase">
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className="size-1.5 rounded-full bg-destructive" />
                  {t("kicker")}
                </span>
                <span className="max-sm:hidden">KEEPERHUB COPILOT</span>
              </div>
              <div className="perforation" />

              <div data-grid-avoid className="px-6 py-12 text-center sm:px-12 sm:py-16">
                <h1
                  className="text-balance text-[40px] leading-[1.05] tracking-tight text-foreground sm:text-[56px]"
                  style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
                >
                  {t.rich("title", { accent: (chunks) => <span className="text-primary">{chunks}</span> })}
                </h1>
                <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-fg-secondary">{t("body")}</p>

                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href="/app"
                    className="group inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-[var(--lift-action-lg)] transition-[transform,filter] hover:-translate-y-px hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {t("openApp")}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <Link
                    href="/"
                    className="inline-flex items-center rounded-full border border-border-strong px-5 py-2.5 text-sm font-medium text-foreground transition-[transform,border-color] hover:-translate-y-px hover:border-foreground/40 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {t("home")}
                  </Link>
                </div>
              </div>

              <div className="perforation" />
              <div className="flex items-center justify-center px-6 py-3 font-mono text-[10px] tracking-[0.22em] text-fg-muted uppercase">
                <Link href="/docs" className="transition-colors hover:text-foreground">
                  {t("docs")} →
                </Link>
              </div>

              <div className="pointer-events-none absolute top-14 right-6 max-sm:top-12 max-sm:right-4">
                <ReceiptStamp label="404" tone="destructive" rotate={-12} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
