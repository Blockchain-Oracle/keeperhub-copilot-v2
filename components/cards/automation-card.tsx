"use client";

import { Loader2, Power, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { StepList } from "@/components/automations/step-list";
import { CopyChip } from "@/components/data/copy-chip";
import { StatusBadge, triggerLabel } from "@/components/pages/automation-parts";
import { useAccount } from "@/components/shell/account-context";
import { announceReceipt } from "@/components/shell/funding/receipt-announce";
import type { AutomationPreview, AutomationReceipt, AutomationSubject } from "@/lib/automations/shape";
import { canonicalJSON } from "@/lib/canonical-json";
import { useTranslate } from "@/lib/i18n/use-translate";
import { checkEditedWrite } from "@/lib/registry/edited-write";
import { cn } from "@/lib/utils";

import {
  automationActionLabel,
  automationAuthorizeAllowed,
  automationFieldErrors,
  automationFormFor,
  automationFrame,
  automationKicker,
  automationTitle,
  buildEditedAutomation,
  definesAutomation,
  proposalSteps,
  readDefinition,
  readSwitch,
  readTarget,
  toAutomationPreviewState,
  triggerSummary,
  type AutomationPreviewState,
  type DetailRow,
  type RunFollowStatus,
  type TriggerSummary,
} from "./automation-view.ts";
import type { FieldError, FormValues } from "./editable.ts";
import { EmptyLine, Inset, Label, Row } from "./parts";
import { ReceiptCard, ReceiptStamp } from "./receipt-card";
import { ShareReceipt } from "./share-receipt";
import type { AutomationCeremony, WriteCeremony, WritePhase } from "./write-card.ts";
import { docNumber } from "./write-card.ts";
import { EditPanel, GHOST_BUTTON, NetworkName, PRIMARY_BUTTON, WriteHeader } from "./write-card-parts";

/*
 * The automation card (decisions 19–21): one component for an automation
 * change's whole life, like the write card, so what was authorized stays on
 * screen. No reference has an automation proposal, so it is the write card's
 * anatomy (Portaldot receipt frame, DeepBookie SignReceipt kicker, status line
 * and document number, the ref guard, the CTA ladder) holding the automation:
 * a proposal's start and steps, or the existing automation a switch, run or
 * delete acts on, on the detail page's numbered rail.
 *
 * Before Authorize the card asks the simulate phase for KeeperHub's reading:
 * facts, what would change, warnings that need a tick, and blockers that keep
 * Authorize off. A new automation lands switched off; the same card then asks
 * KeeperHub's own check and dry run and offers Turn on, a second click
 * (decision 19). A started run is followed to KeeperHub's result, as the
 * automation page follows Run now. Editing changes everything but the kind of
 * start and which steps run (decision 11).
 */

export type AutomationCardProps = {
  phase: WritePhase;
  toolName: string;
  toolCallId?: string;
  input: unknown;
  approvalId?: string;
  approved?: boolean;
  receipt?: unknown;
  /** Absent in a read-only chat: no buttons, no checks. */
  ceremony?: WriteCeremony;
  resumeErrored?: boolean;
};

export function AutomationCard({
  phase,
  toolName,
  toolCallId,
  input,
  approvalId,
  approved,
  receipt,
  ceremony,
  resumeErrored = false,
}: AutomationCardProps) {
  const live = ceremony !== undefined;
  const t = useTranslations("automations");
  const tc = useTranslations("common");
  const translate = useTranslate();
  const { identity } = useAccount();
  const orgId = identity.status === "signed-in" ? identity.orgId : undefined;

  const [applied, setApplied] = useState<unknown>(input);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<FormValues>({});
  const [errors, setErrors] = useState<Record<string, FieldError>>({});
  const [formNote, setFormNote] = useState("");
  const [preview, setPreview] = useState<AutomationPreviewState>({ status: "loading" });
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [authorizedPreview, setAuthorizedPreview] = useState<AutomationPreviewState | null>(null);
  // Flips in the same tick as the click, so a double click cannot answer twice.
  const inFlight = useRef(false);
  // Whether this card was on screen before its change landed, so a run that settles here is announced once.
  const watched = useRef(phase !== "receipt");
  const ackId = useId();

  const shown = phase === "proposed" ? applied : input;
  const argsKey = canonicalJSON(applied ?? null);
  const edited = argsKey !== canonicalJSON(input ?? null);
  const awaiting = phase === "proposed" && live;
  const definition = definesAutomation(toolName) ? readDefinition(shown) : null;
  const switching = toolName === "set_automation_enabled" ? readSwitch(shown) : null;
  const target = readTarget(shown);
  const saved = phase === "receipt" ? readReceipt(receipt) : null;
  const onDemand = definition?.trigger.type === "manual";
  const followUp = useTurnOn(toolName === "create_automation" ? saved : null, onDemand, ceremony?.automation);
  const run = useRunFollow(toolName === "run_automation" ? saved?.ledgerId : undefined, ceremony?.automation, watched, orgId);

  // KeeperHub's reading, once per applied proposal. A late answer for an older one is dropped.
  const simulate = phase === "proposed" ? ceremony?.simulate : undefined;
  useEffect(() => {
    if (simulate === undefined) return;
    let active = true;
    simulate({ tool: toolName, args: JSON.parse(argsKey) as unknown, toolCallId })
      .then((result) => {
        if (active) setPreview(toAutomationPreviewState(result, translate));
      })
      .catch(() => {
        if (active) setPreview({ status: "error", message: translate("automations.failures.checkFailed") });
      });
    return () => {
      active = false;
    };
  }, [simulate, toolName, argsKey, toolCallId, translate]);

  const reading = phase === "proposed" ? preview : authorizedPreview;
  const subject = reading?.status === "ready" ? reading.preview.subject : undefined;
  const name = subject?.name ?? (saved?.name ? saved.name : undefined);

  const frame = automationFrame(
    {
      toolName,
      phase,
      enabled: switching?.enabled,
      approved,
      live,
      resumeErrored,
      submitted,
      edited,
      turnedOn: followUp.state.status === "live",
      run: run.status === "idle" ? undefined : run.status,
    },
    translate,
  );
  const doc = docNumber(toolName, shown);
  const kicker = automationKicker(toolName, shown, translate);
  const title = automationTitle(toolName, shown, name, translate);
  const form = awaiting && definition !== null ? automationFormFor(definition, translate) : null;
  const canAuthorize =
    awaiting && approvalId !== undefined && !submitted && !editing && automationAuthorizeAllowed(preview, acknowledged);

  function startEditing() {
    if (form === null) return;
    setValues(form.seed);
    setErrors({});
    setFormNote("");
    setEditing(true);
  }

  function stopEditing() {
    setEditing(false);
    setErrors({});
    setFormNote("");
  }

  function changeField(key: string, value: unknown) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!Object.hasOwn(current, key)) return current;
      const rest = { ...current };
      delete rest[key];
      return rest;
    });
    setFormNote("");
  }

  function applyEdits() {
    if (form === null || definition === null) return;
    const rebuilt = buildEditedAutomation(definition, values);
    const next = toolName === "update_automation" && target !== null ? { workflowId: target.workflowId, ...rebuilt } : rebuilt;
    const check = checkEditedWrite(toolName, input, next, translate);
    if (!check.ok) {
      const mapped = automationFieldErrors(check.issues, form);
      setErrors(mapped.byField);
      setFormNote(mapped.other.join(" "));
      return;
    }
    stopEditing();
    if (canonicalJSON(next) === argsKey) return;
    setApplied(next);
    setAcknowledged(false);
    setPreview({ status: "loading" });
  }

  async function authorize() {
    if (!canAuthorize || inFlight.current || ceremony === undefined || approvalId === undefined) return;
    inFlight.current = true;
    setSubmitted(true);
    setAuthorizedPreview(preview);
    try {
      await ceremony.confirm(approvalId, edited ? applied : undefined);
    } catch {
      inFlight.current = false;
      setSubmitted(false);
      setAuthorizedPreview(null);
    }
  }

  async function cancel() {
    if (!awaiting || inFlight.current || ceremony === undefined || approvalId === undefined) return;
    inFlight.current = true;
    setSubmitted(true);
    try {
      await ceremony.decline(approvalId);
    } catch {
      inFlight.current = false;
      setSubmitted(false);
    }
  }

  function retry() {
    if (approvalId === undefined || approved === undefined) return;
    void ceremony?.retry?.(approvalId, approved);
  }

  if (phase === "declined") {
    return (
      <ReceiptCard toolName={toolName} metaRight={frame.meta} className="opacity-90">
        <WriteHeader kicker={kicker} status={frame.status} doc={doc} ink="muted" />
        <p className="mt-3 text-[17px] font-semibold tracking-[-0.02em] text-fg-muted line-through [overflow-wrap:anywhere]">
          {title}
        </p>
        <p className="mt-2 text-xs text-fg-muted">
          {toolName === "run_automation" ? t("card.declinedRun") : t("card.declinedProposal")}
        </p>
      </ReceiptCard>
    );
  }

  const sending = phase === "executing" && live && !resumeErrored && approved !== false;
  const stamped = phase === "receipt";
  const workflowId = saved?.workflowId ?? target?.workflowId;

  return (
    <ReceiptCard
      toolName={toolName}
      metaRight={frame.meta}
      tone={frame.tone}
      stamp={frame.stamp !== undefined ? <ReceiptStamp label={frame.stamp.label} tone={frame.stamp.tone} /> : undefined}
    >
      <WriteHeader
        kicker={kicker}
        status={frame.status}
        doc={doc}
        ink={frame.tone === "success" ? "success" : live ? "default" : "muted"}
        stamped={stamped}
      />
      <p className="mt-3 text-[17px] font-semibold tracking-[-0.02em] text-foreground [overflow-wrap:anywhere]">{title}</p>
      {definition?.description !== undefined && definition.description !== "" && (
        <p className="mt-1 text-[13px] text-fg-secondary">{definition.description}</p>
      )}

      {editing && form !== null ? (
        <EditPanel
          fields={form.fields}
          values={values}
          errors={errors}
          note={formNote}
          applyLabel={t("card.checkValues")}
          onChange={changeField}
          onApply={applyEdits}
          onDiscard={stopEditing}
        />
      ) : (
        <div className={cn("mt-3 transition-opacity", sending && "opacity-60")}>
          {definition !== null ? (
            <>
              <Label>{t("card.starts")}</Label>
              <TriggerBlock summary={triggerSummary(definition.trigger, translate)} />
              <Label className="mt-3 block">{t("card.steps")}</Label>
              <StepList
                steps={proposalSteps(definition, translate).map((step) => ({
                  ...step,
                  detail: <StepDetail rows={step.rows} movesValue={step.movesValue} />,
                }))}
              />
            </>
          ) : subject !== undefined && !stamped ? (
            <SubjectBlock subject={subject} />
          ) : target !== null ? (
            <div className="divide-y divide-border/60">
              <Row k={t("card.automation")} v={<CopyChip value={target.workflowId} />} />
              {switching !== null && (
                <Row k={t("card.change")} v={switching.enabled ? t("actions.turnOn") : t("actions.turnOff")} />
              )}
            </div>
          ) : null}
        </div>
      )}

      {awaiting && !editing && (
        <PreviewBlock
          state={preview}
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
      )}
      {phase === "executing" && authorizedPreview?.status === "ready" && <PreviewBlock state={authorizedPreview} />}

      {sending && (
        <div role="status" className="mt-4 flex items-center justify-center gap-3 py-2">
          <Loader2 aria-hidden="true" className="size-5 animate-spin text-fg-muted" />
          <span className="text-[13px] font-medium text-fg-secondary">{frame.status}</span>
        </div>
      )}
      {phase === "executing" && live && resumeErrored && (
        <div className="mt-4">
          <p role="status" className="text-[13px] text-foreground">
            {t("card.notSent")}
          </p>
          {ceremony?.retry !== undefined && approvalId !== undefined && approved !== undefined && (
            <button type="button" onClick={retry} className={cn(PRIMARY_BUTTON, "mt-3")}>
              {tc("tryAgain")}
            </button>
          )}
        </div>
      )}
      {phase === "executing" && !live && approved !== false && (
        <p className="mt-3 text-[12.5px] text-fg-muted">{t("card.noAnswer")}</p>
      )}
      {phase === "proposed" && !live && (
        <p className="mt-3 text-[12.5px] text-fg-muted">{t("card.archived")}</p>
      )}

      {phase === "receipt" && toolName === "create_automation" && saved !== null && (
        <SavedFollowUp followUp={followUp} onDemand={onDemand} live={live} />
      )}
      {phase === "receipt" && toolName === "run_automation" && <RunFollowUp run={run} live={live} ledgerId={saved?.ledgerId} />}
      {phase === "receipt" && toolName === "update_automation" && (
        <p className="mt-3 text-[12.5px] text-fg-secondary">
          {saved?.enabled ? t("card.updatedOn") : t("card.updatedKept")}
        </p>
      )}
      {phase === "receipt" && toolName === "delete_automation" && (
        <p className="mt-3 text-[12.5px] text-fg-secondary">{t("card.deleted")}</p>
      )}
      {phase === "receipt" && workflowId !== undefined && toolName !== "delete_automation" && (
        <Link
          href={`/app/automations/${encodeURIComponent(workflowId)}`}
          className="mt-3 inline-block text-[13px] font-semibold text-fg-secondary transition hover:text-foreground"
        >
          {t("actions.openAutomation")}
        </Link>
      )}

      {awaiting && !editing && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void authorize()} disabled={!canAuthorize} className={PRIMARY_BUTTON}>
            {submitted ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
            {automationActionLabel(
              { submitted, state: preview, acknowledged, action: t("actions.authorize"), busyLabel: t("actions.authorizing") },
              translate,
            )}
          </button>
          {form !== null && (
            <button type="button" onClick={startEditing} disabled={submitted} className={GHOST_BUTTON}>
              {t("actions.edit")}
            </button>
          )}
          <button type="button" onClick={() => void cancel()} disabled={submitted} className={GHOST_BUTTON}>
            {tc("cancel")}
          </button>
        </div>
      )}
    </ReceiptCard>
  );
}

