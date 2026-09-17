"use client";

import { useTranslations } from "next-intl";

import type { OutcomeTone } from "@/lib/activity";
import { automationStatus, runLabel, type AutomationStatus, type AutomationSummary } from "@/lib/automations/shape";
import { englishTranslate, type Translate } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils";

/*
 * Pieces the Automations board and detail page share. StatusBadge is
 * DeepBookie MarketsBoard.tsx:18-33 (a pulsing LIVE dot, a quiet pill
 * otherwise) with KeeperHub's states; ToneBadge is the outcome pill the
 * Activity page uses.
 */

export function StatusBadge({ automation }: { automation: Pick<AutomationSummary, "enabled" | "deactivated" | "triggerType"> }) {
  const t = useTranslations("automations.statusBadge");
  const status: AutomationStatus = automationStatus(automation);
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-success" />
        <span className="font-mono text-[10.5px] font-semibold text-success">{t("live")}</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 font-mono text-[9.5px] uppercase",
        status === "deactivated" ? "border-destructive/30 text-destructive" : "border-border-strong text-fg-muted",
      )}
    >
      {t(status)}
    </span>
  );
}

const TONE: Record<OutcomeTone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  pending: "border-pending/40 bg-pending/10 text-pending",
  muted: "border-border text-fg-muted",
  default: "border-border-strong text-fg-secondary",
};

export function ToneBadge({ label, tone }: { label: string; tone: OutcomeTone }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tracking-[0.12em] uppercase",
        TONE[tone],
      )}
    >
      {label}
    </span>
  );
}

export function triggerLabel(triggerType: string | null, t: Translate = englishTranslate): string {
  if (triggerType === null || triggerType === "Manual") return t("automations.triggerLabel.manual");
  if (triggerType === "Transfer") return t("automations.triggerLabel.transfer");
  return t("automations.triggerLabel.other", { type: triggerType });
}

/** A run's KeeperHub status as its badge reads, keyed by runLabel's English label. */
export function runBadge(status: string, t: Translate = englishTranslate): { label: string; tone: OutcomeTone } {
  const { label, tone } = runLabel(status);
  return { label: t(`automations.runStatus.${label.toLowerCase()}`), tone };
}

// Digits go in as strings so a duration keeps Latin digits in every language.
export function formatDuration(ms: number | null, t: Translate = englishTranslate): string {
  if (ms === null) return "—";
  if (ms < 1000) return t("automations.duration.milliseconds", { ms: String(Math.round(ms)) });
  const seconds = ms / 1000;
  return seconds < 60
    ? t("automations.duration.seconds", { seconds: seconds.toFixed(1) })
    : t("automations.duration.minutes", { minutes: String(Math.floor(seconds / 60)), seconds: String(Math.round(seconds % 60)) });
}
