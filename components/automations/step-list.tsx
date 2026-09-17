"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { NetworkName } from "@/components/cards/write-card-parts";
import { ToneBadge } from "@/components/pages/automation-parts";
import { cn } from "@/lib/utils";

/*
 * An automation's steps in the order they run: the numbered rail from the
 * detail page (DeepBookie market detail grammar, slice 7), shared with the
 * automation cards in the chat, where each step can carry its values.
 */

export type StepListItem = {
  id: string;
  label: string;
  actionType: string | null;
  network: string | null;
  enabled: boolean;
  detail?: ReactNode;
};

export function StepList({ steps, className }: { steps: readonly StepListItem[]; className?: string }) {
  const t = useTranslations("automations.stepList");
  return (
    <ol className={className}>
      {steps.map((step, index) => (
        <li key={step.id} className="relative flex gap-3 py-2.5">
          {index < steps.length - 1 && <span aria-hidden className="absolute top-9 bottom-0 left-[11px] w-px bg-border" />}
          <span className="grid size-6 shrink-0 place-items-center rounded-full border border-border bg-surface-2 font-mono text-[11px] text-fg-secondary">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={cn("truncate text-[13.5px] font-semibold", step.enabled ? "text-foreground" : "text-fg-muted line-through")}>
                {step.label}
              </span>
              {!step.enabled && <ToneBadge label={t("off")} tone="muted" />}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-muted">
              {step.actionType !== null && <code className="font-mono">{step.actionType}</code>}
              {step.network !== null && <NetworkName chainId={step.network} />}
            </div>
            {step.detail}
          </div>
        </li>
      ))}
    </ol>
  );
}
