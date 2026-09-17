"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { usePlatformChains } from "@/components/shell/use-platform-chains";
import { integrations, registryMeta } from "@/lib/registry/generated/meta";
import { cn } from "@/lib/utils";

import type { Category } from "./categories";
import { CategoryCard } from "./category-card";
import { CategoryTile } from "./category-tile";
import type { MotifFacts } from "./motifs";

/*
 * DeepBookie components/chat/chatHome/ChatHome.tsx — the empty-conversation
 * launcher: a status pill, a greeting, then one set of cards in two layouts (a
 * snap-scrolling rail with edge fades from md up; a featured hero and a 2-column
 * grid on phones). Tapping a card sends its prompt.
 *
 * Changes: the pill reports KeeperHub's live network list instead of "agent
 * online · reads live markets"; the greeting and every card are ours; Portaldot
 * inks and display face; it renders only signed in (the identity card covers
 * signed out), so it has no connect modal of its own.
 */

const CATALOG_LABELS = ["Aave V3", "Uniswap V3"];

export function ChatHome({
  categories,
  walletAddress,
  onAction,
}: {
  categories: Category[];
  walletAddress: string | null;
  onAction: (text: string) => void;
}) {
  const t = useTranslations("chat.home");
  const chains = usePlatformChains();
  const [conversationCount, setConversationCount] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/conversations", { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { conversations?: unknown[] };
        if (Array.isArray(body.conversations)) setConversationCount(body.conversations.length);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.error("Conversation count failed", error);
      });
    return () => controller.abort();
  }, []);

  const facts: MotifFacts = {
    walletAddress,
    actionCount: registryMeta.actionCount,
    integrationLabels: Object.values(integrations)
      .map((integration) => integration.label)
      .filter((label) => CATALOG_LABELS.includes(label)),
    conversationCount,
  };

  const [label, dot] =
    chains.status === "ready"
      ? [t("status.online", { count: chains.chains.length }), "live-dot bg-success"]
      : chains.status === "error"
        ? [t("status.unreachable"), "bg-pending"]
        : [t("status.checking"), "bg-fg-muted/60"];

  const [hero, ...rest] = categories;

  return (
    <div className="py-8">
      <div className="px-4 text-center">
        <div className="mb-3.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-[5px]">
          <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
          <span className="font-mono text-[10.5px] text-fg-secondary">{label}</span>
        </div>
        <h2 className="font-display text-[22px] font-medium tracking-[-0.025em] text-foreground">
          {t("greeting")}
        </h2>
        <p className="mx-auto mt-1.5 max-w-[440px] text-[13.5px] leading-[1.45] text-fg-secondary">
          {t.rich("intro", { b: (chunks) => <b className="font-semibold text-foreground">{chunks}</b> })}
        </p>
      </div>

      {/* md and up: a horizontal rail with edge fades */}
      <div className="relative mt-6 hidden md:block">
        <div className="pointer-events-none absolute top-0 bottom-3.5 left-0 z-[2] w-[30px] bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute top-0 right-0 bottom-3.5 z-[2] w-[46px] bg-gradient-to-l from-background to-transparent" />
        <div className="flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-[18px] pt-1.5 pb-4 [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin]">
          {categories.map((category, index) => (
            <CategoryCard key={category.id} category={category} index={index} facts={facts} onAction={onAction} />
          ))}
        </div>
      </div>

      {/* phones: a featured hero and a 2-column grid, no sideways scroll */}
      {hero && (
        <div className="mt-5 px-4 md:hidden">
          <CategoryTile category={hero} variant="hero" facts={facts} onAction={onAction} />
          <div className="my-3.5 flex items-center gap-2.5">
            <span className="font-mono text-[9.5px] font-semibold tracking-[0.12em] text-fg-muted uppercase">{t("orPickACard")}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {rest.map((category) => (
              <CategoryTile key={category.id} category={category} variant="tile" facts={facts} onAction={onAction} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