// --- the saved automation's Turn on (decision 19) ---------------------------------

type FollowUpState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ready"; preview: AutomationPreview }
  | { status: "error"; message: string }
  | { status: "live" };

type FollowUp = {
  state: FollowUpState;
  acknowledged: boolean;
  setAcknowledged: (value: boolean) => void;
  turningOn: boolean;
  failure: string | null;
  turnOn: () => Promise<void>;
  checkAgain: () => void;
};

function useTurnOn(saved: AutomationReceipt | null, onDemand: boolean, automation: AutomationCeremony | undefined): FollowUp {
  const t = useTranslations("automations.failures");
  const workflowId = saved?.workflowId;
  const active = workflowId !== undefined && !onDemand && automation !== undefined;
  const [attempt, setAttempt] = useState(0);
  // Answers are kept against the check they belong to, so a new check reads as checking without a synchronous reset.
  const [answer, setAnswer] = useState<{ key: string; state: FollowUpState } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [turningOn, setTurningOn] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const inFlight = useRef(false);
  const key = `${workflowId ?? ""}:${attempt}`;

  useEffect(() => {
    if (!active || automation === undefined || workflowId === undefined) return;
    let alive = true;
    automation
      .check(workflowId)
      .then((result) => {
        if (!alive) return;
        if (!result.ok) setAnswer({ key, state: { status: "error", message: result.message } });
        else if (result.enabled) setAnswer({ key, state: { status: "live" } });
        else setAnswer({ key, state: { status: "ready", preview: result.preview } });
      })
      .catch(() => {
        if (alive) setAnswer({ key, state: { status: "error", message: t("checkFailed") } });
      });
    return () => {
      alive = false;
    };
  }, [active, automation, workflowId, key, t]);

  const state: FollowUpState = !active ? { status: "idle" } : answer?.key === key ? answer.state : { status: "checking" };

  async function turnOn() {
    if (automation === undefined || workflowId === undefined || inFlight.current || state.status !== "ready") return;
    if (!automationAuthorizeAllowed({ status: "ready", preview: state.preview }, acknowledged)) return;
    inFlight.current = true;
    setTurningOn(true);
    setFailure(null);
    try {
      const result = await automation.setEnabled(workflowId, true);
      if (result.ok && result.enabled) setAnswer({ key, state: { status: "live" } });
      else setFailure(result.ok ? t("notTurnedOn") : result.message);
    } finally {
      inFlight.current = false;
      setTurningOn(false);
    }
  }

  return {
    state,
    acknowledged,
    setAcknowledged,
    turningOn,
    failure,
    turnOn,
    checkAgain: () => {
      setAcknowledged(false);
      setAttempt((n) => n + 1);
    },
  };
}

