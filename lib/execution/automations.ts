import "server-only";

import {
  AUTOMATION_RUNS_LISTED,
  deleteAutomationRecord,
  fetchContractAbi,
  getAutomationRecord,
  listAutomationRuns,
  listAutomations,
  simulateAutomation,
  validateAutomation,
  validateCron,
} from "@/lib/automations";
import {
  automationDefinitionSchema,
  fromWorkflowGraph,
  stepLabel,
  toWorkflowGraph,
  CONDITION_STEP,
  type AutomationDefinition,
  type GraphReading,
} from "@/lib/automations/build";
import { describeChanges } from "@/lib/automations/diff";
import { checkAutomationDefinition, type ProposalIssue } from "@/lib/automations/proposal";
import {
  automationStatus,
  toAutomationDetail,
  triggerTypeOf,
  type AutomationDetail,
  type AutomationFact,
  type AutomationPreview,
  type AutomationReceipt,
  type AutomationRun,
  type AutomationStatus,
  type AutomationSubject,
  type AutomationSummary,
} from "@/lib/automations/shape";
import { canonicalJSON } from "@/lib/canonical-json";
import type { LedgerEntryRow } from "@/lib/data";
import { deriveIdempotencyKey, writeIntent, writeRunIntent, writeTerminal } from "@/lib/ledger";
import { callTool } from "@/lib/mcp";
import { getOperationEntry } from "@/lib/registry";
import type { AuthenticatedSession } from "@/lib/session";

import { toExecutionError } from "./errors.ts";
import { startWorkflowRun, type ExecutionError, type WritePhase } from "./index.ts";

export type { AutomationFact, AutomationPreview, AutomationReceipt } from "@/lib/automations/shape";

/*
 * Automations from chat (decisions 19–21), behind the one door. Listing and
 * describing run straight away. A change runs like any chat write: the card
 * asks the simulate phase for what it can show before Authorize (the local
 * proposal check, KeeperHub's own cron / workflow check and dry run, what would
 * change), and only the approved execute reaches the broadcast phase, where a
 * ledger intent lands BEFORE KeeperHub is called and the terminal after. A new
 * automation is always saved switched off (create_workflow with enabled:true
 * skips KeeperHub's own checks); turning it on is its own change: a chat card,
 * or Turn on on the saved automation's card or its page after KeeperHub's check.
 * A change keeps the automation's on/off state, a run is followed by its card
 * to KeeperHub's result, and a delete takes the run history with it.
 */

export const AUTOMATION_TOOL_NAMES = [
  "list_automations",
  "get_automation",
  "create_automation",
  "set_automation_enabled",
  "update_automation",
  "run_automation",
  "delete_automation",
] as const;
export type AutomationToolName = (typeof AUTOMATION_TOOL_NAMES)[number];
export type AutomationChangeTool = Exclude<AutomationToolName, "list_automations" | "get_automation">;

export type AutomationToolOutput =
  | { ok: true; tool: "list_automations"; automations: AutomationSummary[] }
  | {
      ok: true;
      tool: "get_automation";
      automation: AutomationDetail;
      runs: AutomationRun[] | null;
      /** The automation in the chat's shape, or null (with the reason) when it is not a straight line. */
      definition: AutomationDefinition | null;
      notEditable?: string;
    }
  | { ok: true; tool: AutomationChangeTool; state: "simulated"; preview: AutomationPreview }
  | { ok: true; tool: AutomationChangeTool; state: "receipt"; txHash: null; receipt: AutomationReceipt; opId: string };

type AutomationFailure = { ok: false; tool: AutomationToolName; error: ExecutionError };

export type AutomationCall = {
  session: AuthenticatedSession;
  toolName: AutomationToolName;
  args: unknown;
  requestId: string;
  signal?: AbortSignal;
  conversationId: string;
  toolCallId: string;
  write?: WritePhase;
};

// Changes with no execution to ask about: recovery reads the automation back instead. A run is an execution.
const CHANGE_OPS = new Set(["workflow/create", "workflow/update", "workflow/enable", "workflow/disable", "workflow/delete"]);

export function isAutomationChangeOp(opId: string): boolean {
  return CHANGE_OPS.has(opId);
}

export async function runAutomationTool(call: AutomationCall): Promise<AutomationToolOutput | AutomationFailure> {
  switch (call.toolName) {
    case "list_automations":
      return runList(call);
    case "get_automation":
      return runGet(call);
    case "create_automation":
      return runCreate(call);
    case "set_automation_enabled":
      return runSetEnabled(call);
    case "update_automation":
      return runUpdate(call);
    case "run_automation":
      return runRun(call);
    case "delete_automation":
      return runDelete(call);
  }
}

