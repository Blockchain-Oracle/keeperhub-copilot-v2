"use client";

import { useTranslations } from "next-intl";

import { CHAINS } from "@/lib/chains";
import { useTranslate } from "@/lib/i18n/use-translate";
import { priceFeedFor } from "@/lib/price-feeds";
import { BALANCE_OPS, readBalance, readRound } from "@/lib/read-results";
import { getOperationEntry } from "@/lib/registry";
import { isSolanaChainId } from "@/lib/registry/simulatability";

import { AutomationCard } from "./automation-card";
import { AutomationDetailCard, AutomationListCard } from "./automation-read-cards";
import { isAutomationChangeTool } from "./automation-view.ts";
import { BalanceCard } from "./balance-card";
import { CapabilityCard } from "./capability-card";
import { CardErrorBoundary, DegradedStub } from "./card-error-boundary";
import { ErrorCard } from "./error-card";
import { HoldingsCard } from "./holdings-card";
import { InputRequestCard } from "./input-request-card";
import { NeedsCredentialCard } from "./needs-credential-card";
import { PriceCard } from "./price-card";
import { ReadCard, type RerunRequest } from "./read-card";
import { selectRenderer, type RenderPlan, type ToolPartState, type ToolPartView } from "./select-renderer.ts";
import { SkeletonCard } from "./skeleton-card";
import { actionTypeOf } from "./tool-meta";
import type { WriteCeremony } from "./write-card.ts";
import { WriteCard } from "./write-card-view";

/*
 * v1 components/cards/CardRenderer.tsx: normalise an AI SDK tool part, let the
 * pure selector pick the plan (the system chooses the card, never the model),
 * draw it inside a per-card error boundary, and announce its state once.
 *
 * Changes: a read of a known Chainlink feed draws the price card and a balance
 * read the balance card, each falling back to the generic read card when the
 * result is not the shape expected. Every stage of a write draws the same
 * write card in the same place, so it stays mounted from proposal to receipt.
 */

type CardsTranslator = ReturnType<typeof useTranslations<"cards">>;

type RenderContext = {
  retired: boolean;
  rerun?: (request: RerunRequest) => Promise<void>;
  ceremony?: WriteCeremony;
  resumeErrored: boolean;
  live: boolean;
  label: string;
};

export function CardRenderer({
  part,
  superseded,
  rerun,
  ceremony,
  resumeErrored = false,
  live,
}: {
  part: unknown;
  /** The conversation's retired tool calls; a read card listed here renders replaced. */
  superseded?: ReadonlySet<string>;
  /** The re-run door; absent keeps read cards read-only. */
  rerun?: (request: RerunRequest) => Promise<void>;
  /** The write card's approve, cancel, retry and dry run; absent keeps write cards read-only. */
  ceremony?: WriteCeremony;
  /** The chat's last post failed. */
  resumeErrored?: boolean;
  /** False in a read-only chat: no live fetches. */
  live: boolean;
}) {
  if (part === null || typeof part !== "object") return null;
  const type = (part as { type?: unknown }).type;
  if (typeof type !== "string" || !type.startsWith("tool-")) return null;
  const toolName = type.slice("tool-".length);
  return (
    <CardErrorBoundary opName={toolName} payload={part}>
      <CardBody
        part={part as Record<string, unknown>}
        toolName={toolName}
        superseded={superseded}
        context={{ rerun, ceremony, resumeErrored, live }}
      />
    </CardErrorBoundary>
  );
}

function CardBody({
  part,
  toolName,
  superseded,
  context,
}: {
  part: Record<string, unknown>;
  toolName: string;
  superseded?: ReadonlySet<string>;
  context: Omit<RenderContext, "retired" | "label">;
}) {
  const t = useTranslations("cards");
  const translate = useTranslate();
  const view = toToolPartView(part);
  if (view === null) return <DegradedStub opName={toolName} payload={part} />;
  const plan = selectRenderer(view, translate);
  const retired =
    plan.kind === "read" && plan.toolCallId !== undefined && superseded !== undefined && superseded.has(plan.toolCallId);
  return (
    <>
      {renderPlan(plan, { ...context, retired, label: actionTypeOf(view.input) ?? toolName })}
      <span className="sr-only" role="status" aria-live={announceAssertive(plan) ? "assertive" : "polite"}>
        {announce(plan, t)}
      </span>
    </>
  );
}

