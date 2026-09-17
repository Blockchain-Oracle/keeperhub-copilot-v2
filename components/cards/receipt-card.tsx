"use client";

import * as React from "react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/*
 * The frame every card in the app wraps. Originally Portaldot's receipt card;
 * the bezel now carries the card-stack's thick soft light edge rather than a
 * hairline ring, which is what makes a card read as glass floating on the
 * ground instead of a box drawn on it.
 */

export type ReceiptTone = "default" | "success" | "pending" | "destructive";

const bezelTone: Record<ReceiptTone, string> = {
  default: "ring-card-bezel",
  success: "ring-success/45",
  pending: "ring-pending/45",
  destructive: "ring-destructive/45",
};

const innerTone: Record<ReceiptTone, string> = {
  default: "border-border",
  success: "border-success/30",
  pending: "border-pending/30",
  destructive: "border-destructive/30",
};

const dotTone: Record<ReceiptTone, string> = {
  default: "bg-telemetry shadow-[0_0_8px_var(--telemetry)]",
  success: "bg-success shadow-[0_0_8px_var(--success)]",
  pending: "bg-pending shadow-[0_0_8px_var(--pending)]",
  destructive: "bg-destructive shadow-[0_0_8px_var(--destructive)]",
};

export interface ReceiptCardProps {
  /** TOOL_NAME shown in the meta-strip (small caps mono). */
  toolName: string;
  /** Right-hand side of the meta-strip — defaults to "ISSUED · HH:MM:SS UTC". */
  metaRight?: React.ReactNode;
  tone?: ReceiptTone;
  /** Optional stamp overlay (e.g. PAID / VOID). */
  stamp?: React.ReactNode;
  /** Hide the perforation between meta and content (rare). */
  noPerforation?: boolean;
  /** Hide the watermark (rare; useful for tiny strips). */
  noWatermark?: boolean;
  /** Skip the print-reveal entrance (use inside lists). */
  noEntrance?: boolean;
  className?: string;
  children: React.ReactNode;
}

function nowStrip(issued: string) {
  const d = new Date();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${issued} · ${hh}:${mm}:${ss} UTC`;
}

export function ReceiptCard({
  toolName,
  metaRight,
  tone = "default",
  stamp,
  noPerforation,
  noWatermark,
  noEntrance,
  className,
  children,
}: ReceiptCardProps) {
  const t = useTranslations("cards");
  const issued = t("receipt.issued");
  const [strip, setStrip] = React.useState(nowStrip(issued));
  React.useEffect(() => {
    if (metaRight) return;
    const id = setInterval(() => setStrip(nowStrip(issued)), 1000);
    return () => clearInterval(id);
  }, [metaRight, issued]);

  const ref = React.useRef<HTMLDivElement>(null);
  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }

  return (
    <motion.div
      initial={noEntrance ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={cn("group relative", className)}
    >
      <div
        ref={ref}
        onMouseMove={onMouseMove}
        className={cn(
          "relative overflow-hidden rounded-2xl bg-card p-1 ring-[1.5px] transition-[box-shadow,transform]",
          "shadow-[var(--lift-card)] hover:shadow-[var(--lift-card-hover)] hover:-translate-y-px",
          bezelTone[tone],
        )}
        style={{
          animation: noEntrance ? undefined : "print 620ms cubic-bezier(0.22, 1, 0.36, 1) both",
        }}
      >
        {/* corner glow — fades in on hover */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full opacity-0 blur-3xl transition-opacity duration-700 group-hover:opacity-30"
          style={{ background: "conic-gradient(from 38deg, var(--primary), transparent 40%)" }}
        />
        {/* pointer-tracked spotlight */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(180px circle at var(--mx, 50%) var(--my, 0%), var(--accent-soft), transparent 70%)",
          }}
        />

        <div
          className={cn(
            "relative rounded-[calc(var(--radius)*1.5)] border bg-card",
            !noWatermark && "receipt-watermark",
            innerTone[tone],
          )}
        >
          {/* meta strip */}
          <div className="flex items-center justify-between gap-3 px-4 py-2 text-[10px] font-mono uppercase tracking-[0.18em] text-fg-muted">
            <span className="inline-flex items-center gap-2 truncate">
              <span aria-hidden className={cn("size-1.5 rounded-full", dotTone[tone])} />
              <span className="truncate">{toolName}</span>
            </span>
            <span className="shrink-0 tabular-nums">{metaRight ?? strip}</span>
          </div>

          {!noPerforation && <div className="perforation" />}

          {/* content */}
          <div className="relative px-4 pb-4 pt-3">{children}</div>

          {/* stamp overlay */}
          {stamp && (
            <div className="pointer-events-none absolute inset-0 flex items-start justify-end p-6">
              {stamp}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/** Stamped marker overlay — used for PAID / VOID / SIGNED. */
export function ReceiptStamp({
  label,
  tone = "success",
  rotate = -14,
}: {
  label: string;
  tone?: "success" | "destructive" | "pending";
  rotate?: number;
}) {
  const tint: Record<typeof tone, string> = {
    success: "border-success text-success",
    destructive: "border-destructive text-destructive",
    pending: "border-pending text-pending",
  };
  return (
    <motion.div
      initial={{ opacity: 0, scale: 1.3, rotate: rotate - 8 }}
      animate={{ opacity: 0.7, scale: 1, rotate }}
      transition={{ duration: 0.42, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "select-none rounded-md border-2 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.32em]",
        tint[tone],
      )}
      style={{ mixBlendMode: "screen" }}
    >
      {label}
    </motion.div>
  );
}

/** Standard meta-strip cell for the right side. Pass a label + value. */
export function ReceiptMeta({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 tabular-nums">{children}</span>;
}
