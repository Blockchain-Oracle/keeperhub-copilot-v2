"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { ShareReceipt } from "@/components/cards/share-receipt";
import { GHOST_BUTTON, NetworkName, PRIMARY_BUTTON, useChainLabel } from "@/components/cards/write-card-parts";
import { CopyChip } from "@/components/data/copy-chip";
import { ExplorerLink } from "@/components/data/explorer-link";
import { IntegrationMark } from "@/components/data/integration-mark";
import { UtcTime } from "@/components/data/utc-time";
import { useAccount } from "@/components/shell/account-context";
import { SignInGate } from "@/components/shell/sign-in/sign-in-gate";
import { Skeleton } from "@/components/ui/skeleton";
import type { LedgerListItem, LedgerListResponse } from "@/app/api/ledger/route";
import { explorerTxUrl } from "@/lib/chains";
import { activityLabel, LEDGER_KINDS, outcomeOf, type LedgerKind, type OutcomeTone } from "@/lib/activity";
import { useTranslate } from "@/lib/i18n/use-translate";
import { isShareable } from "@/lib/shares";
import { cn } from "@/lib/utils";

import { Centered, FilterPills, Page, PageHeader, TH } from "./page";

/*
 * DeepBookie app/(app)/positions/page.tsx and PositionsTable.tsx over this
 * app's ledger: a table on large screens and cards below, its header cells,
 * row grammar and status pills. The pills in the header are DeepBookie's
 * markets filter (Live / Settling / Settled) carrying decision 17's Actions /
 * Reads / All.
 *
 * Changes: rows are ledger entries (what ran, network, outcome, transaction,
 * time, where it came from) rather than positions; outcomes use the write
 * card's words and tones; "Load more" pages back through the ledger
 * (DeepBookie has no paging).
 */

const PAGE_SIZE = 50;

type Load =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; rows: LedgerListItem[]; more: boolean; loadingMore: boolean; moreFailed: boolean };

async function fetchPage(kind: LedgerKind, before: string | undefined, signal: AbortSignal): Promise<LedgerListItem[]> {
  const params = new URLSearchParams({ kind, limit: String(PAGE_SIZE) });
  if (before !== undefined) params.set("before", before);
  const res = await fetch(`/api/ledger?${params}`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`ledger ${res.status}`);
  return ((await res.json()) as LedgerListResponse).rows;
}

export function Activity() {
  const { identity } = useAccount();
  const signedIn = identity.status === "signed-in";
  const [kind, setKind] = useState<LedgerKind>("actions");
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const moreController = useRef<AbortController | null>(null);
  const t = useTranslations("pages.activity");
  const common = useTranslations("common");

  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    fetchPage(kind, undefined, controller.signal)
      .then((rows) => setLoad({ status: "ready", rows, more: rows.length === PAGE_SIZE, loadingMore: false, moreFailed: false }))
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ status: "error" });
      });
    return () => controller.abort();
  }, [signedIn, kind, attempt]);

  function choose(next: LedgerKind) {
    if (next === kind) return;
    moreController.current?.abort();
    setLoad({ status: "loading" });
    setKind(next);
  }

  function retry() {
    setLoad({ status: "loading" });
    setAttempt((n) => n + 1);
  }

  function loadMore() {
    if (load.status !== "ready" || !load.more || load.loadingMore) return;
    const last = load.rows[load.rows.length - 1];
    const controller = new AbortController();
    moreController.current = controller;
    setLoad({ ...load, loadingMore: true, moreFailed: false });
    fetchPage(kind, last?.createdAt, controller.signal)
      .then((rows) =>
        setLoad((current) =>
          current.status === "ready"
            ? { status: "ready", rows: [...current.rows, ...rows], more: rows.length === PAGE_SIZE, loadingMore: false, moreFailed: false }
            : current,
        ),
      )
      .catch(() => {
        if (controller.signal.aborted) return;
        setLoad((current) => (current.status === "ready" ? { ...current, loadingMore: false, moreFailed: true } : current));
      });
  }

  if (identity.status === "loading") return <div aria-hidden className="min-h-[50vh]" />;
  if (!signedIn) return <SignInGate />;

  return (
    <Page>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          <FilterPills
            label={t("filter.label")}
            options={LEDGER_KINDS.map((value) => ({ value, label: t(`filter.${value}`) }))}
            value={kind}
            onChange={choose}
          />
        }
      />
      {load.status === "loading" ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full rounded-xl bg-surface-2" />
          <Skeleton className="h-64 w-full rounded-xl bg-surface-2" />
        </div>
      ) : load.status === "error" ? (
        <Centered
          title={t("error.title")}
          body={t("error.body")}
          action={
            <button type="button" onClick={retry} className={PRIMARY_BUTTON}>
              {t("error.retry")}
            </button>
          }
        />
      ) : load.rows.length === 0 ? (
        <Centered
          title={t(`empty.${kind}.title`)}
          body={t(`empty.${kind}.body`)}
          action={
            <Link href="/app" className={PRIMARY_BUTTON}>
              {t("empty.openChat")} →
            </Link>
          }
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card lg:block">
            <div className="flex items-center gap-4 bg-surface-2/40 px-5 py-3">
              <div className={cn(TH, "flex-[2.4]")}>{t("columns.what")}</div>
              <div className={cn(TH, "flex-1")}>{t("columns.network")}</div>
              <div className={cn(TH, "w-24")}>{t("columns.outcome")}</div>
              <div className={cn(TH, "flex-[1.4]")}>{t("columns.transaction")}</div>
              <div className={cn(TH, "flex-[1.2] text-right")}>{t("columns.when")}</div>
              <div className={cn(TH, "w-24 text-right")}>{t("columns.from")}</div>
            </div>
            {load.rows.map((row) => (
              <ActivityRow key={row.id} row={row} />
            ))}
          </div>
          <div className="flex flex-col gap-3 lg:hidden">
            {load.rows.map((row) => (
              <ActivityCard key={row.id} row={row} />
            ))}
          </div>
          {(load.more || load.moreFailed) && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <button type="button" onClick={loadMore} disabled={load.loadingMore} className={GHOST_BUTTON}>
                {load.loadingMore ? common("loading") : t("loadMore")}
              </button>
              {load.moreFailed && <p className="text-[12px] text-fg-muted">{t("loadMoreFailed")}</p>}
            </div>
          )}
        </>
      )}
    </Page>
  );
}