// --- reads -------------------------------------------------------------------

async function runList(call: AutomationCall): Promise<AutomationToolOutput | AutomationFailure> {
  const result = await listAutomations(call.session, call.requestId);
  if (!result.ok) return fail(call.toolName, toExecutionError(result.error));
  return { ok: true, tool: "list_automations", automations: result.data };
}

async function runGet(call: AutomationCall): Promise<AutomationToolOutput | AutomationFailure> {
  const workflowId = workflowIdOf(call.args);
  if (workflowId === null) return fail(call.toolName, missingWorkflowId());
  const read = await readCurrent(call, workflowId);
  if (!read.ok) return fail(call.toolName, read.error);
  if (read.current === null) return fail(call.toolName, notFound());
  const { automation, reading } = read.current;
  const runs = await listAutomationRuns(call.session, automation.id);
  return {
    ok: true,
    tool: "get_automation",
    automation,
    runs,
    definition: reading.ok ? withoutAbi(reading.definition) : null,
    ...(reading.ok ? {} : { notEditable: reading.reason }),
  };
}

type Current = { automation: AutomationDetail; reading: GraphReading; record: Record<string, unknown> };

/** The automation as KeeperHub has it now, or null when this org has none by that id. */
async function readCurrent(
  call: AutomationCall,
  workflowId: string,
): Promise<{ ok: true; current: Current | null } | { ok: false; error: ExecutionError }> {
  const record = await getAutomationRecord(call.session, workflowId, call.requestId, call.signal);
  if (!record.ok) return { ok: false, error: toExecutionError(record.error) };
  const automation = record.data === null ? null : toAutomationDetail(record.data);
  if (record.data === null || automation === null) return { ok: true, current: null };
  return { ok: true, current: { automation, reading: fromWorkflowGraph(record.data), record: record.data } };
}

// --- create_automation ---------------------------------------------------------

async function runCreate(call: AutomationCall): Promise<AutomationToolOutput | AutomationFailure> {
  const check = checkAutomationDefinition(call.args);
  if (!check.ok) return invalidProposal(call.toolName, check.issues);
  if (call.write === "simulate") return previewCreate(call, check.definition, check.warnings);
  if (call.write !== "broadcast") return fail(call.toolName, needsAuthorization());
  return saveAutomation(call, check.definition);
}

async function previewCreate(
  call: AutomationCall,
  definition: AutomationDefinition,
  checkWarnings: ProposalIssue[],
): Promise<AutomationToolOutput> {
  const { facts, blockers } = await triggerChecks(call, definition);
  const moving = valueMovingSteps(definition);
  facts.push({ label: "Moves value", value: moving.length > 0 ? joinLabels(moving) : "No step moves value" });
  facts.push({ label: "Once saved", value: "Switched off until you turn it on" });
  return {
    ok: true,
    tool: "create_automation",
    state: "simulated",
    preview: { facts, warnings: checkWarnings.map((warning) => warning.message), blockers },
  };
}

/** KeeperHub's reading of how an automation starts: its schedule in words, and a contract event start's ABI and event. */
async function triggerChecks(call: AutomationCall, definition: AutomationDefinition): Promise<{ facts: AutomationFact[]; blockers: string[] }> {
  const facts: AutomationFact[] = [];
  const blockers: string[] = [];
  const trigger = definition.trigger;

  if (trigger.type === "schedule") {
    const zone = trigger.timezone?.trim() || "UTC";
    const cron = await validateCron(call.session, trigger.cron, call.requestId, call.signal);
    if (cron === null) facts.push({ label: "Schedule", value: `${trigger.cron} (${zone}), not checked by KeeperHub` });
    else if (!cron.valid) blockers.push(`KeeperHub can't read this schedule: ${cron.error}`);
    else facts.push({ label: "Schedule", value: `${cron.description ?? trigger.cron} (${zone})` });
  }

  if (trigger.type === "event") {
    const withAbi = checkAutomationDefinition(await withEventAbi(definition), { requireAbi: true });
    if (!withAbi.ok) blockers.push(...withAbi.issues.map((issue) => issue.message));
    else facts.push({ label: "Watching", value: `${trigger.event} events${trigger.abi ? "" : ", ABI from the block explorer"}` });
  }
  return { facts, blockers };
}

