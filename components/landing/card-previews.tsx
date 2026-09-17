"use client";

import type { ReactNode } from "react";
import { ArrowRight, Check, Clock, Zap } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * The card faces the landing shows.
 *
 * These are depictions, not the live cards: a landing page has no conversation,
 * no signed-in organisation and no chain to read, and wiring one up so the
 * marquee could show a price would couple the landing to the chat namespace and
 * the account context for no gain.
 *
 * What they are not allowed to be is a different design. The frame here is the
 * same as components/cards/receipt-card.tsx — the bezel, the mono meta strip
 * with its tone dot, the perforation, the stamp — so what the page promises is
 * what arrives. If that card changes, change these with it.
 *
 * Every figure is a real shape of the thing (an address that is an address, an
 * amount with the right number of decimals), and none of it is presented as a
 * live reading.
 */

type Tone = "default" | "success" | "pending";

const dotTone: Record<Tone, string> = {
  default: "bg-telemetry shadow-[0_0_8px_var(--telemetry)]",
  success: "bg-success shadow-[0_0_8px_var(--success)]",
  pending: "bg-pending shadow-[0_0_8px_var(--pending)]",
};

/** The receipt-card frame, minus the motion and the pointer tracking. */
export function PreviewCard({
  toolName,
  metaRight,
  tone = "default",
  stamp,
  children,
}: {
  toolName: string;
  metaRight: string;
  tone?: Tone;
  stamp?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex size-full flex-col bg-card">
      <div className="flex items-center justify-between px-4 py-2.5 font-mono text-[10px] text-fg-muted uppercase tracking-[0.18em]">
        <span className="flex items-center gap-2">
          <span aria-hidden className={cn("size-1.5 rounded-full", dotTone[tone])} />
          {toolName}
        </span>
        <span>{metaRight}</span>
      </div>
      <div className="perforation" />
      <div className="relative flex-1 px-4 pt-3 pb-4">{children}</div>
      {stamp ? (
        <span
          className={cn(
            "absolute right-4 bottom-4 rounded-md border-2 px-2.5 py-1 font-mono text-[11px] tracking-[0.32em] opacity-70",
            tone === "success" ? "border-success text-success" : "border-pending text-pending",
          )}
          style={{ mixBlendMode: "screen" }}
        >
          {stamp}
        </span>
      ) : null}
    </div>
  );
}

function Row({ k, v, mono = true }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[3px] text-[13px]">
      <span className="shrink-0 text-fg-muted">{k}</span>
      <span className={cn("truncate text-foreground", mono && "font-mono tabular-nums")}>{v}</span>
    </div>
  );
}

const SPARK = "M2 34 C24 31 40 18 64 20 C92 22 110 9 140 11 C166 13 184 6 206 4";

/* ── the five faces the stack fans ──────────────────────────────────────── */

export function PricePreview() {
  return (
    <PreviewCard toolName="chainlink · price" metaRight="ISSUED · 14:02:11 UTC">
      <div className="flex h-full items-end justify-between gap-6">
        <div>
          <p className="font-mono text-[11px] text-fg-muted uppercase tracking-[0.18em]">ETH / USD</p>
          <p
            className="mt-1 text-[46px] leading-none tabular-nums text-foreground"
            style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
          >
            4,182.55
          </p>
          <p className="mt-2 text-[12px] text-fg-secondary">Chainlink feed · Ethereum</p>
        </div>
        <svg viewBox="0 0 208 40" className="h-16 w-[208px] shrink-0" aria-hidden>
          <path d={SPARK} fill="none" stroke="var(--success)" strokeWidth="1.5" />
          <path d={`${SPARK} L206 40 L2 40 Z`} fill="var(--success)" opacity="0.1" />
        </svg>
      </div>
    </PreviewCard>
  );
}

export function WritePreview() {
  return (
    <PreviewCard toolName="erc20 · transfer" metaRight="DOC 0x91af" tone="pending">
      <p className="font-mono text-[10px] text-fg-muted uppercase tracking-[0.18em]">
        Waiting for you
      </p>
      <p
        className="mt-1 text-[19px] leading-tight text-foreground"
        style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
      >
        Send 10 USDC to alice.eth
      </p>
      <div className="mt-2.5 rounded-lg border border-border bg-surface-2/40 px-3 py-1.5">
        <Row k="amount" v="10.000000 USDC" />
        <Row k="to" v="0x4a1f…9c2e" />
        <Row k="network" v="Base" mono={false} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-[13px] font-medium text-primary-foreground shadow-[var(--lift-action)]">
          Authorize <ArrowRight className="size-3.5" />
        </span>
        <span className="rounded-full border border-border px-4 py-1.5 text-[13px] text-fg-muted">
          Cancel
        </span>
      </div>
    </PreviewCard>
  );
}

