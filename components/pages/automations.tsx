"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { GHOST_BUTTON, NetworkName, PRIMARY_BUTTON } from "@/components/cards/write-card-parts";
import { UtcTime } from "@/components/data/utc-time";
import { useAccount } from "@/components/shell/account-context";
import { SignInGate } from "@/components/shell/sign-in/sign-in-gate";
import { Skeleton } from "@/components/ui/skeleton";
import {
  filterAutomations,
  sortAutomations,
  type AutomationFilter,
  type AutomationSort,
  type AutomationSummary,
} from "@/lib/automations/shape";
import { useErrorMessage, useTranslate } from "@/lib/i18n/use-translate";
import { cn } from "@/lib/utils";

import { StatusBadge, triggerLabel } from "./automation-parts";
import { Centered, FilterPills, Page, PageHeader, TH } from "./page";

/*
 * DeepBookie app/(app)/markets/page.tsx and MarketsBoard.tsx over KeeperHub's
 * workflows: filter pills in the header, a sort row, a table on large screens
 * and cards below, a row opening the detail page.
 *
 * Changes: KeeperHub's states for DeepBookie's (Live, On demand for manual
 * triggers, Off, Deactivated), so the filters are All / Live / On demand / Off;
 * the columns are trigger, steps, networks and last update. A last-run column
 * is left out: KeeperHub's list carries no runs, and fetching every
 * automation's runs for one table would be one request per row. Loaded once
 * when the page opens (DeepBookie polls every 10 s).
 */

const FILTERS: readonly AutomationFilter[] = ["all", "live", "manual", "off"];

const SORTS: readonly AutomationSort[] = ["updated", "name"];

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; automations: AutomationSummary[] };

