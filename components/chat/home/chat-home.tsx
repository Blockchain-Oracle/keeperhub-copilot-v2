"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { usePlatformChains } from "@/components/shell/use-platform-chains";
import { CardStack } from "@/components/ui/card-stack";
import { integrations, registryMeta } from "@/lib/registry/generated/meta";
import { cn } from "@/lib/utils";

import type { Category } from "./categories";
import { CategoryCard } from "./category-card";
import { CategoryTile } from "./category-tile";
import type { MotifFacts } from "./motifs";

/*
 * DeepBookie components/chat/chatHome/ChatHome.tsx — the empty-conversation
 * launcher: a status pill, a greeting, then one set of cards in two layouts (a
 * featured hero and a 2-column grid on phones). Tapping a card sends its prompt.
 *
 * Changes: the pill reports KeeperHub's live network list instead of "agent
 * online · reads live markets"; the greeting and every card are ours; Portaldot
 * inks and display face; it renders only signed in (the identity card covers
 * signed out), so it has no connect modal of its own. From md up the cards are
 * the landing's (see category-card.tsx) fanned in the landing's "What comes
 * back" stack — drag it, click a card or a dot to bring it forward — where
 * DeepBookie has an edge-to-edge rail. Abu, 2026-09-18: no scrolling sideways,
 * and no scrolling down either — the whole launcher fits the screen, so the
 * intro line under the greeting is gone and the stack takes the height left.
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
  const [stage, size] = useStackSize();

  return (
    <div className="flex h-full min-h-0 flex-col pt-4 pb-2">
      <div className="shrink-0 px-4 text-center">
        <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-[5px]">
          <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
          <span className="font-mono text-[10.5px] text-fg-secondary">{label}</span>
        </div>
        <h2 className="font-display text-[22px] font-medium tracking-[-0.025em] text-foreground">
          {t("greeting")}
        </h2>
      </div>

      {/* md and up: the landing's cards in the landing's stack. */}
      <div ref={stage} className="mx-auto hidden min-h-0 w-[75%] max-w-[1180px] flex-1 flex-col justify-center md:flex">
        <CardStack
          key={size.maxVisible}
          items={categories}
          initialIndex={0}
          cardWidth={size.cardWidth}
          cardHeight={size.cardHeight}
          spreadDeg={size.spreadDeg}
          maxVisible={size.maxVisible}
          overlap={size.overlap}
          autoAdvance
          intervalMs={4200}
          pauseOnHover
          showDots
          minStageHeight={0}
          renderCard={(category, { active }) => (
            <CategoryCard category={category} facts={facts} active={active} onAction={onAction} />
          )}
        />
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

/*
 * The landing's stack sizing (components/landing/cards.tsx) for portrait
 * cards, measured on both axes: the fan fits its three quarters of the page
 * across, and the height left under the greeting down, so nothing scrolls.
 */
const DOTS = 44; // the dots row under the stage
const ARC = 80; // what the stage adds to a card for the fan's arc and lift

function useStackSize() {
  const stage = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ width: 1024, height: 520 });

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setRoom({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const wide = room.width >= 820;
  const maxVisible = wide ? 5 : 3;
  const overlap = wide ? 0.46 : 0.55;
  // The fan spans the front card plus (maxVisible - 1) steps of the uncovered part of a card.
  const across = room.width / (1 + (maxVisible - 1) * (1 - overlap));
  const down = (room.height - DOTS - ARC) / 1.2;
  const cardWidth = Math.round(Math.max(200, Math.min(280, across, down)));
  return [
    stage,
    {
      cardWidth,
      cardHeight: Math.round(cardWidth * 1.2),
      spreadDeg: 12 * Math.floor(maxVisible / 2),
      maxVisible,
      overlap,
    },
  ] as const;
}
