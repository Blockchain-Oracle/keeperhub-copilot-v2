import { z } from "zod";

import { getOperationEntry } from "../registry/index.ts";

/*
 * The automation shape the chat works in (decisions 19–21), and its two-way
 * translation to KeeperHub's workflow graph. The chat names a start and a
 * straight line of steps; the server turns that into KeeperHub's trigger node,
 * action nodes and edges (fork docs/api/workflows.md:103-143,
 * lib/mcp/workflow-schema-constants.ts:169-303). A condition step continues
 * only on its "true" edge; false ends the run. Reading a graph back refuses
 * anything this shape cannot say (branches, loops, disabled steps, other
 * system steps), so an edit never drops part of an automation silently.
 * Pure: runs under node tests and in the browser.
 */

export const CONDITION_STEP = "condition";
export const MAX_STEPS = 20;

const text = z.string().trim().min(1);

export const automationTriggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("manual") }).describe("Runs only when someone presses Run now."),
  z
    .object({
      type: z.literal("schedule"),
      cron: text.describe("Cron expression with 5 fields, e.g. '0 9 * * 1-5' for weekdays at 09:00."),
      timezone: z.string().optional().describe("IANA timezone such as 'Europe/London'. Defaults to UTC."),
    })
    .describe("Runs on a schedule."),
  z
    .object({
      type: z.literal("block"),
      network: text.describe("Chain id as a string, e.g. '84532'."),
      every: text.describe("Fire every N blocks, digits only, e.g. '10'."),
    })
    .describe("Runs every N blocks on a network."),
  z
    .object({
      type: z.literal("event"),
      network: text.describe("Chain id as a string."),
      contract: text.describe("Contract address to watch."),
      event: text.describe("Event name exactly as in the contract ABI, e.g. 'Transfer'."),
      abi: z.string().optional().describe("Contract ABI JSON. Leave out for a verified contract; it is fetched."),
    })
    .describe("Runs when a contract emits an event."),
  z.object({ type: z.literal("webhook") }).describe("Runs when KeeperHub's webhook URL for this automation receives a request."),
  z
    .object({
      type: z.literal("tempo-payment"),
      network: text.describe("Tempo chain id: '4217' mainnet or '42431' Moderato testnet."),
      token: text.describe("TIP-20 stablecoin contract to watch."),
      recipient: text.describe("Deposit address the payment must reach."),
      memo: z.string().optional().describe("Only fire when the memo matches (0x + 64 hex exactly, or a text prefix)."),
    })
    .describe("Runs when a Tempo payment lands on an address."),
]);

export const automationStepSchema = z.object({
  action: text.describe(
    "The action id from search_actions (e.g. 'web3/check-balance'), or 'condition' to continue only when a check is true.",
  ),
  label: z.string().optional().describe("Short step name. Defaults to the action's own label."),
  params: z
    .record(z.string(), z.unknown())
    .describe(
      "The action's fields by key. A condition takes { condition }. Use an earlier step's output as {{@step-N:Label.field}}, the trigger's as {{@trigger:Label.field}}.",
    ),
});

export const automationDefinitionSchema = z.object({
  name: text.describe("Automation name."),
  description: z.string().optional().describe("One sentence on what it does."),
  trigger: automationTriggerSchema,
  steps: z.array(automationStepSchema).min(1).max(MAX_STEPS).describe("Steps in the order they run."),
});

export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;
export type AutomationTriggerType = AutomationTrigger["type"];
export type AutomationStepInput = z.infer<typeof automationStepSchema>;
export type AutomationDefinition = z.infer<typeof automationDefinitionSchema>;

export type WorkflowNode = {
  id: string;
  type: "trigger" | "action";
  position: { x: number; y: number };
  data: { label: string; type: "trigger" | "action"; config: Record<string, unknown> };
};

export type WorkflowEdge = { id: string; source: string; target: string; sourceHandle?: string };

export type WorkflowGraph = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };

/** KeeperHub's own trigger names (workflow-schema-constants.ts TRIGGERS). */
const TRIGGER_TYPES: Record<AutomationTriggerType, string> = {
  manual: "Manual",
  schedule: "Schedule",
  block: "Block",
  event: "Event",
  webhook: "Webhook",
  "tempo-payment": "Transfer",
};

const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  manual: "Manual",
  schedule: "Schedule",
  block: "Block",
  event: "Blockchain Event",
  webhook: "Webhook",
  "tempo-payment": "Transfer",
};

