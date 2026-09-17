"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Address } from "@/components/data/address";
import { Identicon } from "@/components/data/identicon";
import { cn } from "@/lib/utils";

import type { MotifKind } from "./categories";

/*
 * DeepBookie components/chat/chatHome/motifs.tsx — the small living detail on
 * each card. Changes: DeepBookie's invented figures (a 62% odds reading, a
 * $1,284.10 count-up, "fees −40%", "12 sessions") are not copied; a motif shows
 * a shape, or a figure this app actually knows (the org wallet, the action
 * count, your conversation count). Inks move to Portaldot: telemetry for data,
 * primary for the action, success for staking, pending for the vault.
 */

/** Shared curve geometry (also drawn by the mobile hero tile). */
export const CURVE = "M2 30 C30 28 48 14 72 16 C100 18 120 6 150 8 C170 9 186 5 198 4";

export interface MotifFacts {
  walletAddress: string | null;
  actionCount: number;
  integrationLabels: string[];
  /** Null until the list has answered. */
  conversationCount: number | null;
}

export function Motif({ kind, facts }: { kind: MotifKind; facts: MotifFacts }) {
  const t = useTranslations("chat.motifs");
  const common = useTranslations("common");
  switch (kind) {
    case "priceCurve":
      return <PriceCurve />;
    case "wallet":
      return (
        <div className="my-[11px] flex h-[30px] items-center gap-[9px]">
          {facts.walletAddress ? (
            <>
              <Identicon address={facts.walletAddress} size={26} halo />
              <Address value={facts.walletAddress} className="text-[11px] text-fg-secondary" />
            </>
          ) : (
            <span className="font-mono text-[11px] text-fg-muted">{t("noOrgWallet")}</span>
          )}
        </div>
      );
    case "approve":
      return (
        <div className="my-[11px] flex gap-[7px]">
          <div className="pulse-up flex flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-primary/30 bg-primary/10 py-[7px] text-[12px] font-bold text-primary">
            ✓ {t("approve")}
          </div>
          <div className="flex flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-border bg-surface-2 py-[7px] text-[12px] font-bold text-fg-secondary">
            {common("cancel")}
          </div>
        </div>
      );
    case "rate":
      return (
        <div className="my-[11px] flex items-center gap-[9px]">
          <span className="flex size-6 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background">Ξ</span>
          <span className="flex size-[26px] items-center justify-center rounded-[8px] border border-border bg-surface-2 text-[13px] text-fg-secondary transition-transform duration-[400ms] group-hover:rotate-180">
            ⇅
          </span>
          <span className="flex size-6 items-center justify-center rounded-full bg-telemetry text-[11px] font-bold text-background">Ξ</span>
          <span className="ml-0.5 font-mono text-[11px] text-fg-muted">wstETH → stETH</span>
        </div>
      );
    case "stakeBadge":
      return (
        <div className="my-[11px] flex items-center gap-[9px]">
          <span className="drift flex size-7 items-center justify-center rounded-full bg-success text-[14px] font-bold text-background">◈</span>
          <span className="rounded-full border border-success/30 bg-success/10 px-2.5 py-[3px] font-mono text-[11px] font-bold text-success">
            rETH ↔ ETH
          </span>
        </div>
      );
    case "vaultStack":
      return (
        <div className="my-[11px] flex h-[30px] items-center gap-2.5">
          <span className="drift relative h-[26px] w-[42px]">
            <Disc position="left-0" tone="bg-foreground text-background">
              $
            </Disc>
            <Disc position="left-[13px]" tone="bg-pending text-background" ring>
              ◈
            </Disc>
            <Disc position="left-[26px]" tone="bg-surface-2 text-foreground" ring>
              S
            </Disc>
          </span>
          <span className="font-mono text-[11px] text-fg-muted">{t("pooledDeposits")}</span>
        </div>
      );
    case "catalog":
      return (
        <div className="my-[11px] flex flex-wrap gap-[5px]">
          {facts.integrationLabels.map((label) => (
            <Tag key={label}>{label}</Tag>
          ))}
          <Tag accent>{t("actions", { count: facts.actionCount })}</Tag>
        </div>
      );
    case "receipt":
      return (
        <div className="my-[11px] flex h-[30px] items-center gap-[9px]">
          <span
            className="relative block h-[30px] w-[26px] rounded-t-[4px] border border-border bg-surface-2"
            style={{ clipPath: "polygon(0 0,100% 0,100% 86%,86% 100%,72% 86%,58% 100%,44% 86%,30% 100%,16% 86%,0 100%)" }}
          >
            <span className="absolute top-[6px] right-1 left-1 h-0.5 bg-border-strong" />
            <span className="absolute top-3 right-[9px] left-1 h-0.5 bg-border" />
            <span className="absolute top-[18px] right-1.5 left-1 h-0.5 bg-border" />
          </span>
          <span className="font-mono text-[11px] text-fg-muted">
            {facts.conversationCount === null
              ? t("yourConversations")
              : t("conversations", { count: facts.conversationCount })}
          </span>
        </div>
      );
  }
}

function PriceCurve() {
  const height = 30;
  return (
    <div className="relative my-[10px]" style={{ height }}>
      <svg viewBox="0 0 200 40" width="100%" height={height} preserveAspectRatio="none" aria-hidden>
        <path d={`${CURVE} L198 40 L2 40 Z`} className="fill-telemetry" opacity="0.08" />
        <path d={CURVE} fill="none" className="stroke-telemetry" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span
        className="spark-dot absolute size-[7px] rounded-full border-[1.5px] border-card bg-telemetry"
        style={{ offsetPath: `path('${CURVE}')`, boxShadow: "0 0 0 2px oklch(0.78 0.13 220 / 0.18)", top: -3.5, left: -3.5 }}
      />
    </div>
  );
}

function Disc({ children, position, tone, ring }: { children: ReactNode; position: string; tone: string; ring?: boolean }) {
  return (
    <span
      className={cn(
        "absolute top-[3px] flex size-5 items-center justify-center rounded-full text-[9px] font-bold",
        position,
        tone,
        ring && "border-[1.5px] border-card",
      )}
    >
      {children}
    </span>
  );
}

function Tag({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-[3px] font-mono text-[9.5px]",
        accent ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-surface-2 text-fg-secondary",
      )}
    >
      {children}
    </span>
  );
}