async function saveAutomation(call: AutomationCall, definition: AutomationDefinition): Promise<AutomationToolOutput | AutomationFailure> {
  const { session, requestId, conversationId, toolCallId, toolName } = call;
  const final = checkAutomationDefinition(await withEventAbi(definition), { requireAbi: true });
  if (!final.ok) return invalidProposal(toolName, final.issues);
  const saved = final.definition;
  const graph = toWorkflowGraph(saved);

  const ledgerId = await openIntent(call, "workflow/create", withoutAbi(saved), null);
  if (ledgerId === null) return fail(toolName, intentFailed());

  // Never the caller's abort signal: once sent, a save must be answered, not abandoned.
  const result = await callTool({
    accessToken: session.accessToken,
    orgId: session.orgId,
    userId: session.userId,
    name: "create_workflow",
    args: {
      name: saved.name,
      ...(saved.description ? { description: saved.description } : {}),
      nodes: graph.nodes,
      edges: graph.edges,
      enabled: false,
      idempotency_key: deriveIdempotencyKey(toolCallId),
    },
    idempotent: false,
    requestId,
  });
  if (!result.ok) {
    await writeTerminal({ session, id: ledgerId, state: "failure", requestId, conversationId, toolCallId });
    return fail(toolName, toExecutionError(result.error));
  }

  const row = asRecord(result.data);
  const workflowId = str(row.id);
  if (workflowId === null) {
    // It may exist; the intent stays open rather than claiming a failure.
    return fail(toolName, {
      code: "server_error",
      message: "KeeperHub answered without the new automation's id. Check the Automations page before proposing it again.",
    });
  }
  const receipt: AutomationReceipt = {
    workflowId,
    name: str(row.name) ?? saved.name,
    enabled: false,
    triggerType: triggerTypeOf(graph.nodes),
  };
  await writeTerminal({ session, id: ledgerId, state: "receipt", receipt, workflowId, requestId, conversationId, toolCallId });
  return { ok: true, tool: "create_automation", state: "receipt", txHash: null, receipt, opId: "workflow/create" };
}

// --- update_automation ---------------------------------------------------------

async function runUpdate(call: AutomationCall): Promise<AutomationToolOutput | AutomationFailure> {
  const workflowId = workflowIdOf(call.args);
  if (workflowId === null) return fail(call.toolName, missingWorkflowId());
  const check = checkAutomationDefinition(call.args);
  if (!check.ok) return invalidProposal(call.toolName, check.issues);
  if (call.write === "simulate") return previewUpdate(call, workflowId, check.definition, check.warnings);
  if (call.write !== "broadcast") return fail(call.toolName, needsAuthorization());
  return saveUpdate(call, workflowId, check.definition);
}

async function previewUpdate(
  call: AutomationCall,
  workflowId: string,
  proposal: AutomationDefinition,
  checkWarnings: ProposalIssue[],
): Promise<AutomationToolOutput | AutomationFailure> {
  const read = await readCurrent(call, workflowId);
  if (!read.ok) return fail(call.toolName, read.error);
  if (read.current === null) return gonePreview("update_automation");
  const { automation, reading } = read.current;
  const subject = subjectOf(automation);
  if (!reading.ok) {
    return { ok: true, tool: "update_automation", state: "simulated", preview: { facts: [], warnings: [], blockers: [reading.reason], subject } };
  }

  const definition = carryOver(proposal, reading.definition);
  const { facts, blockers } = await triggerChecks(call, definition);
  const changes = describeChanges(withoutAbi(reading.definition), withoutAbi(definition));
  if (changes.length === 0) blockers.push("Nothing would change: this is the automation as it is now.");

  const moving = valueMovingSteps(definition);
  const warnings = checkWarnings.map((warning) => warning.message);
  facts.push({ label: "Moves value", value: moving.length > 0 ? joinLabels(moving) : "No step moves value" });
  const status = automationStatus(automation);
  if (status === "live") {
    facts.push({ label: "Once saved", value: "Stays on, and runs the new version from its next start" });
    if (moving.length > 0) {
      warnings.push(`It's on, so ${joinLabels(moving)} will run with the org wallet from its next start, without asking again.`);
    }
  } else {
    facts.push({ label: "Once saved", value: ONCE_SAVED[status] });
  }
  return { ok: true, tool: "update_automation", state: "simulated", preview: { facts, warnings, blockers, subject, changes } };
}

const ONCE_SAVED: Record<Exclude<AutomationStatus, "live">, string> = {
  manual: "Runs when someone presses Run now",
  off: "Stays switched off",
  deactivated: "Stays deactivated by KeeperHub",
};