type ChangePlan = Extract<RenderPlan, { kind: "write-proposed" | "write-executing" | "write-declined" | "receipt" }>;

function isChangePlan(plan: RenderPlan): plan is ChangePlan {
  return plan.kind === "write-proposed" || plan.kind === "write-executing" || plan.kind === "write-declined" || plan.kind === "receipt";
}

/* An automation change (decisions 19–21) draws the automation card through every stage, as a write draws the write card. */
function renderAutomationChange(plan: ChangePlan, context: RenderContext) {
  const phase =
    plan.kind === "write-proposed"
      ? "proposed"
      : plan.kind === "write-executing"
        ? "executing"
        : plan.kind === "write-declined"
          ? "declined"
          : "receipt";
  return (
    <AutomationCard
      phase={phase}
      toolName={plan.toolName}
      toolCallId={plan.toolCallId}
      input={plan.input}
      approvalId={plan.kind === "write-proposed" || plan.kind === "write-executing" ? plan.approvalId : undefined}
      approved={plan.kind === "write-executing" ? plan.approved : undefined}
      receipt={plan.kind === "receipt" ? plan.receipt : undefined}
      ceremony={context.ceremony}
      resumeErrored={context.resumeErrored}
    />
  );
}

function renderPlan(plan: RenderPlan, context: RenderContext) {
  if (isChangePlan(plan) && isAutomationChangeTool(plan.toolName)) return renderAutomationChange(plan, context);
  switch (plan.kind) {
    case "automations":
      return <AutomationListCard automations={plan.automations} />;
    case "automation":
      return <AutomationDetailCard automation={plan.automation} runs={plan.runs} notEditable={plan.notEditable} />;
    case "holdings":
      return <HoldingsCard holdings={plan.holdings} />;
    case "input-request":
      return (
        <InputRequestCard
          toolCallId={plan.toolCallId}
          input={plan.input}
          output={plan.output}
          ceremony={context.ceremony}
          live={context.live}
          resumeErrored={context.resumeErrored}
        />
      );
    case "skeleton":
      return <SkeletonCard label={context.label} />;
    case "capabilities":
      return <CapabilityCard result={plan.result} />;
    case "read": {
      const network = paramNetwork(plan.input);
      const feed = priceFeedFor(plan.opId);
      if (feed !== undefined && plan.opId !== undefined) {
        const reading = readRound(plan.data);
        if (reading !== null) {
          return <PriceCard opId={plan.opId} feed={feed} chainId={network} reading={reading} live={context.live} />;
        }
      }
      if (plan.opId !== undefined && BALANCE_OPS.has(plan.opId)) {
        const reading = readBalance(plan.opId, plan.data, nativeDecimals(network));
        if (reading !== null) return <BalanceCard opId={plan.opId} chainId={network} reading={reading} />;
      }
      return (
        <ReadCard
          toolName={plan.toolName}
          opId={plan.opId}
          toolCallId={plan.toolCallId}
          fingerprint={plan.fingerprint}
          input={plan.input}
          data={plan.data}
          retired={context.retired}
          rerun={context.rerun}
        />
      );
    }
    case "needs-credential":
      return (
        <NeedsCredentialCard
          toolName={plan.toolName}
          opId={plan.opId}
          integration={plan.integration}
          message={plan.message}
        />
      );
    case "write-proposed":
      return (
        <WriteCard
          phase="proposed"
          toolName={plan.toolName}
          opId={plan.opId}
          toolCallId={plan.toolCallId}
          approvalId={plan.approvalId}
          input={plan.input}
          ceremony={context.ceremony}
          resumeErrored={context.resumeErrored}
        />
      );
    case "write-executing":
      return (
        <WriteCard
          phase="executing"
          toolName={plan.toolName}
          opId={plan.opId}
          toolCallId={plan.toolCallId}
          approvalId={plan.approvalId}
          approved={plan.approved}
          input={plan.input}
          ceremony={context.ceremony}
          resumeErrored={context.resumeErrored}
        />
      );
    case "write-declined":
      return (
        <WriteCard
          phase="declined"
          toolName={plan.toolName}
          opId={plan.opId}
          toolCallId={plan.toolCallId}
          input={plan.input}
          ceremony={context.ceremony}
        />
      );
    case "receipt":
      return (
        <WriteCard
          phase="receipt"
          toolName={plan.toolName}
          opId={plan.opId}
          toolCallId={plan.toolCallId}
          input={plan.input}
          txHash={plan.txHash}
          receipt={plan.receipt}
          ceremony={context.ceremony}
        />
      );
    case "error":
      return <ErrorCard toolName={plan.toolName} error={plan.error} />;
    case "stub":
      return <DegradedStub opName={plan.toolName} payload={plan.payload} />;
  }
}