export const TRIGGER_NODE_ID = "trigger";
const STEP_SPACING = 160;

export function stepNodeId(index: number): string {
  return `step-${index + 1}`;
}

/** The label a step carries: its own, else the action's registry label. */
export function stepLabel(step: AutomationStepInput): string {
  const own = step.label?.trim();
  if (own) return own;
  if (step.action === CONDITION_STEP) return "Condition";
  return getOperationEntry(step.action)?.label ?? step.action;
}

export function toWorkflowGraph(definition: AutomationDefinition): WorkflowGraph {
  const trigger: WorkflowNode = {
    id: TRIGGER_NODE_ID,
    type: "trigger",
    position: { x: 0, y: 0 },
    data: { label: TRIGGER_LABELS[definition.trigger.type], type: "trigger", config: triggerConfig(definition.trigger) },
  };
  const steps = definition.steps.map<WorkflowNode>((step, index) => ({
    id: stepNodeId(index),
    type: "action",
    position: { x: 0, y: (index + 1) * STEP_SPACING },
    data: { label: stepLabel(step), type: "action", config: stepConfig(step) },
  }));
  const nodes = [trigger, ...steps];
  const edges: WorkflowEdge[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const source = nodes[i - 1];
    const target = nodes[i];
    const fromCondition = source.data.config.actionType === "Condition";
    edges.push({
      id: `${source.id}->${target.id}`,
      source: source.id,
      target: target.id,
      ...(fromCondition ? { sourceHandle: "true" } : {}),
    });
  }
  return { nodes, edges };
}

function triggerConfig(trigger: AutomationTrigger): Record<string, unknown> {
  const triggerType = TRIGGER_TYPES[trigger.type];
  switch (trigger.type) {
    case "manual":
    case "webhook":
      return { triggerType };
    case "schedule":
      return { triggerType, scheduleCron: trigger.cron, scheduleTimezone: trigger.timezone?.trim() || "UTC" };
    case "block":
      return { triggerType, network: trigger.network, blockInterval: trigger.every };
    case "event":
      return {
        triggerType,
        network: trigger.network,
        contractAddress: trigger.contract,
        eventName: trigger.event,
        ...(trigger.abi !== undefined ? { contractABI: trigger.abi } : {}),
      };
    case "tempo-payment":
      return {
        triggerType,
        network: trigger.network,
        contractAddress: trigger.token,
        recipientAddress: trigger.recipient,
        ...(trigger.memo !== undefined && trigger.memo !== "" ? { memo: trigger.memo } : {}),
      };
  }
}

function stepConfig(step: AutomationStepInput): Record<string, unknown> {
  if (step.action === CONDITION_STEP) return { actionType: "Condition", condition: step.params.condition };
  // Hidden routing settings (a protocol action's _protocolMeta) travel with the
  // node, as they do with a direct run; the proposal's own params win.
  const hidden = getOperationEntry(step.action)?.passthroughDefaults ?? {};
  return { actionType: step.action, ...hidden, ...step.params };
}

export type GraphReading =
  | { ok: true; definition: AutomationDefinition }
  | { ok: false; reason: string };

const NOT_A_LINE = "This automation branches, loops or has switched-off steps, so it can only be edited in KeeperHub.";

/*
 * A KeeperHub workflow back in the chat's shape, when it is one: a single
 * trigger this shape knows, then each step reached by exactly one edge in a
 * line (a condition by its "true" edge), every action node on that line.
 */