async function saveUpdate(call: AutomationCall, workflowId: string, proposal: AutomationDefinition): Promise<AutomationToolOutput | AutomationFailure> {
  const { session, requestId, conversationId, toolCallId, toolName } = call;
  const read = await readCurrent(call, workflowId);
  if (!read.ok) return fail(toolName, read.error);
  if (read.current === null) return fail(toolName, notFound());
  const { automation, reading } = read.current;
  if (!reading.ok) return fail(toolName, { code: "write_not_available", message: reading.reason });

  const final = checkAutomationDefinition(await withEventAbi(carryOver(proposal, reading.definition)), { requireAbi: true });
  if (!final.ok) return invalidProposal(toolName, final.issues);
  const saved = final.definition;
  const graph = toWorkflowGraph(saved);

  const ledgerId = await openIntent(call, "workflow/update", { workflowId, ...withoutAbi(saved) }, workflowId);
  if (ledgerId === null) return fail(toolName, intentFailed());

  // Nodes and edges replace the old ones whole (fork lib/mcp/tools.ts update_workflow); leaving `enabled` out keeps it on or off.
  const result = await callTool({
    accessToken: session.accessToken,
    orgId: session.orgId,
    userId: session.userId,
    name: "update_workflow",
    args: {
      workflowId,
      name: saved.name,
      ...(saved.description !== undefined ? { description: saved.description } : {}),
      nodes: graph.nodes,
      edges: graph.edges,
    },
    idempotent: false,
    requestId,
  });
  if (!result.ok) {
    await writeTerminal({ session, id: ledgerId, state: "failure", requestId, conversationId, toolCallId });
    return fail(toolName, toExecutionError(result.error));
  }
  const row = asRecord(result.data);
  const receipt: AutomationReceipt = {
    workflowId,
    name: str(row.name) ?? saved.name,
    enabled: typeof row.enabled === "boolean" ? row.enabled : automation.enabled,
    triggerType: triggerTypeOf(graph.nodes),
  };
  await writeTerminal({ session, id: ledgerId, state: "receipt", receipt, requestId, conversationId, toolCallId });
  return { ok: true, tool: "update_automation", state: "receipt", txHash: null, receipt, opId: "workflow/update" };
}

/*
 * What a change leaves out stays as it is: the description, and a contract
 * event start's ABI while it watches the same contract (it may have been pasted
 * for a contract the block explorer cannot verify).
 */
function carryOver(proposal: AutomationDefinition, current: AutomationDefinition): AutomationDefinition {
  const description = proposal.description ?? current.description;
  const next: AutomationDefinition = description === undefined ? proposal : { ...proposal, description };
  const trigger = next.trigger;
  const was = current.trigger;
  if (
    trigger.type === "event" &&
    (trigger.abi === undefined || trigger.abi.trim() === "") &&
    was.type === "event" &&
    was.abi !== undefined &&
    was.network === trigger.network &&
    was.contract.toLowerCase() === trigger.contract.toLowerCase()
  ) {
    return { ...next, trigger: { ...trigger, abi: was.abi } };
  }
  return next;
}

// --- run_automation ----------------------------------------------------------------

async function runRun(call: AutomationCall): Promise<AutomationToolOutput | AutomationFailure> {
  const workflowId = workflowIdOf(call.args);
  if (workflowId === null) return fail(call.toolName, missingWorkflowId());
  if (call.write === "simulate") return previewRun(call, workflowId);
  if (call.write !== "broadcast") return fail(call.toolName, needsAuthorization());

  const read = await readCurrent(call, workflowId);
  if (!read.ok) return fail(call.toolName, read.error);
  if (read.current === null) return fail(call.toolName, notFound());
  const { automation } = read.current;
  if (automation.deactivated) return fail(call.toolName, { code: "write_not_available", message: DEACTIVATED_RUN });

  const run = await startWorkflowRun({
    session: call.session,
    workflowId,
    name: automation.name,
    requestId: call.requestId,
    chat: { conversationId: call.conversationId, toolCallId: call.toolCallId },
  });
  if (!run.ok) return fail(call.toolName, run.error);
  const receipt: AutomationReceipt = {
    workflowId,
    name: automation.name,
    enabled: automation.enabled,
    triggerType: automation.triggerType,
    ledgerId: run.ledgerId,
    executionId: run.executionId,
  };
  return { ok: true, tool: "run_automation", state: "receipt", txHash: null, receipt, opId: "workflow/run" };
}

