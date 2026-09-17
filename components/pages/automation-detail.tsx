"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { StepList } from "@/components/automations/step-list";
import { PreviewBlock } from "@/components/cards/automation-card";
import {
  automationActionLabel,
  automationAuthorizeAllowed,
  readPreview,
  type AutomationPreviewState,
} from "@/components/cards/automation-view";
import { ReceiptCard } from "@/components/cards/receipt-card";
import { docNumber } from "@/components/cards/write-card";
import { GHOST_BUTTON, NetworkName, PRIMARY_BUTTON, useChainLabel, WriteHeader } from "@/components/cards/write-card-parts";
import { CopyChip } from "@/components/data/copy-chip";
import { ExplorerLink } from "@/components/data/explorer-link";
import { UtcTime } from "@/components/data/utc-time";
import { useAccount } from "@/components/shell/account-context";
import { announceReceipt } from "@/components/shell/funding/receipt-announce";
import { SignInGate } from "@/components/shell/sign-in/sign-in-gate";
import { Dialog, DialogBody, DialogContent, DialogEyebrow, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { AutomationDryRun } from "@/lib/automations";
import { automationStatus, type AutomationDetail, type AutomationRun } from "@/lib/automations/shape";
import { explorerTxUrl } from "@/lib/chains";
import { useErrorMessage, useTranslate } from "@/lib/i18n/use-translate";
import { cn } from "@/lib/utils";

import { formatDuration, runBadge, StatusBadge, ToneBadge, triggerLabel } from "./automation-parts";
import { Centered, Page, TH } from "./page";

/*
 * DeepBookie app/(app)/markets/[id]/page.tsx over one KeeperHub automation: a
 * back link, the title block with its status, the stats card, then two
 * columns (DeepBookie's odds curve and trade tape become the steps and the
 * recent runs, the tape in TradeTape.tsx's grammar).
 *
 * Run now (decision 18) opens the Masayume dialog holding the write card's
 * anatomy: kicker, status line, document number, what will run, KeeperHub's
 * dry run and Authorize / Cancel with the same double-click guard. After the
 * click the run joins the tape as RUNNING and the page asks where it stands
 * every 2 s (KeeperHub's poll hint) until it settles, for up to 5 minutes;
 * write recovery closes it later if the page is gone.
 *
 * Turn on / Turn off (decision 21) opens the same dialog grammar over
 * KeeperHub's check (its errors block, its warnings need a tick) and switches
 * through the route the chat card's Turn on uses, then reloads the page.
 */

const POLL_MS = 2_000;
const POLL_LIMIT_MS = 5 * 60_000;

type Load =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; message: string }
  | { status: "ready"; automation: AutomationDetail; runs: AutomationRun[] | null };

type LocalRun = { ledgerId: string; state: "pending" | "receipt" | "failure" | "stale"; txHash: string | null };