export function DryRunPreview() {
  return (
    <PreviewCard toolName="aave-v3 · supply" metaRight="CHECKED · 14:03:40 UTC" tone="pending">
      <p className="font-mono text-[10px] text-fg-muted uppercase tracking-[0.18em]">
        KeeperHub tried it first
      </p>
      <p
        className="mt-1 text-[19px] leading-tight text-foreground"
        style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
      >
        Supply 50 USDC to Aave v3
      </p>
      <div className="mt-2.5 space-y-2">
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-[13px] text-success">
          <Check className="size-4 shrink-0" />
          This would succeed. Estimated gas 0.00041 ETH.
        </div>
        <div className="rounded-lg border border-border bg-surface-2/40 px-3 py-1.5">
          <Row k="supply apy" v="4.31%" />
          <Row k="network" v="Base" mono={false} />
        </div>
      </div>
    </PreviewCard>
  );
}

export function ReceiptPreview() {
  return (
    <PreviewCard
      toolName="erc20 · transfer"
      metaRight="ISSUED · 14:04:02 UTC"
      tone="success"
      stamp="EXECUTED"
    >
      <p className="font-mono text-[10px] text-fg-muted uppercase tracking-[0.18em]">
        Read back off the chain
      </p>
      <p
        className="mt-1 text-[19px] leading-tight text-foreground"
        style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
      >
        10 USDC sent
      </p>
      <div className="mt-2.5 rounded-lg border border-border bg-surface-2/40 px-3 py-1.5">
        <Row k="transaction" v="0x7d3b…41ae" />
        <Row k="block" v="24,918,330" />
        <Row k="status" v="success" />
      </div>
    </PreviewCard>
  );
}

export function AutomationPreview() {
  return (
    <PreviewCard toolName="automation · gas watch" metaRight="SAVED · OFF" tone="pending">
      <p
        className="text-[19px] leading-tight text-foreground"
        style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
      >
        Tell me when gas drops below 20 gwei
      </p>
      <div className="mt-3 space-y-1.5">
        {[
          { icon: <Clock className="size-3.5" />, label: "Every 5 minutes", sub: "trigger" },
          { icon: <Zap className="size-3.5" />, label: "Read gas price · Ethereum", sub: "step 1" },
          { icon: <ArrowRight className="size-3.5" />, label: "Notify me", sub: "step 2" },
        ].map((step) => (
          <div key={step.sub} className="flex items-center gap-2.5 text-[13px]">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-2 text-primary">
              {step.icon}
            </span>
            <span className="truncate text-foreground">{step.label}</span>
            <span className="ml-auto shrink-0 font-mono text-[10px] text-fg-muted uppercase tracking-[0.18em]">
              {step.sub}
            </span>
          </div>
        ))}
      </div>
    </PreviewCard>
  );
}

/* ── the small visuals the rail cards wear ──────────────────────────────── */

export function RailSpark() {
  return (
    <svg viewBox="0 0 208 60" className="size-full" preserveAspectRatio="none" aria-hidden>
      <path d="M2 50 C24 46 40 26 64 30 C92 34 110 12 140 16 C166 20 184 8 206 5" fill="none" stroke="var(--success)" strokeWidth="1.5" />
      <path d="M2 50 C24 46 40 26 64 30 C92 34 110 12 140 16 C166 20 184 8 206 5 L206 60 L2 60 Z" fill="var(--success)" opacity="0.12" />
    </svg>
  );
}

export function RailGrid({ tone = "telemetry" }: { tone?: "telemetry" | "primary" | "pending" }) {
  const stroke =
    tone === "primary" ? "var(--primary)" : tone === "pending" ? "var(--pending)" : "var(--telemetry)";
  return (
    <svg viewBox="0 0 208 60" className="size-full" preserveAspectRatio="none" aria-hidden>
      <g opacity="0.5">
        {[0, 1, 2, 3, 4].map((row) => (
          <line key={row} x1="0" y1={row * 15} x2="208" y2={row * 15} stroke="var(--border)" strokeWidth="1" />
        ))}
        {Array.from({ length: 14 }, (_, col) => (
          <line key={col} x1={col * 16} y1="0" x2={col * 16} y2="60" stroke="var(--border)" strokeWidth="1" />
        ))}
      </g>
      {[
        [48, 15],
        [96, 30],
        [144, 15],
        [160, 45],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x - 5} y={y - 5} width="10" height="10" rx="2" fill={stroke} opacity="0.9" />
      ))}
      <path d="M53 15 H91 M101 30 H139 M149 18 L157 42" stroke={stroke} strokeWidth="1.2" opacity="0.45" fill="none" />
    </svg>
  );
}

export function RailStack() {
  return (
    <div className="flex size-full items-center justify-center gap-1.5 px-6">
      {[0.4, 0.62, 1, 0.62, 0.4].map((opacity, index) => (
        <span
          key={`${opacity}-${index}`}
          className="w-6 rounded-[4px] bg-primary"
          style={{ opacity, height: `${22 + opacity * 22}px` }}
        />
      ))}
    </div>
  );
}