function SavedFollowUp({ followUp, onDemand, live }: { followUp: FollowUp; onDemand: boolean; live: boolean }) {
  const t = useTranslations("automations");
  const translate = useTranslate();
  const ackId = useId();
  const { state } = followUp;
  if (onDemand) {
    return <p className="mt-3 text-[12.5px] text-fg-secondary">{t("savedFollowUp.onDemand")}</p>;
  }
  if (!live) {
    return <p className="mt-3 text-[12.5px] text-fg-muted">{t("savedFollowUp.archived")}</p>;
  }
  if (state.status === "live") {
    return <p className="mt-3 text-[13px] font-medium text-success">{t("savedFollowUp.live")}</p>;
  }
  const previewState: AutomationPreviewState =
    state.status === "ready"
      ? { status: "ready", preview: state.preview }
      : state.status === "error"
        ? { status: "error", message: state.message }
        : { status: "loading" };
  const allowed = state.status === "ready" && automationAuthorizeAllowed(previewState, followUp.acknowledged);
  return (
    <div className="mt-3">
      <p className="text-[12.5px] text-fg-secondary">{t("savedFollowUp.off")}</p>
      <PreviewBlock
        state={previewState}
        acknowledgement={
          <label htmlFor={ackId} className="mt-2 flex items-start gap-2 text-[12.5px] text-foreground">
            <input
              id={ackId}
              type="checkbox"
              checked={followUp.acknowledged}
              onChange={(event) => followUp.setAcknowledged(event.target.checked)}
              disabled={followUp.turningOn}
              className="mt-0.5 size-4 accent-[var(--pending)]"
            />
            <span>{t("acknowledge.turnOn")}</span>
          </label>
        }
      />
      {followUp.failure !== null && <p className="mt-3 font-mono text-[12px] text-destructive">{followUp.failure}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {state.status === "error" ? (
          <button type="button" onClick={followUp.checkAgain} className={GHOST_BUTTON}>
            {t("actions.checkAgain")}
          </button>
        ) : (
          <button type="button" onClick={() => void followUp.turnOn()} disabled={!allowed || followUp.turningOn} className={PRIMARY_BUTTON}>
            {followUp.turningOn ? <Loader2 className="size-3.5 animate-spin" /> : <Power className="size-3.5" />}
            {automationActionLabel(
              {
                submitted: followUp.turningOn,
                state: previewState,
                acknowledged: followUp.acknowledged,
                action: t("actions.turnOn"),
                busyLabel: t("actions.turningOn"),
              },
              translate,
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// --- a started run, followed to its result (decision 21) --------------------------

const RUN_POLL_MS = 2_000;
const RUN_POLL_LIMIT_MS = 5 * 60_000;

type RunFollow = { status: "idle" | RunFollowStatus; txHash: string | null };

/*
 * The automation page's Run now poll (automation-detail.tsx) on the chat card:
 * asks every 2 s where the run stands until KeeperHub settles it, for up to 5
 * minutes. A run that lands while the card watched it counts toward the
 * first-receipt welcome, once.
 */
function useRunFollow(
  ledgerId: string | undefined,
  automation: AutomationCeremony | undefined,
  watched: RefObject<boolean>,
  orgId: string | undefined,
): RunFollow {
  const [answer, setAnswer] = useState<{ ledgerId: string; status: RunFollowStatus; txHash: string | null } | null>(null);
  const announced = useRef(false);
  const active = ledgerId !== undefined && automation !== undefined;

  useEffect(() => {
    if (ledgerId === undefined || automation === undefined) return;
    const id = ledgerId;
    const follow = automation;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    async function tick() {
      const result = await follow.runStatus(id).catch(() => null);
      if (stopped) return;
      if (result !== null && result.state !== "pending") {
        setAnswer({ ledgerId: id, status: result.state, txHash: result.txHash });
        if (result.state === "receipt" && watched.current && !announced.current && orgId !== undefined) {
          announced.current = true;
          announceReceipt(orgId, "workflow/run", result.txHash);
        }
        return;
      }
      if (Date.now() - started >= RUN_POLL_LIMIT_MS) {
        setAnswer({ ledgerId: id, status: "stale", txHash: null });
        return;
      }
      timer = setTimeout(() => void tick(), RUN_POLL_MS);
    }
    timer = setTimeout(() => void tick(), 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [ledgerId, automation, watched, orgId]);

  if (!active) return { status: "idle", txHash: null };
  return answer?.ledgerId === ledgerId ? { status: answer.status, txHash: answer.txHash } : { status: "pending", txHash: null };
}

function RunFollowUp({ run, live, ledgerId }: { run: RunFollow; live: boolean; ledgerId?: string }) {
  const t = useTranslations("automations.runFollowUp");
  if (!live || run.status === "idle") {
    return <p className="mt-3 text-[12.5px] text-fg-muted">{t("started")}</p>;
  }
  switch (run.status) {
    case "pending":
      return (
        <p role="status" className="mt-3 inline-flex items-center gap-2 text-[12.5px] text-fg-secondary">
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          {t("running")}
        </p>
      );
    case "receipt":
      return (
        <div className="mt-3">
          <p className="text-[13px] font-medium text-success">{t("executed")}</p>
          {run.txHash !== null && <Row k={t("transaction")} v={<CopyChip value={run.txHash} />} />}
          {run.txHash !== null && ledgerId !== undefined && (
            <div className="mt-2 flex justify-end">
              <ShareReceipt ledgerId={ledgerId} />
            </div>
          )}
        </div>
      );
    case "failure":
      return <p className="mt-3 text-[12.5px] text-destructive">{t("failed")}</p>;
    default:
      return <p className="mt-3 text-[12.5px] text-fg-muted">{t("stale")}</p>;
  }
}

// --- drawn pieces -------------------------------------------------------------------

/** KeeperHub's reading before a change: facts, what would change, blockers and warnings with their tick. Shared with the automation page's Turn on / Turn off. */
export function PreviewBlock({ state, acknowledgement }: { state: AutomationPreviewState; acknowledgement?: React.ReactNode }) {
  const t = useTranslations("automations.previewBlock");
  if (state.status === "loading") {
    return (
      <p role="status" className="mt-3 font-mono text-[11px] tracking-[0.18em] text-fg-muted uppercase">
        —— {t("checking")} ——
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <Inset className="mt-3">
        <Label>{t("label")}</Label>
        <p className="mt-1 font-mono text-[12px] text-fg-secondary [overflow-wrap:anywhere]">{state.message}</p>
      </Inset>
    );
  }
  const { facts, warnings, blockers } = state.preview;
  const changes = state.preview.changes ?? [];
  const blocked = blockers.length > 0;
  const warned = warnings.length > 0;
  return (
    <div
      className={cn(
        "mt-3 rounded-lg border px-3 py-2",
        blocked
          ? "border-destructive/30 bg-destructive/5"
          : warned
            ? "border-pending/40 bg-pending/5"
            : "border-success/30 bg-success/5",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <Label>{t("label")}</Label>
        <span
          className={cn(
            "font-mono text-[10px] tracking-[0.18em] uppercase",
            blocked ? "text-destructive" : warned ? "text-pending" : "text-success",
          )}
        >
          {blocked ? t("blocked") : warned ? t("warned") : t("ready")}
        </span>
      </div>
      {changes.length > 0 && (
        <div className="mt-2">
          <Label>{t("changes")}</Label>
          <ul className="mt-1 space-y-1">
            {changes.map((change, index) => (
              <li key={`${index}-${change}`} className="font-mono text-[12px] text-foreground [overflow-wrap:anywhere]">
                {change}
              </li>
            ))}
          </ul>
        </div>
      )}
      {facts.length > 0 && (
        <div className="mt-1 divide-y divide-border/60">
          {facts.map((fact) => (
            <Row key={fact.label} k={fact.label} v={<span className="text-[13px] [overflow-wrap:anywhere]">{fact.value}</span>} />
          ))}
        </div>
      )}
      {blocked && (
        <ul className="mt-2 space-y-1">
          {blockers.map((blocker) => (
            <li key={blocker} className="text-[12.5px] text-destructive">
              {blocker}
            </li>
          ))}
        </ul>
      )}
      {warned && (
        <ul className="mt-2 space-y-1">
          {warnings.map((warning) => (
            <li key={warning} className="text-[12.5px] text-pending">
              {warning}
            </li>
          ))}
        </ul>
      )}
      {warned && !blocked && acknowledgement}
    </div>
  );
}

/** The existing automation a switch, run or delete acts on: how it starts, whether it is on, and its steps. */
function SubjectBlock({ subject }: { subject: AutomationSubject }) {
  const t = useTranslations("automations.subjectBlock");
  const translate = useTranslate();
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-fg-muted">{triggerLabel(subject.triggerType, translate)}</span>
        <StatusBadge
          automation={{
            enabled: subject.status === "live",
            deactivated: subject.status === "deactivated",
            triggerType: subject.triggerType,
          }}
        />
      </div>
      <Label className="mt-3 block">{t("steps")}</Label>
      {subject.steps.length === 0 ? <EmptyLine>{t("noSteps")}</EmptyLine> : <StepList steps={subject.steps} />}
    </>
  );
}

function TriggerBlock({ summary }: { summary: TriggerSummary }) {
  const t = useTranslations("automations.triggerBlock");
  return (
    <div className="mt-1">
      <p className="text-[13.5px] font-semibold text-foreground">{summary.title}</p>
      {(summary.network !== null || summary.rows.length > 0) && (
        <div className="mt-1 divide-y divide-border/60">
          {summary.network !== null && <Row k={t("network")} v={<NetworkName chainId={summary.network} />} />}
          {summary.rows.map((row) => (
            <Row key={row.key} k={row.label} v={<DetailValue value={row.value} />} />
          ))}
        </div>
      )}
    </div>
  );
}

function StepDetail({ rows, movesValue }: { rows: DetailRow[]; movesValue: boolean }) {
  const t = useTranslations("automations.stepDetail");
  return (
    <>
      {movesValue && (
        <span className="mt-1 inline-flex items-center rounded-full border border-pending/40 bg-pending/10 px-1.5 py-0.5 text-[10px] font-medium text-pending">
          {t("movesValue")}
        </span>
      )}
      {rows.length > 0 && (
        <div className="mt-1.5 divide-y divide-border/50 rounded-md border border-border/60 bg-surface-2/30 px-2">
          {rows.map((row) => (
            <Row key={row.key} k={row.label} v={<DetailValue value={row.value} />} />
          ))}
        </div>
      )}
    </>
  );
}

function DetailValue({ value }: { value: string }) {
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) return <CopyChip value={value} />;
  return <span className="font-mono text-[12.5px] [overflow-wrap:anywhere]">{value}</span>;
}

function readReceipt(receipt: unknown): AutomationReceipt | null {
  if (receipt === null || typeof receipt !== "object") return null;
  const record = receipt as Record<string, unknown>;
  if (typeof record.workflowId !== "string" || record.workflowId === "") return null;
  return {
    workflowId: record.workflowId,
    name: typeof record.name === "string" ? record.name : "",
    enabled: record.enabled === true,
    triggerType: typeof record.triggerType === "string" ? record.triggerType : null,
    ...(typeof record.ledgerId === "string" && record.ledgerId !== "" ? { ledgerId: record.ledgerId } : {}),
    ...(typeof record.executionId === "string" ? { executionId: record.executionId } : {}),
    ...(record.deleted === true ? { deleted: true } : {}),
  };
}
