"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import { IntegrationMark } from "@/components/data/integration-mark";
import { Identicon } from "@/components/data/identicon";
import { RailCard } from "@/components/ui/card-rail";
import { cn } from "@/lib/utils";

import type { Category } from "./categories";
import { CURVE, Motif, type MotifFacts } from "./motifs";

/*
 * One launcher card, as the landing draws its Ask cards: `RailCard`
 * (components/ui/card-rail — the 21st offer-carousel anatomy), so the app's
 * first screen and the landing's are the same card. Abu, 2026-09-18: the
 * DeepBookie 246×188 rail cards were meant to become these in the revamp.
 *
 * What goes in each slot: the family dot and label on the tag row; the card's
 * live motif in the top half, over the hairline grid the landing's visuals
 * sit on; the words it will send (or where it goes) in the footer, beside the
 * integration's own mark or the org wallet's identicon.
 *
 * It sits in the landing's card stack (chat-home.tsx), so only the card in
 * front answers a click — a card behind it is brought forward by the stack —
 * and a click that ends a drag is not a click.
 */

/* Which footer mark a card wears: its integration's logo, or the org wallet. */
const MARK: Record<string, string> = {
  chainlink: "chainlink",
  lido: "lido",
  "rocket-pool": "rocket-pool",
  sky: "sky",
  discover: "search",
};

const WALLET_CARDS = new Set(["org-wallet", "send-to-self"]);

export function CategoryCard({
  category,
  facts,
  active,
  onAction,
}: {
  category: Category;
  facts: MotifFacts;
  active: boolean;
  onAction: (text: string) => void;
}) {
  const t = useTranslations("chat.home");
  const router = useRouter();
  const href = category.href;
  const pressedAt = useRef<number | null>(null);

  return (
    <div
      className={cn("size-full", !active && "pointer-events-none")}
      onPointerDownCapture={(event) => {
        pressedAt.current = event.clientX;
      }}
      onClickCapture={(event) => {
        const from = pressedAt.current;
        if (from !== null && Math.abs(event.clientX - from) > 6) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <RailCard
        lift={false}
        className="size-full rounded-none border-0 shadow-none hover:shadow-none"
        item={{
          id: category.id,
          tag: category.familyLabel,
          tagIcon: <span aria-hidden className={cn("block size-2 rounded-full", category.dot)} />,
          title: category.title,
          description: category.description,
          visual: <Visual category={category} facts={facts} />,
          mark: <FooterMark category={category} walletAddress={facts.walletAddress} />,
          markLabel: href ? t("open", { name: category.title }) : t("quoted", { text: category.prompt ?? "" }),
          markSubLabel: href ? undefined : t("askThis"),
          onSelect: href ? () => router.push(href) : () => onAction(category.prompt ?? ""),
        }}
      />
    </div>
  );
}

/* The top half: the motif, larger, on the landing's hairline grid. The price
   curve runs edge to edge instead, the way the landing's price card does. */
function Visual({ category, facts }: { category: Category; facts: MotifFacts }) {
  return (
    <div className="relative size-full">
      <div
        aria-hidden
        className="absolute inset-0 opacity-50 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:16px_16px]"
      />
      {category.motif === "priceCurve" ? (
        <svg
          viewBox="0 0 200 40"
          preserveAspectRatio="none"
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[72%] w-full"
        >
          <path d={`${CURVE} L198 40 L2 40 Z`} className="fill-telemetry" opacity="0.12" />
          <path d={CURVE} fill="none" className="stroke-telemetry" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        </svg>
      ) : (
        <div className="relative flex size-full items-center justify-center px-6">
          <div className="w-full max-w-[220px] scale-[1.12]">
            <Motif kind={category.motif} facts={facts} />
          </div>
        </div>
      )}
    </div>
  );
}

function FooterMark({ category, walletAddress }: { category: Category; walletAddress: string | null }) {
  const integration = MARK[category.id];
  if (integration) return <IntegrationMark integration={integration} size={22} />;
  if (WALLET_CARDS.has(category.id) && walletAddress) return <Identicon address={walletAddress} size={22} />;
  return null;
}