/** Run now's confirm card in the chat (decision 18): KeeperHub's advisory dry run, whose warnings need a tick, and which steps move value. */
async function previewRun(call: AutomationCall, workflowId: string): Promise<AutomationToolOutput | AutomationFailure> {
  const read = await readCurrent(call, workflowId);
  if (!read.ok) return fail(call.toolName, read.error);
  if (read.current === null) return gonePreview("run_automation");
  const { automation } = read.current;

  const facts: AutomationFact[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];
  if (automation.deactivated) {
    blockers.push(DEACTIVATED_RUN);
  } else {
    const dryRun = await simulateAutomation(call.session, workflowId);
    if (dryRun.ok) {
      facts.push({ label: "Dry run", value: `${dryRun.simulated} checked, ${dryRun.skipped} skipped` });
      warnings.push(...dryRun.warnings.map((warning) => warning.message));
    } else {
      facts.push({ label: "Dry run", value: dryRun.reason });
    }
  }
  const moving = detailMovingSteps(automation);
  facts.push({ label: "Moves value", value: moving.length > 0 ? joinLabels(moving) : "No step moves value" });
  facts.push({ label: "Once authorized", value: "Every step runs now, without stopping again" });
  return { ok: true, tool: "run_automation", state: "simulated", preview: { facts, warnings, blockers, subject: subjectOf(automation) } };
}

// --- delete_automation -------------------------------------------------------------

async function runDelete(call: AutomationCall): Promise<AutomationToolOutput | AutomationFailure> {
  const workflowId = workflowIdOf(call.args);
  if (workflowId === null) return fail(call.toolName, missingWorkflowId());
  if (call.write === "simulate") return previewDelete(call, workflowId);
  if (call.write !== "broadcast") return fail(call.toolName, needsAuthorization());
  return deleteNow(call, workflowId);
}

async function previewDelete(call: AutomationCall, workflowId: string): Promise<AutomationToolOutput | AutomationFailure> {
  const read = await readCurrent(call, workflowId);
  if (!read.ok) return fail(call.toolName, read.error);
  if (read.current === null) return gonePreview("delete_automation");
  const { automation } = read.current;
  const runs = await listAutomationRuns(call.session, workflowId);
  const status = automationStatus(automation);
  const facts: AutomationFact[] = [
    { label: "Now", value: STATUS_WORDS[status] },
    { label: "Last updated", value: automation.updatedAt !== null ? utcMinute(automation.updatedAt) : "Unknown" },
    { label: "Run history", value: runHistory(runs) },
    {
      label: "Once authorized",
      value: status === "live" ? "It stops and is deleted from KeeperHub. This can't be undone." : "Deleted from KeeperHub. This can't be undone.",
    },
  ];
  return { ok: true, tool: "delete_automation", state: "simulated", preview: { facts, warnings: [], blockers: [], subject: subjectOf(automation) } };
}

const STATUS_WORDS: Record<AutomationStatus, string> = {
  live: "Live",
  manual: "On demand",
  off: "Off",
  deactivated: "Deactivated by KeeperHub",
};

function runHistory(runs: AutomationRun[] | null): string {
  if (runs === null) return "Couldn't be read. Any runs are deleted with it";
  if (runs.length === 0) return "No runs yet";
  const count = runs.length >= AUTOMATION_RUNS_LISTED ? `${runs.length}+ runs` : `${runs.length} run${runs.length === 1 ? "" : "s"}`;
  return `${count}, deleted with it`;
}

async function deleteNow(call: AutomationCall, workflowId: string): Promise<AutomationToolOutput | AutomationFailure> {
  const { session, requestId, conversationId, toolCallId, toolName } = call;
  const read = await readCurrent(call, workflowId);
  if (!read.ok) return fail(toolName, read.error);
  const automation = read.current?.automation ?? null;
  const name = automation?.name ?? "";

  const ledgerId = await openIntent(call, "workflow/delete", { workflowId, name }, workflowId);
  if (ledgerId === null) return fail(toolName, intentFailed());

  const result = await deleteAutomationRecord(session, workflowId);
  if (!result.ok) {
    // With no answer it may have landed: the intent stays open for recovery to read back.
    if (result.answered) await writeTerminal({ session, id: ledgerId, state: "failure", requestId, conversationId, toolCallId });
    return fail(toolName, toExecutionError(result.error));
  }
  const receipt: AutomationReceipt = { workflowId, name, enabled: false, triggerType: automation?.triggerType ?? null, deleted: true };
  await writeTerminal({ session, id: ledgerId, state: "receipt", receipt, requestId, conversationId, toolCallId });
  return { ok: true, tool: "delete_automation", state: "receipt", txHash: null, receipt, opId: "workflow/delete" };
}