function paramNetwork(input: unknown): string | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const params = (input as { params?: unknown }).params;
  if (params === null || typeof params !== "object") return undefined;
  const network = (params as { network?: unknown }).network;
  return typeof network === "string" && network !== "" ? network : undefined;
}

/* Native currencies carry 18 decimals on every EVM network and 9 on Solana; an unknown network gets no guess. */
function nativeDecimals(network: string | undefined): number | undefined {
  if (network === undefined || CHAINS[network] === undefined) return undefined;
  return isSolanaChainId(network) ? 9 : 18;
}

function announce(plan: RenderPlan, t: CardsTranslator): string {
  switch (plan.kind) {
    case "skeleton":
      return t("announce.working");
    case "capabilities":
      return t("announce.capabilities");
    case "read":
      return t("announce.read", { label: readLabel(plan.opId, t) });
    case "needs-credential":
      return t("announce.needsCredential", { label: readLabel(plan.opId, t) });
    case "automations":
      return t("announce.automations");
    case "automation":
      return t("announce.automation");
    case "holdings":
      return t("announce.holdings");
    case "input-request":
      return plan.output === undefined ? t("announce.formOpen") : t("announce.formSent");
    case "write-proposed":
      return t("announce.proposed", { label: changeLabel(plan, t) });
    case "write-executing":
      return t("announce.executing", { label: changeLabel(plan, t) });
    case "write-declined":
      return t("announce.declined", { label: changeLabel(plan, t) });
    case "receipt":
      return isAutomationChangeTool(plan.toolName)
        ? t("announce.automationDone")
        : t("announce.executed", { label: readLabel(plan.opId, t) });
    case "error":
      return plan.error.message;
    case "stub":
      return "";
  }
}

function announceAssertive(plan: RenderPlan): boolean {
  return plan.kind === "receipt" || plan.kind === "write-declined" || plan.kind === "error";
}

function changeLabel(plan: ChangePlan, t: CardsTranslator): string {
  return isAutomationChangeTool(plan.toolName) ? t("announce.automationLabel") : readLabel(plan.opId, t);
}

function readLabel(opId: string | undefined, t: CardsTranslator): string {
  return (opId !== undefined ? getOperationEntry(opId)?.label : undefined) ?? t("announce.resultLabel");
}

const PART_STATES: ReadonlySet<string> = new Set<ToolPartState>([
  "input-streaming",
  "input-available",
  "approval-requested",
  "approval-responded",
  "output-denied",
  "output-available",
  "output-error",
]);

function toToolPartView(record: Record<string, unknown>): ToolPartView | null {
  const type = record.type;
  const state = record.state;
  if (typeof type !== "string" || !type.startsWith("tool-")) return null;
  if (typeof state !== "string" || !PART_STATES.has(state)) return null;
  const approval =
    record.approval !== null && typeof record.approval === "object" ? (record.approval as Record<string, unknown>) : null;
  return {
    toolName: type.slice("tool-".length),
    state: state as ToolPartState,
    toolCallId: typeof record.toolCallId === "string" ? record.toolCallId : undefined,
    input: record.input,
    output: record.output,
    errorText: typeof record.errorText === "string" ? record.errorText : undefined,
    approval:
      approval === null
        ? undefined
        : {
            id: typeof approval.id === "string" ? approval.id : undefined,
            approved: typeof approval.approved === "boolean" ? approval.approved : undefined,
            isAutomatic: typeof approval.isAutomatic === "boolean" ? approval.isAutomatic : undefined,
            signature: typeof approval.signature === "string" ? approval.signature : undefined,
          },
  };
}
