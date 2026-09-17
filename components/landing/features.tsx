"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/*
 * The features section.
 *
 * Structure ported verbatim from
 * references/portaldot-mcp/packages/web/components/landing/features.tsx.
 * Substituted: the copy only — the six feature entries and the section
 * heading. Everything structural is theirs: the 3-col grid with two
 * md:col-span-2 tiles, the framer-motion stagger, the conic-gradient hover
 * glow, the meta strip with the telemetry dot and the SPEC label, the
 * perforation, the receipt-watermark surface, the dot-matrix fill on the wide
 * tiles, the ring and shadow classes, the type scale.
 *
 * Their comment on the idea, kept because it still describes this file:
 *
 *   Features are rendered as a row of *capability spec receipts*. Each one
 *   reads like a printed datasheet: meta-strip with a tag, headline in the
 *   display font, a one-line subtitle in fg-secondary, perforation, body.
 *   The 2-col-span cards get an ASCII dot-matrix pattern filling the right
 *   edge, so the larger surface area never reads as wasted white space.
 *
 * SectionHeading is exported from here because the other three sections import
 * it from this file, exactly as Portaldot does.
 *
 * Text: messages/en/landing.json (decision 41).
 */

interface Feature {
  /** Its tag, title and description under landing.features.items. */
  id: "registry" | "effect" | "confirm" | "failLoudly" | "voice" | "ledger";
  className?: string;
  /** Render the dot-matrix pattern fill (used on the wide tiles). */
  matrix?: boolean;
}

const features: Feature[] = [
  { id: "registry", className: "md:col-span-2", matrix: true },
  { id: "effect" },
  { id: "confirm" },
  { id: "failLoudly" },
  { id: "voice" },
  { id: "ledger", className: "md:col-span-2", matrix: true },
];

export function Features() {
  const t = useTranslations("landing");
  return (
    <section id="features" className="relative px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <SectionHeading
          eyebrow={t("features.heading.eyebrow")}
          title={t.rich("features.heading.title", {
            em: (chunks) => <em className="font-normal italic text-telemetry">{chunks}</em>,
          })}
          subtitle={t("features.heading.subtitle")}
        />

        <div className="mt-12 grid gap-3 md:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
              className={cn("relative", f.className)}
            >
              <FeatureReceipt feature={f} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureReceipt({ feature }: { feature: Feature }) {
  const t = useTranslations("landing");
  return (
    <article className="group relative h-full overflow-hidden rounded-2xl bg-card p-1 ring-1 ring-border-strong/60 transition-shadow hover:shadow-[0_24px_60px_-30px_oklch(0_0_0_/_70%)]">
      <div className="absolute -top-12 -right-12 size-40 rounded-full opacity-0 blur-3xl transition-opacity duration-700 group-hover:opacity-30"
        aria-hidden
        style={{ background: "conic-gradient(from 38deg, var(--primary), transparent 40%)" }}
      />
      <div className="relative h-full rounded-[calc(var(--radius)*1.5)] border border-border bg-card receipt-watermark">
        <div className="flex items-center justify-between gap-3 px-4 py-2 text-[10px] font-mono uppercase tracking-[0.18em] text-fg-muted">
          <span className="inline-flex items-center gap-2 truncate">
            <span aria-hidden className="size-1.5 rounded-full bg-telemetry glow-telemetry" />
            <span className="truncate">{t(`features.items.${feature.id}.tag`)}</span>
          </span>
          <span className="shrink-0">{t("features.spec")}</span>
        </div>
        <div className="perforation" />
        <div className="relative flex h-full flex-col px-4 pb-4 pt-3">
          <h3
            className="text-[20px] leading-tight tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
          >
            {t(`features.items.${feature.id}.title`)}
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-fg-secondary">{t(`features.items.${feature.id}.description`)}</p>
          {feature.matrix && (
            <div
              aria-hidden
              className="pointer-events-none absolute right-3 top-12 size-32 opacity-30"
              style={{
                background:
                  "radial-gradient(circle at center, var(--telemetry) 0.6px, transparent 0.8px)",
                backgroundSize: "8px 8px",
                maskImage:
                  "radial-gradient(closest-side, black 50%, transparent 75%)",
              }}
            />
          )}
        </div>
      </div>
    </article>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5 }}
      className="max-w-2xl"
    >
      <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-telemetry">
        <span aria-hidden className="size-1 rounded-full bg-telemetry glow-telemetry" />
        {eyebrow}
      </span>
      <h2
        className="mt-3 text-foreground text-[34px] leading-tight tracking-tight sm:text-[44px]"
        style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
      >
        {title}
      </h2>
      {subtitle && <p className="mt-3 text-[15px] leading-relaxed text-fg-secondary">{subtitle}</p>}
    </motion.div>
  );
}
