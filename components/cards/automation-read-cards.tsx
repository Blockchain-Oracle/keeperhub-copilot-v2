"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { StepList } from "@/components/automations/step-list";
import { UtcTime } from "@/components/data/utc-time";
import { runBadge, StatusBadge, ToneBadge, triggerLabel } from "@/components/pages/automation-parts";
import {
  automationStatus,
  type AutomationDetail,
  type AutomationRun,
  type AutomationStep,
  type AutomationSummary,
} from "@/lib/automations/shape";
import type { Translate } from "@/lib/i18n/translate";
import { useTranslate } from "@/lib/i18n/use-translate";

import { EmptyLine, Label } from "./parts";
import { ReceiptCard } from "./receipt-card";

/*
 * Listing and describing automations in the chat (decision 21). The list is
 * the capability card's list grammar (Portaldot tools.tsx TaskListCard: the
 * count in the meta slot, divided rows, "—— none ——") with the Automations
 * board's status badge; the description is the detail page in a card: status,
 * how it starts, the numbered steps and the last runs.
 */

const RUNS_SHOWN = 3;

export function AutomationListCard({ automations }: { automations: unknown }) {
  const t = useTranslations("automations.listCard");
  const translate = useTranslate();
  const list = readSummaries(automations);
  return (
    <ReceiptCard toolName="list_automations" metaRight={t("meta", { count: list.length })}>
      {list.length === 0 ? (
        <EmptyLine>{t("empty")}</EmptyLine>
      ) : (
        <ul className="divide-y divide-border/70">
          {list.map((automation) => (
            <li key={automation.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/app/automations/${encodeURIComponent(automation.id)}`}
                  className="block truncate text-sm font-medium text-foreground transition hover:text-primary"
                >
                  {automation.name}
                </Link>
                <p className="text-[12px] text-fg-muted">
                  {triggerLabel(automation.triggerType, translate)} · {t("steps", { count: automation.stepCount })}
                </p>
              </div>
              <StatusBadge automation={automation} />
            </li>
          ))}
        </ul>
      )}
    </ReceiptCard>
  );
}

export function AutomationDetailCard({ automation, runs, notEditable }: { automation: unknown; runs: unknown; notEditable?: string }) {
  const t = useTranslations("automations");
  const translate = useTranslate();
  const detail = readDetail(automation, translate);
  if (detail === null) {
    return (
      <ReceiptCard toolName="get_automation" metaRight={t("detailCard.unreadableMeta")}>
        <EmptyLine>{t("detailCard.unreadable")}</EmptyLine>
      </ReceiptCard>
    );
  }
  const recent = readRuns(runs);
  return (
    <ReceiptCard toolName="get_automation" metaRight={t(`detailCard.statusMeta.${automationStatus(detail)}`)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] font-semibold tracking-[-0.02em] text-foreground [overflow-wrap:anywhere]">{detail.name}</p>
          <p className="text-[12.5px] text-fg-muted">{triggerLabel(detail.triggerType, translate)}</p>
          {detail.description !== null && <p className="mt-1 text-[13px] text-fg-secondary">{detail.description}</p>}
        </div>
        <StatusBadge automation={detail} />
      </div>

      <Label className="mt-3 block">{t("detailCard.steps")}</Label>
      {detail.steps.length === 0 ? <EmptyLine>{t("detailCard.noSteps")}</EmptyLine> : <StepList steps={detail.steps} />}

      <Label className="mt-2 block">{t("detailCard.recentRuns")}</Label>
      {recent === null ? (
        <p className="py-2 text-[12.5px] text-fg-muted">{t("detailCard.runsUnavailable")}</p>
      ) : recent.length === 0 ? (
        <p className="py-2 text-[12.5px] text-fg-muted">{t("detailCard.noRuns")}</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {recent.slice(0, RUNS_SHOWN).map((run) => {
            const label = runBadge(run.status, translate);
            return (
              <li key={run.id} className="flex items-center justify-between gap-3 py-1.5">
                <ToneBadge label={label.label} tone={label.tone} />
                {run.startedAt !== null && (
                  <UtcTime ms={Date.parse(run.startedAt)} withDate withSeconds={false} className="text-xs text-fg-muted" />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {notEditable !== undefined && <p className="mt-2 text-[12px] text-fg-muted">{notEditable}</p>}
      <Link
        href={`/app/automations/${encodeURIComponent(detail.id)}`}
        className="mt-3 inline-block text-[13px] font-semibold text-fg-secondary transition hover:text-foreground"
      >
        {t("actions.openAutomation")}
      </Link>
    </ReceiptCard>
  );
}

function readSummaries(value: unknown): AutomationSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const summary = readSummary(item);
    return summary === null ? [] : [summary];
  });
}

function readSummary(value: unknown): AutomationSummary | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string") return null;
  return {
    id: record.id,
    name: record.name,
    description: typeof record.description === "string" ? record.description : null,
    enabled: record.enabled === true,
    deactivated: record.deactivated === true,
    triggerType: typeof record.triggerType === "string" ? record.triggerType : null,
    stepCount: typeof record.stepCount === "number" ? record.stepCount : 0,
    networks: Array.isArray(record.networks) ? record.networks.filter((n): n is string => typeof n === "string") : [],
    createdAt: typeof record.createdAt === "string" ? record.createdAt : null,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
  };
}

function readDetail(value: unknown, t: Translate): AutomationDetail | null {
  const summary = readSummary(value);
  if (summary === null) return null;
  const steps = (value as { steps?: unknown }).steps;
  return {
    ...summary,
    steps: Array.isArray(steps)
      ? steps.flatMap((step): AutomationStep[] => {
          const s = step as Record<string, unknown>;
          if (s === null || typeof s !== "object" || typeof s.id !== "string") return [];
          return [
            {
              id: s.id,
              label: typeof s.label === "string" ? s.label : t("automations.view.stepFallback"),
              actionType: typeof s.actionType === "string" ? s.actionType : null,
              network: typeof s.network === "string" ? s.network : null,
              enabled: s.enabled !== false,
            },
          ];
        })
      : [],
  };
}

function readRuns(value: unknown): AutomationRun[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((run): AutomationRun[] => {
    const r = run as Record<string, unknown>;
    if (r === null || typeof r !== "object" || typeof r.id !== "string") return [];
    return [
      {
        id: r.id,
        status: typeof r.status === "string" ? r.status : "unknown",
        triggerSource: typeof r.triggerSource === "string" ? r.triggerSource : null,
        startedAt: typeof r.startedAt === "string" ? r.startedAt : null,
        completedAt: typeof r.completedAt === "string" ? r.completedAt : null,
        durationMs: typeof r.durationMs === "number" ? r.durationMs : null,
        transactionHashes: [],
        error: typeof r.error === "string" ? r.error : null,
      },
    ];
  });
}
