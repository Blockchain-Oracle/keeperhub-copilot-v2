"use client";

import { useTranslations } from "next-intl";

import { ReceiptCard } from "./receipt-card";

/*
 * Portaldot components/tools.tsx SkeletonCard, verbatim: "FETCHING", pending
 * tone, no entrance, three cyan-shimmer bars. The label is the operation once
 * its id parses out of the streaming input (v1 SkeletonCard), else "working".
 */
export function SkeletonCard({ label }: { label?: string }) {
  const t = useTranslations("cards");
  return (
    <ReceiptCard toolName={label ?? t("skeleton.working")} metaRight={t("skeleton.fetching")} tone="pending" noEntrance>
      <div className="space-y-3 py-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="relative h-3 overflow-hidden rounded-sm bg-surface-2"
            style={{ width: `${100 - i * 14}%` }}
          >
            <div
              className="absolute inset-y-0 w-1/3 animate-[pulse-soft_1.4s_ease-in-out_infinite]"
              style={{
                background: "linear-gradient(90deg, transparent, oklch(0.78 0.13 220 / 50%), transparent)",
                animationDelay: `${i * 160}ms`,
              }}
            />
          </div>
        ))}
      </div>
    </ReceiptCard>
  );
}
