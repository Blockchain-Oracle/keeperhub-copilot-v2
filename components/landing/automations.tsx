"use client";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { Blocks, Clock, Hand, Radio, Wallet, Webhook } from "lucide-react";

import { SectionHeading } from "./section-heading";

/*
 * Automations.
 *
 * The app can build every kind of start KeeperHub has, out of a sentence
 * (decision 20), and the landing never once said so. This is that section.
 *
 * The six are KeeperHub's own trigger types, not a marketing selection — if
 * the platform gains a seventh, it belongs here.
 *
 * Text: messages/en/landing.json (decision 41).
 */

const TRIGGERS = [
  { id: "manual", icon: Hand },
  { id: "schedule", icon: Clock },
  { id: "block", icon: Blocks },
  { id: "event", icon: Radio },
  { id: "webhook", icon: Webhook },
  { id: "payment", icon: Wallet },
] as const;

export function Automations() {
  const t = useTranslations("landing");

  return (
    <section id="automations" className="relative border-border border-t px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <SectionHeading
          eyebrow={t("automations.heading.eyebrow")}
          title={t.rich("automations.heading.title", {
            accent: (chunks) => <span className="text-primary">{chunks}</span>,
          })}
          subtitle={t("automations.heading.subtitle")}
        />

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TRIGGERS.map(({ id, icon: Icon }, index) => (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
              className="group rounded-2xl border-[1.5px] border-card-bezel bg-card p-5 shadow-[var(--lift-card)] transition-shadow hover:shadow-[var(--lift-card-hover)]"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-surface-2 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="size-[18px]" />
              </span>
              <h3
                className="mt-3.5 text-[17px] leading-tight text-foreground"
                style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
              >
                {t(`automations.triggers.${id}.title`)}
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-fg-secondary">
                {t(`automations.triggers.${id}.body`)}
              </p>
            </motion.div>
          ))}
        </div>

        <p className="mt-6 font-mono text-[11px] text-fg-muted uppercase tracking-[0.18em]">
          {t("automations.footnote")}
        </p>
      </div>
    </section>
  );
}