export function AutomationDetailView({ workflowId }: { workflowId: string }) {
  const t = useTranslations("automations");
  const errorMessage = useErrorMessage();
  const { identity } = useAccount();
  const signedIn = identity.status === "signed-in";
  const orgId = identity.status === "signed-in" ? identity.orgId : undefined;
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Each opening mounts a fresh confirm card, with its own dry run.
  const [runKey, setRunKey] = useState(0);
  const [localRun, setLocalRun] = useState<LocalRun | null>(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchKey, setSwitchKey] = useState(0);

  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    fetch(`/api/automations/${encodeURIComponent(workflowId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        if (res.status === 404) return setLoad({ status: "missing" });
        const body = (await res.json()) as {
          automation?: AutomationDetail;
          runs?: AutomationRun[] | null;
          error?: { code?: string; message?: string };
        };
        if (!res.ok || body.automation === undefined) {
          setLoad({ status: "error", message: errorMessage(body.error?.code, body.error?.message ?? t("failures.noAnswer")) });
          return;
        }
        setLoad({ status: "ready", automation: body.automation, runs: body.runs ?? null });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ status: "error", message: t("failures.noAnswer") });
      });
    return () => controller.abort();
  }, [signedIn, workflowId, attempt, errorMessage, t]);

  // Follow a run started here until KeeperHub settles it.
  const pollLedgerId = localRun?.state === "pending" ? localRun.ledgerId : undefined;
  useEffect(() => {
    if (pollLedgerId === undefined) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    async function tick() {
      try {
        const res = await fetch(`/api/automations/runs/${encodeURIComponent(pollLedgerId as string)}`, { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { state: LocalRun["state"]; txHash: string | null };
          if (body.state !== "pending") {
            if (stopped) return;
            setLocalRun({ ledgerId: pollLedgerId as string, state: body.state, txHash: body.txHash });
            if (body.state === "receipt" && orgId !== undefined) announceReceipt(orgId, "workflow/run", body.txHash);
            setAttempt((n) => n + 1);
            return;
          }
        }
      } catch {
        // a dropped poll is retried on the next tick
      }
      if (stopped) return;
      if (Date.now() - started >= POLL_LIMIT_MS) {
        setLocalRun({ ledgerId: pollLedgerId as string, state: "stale", txHash: null });
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    }
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pollLedgerId, orgId]);

  if (identity.status === "loading") return <div aria-hidden className="min-h-[50vh]" />;
  if (!signedIn) return <SignInGate />;

  return (
    <Page>
      <Link href="/app/automations" className="mb-4 inline-block text-[13px] font-semibold text-fg-muted transition hover:text-foreground">
        {t("detail.back")}
      </Link>

      {load.status === "loading" ? (
        <>
          <Skeleton className="mb-5 h-10 w-64 rounded-lg bg-surface-2" />
          <Skeleton className="h-80 w-full rounded-xl bg-surface-2" />
        </>
      ) : load.status === "missing" ? (
        <Centered title={t("detail.missingTitle")} body={t("detail.missingBody")} />
      ) : load.status === "error" ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-fg-muted">
          {t("detail.loadFailed", { message: load.message })}
        </div>
      ) : (
        <Loaded
          automation={load.automation}
          runs={load.runs}
          localRun={localRun}
          onRunNow={() => {
            setRunKey((n) => n + 1);
            setDialogOpen(true);
          }}
          onSwitch={() => {
            setSwitchKey((n) => n + 1);
            setSwitchOpen(true);
          }}
        />
      )}

      {load.status === "ready" && (
        <SwitchDialog
          key={`switch-${switchKey}`}
          automation={load.automation}
          open={switchOpen}
          onOpenChange={setSwitchOpen}
          onSwitched={() => {
            setSwitchOpen(false);
            setAttempt((n) => n + 1);
          }}
        />
      )}

      {load.status === "ready" && (
        <RunDialog
          key={runKey}
          automation={load.automation}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onStarted={(ledgerId) => {
            setDialogOpen(false);
            setLocalRun({ ledgerId, state: "pending", txHash: null });
          }}
        />
      )}
    </Page>
  );
}

function Loaded({
  automation,
  runs,
  localRun,
  onRunNow,
  onSwitch,
}: {
  automation: AutomationDetail;
  runs: AutomationRun[] | null;
  localRun: LocalRun | null;
  onRunNow: () => void;
  onSwitch: () => void;
}) {
  const t = useTranslations("automations");
  const translate = useTranslate();
  const lastRun = runs?.[0];
  const running = localRun?.state === "pending";
  // KeeperHub's switch only matters for triggers that fire on their own.
  const status = automationStatus(automation);
  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-foreground">{automation.name}</h1>
          <p className="text-[12.5px] text-fg-muted">
            {triggerLabel(automation.triggerType, translate)}
            {automation.createdAt !== null && (
              <>
                {" · "}
                {t.rich("detail.created", {
                  time: () => <UtcTime ms={Date.parse(automation.createdAt as string)} withDate withSeconds={false} />,
                })}
              </>
            )}
          </p>
          {automation.description !== null && <p className="mt-1 max-w-2xl text-[13px] text-fg-secondary">{automation.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge automation={automation} />
          {(status === "live" || status === "off") && (
            <button type="button" onClick={onSwitch} className={GHOST_BUTTON}>
              {status === "live" ? t("actions.turnOff") : t("actions.turnOn")}
            </button>
          )}
          <button
            type="button"
            onClick={onRunNow}
            disabled={automation.deactivated || running}
            title={automation.deactivated ? t("detail.deactivated") : undefined}
            className={PRIMARY_BUTTON}
          >
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
            {running ? t("actions.running") : t("actions.runNow")}
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-x-10 gap-y-4 rounded-xl border border-border bg-card p-5">
        <Stat label={t("detail.stats.trigger")} value={automation.triggerType ?? "Manual"} />
        <Stat label={t("detail.stats.steps")} value={String(automation.stepCount)} />
        <Stat label={t("detail.stats.networks")} value={automation.networks.length > 0 ? String(automation.networks.length) : "—"} />
        <Stat label={t("detail.stats.lastRun")} value={lastRun !== undefined ? runBadge(lastRun.status, translate).label : "—"} />
        <div>
          <div className={TH}>{t("detail.stats.updated")}</div>
          <div className="mt-0.5 text-[15px] font-bold">
            {automation.updatedAt !== null ? <UtcTime ms={Date.parse(automation.updatedAt)} withDate withSeconds={false} /> : "—"}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Steps automation={automation} />
        <RunsTape runs={runs} localRun={localRun} />
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className={TH}>{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-bold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function Steps({ automation }: { automation: AutomationDetail }) {
  const t = useTranslations("automations.detail");
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className={cn(TH, "border-b border-border px-4 py-2.5")}>{t("steps")}</div>
      {automation.steps.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-fg-muted">{t("noSteps")}</p>
      ) : (
        <StepList steps={automation.steps} className="px-4 py-2" />
      )}
    </div>
  );
}

function RunsTape({ runs, localRun }: { runs: AutomationRun[] | null; localRun: LocalRun | null }) {
  const t = useTranslations("automations");
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className={cn(TH, "border-b border-border px-4 py-2.5")}>{t("detail.recentRuns")}</div>
      {localRun !== null && localRun.state !== "receipt" && localRun.state !== "failure" && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-foreground">
            {localRun.state === "pending" && <Loader2 aria-hidden className="size-3.5 animate-spin text-fg-muted" />}
            {t("detail.justStarted")}
          </span>
          <span role="status">
            {localRun.state === "pending" ? (
              <ToneBadge label={t("runStatus.running")} tone="pending" />
            ) : (
              <span className="text-[12px] text-fg-muted">{t("detail.stillRunning")}</span>
            )}
          </span>
        </div>
      )}
      {runs === null ? (
        <p className="px-4 py-8 text-center text-sm text-fg-muted">{t("detail.runsUnavailable")}</p>
      ) : runs.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-fg-muted">{t("detail.noRuns")}</p>
      ) : (
        runs.map((run) => <RunRow key={run.id} run={run} />)
      )}
    </div>
  );
}

function RunRow({ run }: { run: AutomationRun }) {
  const t = useTranslations("automations.detail");
  const translate = useTranslate();
  const label = runBadge(run.status, translate);
  const tx = run.transactionHashes[0];
  return (
    <div className="border-t border-border px-4 py-2.5 first:border-t-0">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2">
          <ToneBadge label={label.label} tone={label.tone} />
          <span className="truncate text-[12.5px] text-fg-secondary">{run.triggerSource ?? t("runSource")}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 font-mono text-xs tabular-nums text-fg-muted">
          {run.startedAt !== null && <UtcTime ms={Date.parse(run.startedAt)} withDate withSeconds={false} />}
          <span>· {formatDuration(run.durationMs, translate)}</span>
        </span>
      </div>
      {tx !== undefined && <RunTx hash={tx.hash} network={tx.network} more={run.transactionHashes.length - 1} />}
      {run.error !== null && label.tone === "destructive" && (
        <p className="mt-1 truncate font-mono text-[11.5px] text-destructive" title={run.error}>
          {run.error}
        </p>
      )}
    </div>
  );
}

function RunTx({ hash, network, more }: { hash: string; network: string | null; more: number }) {
  const t = useTranslations("automations.detail");
  const { explorerUrl } = useChainLabel(network ?? undefined);
  const link =
    network === null ? null : (explorerTxUrl(network, hash) ?? (explorerUrl !== null ? `${explorerUrl.replace(/\/$/, "")}/tx/${hash}` : null));
  return (
    <div className="mt-1 flex items-center gap-2">
      <CopyChip value={hash} />
      {link !== null && <ExplorerLink href={link} label={t("viewTx")} />}
      {more > 0 && <span className="font-mono text-[11px] text-fg-muted">{t("moreTx", { count: more })}</span>}
    </div>
  );
}

type DryRunLoad = { status: "loading" } | { status: "ready"; dryRun: AutomationDryRun };

function RunDialog({
  automation,
  open,
  onOpenChange,
  onStarted,
}: {
  automation: AutomationDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted: (ledgerId: string) => void;
}) {
  const t = useTranslations("automations");
  const tc = useTranslations("common");
  const translate = useTranslate();
  const errorMessage = useErrorMessage();
  const [dryRun, setDryRun] = useState<DryRunLoad>({ status: "loading" });
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const inFlight = useRef(false);
  const ackId = useId();

  // The page mounts this card afresh for each opening, so its state starts clean.
  function changeOpen(next: boolean) {
    if (!next && inFlight.current) return;
    onOpenChange(next);
  }

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`/api/automations/${encodeURIComponent(automation.id)}/simulate`, { method: "POST", signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as { dryRun?: AutomationDryRun };
        setDryRun({
          status: "ready",
          dryRun: body.dryRun ?? { ok: false, reason: t("failures.dryRunFailed") },
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setDryRun({ status: "ready", dryRun: { ok: false, reason: t("failures.dryRunFailed") } });
        }
      });
    return () => controller.abort();
  }, [open, automation.id, t]);

  const warnings = dryRun.status === "ready" && dryRun.dryRun.ok ? dryRun.dryRun.warnings : [];
  const needsAck = warnings.length > 0;
  const canAuthorize = !submitted && dryRun.status === "ready" && (!needsAck || acknowledged) && !automation.deactivated;

  async function authorize() {
    if (!canAuthorize || inFlight.current) return;
    inFlight.current = true;
    setSubmitted(true);
    setFailure(null);
    try {
      const res = await fetch(`/api/automations/${encodeURIComponent(automation.id)}/run`, { method: "POST" });
      const body = (await res.json()) as { ledgerId?: string; error?: { code?: string; message?: string } };
      if (!res.ok || body.ledgerId === undefined) {
        setFailure(errorMessage(body.error?.code, body.error?.message ?? t("failures.runNotStarted")));
        return;
      }
      onStarted(body.ledgerId);
    } catch {
      setFailure(t("failures.runNotStartedConnection"));
    } finally {
      inFlight.current = false;
      setSubmitted(false);
    }
  }

  const doc = docNumber("execute_workflow", { workflowId: automation.id, updatedAt: automation.updatedAt });
  const label = submitted
    ? t("actions.authorizing")
    : dryRun.status === "loading"
      ? t("runDialog.runningDryRun")
      : needsAck && !acknowledged
        ? t("runDialog.acknowledge")
        : t("actions.authorize");

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogEyebrow>{t("actions.runNow")}</DialogEyebrow>
          <DialogTitle>{automation.name}</DialogTitle>
        </DialogHeader>
        <DialogBody className="pb-7">
          <ReceiptCard
            toolName="execute_workflow"
            metaRight={submitted ? t("view.frame.authorizing.meta") : t("view.frame.awaiting.meta")}
            tone="pending"
            noEntrance
          >
            <WriteHeader
              kicker={t("view.kicker.run")}
              status={submitted ? t("view.frame.authorizing.status") : t("view.frame.awaiting.status")}
              doc={doc}
              ink="default"
            />
            <p className="mt-3 text-[17px] font-semibold tracking-[-0.02em] text-foreground [overflow-wrap:anywhere]">
              {t("view.title.run", { name: automation.name })}
            </p>
            <div className="mt-3 divide-y divide-border/60 text-sm">
              <DialogRow k={t("runDialog.trigger")} v={triggerLabel(automation.triggerType, translate)} />
              <DialogRow k={t("runDialog.steps")} v={String(automation.stepCount)} />
              <DialogRow
                k={t("runDialog.networks")}
                v={
                  automation.networks.length === 0 ? (
                    "—"
                  ) : (
                    <span className="inline-flex flex-wrap justify-end gap-x-3 gap-y-1">
                      {automation.networks.map((network) => (
                        <NetworkName key={network} chainId={network} />
                      ))}
                    </span>
                  )
                }
              />
            </div>
            <p className="mt-3 text-[12.5px] text-fg-muted">{t("runDialog.explainer")}</p>

            {dryRun.status === "loading" ? (
              <p role="status" className="mt-3 font-mono text-[11px] tracking-[0.18em] text-fg-muted uppercase">
                —— {t("runDialog.dryRunLoading")} ——
              </p>
            ) : !dryRun.dryRun.ok ? (
              <div className="mt-3 rounded-lg border border-border bg-surface-2/40 px-3 py-2">
                <div className="font-mono text-[10px] tracking-[0.18em] text-fg-muted uppercase">{t("runDialog.dryRun")}</div>
                <p className="mt-1 text-[12.5px] text-fg-secondary">{t("runDialog.dryRunReason", { reason: dryRun.dryRun.reason })}</p>
              </div>
            ) : warnings.length > 0 ? (
              <div className="mt-3 rounded-lg border border-pending/40 bg-pending/5 px-3 py-2">
                <div className="font-mono text-[10px] tracking-[0.18em] text-fg-muted uppercase">{t("runDialog.dryRun")}</div>
                <ul className="mt-1 space-y-1">
                  {warnings.map((warning, index) => (
                    <li key={`${warning.nodeId}-${index}`} className="text-[12.5px] text-pending">
                      {warning.message}
                    </li>
                  ))}
                </ul>
                <label htmlFor={ackId} className="mt-2 flex items-start gap-2 text-[12.5px] text-foreground">
                  <input
                    id={ackId}
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    disabled={submitted}
                    className="mt-0.5 size-4 accent-[var(--pending)]"
                  />
                  <span>{t("acknowledge.run")}</span>
                </label>
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-success/30 bg-success/5 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[10px] tracking-[0.18em] text-fg-muted uppercase">{t("runDialog.dryRun")}</span>
                  <span className="font-mono text-[10px] tracking-[0.18em] text-success uppercase">{t("runDialog.noWarnings")}</span>
                </div>
                <p className="mt-1 text-[12.5px] text-fg-secondary">
                  {dryRun.dryRun.skipped > 0
                    ? t("runDialog.checkedSkipped", { count: dryRun.dryRun.simulated, skipped: dryRun.dryRun.skipped })
                    : t("runDialog.checked", { count: dryRun.dryRun.simulated })}
                </p>
              </div>
            )}

            {failure !== null && <p className="mt-3 font-mono text-[12px] text-destructive">{failure}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void authorize()} disabled={!canAuthorize} className={PRIMARY_BUTTON}>
                {submitted ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                {label}
              </button>
              <button type="button" onClick={() => changeOpen(false)} disabled={submitted} className={GHOST_BUTTON}>
                {tc("cancel")}
              </button>
            </div>
          </ReceiptCard>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function SwitchDialog({
  automation,
  open,
  onOpenChange,
  onSwitched,
}: {
  automation: AutomationDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSwitched: () => void;
}) {
  const t = useTranslations("automations");
  const tc = useTranslations("common");
  const translate = useTranslate();
  const errorMessage = useErrorMessage();
  // The way it turns, fixed for this opening; the page mounts a fresh dialog each time.
  const enabled = !automation.enabled;
  const [check, setCheck] = useState<AutomationPreviewState>({ status: "loading" });
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const inFlight = useRef(false);
  const ackId = useId();

  function changeOpen(next: boolean) {
    if (!next && inFlight.current) return;
    onOpenChange(next);
  }

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`/api/automations/${encodeURIComponent(automation.id)}/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as { preview?: unknown; error?: { code?: string; message?: string } };
        const preview = readPreview(body.preview, translate);
        setCheck(
          res.ok && preview !== null
            ? { status: "ready", preview }
            : { status: "error", message: errorMessage(body.error?.code, body.error?.message ?? t("failures.checkFailed")) },
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setCheck({ status: "error", message: t("failures.checkFailed") });
      });
    return () => controller.abort();
  }, [open, automation.id, enabled, translate, errorMessage, t]);

  const canAuthorize = !submitted && automationAuthorizeAllowed(check, acknowledged);

  async function authorize() {
    if (!canAuthorize || inFlight.current) return;
    inFlight.current = true;
    setSubmitted(true);
    setFailure(null);
    try {
      const res = await fetch(`/api/automations/${encodeURIComponent(automation.id)}/enabled`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const body = (await res.json()) as { receipt?: unknown; error?: { code?: string; message?: string } };
      if (!res.ok || body.receipt === undefined) {
        setFailure(errorMessage(body.error?.code, body.error?.message ?? t("failures.notChanged")));
        return;
      }
      onSwitched();
    } catch {
      setFailure(t("failures.noAnswerConnection"));
    } finally {
      inFlight.current = false;
      setSubmitted(false);
    }
  }

  const verb = enabled ? t("actions.turnOn") : t("actions.turnOff");
  const doc = docNumber("set_automation_enabled", { workflowId: automation.id, enabled });

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogEyebrow>{verb}</DialogEyebrow>
          <DialogTitle>{automation.name}</DialogTitle>
        </DialogHeader>
        <DialogBody className="pb-7">
          <ReceiptCard
            toolName="set_automation_enabled"
            metaRight={
              submitted ? t(enabled ? "view.frame.turningOn.meta" : "view.frame.turningOff.meta") : t("view.frame.awaiting.meta")
            }
            tone="pending"
            noEntrance
          >
            <WriteHeader
              kicker={enabled ? t("view.kicker.turnOn") : t("view.kicker.turnOff")}
              status={
                submitted ? t(enabled ? "view.frame.turningOn.status" : "view.frame.turningOff.status") : t("view.frame.awaiting.status")
              }
              doc={doc}
              ink="default"
            />
            <p className="mt-3 text-[17px] font-semibold tracking-[-0.02em] text-foreground [overflow-wrap:anywhere]">
              {t(enabled ? "view.title.turnOn" : "view.title.turnOff", { name: automation.name })}
            </p>
            <p className="mt-2 text-[12.5px] text-fg-muted">
              {enabled ? t("switchDialog.onExplainer") : t("switchDialog.offExplainer")}
            </p>

            <PreviewBlock
              state={check}
              acknowledgement={
                <label htmlFor={ackId} className="mt-2 flex items-start gap-2 text-[12.5px] text-foreground">
                  <input
                    id={ackId}
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    disabled={submitted}
                    className="mt-0.5 size-4 accent-[var(--pending)]"
                  />
                  <span>{t("acknowledge.goAhead")}</span>
                </label>
              }
            />

            {failure !== null && <p className="mt-3 font-mono text-[12px] text-destructive">{failure}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void authorize()} disabled={!canAuthorize} className={PRIMARY_BUTTON}>
                {submitted ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                {automationActionLabel(
                  { submitted, state: check, acknowledged, action: t("actions.authorize"), busyLabel: t("actions.authorizing") },
                  translate,
                )}
              </button>
              <button type="button" onClick={() => changeOpen(false)} disabled={submitted} className={GHOST_BUTTON}>
                {tc("cancel")}
              </button>
            </div>
          </ReceiptCard>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function DialogRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="shrink-0 text-fg-muted">{k}</span>
      <span className="min-w-0 text-right text-foreground">{v}</span>
    </div>
  );
}