export function Automations() {
  const t = useTranslations("automations");
  const translate = useTranslate();
  const errorMessage = useErrorMessage();
  const { identity } = useAccount();
  const signedIn = identity.status === "signed-in";
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<AutomationFilter>("all");
  const [sort, setSort] = useState<AutomationSort>("updated");

  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    fetch("/api/automations", { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json()) as { automations?: AutomationSummary[]; error?: { code?: string; message?: string } };
        if (!res.ok || body.automations === undefined) {
          setLoad({ status: "error", message: errorMessage(body.error?.code, body.error?.message ?? t("failures.noAnswer")) });
          return;
        }
        setLoad({ status: "ready", automations: body.automations });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ status: "error", message: t("failures.noAnswer") });
      });
    return () => controller.abort();
  }, [signedIn, attempt, errorMessage, t]);

  const shown = useMemo(
    () => (load.status === "ready" ? sortAutomations(filterAutomations(load.automations, filter), sort) : []),
    [load, filter, sort],
  );

  if (identity.status === "loading") return <div aria-hidden className="min-h-[50vh]" />;
  if (!signedIn) return <SignInGate />;

  const filters = FILTERS.map((value) => ({ value, label: t(`board.filters.${value}`) }));
  const sorts = SORTS.map((value) => ({ value, label: t(`board.sorts.${value}`) }));
  // The board's empty state opens the chat with this, sent once on arrival.
  const createPrompt = t("board.createPrompt");

  return (
    <Page>
      <PageHeader
        title={t("board.title")}
        subtitle={t("board.subtitle")}
        action={<FilterPills label={t("board.filterLabel")} options={filters} value={filter} onChange={setFilter} />}
      />

      {load.status === "ready" && load.automations.length > 0 && (
        <div className="mb-3 flex items-center justify-end gap-2 text-[12px]">
          <span className="text-fg-muted">{t("board.sortLabel")}</span>
          <FilterPills label={t("board.sortLabel")} options={sorts} value={sort} onChange={setSort} />
        </div>
      )}

      {load.status === "loading" ? (
        <Skeleton className="h-72 w-full rounded-xl bg-surface-2" />
      ) : load.status === "error" ? (
        <Centered
          title={t("board.loadFailed")}
          body={load.message}
          action={
            <button
              type="button"
              onClick={() => {
                setLoad({ status: "loading" });
                setAttempt((n) => n + 1);
              }}
              className={PRIMARY_BUTTON}
            >
              {t("board.retry")}
            </button>
          }
        />
      ) : load.automations.length === 0 ? (
        <Centered
          title={t("board.emptyTitle")}
          body={t("board.emptyBody")}
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link href={`/app?prompt=${encodeURIComponent(createPrompt)}`} className={PRIMARY_BUTTON}>
                {t("board.createInChat")}
              </Link>
              <a href="https://app.keeperhub.com" target="_blank" rel="noreferrer" className={GHOST_BUTTON}>
                {t("board.openKeeperHub")}
              </a>
            </div>
          }
        />
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-fg-muted">{t("board.noneInView")}</div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card lg:block">
            <div className="flex items-center gap-4 bg-surface-2/40 px-5 py-3">
              <div className={cn(TH, "flex-[2.4]")}>{t("board.columns.automation")}</div>
              <div className={cn(TH, "w-28")}>{t("board.columns.status")}</div>
              <div className={cn(TH, "w-14 text-right")}>{t("board.columns.steps")}</div>
              <div className={cn(TH, "flex-[1.4]")}>{t("board.columns.networks")}</div>
              <div className={cn(TH, "flex-1 text-right")}>{t("board.columns.updated")}</div>
              <div className="w-16" />
            </div>
            {shown.map((automation) => (
              <Link
                key={automation.id}
                href={`/app/automations/${automation.id}`}
                className="flex items-center gap-4 border-t border-border px-5 py-3.5 transition hover:bg-surface-2/40 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="min-w-0 flex-[2.4]">
                  <div className="truncate text-[14.5px] font-bold text-foreground">{automation.name}</div>
                  <div className="truncate text-[11.5px] text-fg-muted">{triggerLabel(automation.triggerType, translate)}</div>
                </div>
                <div className="w-28">
                  <StatusBadge automation={automation} />
                </div>
                <div className="w-14 text-right font-mono text-[13px] tabular-nums text-fg-secondary">{automation.stepCount}</div>
                <div className="min-w-0 flex-[1.4] text-[12.5px]">
                  <Networks networks={automation.networks} />
                </div>
                <div className="flex-1 text-right">
                  {automation.updatedAt !== null ? (
                    <UtcTime ms={Date.parse(automation.updatedAt)} withDate withSeconds={false} className="text-[12px] text-fg-muted" />
                  ) : (
                    <span className="text-fg-muted">—</span>
                  )}
                </div>
                <div className="w-16 text-right text-[12px] font-semibold text-fg-muted">{t("board.open")}</div>
              </Link>
            ))}
          </div>

          <div className="flex flex-col gap-3 lg:hidden">
            {shown.map((automation) => (
              <Link
                key={automation.id}
                href={`/app/automations/${automation.id}`}
                className="rounded-xl border border-border bg-card p-4 transition hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-bold text-foreground">{automation.name}</div>
                    <div className="truncate text-[11.5px] text-fg-muted">{triggerLabel(automation.triggerType, translate)}</div>
                  </div>
                  <StatusBadge automation={automation} />
                </div>
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                  <Mini label={t("board.columns.steps")} value={String(automation.stepCount)} />
                  <div className="min-w-0 text-[12px]">
                    <Networks networks={automation.networks} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </Page>
  );
}

function Networks({ networks }: { networks: string[] }) {
  if (networks.length === 0) return <span className="text-fg-muted">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {networks.slice(0, 2).map((network) => (
        <NetworkName key={network} chainId={network} />
      ))}
      {networks.length > 2 && <span className="font-mono text-[11px] text-fg-muted">+{networks.length - 2}</span>}
    </span>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className={TH}>{label}</div>
      <div className="mt-0.5 font-mono text-[14px] font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}