// --- set_automation_enabled ----------------------------------------------------

async function runSetEnabled(call: AutomationCall): Promise<AutomationToolOutput | AutomationFailure> {
  const workflowId = workflowIdOf(call.args);
  const enabled = asRecord(call.args).enabled;
  if (workflowId === null) return fail(call.toolName, missingWorkflowId());
  if (typeof enabled !== "boolean") {
    return fail(call.toolName, {
      code: "validation_failed",
      message: "Say whether to turn the automation on (true) or off (false).",
      issues: [{ path: "enabled", message: "Expected true or false." }],
    });
  }
  if (call.write === "simulate") {
    const result = await automationSwitchPreview({ session: call.session, workflowId, enabled, requestId: call.requestId, signal: call.signal });
    if (!result.ok) return fail("set_automation_enabled", result.error);
    return { ok: true, tool: "set_automation_enabled", state: "simulated", preview: result.data.preview };
  }
  if (call.write !== "broadcast") return fail(call.toolName, needsAuthorization());

  const opId = switchOp(enabled);
  const ledgerId = await openIntent(call, opId, { workflowId, enabled }, workflowId);
  if (ledgerId === null) return fail(call.toolName, intentFailed());
  const sent = await sendSwitch({
    session: call.session,
    ledgerId,
    workflowId,
    enabled,
    requestId: call.requestId,
    correlation: { conversationId: call.conversationId, toolCallId: call.toolCallId },
  });
  if (!sent.ok) return fail("set_automation_enabled", sent.error);
  return { ok: true, tool: "set_automation_enabled", state: "receipt", txHash: null, receipt: sent.receipt, opId };
}

export type SwitchPreview = { automation: AutomationDetail | null; preview: AutomationPreview };

/*
 * What turning an automation on or off would meet, for its card: the
 * automation as it stands, KeeperHub's own check (its errors block) and dry run
 * (its warnings need a tick) when turning on, and a warning naming every step
 * that will then move value without asking again.
 */
export async function automationSwitchPreview(input: {
  session: AuthenticatedSession;
  workflowId: string;
  enabled: boolean;
  requestId: string;
  signal?: AbortSignal;
}): Promise<{ ok: true; data: SwitchPreview } | { ok: false; error: ExecutionError }> {
  const { session, workflowId, enabled, requestId, signal } = input;
  const record = await getAutomationRecord(session, workflowId, requestId, signal);
  if (!record.ok) return { ok: false, error: toExecutionError(record.error) };
  const automation = record.data === null ? null : toAutomationDetail(record.data);
  if (automation === null) {
    return { ok: true, data: { automation: null, preview: { facts: [], warnings: [], blockers: [GONE] } } };
  }

  const facts: AutomationFact[] = [
    { label: "Automation", value: automation.name },
    { label: "Now", value: automation.enabled ? "On" : "Off" },
  ];
  const warnings: string[] = [];
  const blockers: string[] = [];
  const status = automationStatus(automation);
  if (status === "deactivated") blockers.push("KeeperHub has deactivated this automation, so it can't be turned on or off here.");
  else if (status === "manual") blockers.push("This automation runs on demand, so there is nothing to turn on or off.");
  else if (automation.enabled === enabled) blockers.push(enabled ? "It's already on." : "It's already off.");

  if (enabled && blockers.length === 0) {
    const [validation, dryRun] = await Promise.all([
      validateAutomation(session, workflowId, requestId, signal),
      simulateAutomation(session, workflowId),
    ]);
    if (validation === null) {
      facts.push({ label: "KeeperHub check", value: "Couldn't be run just now" });
    } else if (validation.valid && validation.errors.length === 0) {
      facts.push({ label: "KeeperHub check", value: "Passed" });
    } else {
      blockers.push(...(validation.errors.length > 0 ? validation.errors : ["KeeperHub says this automation isn't ready to turn on."]));
    }
    if (validation !== null) warnings.push(...validation.warnings);
    if (dryRun.ok) {
      facts.push({ label: "Dry run", value: `${dryRun.simulated} checked, ${dryRun.skipped} skipped` });
      warnings.push(...dryRun.warnings.map((warning) => warning.message));
    } else {
      facts.push({ label: "Dry run", value: dryRun.reason });
    }
    const moving = detailMovingSteps(automation);
    if (moving.length > 0) {
      warnings.push(`Once on, ${joinLabels(moving)} will run with the org wallet every time it starts, without asking again.`);
    }
  }
  return { ok: true, data: { automation, preview: { facts, warnings, blockers, subject: subjectOf(automation) } } };
}

