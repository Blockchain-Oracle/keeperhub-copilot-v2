"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { CardStack, type CardStackItem } from "@/components/ui/card-stack";

import {
  AutomationPreview,
  DryRunPreview,
  PricePreview,
  ReceiptPreview,
  WritePreview,
} from "./card-previews";
import { SectionHeading } from "./section-heading";

/*
 * The showpiece: what an answer actually looks like.
 *
 * 21st.dev ruixen.ui/card-stack (components/ui/card-stack) fans five of the
 * app's own card faces in 3D. It is that component and not the fan carousel
 * because of renderCard — the stack shows real cards rather than photographs,
 * which is the only version of this section worth having.
 *
 * Drag it, click a card to bring it forward, or use the arrow keys.
 *
 * Text: messages/en/landing.json (decision 41).
 */

const FACES = {
  price: <PricePreview />,
  write: <WritePreview />,
  dryRun: <DryRunPreview />,
  receipt: <ReceiptPreview />,
  automation: <AutomationPreview />,
} as const;

const ORDER = ["price", "write", "dryRun", "receipt", "automation"] as const;

export function Cards() {
  const t = useTranslations("landing");
  const [stage, size] = useStackSize();

  const items: CardStackItem[] = ORDER.map((id) => ({
    id,
    title: t(`cards.items.${id}.title`),
    description: t(`cards.items.${id}.description`),
  }));

  return (
    <section id="cards" className="relative overflow-hidden border-border border-t px-4 py-20 sm:py-28">
      <div ref={stage} className="mx-auto max-w-6xl">
        <SectionHeading
          centered
          eyebrow={t("cards.heading.eyebrow")}
          title={t.rich("cards.heading.title", {
            accent: (chunks) => <span className="text-primary">{chunks}</span>,
          })}
          subtitle={t("cards.heading.subtitle")}
        />

        <div className="mt-6">
          <CardStack
            key={size.maxVisible}
            items={items}
            initialIndex={2}
            cardWidth={size.cardWidth}
            cardHeight={size.cardHeight}
            spreadDeg={size.spreadDeg}
            maxVisible={size.maxVisible}
            overlap={size.overlap}
            autoAdvance
            intervalMs={4200}
            pauseOnHover
            showDots
            renderCard={(item) => FACES[item.id as keyof typeof FACES]}
          />
        </div>

        {/* the tag line under each face, since the faces carry the app's own
            words rather than the section's */}
        <div className="mx-auto mt-2 grid max-w-4xl gap-2 text-center sm:grid-cols-5">
          {ORDER.map((id) => (
            <p key={id} className="font-mono text-[10px] text-fg-muted uppercase tracking-[0.18em]">
              {t(`cards.items.${id}.tag`)}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

interface StackSize {
  cardWidth: number;
  cardHeight: number;
  spreadDeg: number;
  maxVisible: number;
  overlap: number;
}

/*
 * The stack is drawn in pixels, not in percentages, so it has to be told how
 * much room it has. Two breakpoints were not enough — at any width between them
 * the fan either spilled past the viewport or sat marooned in the middle — so
 * this measures the stage and scales the geometry continuously.
 *
 * The card keeps the 520x320 ratio it was designed at; only the size, the arc
 * and how many cards are in flight change.
 */
function useStackSize(): [React.RefObject<HTMLDivElement | null>, StackSize] {
  const stage = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1024);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cardWidth = Math.round(Math.max(248, Math.min(520, width * 0.58)));
  const wide = width >= 900;
  /* spreadDeg is the WHOLE arc, which the component divides by how many cards
     sit either side of the active one. Two visible neighbours at 36 degrees is
     a gentle 18 each; one neighbour at 36 would be a 36-degree lurch. So the
     arc has to shrink with the count, not just with the width. */
  const maxVisible = wide ? 5 : 3;
  const perCard = wide ? 18 : 15;
  return [
    stage,
    {
      cardWidth,
      cardHeight: Math.round(cardWidth * (320 / 520)),
      spreadDeg: perCard * Math.floor(maxVisible / 2),
      maxVisible,
      overlap: wide ? 0.46 : 0.6,
    },
  ];
}