export function fromWorkflowGraph(workflow: { name?: unknown; description?: unknown; nodes?: unknown; edges?: unknown }): GraphReading {
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes.filter(isRecord) : [];
  const edges = Array.isArray(workflow.edges) ? workflow.edges.filter(isRecord) : [];
  const triggers = nodes.filter((node) => nodeType(node) === "trigger");
  const actions = nodes.filter((node) => nodeType(node) === "action");
  if (triggers.length !== 1 || nodes.length !== triggers.length + actions.length) return { ok: false, reason: NOT_A_LINE };

  const trigger = readTrigger(configOf(triggers[0]));
  if (trigger === null) return { ok: false, reason: "This automation's start can only be edited in KeeperHub." };

  const byId = new Map(actions.map((node) => [node.id as string, node]));
  const steps: AutomationStepInput[] = [];
  const lineIds: string[] = [];
  let current = triggers[0];
  for (;;) {
    const out = edges.filter((edge) => edge.source === current.id);
    const isCondition = configOf(current).actionType === "Condition";
    const next = isCondition ? out.filter((edge) => edge.sourceHandle === "true") : out;
    const stray = isCondition ? out.filter((edge) => edge.sourceHandle !== "true") : [];
    if (next.length > 1 || stray.length > 0) return { ok: false, reason: NOT_A_LINE };
    if (next.length === 0) break;
    const target = typeof next[0].target === "string" ? byId.get(next[0].target) : undefined;
    if (target === undefined || lineIds.includes(target.id as string)) return { ok: false, reason: NOT_A_LINE };
    lineIds.push(target.id as string);
    const step = readStep(target);
    if (step === null) return { ok: false, reason: NOT_A_LINE };
    steps.push(step);
    current = target;
  }
  if (steps.length !== actions.length || steps.length === 0) return { ok: false, reason: NOT_A_LINE };

  // KeeperHub's editor names nodes its own way and the chat's shape numbers
  // them, so a step reading an earlier one's output follows the rename.
  const renamed = new Map<string, string>([[triggers[0].id as string, TRIGGER_NODE_ID]]);
  lineIds.forEach((id, index) => renamed.set(id, stepNodeId(index)));

  return {
    ok: true,
    definition: {
      name: typeof workflow.name === "string" && workflow.name.trim() !== "" ? workflow.name : "Untitled automation",
      ...(typeof workflow.description === "string" && workflow.description !== "" ? { description: workflow.description } : {}),
      trigger,
      steps: steps.map((step) => ({ ...step, params: renameReferences(step.params, renamed) as Record<string, unknown> })),
    },
  };
}

const NODE_REFERENCE = /\{\{@([^:}]+):/g;

function renameReferences(value: unknown, ids: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") {
    return value.replace(NODE_REFERENCE, (match, id: string) => {
      const next = ids.get(id.trim());
      return next === undefined ? match : `{{@${next}:`;
    });
  }
  if (Array.isArray(value)) return value.map((item) => renameReferences(item, ids));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renameReferences(item, ids)]));
  return value;
}

function readTrigger(config: Record<string, unknown>): AutomationTrigger | null {
  const s = (key: string) => (typeof config[key] === "string" ? (config[key] as string) : "");
  switch (config.triggerType) {
    case "Manual":
      return { type: "manual" };
    case "Webhook":
      return { type: "webhook" };
    case "Schedule":
    case "Scheduled":
      return s("scheduleCron") === ""
        ? null
        : { type: "schedule", cron: s("scheduleCron"), ...(s("scheduleTimezone") !== "" ? { timezone: s("scheduleTimezone") } : {}) };
    case "Block":
      return { type: "block", network: s("network"), every: String(config.blockInterval ?? "") };
    case "Event":
      return {
        type: "event",
        network: s("network"),
        contract: s("contractAddress"),
        event: s("eventName"),
        ...(s("contractABI") !== "" ? { abi: s("contractABI") } : {}),
      };
    case "Transfer":
      return {
        type: "tempo-payment",
        network: s("network"),
        token: s("contractAddress"),
        recipient: s("recipientAddress"),
        ...(s("memo") !== "" ? { memo: s("memo") } : {}),
      };
    default:
      return null;
  }
}

function readStep(node: Record<string, unknown>): AutomationStepInput | null {
  const data = isRecord(node.data) ? node.data : {};
  if (data.enabled === false) return null;
  const config = configOf(node);
  const label = typeof data.label === "string" && data.label !== "" ? data.label : undefined;
  if (config.actionType === "Condition") {
    if (typeof config.condition !== "string") return null;
    return { action: CONDITION_STEP, ...(label !== undefined && label !== "Condition" ? { label } : {}), params: { condition: config.condition } };
  }
  if (typeof config.actionType !== "string") return null;
  const entry = getOperationEntry(config.actionType);
  if (entry === undefined || entry.kind !== "plugin") return null;
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key === "actionType" || Object.hasOwn(entry.passthroughDefaults, key)) continue;
    params[key] = value;
  }
  return { action: config.actionType, ...(label !== undefined && label !== entry.label ? { label } : {}), params };
}

function nodeType(node: Record<string, unknown>): string | null {
  const data = isRecord(node.data) ? node.data : {};
  const type = typeof node.type === "string" ? node.type : typeof data.type === "string" ? data.type : null;
  return typeof node.id === "string" ? type : null;
}

function configOf(node: Record<string, unknown>): Record<string, unknown> {
  const data = isRecord(node.data) ? node.data : {};
  return isRecord(data.config) ? data.config : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