/*
 * Turn on (or off) from a saved automation's card (decision 19) or its page.
 * The click after KeeperHub's check is the authorization, as Run now's is
 * (decision 18): the intent lands before KeeperHub is called, with no chat tool
 * call to key it.
 */
export async function switchAutomationFromCard(input: {
  session: AuthenticatedSession;
  workflowId: string;
  enabled: boolean;
  requestId: string;
}): Promise<{ ok: true; receipt: AutomationReceipt } | { ok: false; error: ExecutionError }> {
  const { session, workflowId, enabled, requestId } = input;
  const opId = switchOp(enabled);
  let ledgerId: string;
  try {
    const row = await writeRunIntent({
      session,
      workflowId,
      idempotencyKey: crypto.randomUUID(),
      confirmedInputs: { workflowId, enabled },
      opId,
    });
    ledgerId = row.id;
  } catch (error) {
    logIntentFailure({ tool: "automation_card", opId, requestId, orgId: session.orgId, error });
    return { ok: false, error: intentFailed() };
  }
  return sendSwitch({ session, ledgerId, workflowId, enabled, requestId, correlation: {} });
}

async function sendSwitch(input: {
  session: AuthenticatedSession;
  ledgerId: string;
  workflowId: string;
  enabled: boolean;
  requestId: string;
  correlation: { conversationId?: string; toolCallId?: string };
}): Promise<{ ok: true; receipt: AutomationReceipt } | { ok: false; error: ExecutionError }> {
  const { session, ledgerId, workflowId, enabled, requestId, correlation } = input;
  const result = await callTool({
    accessToken: session.accessToken,
    orgId: session.orgId,
    userId: session.userId,
    name: "update_workflow",
    args: { workflowId, enabled },
    idempotent: false,
    requestId,
  });
  if (!result.ok) {
    await writeTerminal({ session, id: ledgerId, state: "failure", requestId, ...correlation });
    return { ok: false, error: toExecutionError(result.error) };
  }
  const row = asRecord(result.data);
  const receipt: AutomationReceipt = {
    workflowId,
    name: str(row.name) ?? "",
    enabled: typeof row.enabled === "boolean" ? row.enabled : enabled,
    triggerType: triggerTypeOf(row.nodes),
  };
  await writeTerminal({ session, id: ledgerId, state: "receipt", receipt, requestId, ...correlation });
  return { ok: true, receipt };
}

// --- recovery --------------------------------------------------------------------

/*
 * An automation change whose answer never arrived has no execution to ask
 * about. The automation as KeeperHub has it now says whether it took effect: on
 * or off as asked, gone after a delete, or holding exactly the confirmed
 * version after a change. A save never stamped its id, so it cannot be matched
 * and waits out expiry.
 */
export async function automationChangeLanded(input: {
  session: AuthenticatedSession;
  row: LedgerEntryRow;
  requestId: string;
  signal?: AbortSignal;
}): Promise<boolean> {
  const { session, row, requestId, signal } = input;
  if (!row.workflowId || row.opId === "workflow/create") return false;
  const record = await getAutomationRecord(session, row.workflowId, requestId, signal);
  if (!record.ok) return false;
  if (row.opId === "workflow/delete") return record.data === null;
  if (record.data === null) return false;
  if (row.opId === "workflow/update") return holdsConfirmed(record.data, row.confirmedInputs);
  return row.opId === "workflow/enable" ? record.data.enabled === true : record.data.enabled !== true;
}

/** Whether KeeperHub holds the version a change confirmed: the same name, description and graph, both rebuilt the same way. */
function holdsConfirmed(record: Record<string, unknown>, confirmed: Record<string, unknown> | null): boolean {
  const reading = fromWorkflowGraph(record);
  const wanted = automationDefinitionSchema.safeParse(confirmed);
  if (!reading.ok || !wanted.success) return false;
  const key = (definition: AutomationDefinition) => {
    const plain = withoutAbi(definition);
    return canonicalJSON({ name: plain.name, description: plain.description ?? null, graph: toWorkflowGraph(plain) });
  };
  return key(reading.definition) === key(wanted.data);
}

