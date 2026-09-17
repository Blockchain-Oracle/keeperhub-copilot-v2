"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeftRight, Layers, Search, Timer, TrendingUp, Wallet } from "lucide-react";

import { CardRail, type RailCardItem } from "@/components/ui/card-rail";

import { RailGrid, RailSpark, RailStack } from "./card-previews";
import { SectionHeading } from "./section-heading";

/*
 * What you can ask it.
 *
 * The rail is 21st.dev ravikatiyar162/offer-carousel's anatomy
 * (components/ui/card-rail) — two-half card, tag row, a footer arrow that
 * swings and fills on hover, edge arrows that appear with the pointer.
 *
 * Each card carries a prompt the app can really answer; clicking one opens the
 * app with that prompt already in the composer, which is the same route the
 * hero's input takes. Nothing here is decorative.
 *
 * Text: messages/en/landing.json (decision 41).
 */

/* `where` is the integration or surface the prompt actually lands on — the slot
   the original carousel gave to a brand. It is information, not decoration. */
const ITEMS = [
  { id: "price", prompt: "What's the ETH price on Chainlink right now?", where: "Chainlink", icon: TrendingUp, visual: <RailSpark /> },
  { id: "holdings", prompt: "Show me my balances across every chain", where: "Your org wallet", icon: Wallet, visual: <RailGrid tone="telemetry" /> },
  { id: "send", prompt: "Send 10 USDC to alice.eth on Base", where: "ERC-20 · Base", icon: ArrowLeftRight, visual: <RailStack /> },
  { id: "supply", prompt: "Supply 50 USDC to Aave and tell me the APY first", where: "Aave v3", icon: Layers, visual: <RailGrid tone="primary" /> },
  { id: "automate", prompt: "Tell me when gas drops below 20 gwei", where: "Automation", icon: Timer, visual: <RailGrid tone="pending" /> },
  { id: "explain", prompt: "What can you do on Base?", where: "The registry", icon: Search, visual: <RailStack /> },
] as const;

export function Ask() {
  const router = useRouter();
  const t = useTranslations("landing");

  const items: RailCardItem[] = ITEMS.map(({ id, prompt, where, icon: Icon, visual }) => ({
    id,
    tag: t(`ask.items.${id}.tag`),
    tagIcon: <Icon className="size-3.5" />,
    title: t(`ask.items.${id}.title`),
    description: t(`ask.items.${id}.description`),
    visual,
    markLabel: where,
    markSubLabel: t("ask.tryIt"),
    onSelect: () => router.push(`/app?prompt=${encodeURIComponent(prompt)}`),
  }));

  return (
    <section id="ask" className="relative border-border border-t px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow={t("ask.heading.eyebrow")}
          title={t.rich("ask.heading.title", {
            accent: (chunks) => <span className="text-primary">{chunks}</span>,
          })}
          subtitle={t("ask.heading.subtitle")}
        />
        <CardRail items={items} className="mt-10" ariaLabel={t("ask.heading.eyebrow")} />
      </div>
    </section>
  );
}
