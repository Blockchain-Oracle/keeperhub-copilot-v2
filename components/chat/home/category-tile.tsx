"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";

import { cn } from "@/lib/utils";

import type { Category } from "./categories";
import { Motif, type MotifFacts } from "./motifs";
import { TileIcon } from "./tile-icons";

/*
 * DeepBookie components/chat/chatHome/CategoryTile.tsx — the phone launcher:
 * `hero` is the featured first card, `tile` the compact icon + title + terse
 * line. Changes: the hero draws its own motif rather than DeepBookie's fixed odds
 * curve with its "62% · UP 4:00pm" reading and LIVE badge (no invented figures);
 * Portaldot inks; no disabled "Connect wallet to use" state.
 */

const TILE =
  "group flex flex-col rounded-[13px] border bg-card p-[12px_13px] text-left transition-[transform,border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-[0_8px_20px_-12px_oklch(0_0_0_/_60%)] focus-visible:outline-2 focus-visible:outline-ring active:scale-[0.975]";

export function CategoryTile({
  category,
  variant,
  facts,
  onAction,
}: {
  category: Category;
  variant: "hero" | "tile";
  facts: MotifFacts;
  onAction: (text: string) => void;
}) {
  const inner = variant === "hero" ? <Hero category={category} facts={facts} /> : <Compact category={category} />;
  const className = cn(TILE, variant === "hero" ? "border-telemetry/30" : "border-border");

  if (category.href) {
    return (
      <Link href={category.href} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => onAction(category.prompt ?? "")} className={className}>
      {inner}
    </button>
  );
}

function Hero({ category, facts }: { category: Category; facts: MotifFacts }) {
  const t = useTranslations("chat.home");
  return (
    <>
      <div className="mb-[9px] flex items-center gap-2">
        <TileIcon kind={category.motif} />
        <span className="text-[14.5px] font-bold tracking-[-0.02em] text-foreground">{category.title}</span>
      </div>
      <Motif kind={category.motif} facts={facts} />
      <div className="mt-1 flex items-center gap-1.5 rounded-[8px] border border-border bg-surface-2 px-2.5 py-[7px] font-mono text-[10.5px] text-fg-secondary">
        <span className="min-w-0 flex-1 truncate">{t("quoted", { text: category.prompt ?? category.description })}</span>
        <span className="ml-auto flex-none">→</span>
      </div>
    </>
  );
}

function Compact({ category }: { category: Category }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <TileIcon kind={category.motif} />
        <span className="flex-none text-[14px] leading-none text-fg-muted transition-transform duration-150 group-active:translate-x-0.5">
          →
        </span>
      </div>
      <div className="mt-[9px] mb-0.5 text-[13px] font-bold tracking-[-0.01em] text-foreground">{category.title}</div>
      <div className="text-[10.5px] leading-[1.3] text-fg-muted">{category.mobileDesc}</div>
    </div>
  );
}
