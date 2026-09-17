"use client";

import { useTranslations } from "next-intl";
import * as React from "react";

import { CopyChip } from "@/components/data/copy-chip";
import { Identicon } from "@/components/data/identicon";
import { cn } from "@/lib/utils";

import type { ChipTreatment } from "./card-state.ts";
import { classifyScalar } from "./format.ts";
import type { ReceiptTone } from "./receipt-card";

/*
 * Portaldot components/tools.tsx's card helpers: Mono, Row, Display,
 * useRampBigInt, MetricTile, and GenericResultCard's value rules. The small
 * label, inset and empty line are the grammar tools.tsx repeats inline
 * ("amount", the Free/Reserved tile, "—— no tasks recorded ——").
 *
 * Changes: a Row value may wrap (EVM hashes are long); the ramp starts from 0
 * on its first frame instead of a synchronous reset (React 19 lint, same
 * motion); the value rules recognise 0x addresses and hashes where Portaldot
 * recognised SS58.
 */

export const Mono = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={cn("font-mono tabular-nums text-foreground", className)}>{children}</span>
);

export const Row = ({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) => (
  <div className="flex items-center justify-between gap-4 py-1 text-sm">
    <span className="shrink-0 text-fg-muted">{k}</span>
    <span
      className={cn("min-w-0 text-right [overflow-wrap:anywhere]", strong ? "font-medium text-foreground" : "text-foreground")}
    >
      {v}
    </span>
  </div>
);

export const Display = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span
    className={cn("tabular-nums tracking-tight text-foreground", className)}
    style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
  >
    {children}
  </span>
);

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("text-[10px] font-mono uppercase tracking-[0.18em] text-fg-muted", className)}>{children}</div>
  );
}

export function Inset({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border border-border bg-surface-2/40 px-3 py-2", className)}>{children}</div>;
}

export function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-muted">—— {children} ——</p>;
}

/** Animate a bigint from 0n → target with ease-out cubic over `durMs`. */
export function useRampBigInt(target: bigint, durMs = 700): bigint {
  const [v, setV] = React.useState<bigint>(0n);
  const targetKey = String(target);
  React.useEffect(() => {
    let raf = 0;
    const start = performance.now();
    function step(t: number) {
      const k = Math.min(1, Math.max(0, (t - start) / durMs));
      const eased = 1 - Math.pow(1 - k, 3);
      // scale by 1e9 to keep precision through the bigint multiply
      const SCALE = 1_000_000_000n;
      const num = (target * BigInt(Math.round(eased * 1e9))) / SCALE;
      setV(num);
      if (k < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [targetKey, durMs, target]);
  return v;
}

export function MetricTile({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 px-3 py-2">
      <div className="text-[9px] font-mono uppercase tracking-[0.22em] text-fg-muted">{label}</div>
      <div
        className={cn("mt-0.5 truncate text-foreground", large ? "text-[18px]" : "text-[15px]")}
        style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
      >
        {value}
      </div>
    </div>
  );
}

/* v1's chip treatments on Portaldot's tones: the in-flight accent reads pending, failure destructive. */
export function toneFor(treatment: ChipTreatment): ReceiptTone {
  if (treatment === "accent") return "pending";
  if (treatment === "heavy") return "destructive";
  return "default";
}

/* Portaldot GenericResultCard's renderVal. */
export function ResultValue({ value }: { value: unknown }): React.ReactNode {
  const t = useTranslations("cards");
  if (value === null || value === undefined) return <span className="text-fg-muted">—</span>;
  if (typeof value === "string") {
    const kind = classifyScalar(value);
    if (kind === "address") {
      return (
        <span className="inline-flex items-center gap-1.5">
          <Identicon address={value} size={14} />
          <CopyChip value={value} />
        </span>
      );
    }
    if (kind === "hash" || (/^0x[0-9a-fA-F]+$/.test(value) && value.length > 20)) return <CopyChip value={value} />;
    if (kind === "number") return <Mono>{value}</Mono>;
    return <span className="text-foreground">{value}</span>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <Mono>{String(value)}</Mono>;
  }
  if (Array.isArray(value)) {
    return (
      <span className="text-fg-muted">{t("parts.items", { count: value.length })}</span>
    );
  }
  if (typeof value === "object") {
    return (
      <div className="text-right">
        {Object.entries(value as Record<string, unknown>).map(([sk, sv]) => (
          <div key={sk} className="text-xs text-fg-muted">
            {sk}:{" "}
            <span className="text-foreground">{typeof sv === "object" ? JSON.stringify(sv) : String(sv)}</span>
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(value)}</span>;
}

export function ResultRows({ data, labelFor }: { data: unknown; labelFor: (key: string) => string }) {
  const t = useTranslations("cards");
  if (data === null || data === undefined) return <EmptyLine>{t("parts.noData")}</EmptyLine>;
  const entries: Array<[string, unknown]> = Array.isArray(data)
    ? data.map((value, index) => [`#${index + 1}`, value])
    : typeof data === "object"
      ? Object.entries(data as Record<string, unknown>).map(([key, value]) => [labelFor(key), value])
      : [[t("parts.value"), data]];
  if (entries.length === 0) return <EmptyLine>{t("parts.noData")}</EmptyLine>;
  return (
    <div className="divide-y divide-border/60">
      {entries.map(([k, v]) => (
        <Row key={k} k={k} v={<ResultValue value={v} />} />
      ))}
    </div>
  );
}