// --- helpers ---------------------------------------------------------------------

async function openIntent(
  call: AutomationCall,
  opId: string,
  confirmedInputs: Record<string, unknown>,
  workflowId: string | null,
): Promise<string | null> {
  try {
    const row = await writeIntent({
      session: call.session,
      conversationId: call.conversationId,
      toolCallId: call.toolCallId,
      opId,
      confirmedInputs,
      schemaFingerprint: null,
      workflowId,
    });
    return row.id;
  } catch (error) {
    logIntentFailure({ tool: call.toolName, opId, requestId: call.requestId, orgId: call.session.orgId, error });
    return null;
  }
}

function logIntentFailure(input: { tool: string; opId: string; requestId: string; orgId: string; error: unknown }): void {
  console.error(
    JSON.stringify({
      event: "ledger_intent_write_failed",
      tool: input.tool,
      opId: input.opId,
      requestId: input.requestId,
      orgId: input.orgId,
      message: input.error instanceof Error ? input.error.message : String(input.error),
    }),
  );
}

function switchOp(enabled: boolean): "workflow/enable" | "workflow/disable" {
  return enabled ? "workflow/enable" : "workflow/disable";
}

/** A contract event start with no ABI gets the verified one from KeeperHub's explorer lookup, when there is one. */
async function withEventAbi(definition: AutomationDefinition): Promise<AutomationDefinition> {
  const trigger = definition.trigger;
  if (trigger.type !== "event" || (trigger.abi !== undefined && trigger.abi.trim() !== "")) return definition;
  const abi = await fetchContractAbi(trigger.network, trigger.contract);
  return abi === null ? definition : { ...definition, trigger: { ...trigger, abi } };
}

/** The definition without a contract ABI, which can be large: kept out of the ledger and the model's context. */
function withoutAbi(definition: AutomationDefinition): AutomationDefinition {
  if (definition.trigger.type !== "event" || definition.trigger.abi === undefined) return definition;
  const { type, network, contract, event } = definition.trigger;
  return { ...definition, trigger: { type, network, contract, event } };
}

function subjectOf(automation: AutomationDetail): AutomationSubject {
  return {
    id: automation.id,
    name: automation.name,
    triggerType: automation.triggerType,
    status: automationStatus(automation),
    steps: automation.steps,
  };
}

function gonePreview(tool: AutomationChangeTool): AutomationToolOutput {
  return { ok: true, tool, state: "simulated", preview: { facts: [], warnings: [], blockers: [GONE] } };
}

function valueMovingSteps(definition: AutomationDefinition): string[] {
  return definition.steps.flatMap((step) => (step.action !== CONDITION_STEP && movesValue(step.action) ? [stepLabel(step)] : []));
}

function detailMovingSteps(automation: AutomationDetail): string[] {
  return automation.steps.flatMap((step) => (step.enabled && step.actionType !== null && movesValue(step.actionType) ? [step.label] : []));
}

function movesValue(actionType: string): boolean {
  const entry = getOperationEntry(actionType);
  return entry !== undefined && entry.kind === "plugin" && entry.effectClass !== "read";
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

function utcMinute(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC` : iso;
}

const GONE = "This automation isn't in your organisation any more.";
const DEACTIVATED_RUN = "KeeperHub has deactivated this automation, so it can't run.";

function fail(tool: AutomationToolName, error: ExecutionError): AutomationFailure {
  return { ok: false, tool, error };
}

function invalidProposal(tool: AutomationToolName, issues: ProposalIssue[]): AutomationFailure {
  return fail(tool, {
    code: "validation_failed",
    message: "The automation needs fixing before it can be shown to the person. Fix these and propose it again.",
    issues,
  });
}

function needsAuthorization(): ExecutionError {
  return { code: "write_not_available", message: "Changing an automation needs the person's authorization on its card." };
}

function intentFailed(): ExecutionError {
  return { code: "server_error", message: "This change could not be recorded, so nothing was sent to KeeperHub. Try again in a moment." };
}

function missingWorkflowId(): ExecutionError {
  return {
    code: "validation_failed",
    message: "Give the automation's id from list_automations.",
    issues: [{ path: "workflowId", message: "Required." }],
  };
}

function notFound(): ExecutionError {
  return { code: "validation_failed", message: "There's no automation with that id in this organisation. List the automations to find it." };
}

function workflowIdOf(args: unknown): string | null {
  const id = asRecord(args).workflowId;
  return typeof id === "string" && id.trim() !== "" ? id.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}
