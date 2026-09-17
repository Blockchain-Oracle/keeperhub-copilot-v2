"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

/*
 * The heading every landing section wears. It used to live inside features.tsx,
 * which the other sections imported it from; that file is gone, so it has its
 * own home now.
 */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  centered = false,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
  centered?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5 }}
      className={centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}
    >
      <span className="inline-flex items-center gap-2 font-mono text-[10px] text-telemetry uppercase tracking-[0.22em]">
        <span aria-hidden className="glow-telemetry size-1 rounded-full bg-telemetry" />
        {eyebrow}
      </span>
      <h2
        className="mt-3 text-[34px] leading-tight tracking-tight text-foreground sm:text-[44px]"
        style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
      >
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-3 text-[15px] leading-relaxed text-fg-secondary">{subtitle}</p>
      ) : null}
    </motion.div>
  );
}