function ActivityRow({ row }: { row: LedgerListItem }) {
  return (
    <div className="flex items-center gap-4 border-t border-border px-5 py-3.5">
      <div className="flex min-w-0 flex-[2.4] items-center gap-2.5">
        <What row={row} />
      </div>
      <div className="min-w-0 flex-1 text-[13px]">{row.network !== null ? <NetworkName chainId={row.network} /> : <Dash />}</div>
      <div className="w-24">
        <OutcomePill state={row.state} opId={row.opId} />
      </div>
      <div className="flex min-w-0 flex-[1.4] items-center gap-2">
        <Transaction hash={row.txHash} network={row.network} />
        {isShareable(row) && <ShareReceipt ledgerId={row.id} compact />}
      </div>
      <div className="flex-[1.2] text-right">
        <UtcTime ms={Date.parse(row.createdAt)} withDate className="text-[12px] text-fg-muted" />
      </div>
      <div className="w-24 text-right">
        <Origin row={row} />
      </div>
    </div>
  );
}

function ActivityCard({ row }: { row: LedgerListItem }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <What row={row} />
        </div>
        <OutcomePill state={row.state} opId={row.opId} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[12px]">
        {row.network !== null && <NetworkName chainId={row.network} />}
        <UtcTime ms={Date.parse(row.createdAt)} withDate className="text-fg-muted" />
      </div>
      {(row.txHash !== null || row.conversationId !== null || row.workflowId !== null) && (
        <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-border/60 pt-2.5">
          <Transaction hash={row.txHash} network={row.network} />
          <div className="flex shrink-0 items-center gap-3">
            {isShareable(row) && <ShareReceipt ledgerId={row.id} compact />}
            <Origin row={row} />
          </div>
        </div>
      )}
    </div>
  );
}

function What({ row }: { row: LedgerListItem }) {
  const translate = useTranslate();
  return (
    <>
      <IntegrationMark integration={row.integration} size={22} />
      <div className="min-w-0">
        <div className="truncate text-[14px] leading-none font-bold text-foreground">{activityLabel(row.opId, translate)}</div>
        <div className="mt-1 truncate font-mono text-[10.5px] text-fg-muted">{row.opId}</div>
      </div>
    </>
  );
}

const PILL_TONE: Record<OutcomeTone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  pending: "border-pending/40 bg-pending/10 text-pending",
  muted: "border-border text-fg-muted",
  default: "border-border-strong text-fg-secondary",
};

function OutcomePill({ state, opId }: { state: string; opId: string }) {
  const translate = useTranslate();
  const outcome = outcomeOf(state, opId, translate);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tracking-[0.12em] uppercase",
        PILL_TONE[outcome.tone],
      )}
    >
      {outcome.label}
    </span>
  );
}

function Transaction({ hash, network }: { hash: string | null; network: string | null }) {
  const { explorerUrl } = useChainLabel(network ?? undefined);
  const t = useTranslations("pages.activity");
  if (hash === null) return <Dash />;
  const link =
    network === null
      ? null
      : (explorerTxUrl(network, hash) ?? (explorerUrl !== null ? `${explorerUrl.replace(/\/$/, "")}/tx/${hash}` : null));
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <CopyChip value={hash} />
      {link !== null && <ExplorerLink href={link} label={t("view")} />}
    </span>
  );
}

function Origin({ row }: { row: LedgerListItem }) {
  const t = useTranslations("pages.activity");
  const className = "text-[12px] font-semibold text-fg-muted transition-colors hover:text-foreground";
  if (row.conversationId !== null) {
    return (
      <Link href={`/app/c/${row.conversationId}`} className={className}>
        {t("fromChat")} →
      </Link>
    );
  }
  if (row.workflowId !== null) {
    return (
      <Link href={`/app/automations/${row.workflowId}`} className={className}>
        {t("fromAutomation")} →
      </Link>
    );
  }
  return <Dash />;
}

function Dash() {
  return <span className="text-fg-muted">—</span>;
}
