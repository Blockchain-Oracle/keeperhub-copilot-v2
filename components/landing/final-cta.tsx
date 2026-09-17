"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

/*
 * The closing call to action.
 *
 * Structure ported verbatim from
 * references/portaldot-mcp/packages/web/components/landing/final-cta.tsx —
 * the signed-proof receipt, where the card itself is the credential:
 * the blurred halo behind it, the p-1 outer ring, perforated meta strips top
 * and bottom, the display headline with one italic telemetry word, and the
 * mono signature row.
 *
 * Substituted, and only this:
 *   - the copy (the section closes on the thesis: reads flow, writes stop
 *     and ask), the primary action still goes to /app;
 *   - their live `useChainPulse` block height. We have no equivalent stream on
 *     this page, and a fabricated number is worse than none, so the signature
 *     carries the one fixed fact that plays the same role: the registry
 *     snapshot the action set is generated from.
 *
 * Text: messages/en/landing.json (decision 41).
 */
export function FinalCta() {
  const t = useTranslations("landing");
  return (
    <section className="px-4 py-24 sm:py-32">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-auto max-w-3xl"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 translate-y-6 scale-95 rounded-[28px] blur-3xl"
          style={{ background: "radial-gradient(closest-side, color-mix(in oklch, var(--primary) 28%, transparent), transparent 70%)" }}
        />

        <div className="overflow-hidden rounded-3xl bg-card p-1 ring-[1.5px] ring-card-bezel shadow-[0_36px_80px_-30px_oklch(0_0_0_/_70%)]">
          <div className="relative rounded-[calc(var(--radius)*1.5)] border border-border bg-card receipt-watermark">
            {/* meta strip — top */}
            <div className="flex items-center justify-between gap-3 px-6 py-3 text-[10px] font-mono uppercase tracking-[0.22em] text-fg-muted">
              <span className="inline-flex items-center gap-2">
                <span aria-hidden className="size-1.5 rounded-full bg-primary glow-primary" />
                KEEPERHUB COPILOT · {t("finalCta.invitation")}
              </span>
              <span>{t("finalCta.nonCustodial")}</span>
            </div>
            <div className="perforation" />

            {/* body */}
            <div className="px-6 py-12 text-center sm:px-12 sm:py-16">
              <h2
                className="text-[40px] leading-tight tracking-tight text-foreground sm:text-[56px]"
                style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
              >
                {t.rich("finalCta.title", {
                  accent: (chunks) => <span className="text-primary">{chunks}</span>,
                })}
              </h2>
              <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-fg-secondary">
                {t("finalCta.body")}
              </p>
              <div className="mt-8 flex items-center justify-center">
                <Link
                  href="/app"
                  className="group inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-[var(--lift-action-lg)] transition-[transform,filter] hover:-translate-y-px hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {t("finalCta.openApp")}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>

            <div className="perforation" />
            {/* meta strip — bottom (the signature) */}
            <div className="flex flex-col gap-2 px-6 py-3 text-[10px] font-mono uppercase tracking-[0.22em] text-fg-muted sm:flex-row sm:items-center sm:justify-between">
              <a
                href="https://github.com/KeeperHub/keeperhub"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 transition-colors hover:text-foreground"
              >
                <ShieldCheck className="size-3 text-primary" />
                {t("finalCta.signed")} · keeperhub/keeperhub
              </a>
              <span className="tabular-nums">
                {t.rich("finalCta.snapshot", {
                  highlight: (chunks) => <span className="text-foreground">{chunks}</span>,
                })}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
