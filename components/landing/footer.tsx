"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { LanguageDialog } from "@/components/shell/header/language-dialog";
import { useLocale } from "@/components/shell/locale-context";
import { DiamondMark } from "@/components/ui/diamond-mark";
import { getLocale } from "@/lib/locale";

/*
 * The footer.
 *
 * Structure ported verbatim from
 * references/portaldot-mcp/packages/web/components/blocks/footer-section.tsx.
 * Same three rows, same class strings, same telemetry strip: brand row with an
 * inline mark and a GitHub badge, a perforation, then a mono micro-label row
 * with live telemetry on the left and the link nav on the right, all inside the
 * ring-1 / p-1 double-card with the receipt watermark.
 *
 * Substituted:
 *   - copy (wordmark, tagline, link titles, telemetry labels)
 *   - `useChainPulse()` — Portaldot's Substrate head subscription does not
 *     exist here, so the one live value is KeeperHub's network count, read
 *     from the same route the hero's status chip uses. It degrades to "—"
 *     rather than inventing a number, exactly as their block/latency do.
 *
 * Text: messages/en/landing.json (decision 41).
 */

interface FooterLink {
  title: string;
  href: string;
  external?: boolean;
}

function GithubGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 .5C5.7.5.6 5.6.6 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 1.7 2.7 1.2 3.3.9.1-.7.4-1.2.7-1.5-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.4 5.6 18.3.5 12 .5Z" />
    </svg>
  );
}

/*
  Footer = a single telemetry strip. Three rows:
    1. logo · tagline · social
    2. perforation
    3. live networks · effect split · year  +  small links
  This replaces the 3-column bento footer with something that reads like
  the chain itself signed off on the page.
*/
export function Footer() {
  const t = useTranslations("landing");
  const networks = useNetworkCount();
  const nav: FooterLink[] = [
    { title: t("footer.nav.features"), href: "#features" },
    { title: t("footer.nav.how"), href: "#how" },
    { title: t("footer.nav.install"), href: "#install" },
    { title: t("footer.nav.app"), href: "/app" },
    { title: t("footer.nav.docs"), href: "https://docs.keeperhub.com", external: true },
    {
      title: "GitHub",
      href: "https://github.com/KeeperHub/keeperhub",
      external: true,
    },
  ];
  // The language picker (decision 41), so a visitor can change it before signing in.
  const [languageOpen, setLanguageOpen] = useState(false);
  const language = getLocale(useLocale().locale);

  return (
    <footer className="relative mx-auto w-full max-w-6xl px-4 pb-10 pt-16">
      <div className="overflow-hidden rounded-3xl bg-card/60 p-1 ring-1 ring-border-strong/60 backdrop-blur">
        <div className="rounded-[calc(var(--radius)*1.5)] border border-border bg-card receipt-watermark">
          {/* Row 1 — brand */}
          <div className="flex flex-col items-start justify-between gap-4 px-5 py-4 sm:flex-row sm:items-center">
            <Link href="/" className="inline-flex items-center gap-2 text-foreground">
              <DiamondMark className="size-5 text-primary" />
              <span className="font-semibold tracking-tight">KeeperHub Copilot</span>
              <span className="ml-2 hidden font-mono text-[11px] text-fg-muted sm:inline">
                · {t("footer.tagline")}
              </span>
            </Link>
            <a
              href="https://github.com/KeeperHub/keeperhub"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted transition-colors hover:border-border-strong hover:text-foreground"
            >
              <GithubGlyph className="size-3.5" />
              GitHub
            </a>
          </div>

          <div className="perforation" />

          {/* Row 2 — telemetry + links */}
          <div className="flex flex-col gap-3 px-5 py-3 text-[10px] font-mono uppercase tracking-[0.22em] text-fg-muted sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-1.5 rounded-full bg-telemetry glow-telemetry animate-[pulse-soft_2.4s_ease-in-out_infinite]"
                />
                {t("footer.live")}
              </span>
              <span>·</span>
              <span className="tabular-nums text-fg-secondary">
                {t("footer.networks", { count: networks !== null ? networks : "—" })}
              </span>
              <span>·</span>
              <span className="tabular-nums">{t("footer.effectSplit")}</span>
              <span>·</span>
              <span>KEEPERHUB · {new Date().getFullYear()}</span>
            </div>
            <nav className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {nav.map((link) =>
                link.external ? (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="transition-colors hover:text-foreground"
                  >
                    {link.title}
                  </a>
                ) : (
                  <Link key={link.href} href={link.href} className="transition-colors hover:text-foreground">
                    {link.title}
                  </Link>
                ),
              )}
              <button
                type="button"
                onClick={() => setLanguageOpen(true)}
                className="cursor-pointer uppercase transition-colors hover:text-foreground"
              >
                <span lang={language.code}>{language.native}</span>
              </button>
            </nav>
          </div>
        </div>
      </div>
      <LanguageDialog open={languageOpen} onOpenChange={setLanguageOpen} />
    </footer>
  );
}

/*
  The one live number in the strip. Stands in for Portaldot's `useChainPulse`,
  which subscribes to new heads; we have no chain socket on the marketing page,
  so this asks KeeperHub how many networks it can execute on right now — the
  same route the hero chip reads. On failure it stays null and the strip prints
  an em dash. No invented figure, ever.
*/
function useNetworkCount(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/platform/chains", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { count?: number };
        if (cancelled || typeof data.count !== "number") return;
        setCount(data.count);
      } catch {
        // Degrade silently — the strip shows "—".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return count;
}
