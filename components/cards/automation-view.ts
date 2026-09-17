/*
 * The automation card's pure logic (decisions 19–21), JSX-free so it runs
 * under node tests, the same split as write-card.ts ↔ write-card-view.tsx:
 * the start in words, the steps with their fields, the preview state and CTA
 * ladder, the frame's tone and labels through every kind of change, and the
 * edit form (decision 11: every field but the kind of start and which steps
 * run).
 */
import {
  automationDefinitionSchema,
  CONDITION_STEP,
  stepLabel,
  stepNodeId,
  type AutomationDefinition,
  type AutomationTrigger,
} from "@/lib/automations/build";
import type { AutomationPreview, AutomationStatus, AutomationStep, AutomationSubject } from "@/lib/automations/shape";
import { englishTranslate, type Translate } from "@/lib/i18n/translate";
import { getOperationEntry, type FieldSpec, type ShowWhen } from "@/lib/registry";
import type { EditIssue } from "@/lib/registry/edited-write";

import { buildParams, seedFormState, type FieldError, type FormValues } from "./editable.ts";
import type { SimulateResult, WritePhase } from "./write-card.ts";

export const AUTOMATION_CHANGE_TOOLS: ReadonlySet<string> = new Set([
  "create_automation",
  "update_automation",
  "set_automation_enabled",
  "run_automation",
  "delete_automation",
]);

export function isAutomationChangeTool(toolName: string): boolean {
  return AUTOMATION_CHANGE_TOOLS.has(toolName);
}

/** A proposal carrying a whole automation: a new one, or a change to one. */
export function definesAutomation(toolName: string): boolean {
  return toolName === "create_automation" || toolName === "update_automation";
}

export function readDefinition(input: unknown): AutomationDefinition | null {
  const parsed = automationDefinitionSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export function readSwitch(input: unknown): { workflowId: string; enabled: boolean } | null {
  const target = readTarget(input);
  const enabled = (input as { enabled?: unknown } | null)?.enabled;
  return target !== null && typeof enabled === "boolean" ? { workflowId: target.workflowId, enabled } : null;
}

/** Which existing automation a change, switch, run or delete acts on. */
export function readTarget(input: unknown): { workflowId: string } | null {
  if (input === null || typeof input !== "object") return null;
  const { workflowId } = input as { workflowId?: unknown };
  return typeof workflowId === "string" && workflowId !== "" ? { workflowId } : null;
}

// --- the start and the steps, in words -----------------------------------------

export type DetailRow = { key: string; label: string; value: string };

export type TriggerSummary = { title: string; network: string | null; rows: DetailRow[] };

export function triggerSummary(trigger: AutomationTrigger, t: Translate = englishTranslate): TriggerSummary {
  switch (trigger.type) {
    case "manual":
      return { title: t("automations.view.trigger.manual"), network: null, rows: [] };
    case "webhook":
      return { title: t("automations.view.trigger.webhook"), network: null, rows: [] };
    case "schedule":
      return {
        title: t("automations.view.trigger.schedule"),
        network: null,
        rows: [
          { key: "cron", label: t("automations.view.rows.cron"), value: trigger.cron },
          { key: "timezone", label: t("automations.view.rows.timezone"), value: trigger.timezone?.trim() || "UTC" },
        ],
      };
    case "block":
      return {
        title: t("automations.view.trigger.block", { count: Number(trigger.every), every: trigger.every }),
        network: trigger.network,
        rows: [],
      };
    case "event":
      return {
        title: t("automations.view.trigger.event", { event: trigger.event }),
        network: trigger.network,
        rows: [{ key: "contract", label: t("automations.view.rows.contract"), value: trigger.contract }],
      };
    case "tempo-payment":
      return {
        title: t("automations.view.trigger.tempoPayment"),
        network: trigger.network,
        rows: [
          { key: "recipient", label: t("automations.view.rows.recipient"), value: trigger.recipient },
          { key: "token", label: t("automations.view.rows.token"), value: trigger.token },
          ...(trigger.memo ? [{ key: "memo", label: t("automations.view.rows.memo"), value: trigger.memo }] : []),
        ],
      };
  }
}

export type ProposalStep = {
  id: string;
  label: string;
  actionType: string;
  integration: string;
  network: string | null;
  enabled: true;
  movesValue: boolean;
  rows: DetailRow[];
};

/** Each step as the card lists it: its label, action, network, and the values it will run with. */
export function proposalSteps(definition: AutomationDefinition, t: Translate = englishTranslate): ProposalStep[] {
  return definition.steps.map((step, index) => {
    if (step.action === CONDITION_STEP) {
      return {
        id: stepNodeId(index),
        label: stepLabel(step),
        actionType: "Condition",
        integration: "system",
        network: null,
        enabled: true,
        movesValue: false,
        rows: [{ key: "condition", label: t("automations.view.rows.condition"), value: text(step.params.condition) }],
      };
    }
    const entry = getOperationEntry(step.action);
    const hidden = new Set(Object.keys(entry?.passthroughDefaults ?? {}));
    const rows = Object.entries(step.params)
      .filter(([key]) => key !== "network" && !hidden.has(key))
      .map(([key, value]) => ({ key, label: entry?.fields.find((field) => field.key === key)?.label ?? key, value: text(value) }));
    return {
      id: stepNodeId(index),
      label: stepLabel(step),
      actionType: step.action,
      integration: entry?.integration ?? step.action.split("/")[0],
      network: typeof step.params.network === "string" && step.params.network !== "" ? step.params.network : null,
      enabled: true,
      movesValue: entry !== undefined && entry.kind === "plugin" && entry.effectClass !== "read",
      rows,
    };
  });
}

// --- the preview, the ladder, the frame ------------------------------------------

export type AutomationPreviewState =
  | { status: "loading" }
  | { status: "ready"; preview: AutomationPreview }
  | { status: "error"; message: string };

export function toAutomationPreviewState(result: SimulateResult, t: Translate = englishTranslate): AutomationPreviewState {
  if (result.ok === false) return { status: "error", message: result.error.message };
  if (result.kind !== "simulated") return { status: "error", message: t("automations.failures.checkFailed") };
  const preview = readPreview(result.preview, t);
  return preview === null ? { status: "error", message: t("automations.failures.checkFailed") } : { status: "ready", preview };
}

export function readPreview(value: unknown, t: Translate = englishTranslate): AutomationPreview | null {
  if (value === null || typeof value !== "object") return null;
  const { facts, warnings, blockers, subject, changes } = value as {
    facts?: unknown;
    warnings?: unknown;
    blockers?: unknown;
    subject?: unknown;
    changes?: unknown;
  };
  if (!Array.isArray(facts) || !Array.isArray(warnings) || !Array.isArray(blockers)) return null;
  const readSubjectValue = readSubject(subject, t);
  return {
    facts: facts.flatMap((fact) => {
      const f = fact as { label?: unknown; value?: unknown };
      return typeof f.label === "string" && typeof f.value === "string" ? [{ label: f.label, value: f.value }] : [];
    }),
    warnings: strings(warnings),
    blockers: strings(blockers),
    ...(readSubjectValue !== undefined ? { subject: readSubjectValue } : {}),
    ...(Array.isArray(changes) ? { changes: strings(changes) } : {}),
  };
}

const STATUSES: ReadonlySet<unknown> = new Set<AutomationStatus>(["live", "manual", "off", "deactivated"]);

function readSubject(value: unknown, t: Translate): AutomationSubject | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const s = value as Record<string, unknown>;
  if (typeof s.id !== "string" || typeof s.name !== "string" || !Array.isArray(s.steps)) return undefined;
  return {
    id: s.id,
    name: s.name,
    triggerType: typeof s.triggerType === "string" ? s.triggerType : null,
    status: STATUSES.has(s.status) ? (s.status as AutomationStatus) : "off",
    steps: s.steps.flatMap((step): AutomationStep[] => {
      const r = step as Record<string, unknown> | null;
      if (r === null || typeof r !== "object" || typeof r.id !== "string") return [];
      return [
        {
          id: r.id,
          label: typeof r.label === "string" ? r.label : t("automations.view.stepFallback"),
          actionType: typeof r.actionType === "string" ? r.actionType : null,
          network: typeof r.network === "string" ? r.network : null,
          enabled: r.enabled !== false,
        },
      ];
    }),
  };
}

export function automationAuthorizeAllowed(state: AutomationPreviewState, acknowledged: boolean): boolean {
  return (
    state.status === "ready" &&
    state.preview.blockers.length === 0 &&
    (state.preview.warnings.length === 0 || acknowledged)
  );
}

/** The write card's CTA ladder in the automation's words, ending on the action. */
export function automationActionLabel(
  s: {
    submitted: boolean;
    state: AutomationPreviewState;
    acknowledged: boolean;
    action: string;
    busyLabel: string;
  },
  t: Translate = englishTranslate,
): string {
  if (s.submitted) return s.busyLabel;
  if (s.state.status === "loading") return t("automations.view.actionLabel.checking");
  if (s.state.status === "error") return t("automations.view.actionLabel.checkFailed");
  if (s.state.preview.blockers.length > 0) return t("automations.view.actionLabel.blocked");
  if (s.state.preview.warnings.length > 0 && !s.acknowledged) return t("automations.view.actionLabel.acknowledge");
  return s.action;
}

/** Where a run started from the chat stands, as its card follows it. */
export type RunFollowStatus = "pending" | "receipt" | "failure" | "stale";

export type AutomationFrame = {
  tone: "default" | "success" | "pending" | "destructive";
  meta: string;
  status: string;
  /** Only once the change has landed. */
  stamp?: { label: string; tone: "success" | "destructive" };
};

// Each frame's meta and status line live together under automations.view.frame.<key>.
const EXECUTING: Readonly<Record<string, string>> = {
  create_automation: "saving",
  update_automation: "savingChanges",
  run_automation: "starting",
  delete_automation: "deleting",
};

function framed(
  t: Translate,
  tone: AutomationFrame["tone"],
  key: string,
  stamp?: { label: string; tone: "success" | "destructive" },
): AutomationFrame {
  return {
    tone,
    meta: t(`automations.view.frame.${key}.meta`),
    status: t(`automations.view.frame.${key}.status`),
    ...(stamp !== undefined ? { stamp: { label: t(`automations.view.stamp.${stamp.label}`), tone: stamp.tone } } : {}),
  };
}

export function automationFrame(
  s: {
    toolName: string;
    phase: WritePhase;
    /** For a switch: which way it turns. */
    enabled?: boolean;
    approved?: boolean;
    live: boolean;
    resumeErrored: boolean;
    submitted: boolean;
    edited: boolean;
    /** A saved automation turned on from its card. */
    turnedOn?: boolean;
    /** A started run, while the card follows it; absent when nothing follows it (a read-only chat). */
    run?: RunFollowStatus;
  },
  t: Translate = englishTranslate,
): AutomationFrame {
  switch (s.phase) {
    case "receipt":
      return receiptFrame(s, t);
    case "declined":
      return framed(t, "default", "cancelled");
    case "executing": {
      if (s.resumeErrored && s.live) return framed(t, "pending", "notSent");
      if (s.approved === false) return framed(t, "default", "cancelling");
      if (!s.live) return framed(t, "default", "noAnswer");
      const executing = EXECUTING[s.toolName];
      if (executing !== undefined) return framed(t, "pending", executing);
      return s.enabled ? framed(t, "pending", "turningOn") : framed(t, "pending", "turningOff");
    }
    case "proposed":
      if (!s.live) return framed(t, "default", "neverAuthorized");
      if (s.submitted) return framed(t, "pending", "authorizing");
      return s.edited ? framed(t, "pending", "edited") : framed(t, "pending", "awaiting");
  }
}

function receiptFrame(
  s: { toolName: string; enabled?: boolean; turnedOn?: boolean; run?: RunFollowStatus },
  t: Translate,
): AutomationFrame {
  switch (s.toolName) {
    case "create_automation":
      return s.turnedOn
        ? framed(t, "success", "live", { label: "live", tone: "success" })
        : framed(t, "success", "savedOff", { label: "saved", tone: "success" });
    case "update_automation":
      return framed(t, "success", "saved", { label: "saved", tone: "success" });
    case "delete_automation":
      return framed(t, "success", "deleted", { label: "deleted", tone: "success" });
    case "run_automation":
      switch (s.run) {
        case "receipt":
          return framed(t, "success", "executed", { label: "executed", tone: "success" });
        case "failure":
          return framed(t, "destructive", "failed", { label: "void", tone: "destructive" });
        case "stale":
          return framed(t, "pending", "stillRunning");
        case "pending":
          return framed(t, "pending", "running");
        default:
          return framed(t, "default", "started");
      }
    default:
      return s.enabled
        ? framed(t, "success", "turnedOn", { label: "on", tone: "success" })
        : framed(t, "success", "turnedOff", { label: "off", tone: "success" });
  }
}

export function automationKicker(toolName: string, input: unknown, t: Translate = englishTranslate): string {
  switch (toolName) {
    case "create_automation":
      return t("automations.view.kicker.create");
    case "update_automation":
      return t("automations.view.kicker.update");
    case "run_automation":
      return t("automations.view.kicker.run");
    case "delete_automation":
      return t("automations.view.kicker.delete");
    default:
      return readSwitch(input)?.enabled === false ? t("automations.view.kicker.turnOff") : t("automations.view.kicker.turnOn");
  }
}

/** The card's first line: the proposed automation's name, or what happens to the named one. */
export function automationTitle(toolName: string, input: unknown, name: string | undefined, t: Translate = englishTranslate): string {
  switch (toolName) {
    case "create_automation":
      return readDefinition(input)?.name ?? t("automations.view.title.create");
    case "update_automation":
      return readDefinition(input)?.name ?? t("automations.view.title.update");
    case "run_automation":
      return name ? t("automations.view.title.run", { name }) : t("automations.view.title.runAny");
    case "delete_automation":
      return name ? t("automations.view.title.delete", { name }) : t("automations.view.title.deleteAny");
    default: {
      const verb = readSwitch(input)?.enabled === false ? "turnOff" : "turnOn";
      return name ? t(`automations.view.title.${verb}`, { name }) : t(`automations.view.title.${verb}Any`);
    }
  }
}

// --- the edit form (decision 11) ---------------------------------------------------

export type AutomationForm = { fields: FieldSpec[]; seed: FormValues };

const TEMPO_OPTIONS = [
  { value: "4217", label: "Tempo" },
  { value: "42431", label: "Tempo Moderato" },
];

/** Every field but the kind of start and which steps run, keyed name / trigger.* / steps.N.*. */
export function automationFormFor(definition: AutomationDefinition, t: Translate = englishTranslate): AutomationForm {
  const fields: FieldSpec[] = [{ key: "name", label: t("automations.view.form.name"), type: "template-input", required: true }];
  const seed: FormValues = { name: definition.name };

  const trigger = definition.trigger;
  const add = (spec: FieldSpec, value: unknown) => {
    fields.push(spec);
    seed[spec.key] = text(value);
  };
  switch (trigger.type) {
    case "schedule":
      add(
        { key: "trigger.cron", label: t("automations.view.form.cron"), type: "template-input", required: true, placeholder: "0 9 * * 1-5" },
        trigger.cron,
      );
      add(
        { key: "trigger.timezone", label: t("automations.view.form.timezone"), type: "template-input", required: false, placeholder: "UTC" },
        trigger.timezone,
      );
      break;
    case "block":
      add({ key: "trigger.network", label: t("automations.view.form.network"), type: "chain-select", required: true }, trigger.network);
      add({ key: "trigger.every", label: t("automations.view.form.every"), type: "protocol-uint", required: true }, trigger.every);
      break;
    case "event":
      add({ key: "trigger.network", label: t("automations.view.form.network"), type: "chain-select", required: true }, trigger.network);
      add({ key: "trigger.contract", label: t("automations.view.form.contract"), type: "protocol-address", required: true }, trigger.contract);
      add({ key: "trigger.event", label: t("automations.view.form.event"), type: "template-input", required: true }, trigger.event);
      add(
        {
          key: "trigger.abi",
          label: t("automations.view.form.abi"),
          type: "json-editor",
          required: false,
          rows: 3,
          placeholder: t("automations.view.form.abiPlaceholder"),
        },
        trigger.abi,
      );
      break;
    case "tempo-payment":
      add(
        { key: "trigger.network", label: t("automations.view.form.network"), type: "select", required: true, options: TEMPO_OPTIONS },
        trigger.network,
      );
      add(
        { key: "trigger.recipient", label: t("automations.view.form.recipient"), type: "protocol-address", required: true },
        trigger.recipient,
      );
      add({ key: "trigger.token", label: t("automations.view.form.token"), type: "protocol-address", required: true }, trigger.token);
      add({ key: "trigger.memo", label: t("automations.view.form.memo"), type: "template-input", required: false }, trigger.memo);
      break;
    case "manual":
    case "webhook":
      break;
  }

  definition.steps.forEach((step, index) => {
    const prefix = `steps.${index}.`;
    const stepLabelOf = (label: string) => t("automations.view.form.stepField", { number: index + 1, label });
    if (step.action === CONDITION_STEP) {
      add(
        { key: `${prefix}condition`, label: stepLabelOf(t("automations.view.rows.condition")), type: "template-input", required: true },
        step.params.condition,
      );
      return;
    }
    const entry = getOperationEntry(step.action);
    if (entry === undefined) return;
    const stepSeed = seedFormState(entry.fields, step.params);
    for (const field of entry.fields) {
      fields.push(prefixField(field, prefix, stepLabelOf(field.label)));
      seed[`${prefix}${field.key}`] = stepSeed[field.key];
    }
  });

  return { fields, seed };
}

/** The proposal with the form applied. The kind of start, the steps' actions and their hidden settings are carried unchanged. */
export function buildEditedAutomation(definition: AutomationDefinition, values: FormValues): AutomationDefinition {
  const value = (key: string) => text(values[key]).trim();
  const optional = (key: string) => (value(key) === "" ? {} : { [key.split(".").pop() as string]: value(key) });

  const trigger = definition.trigger;
  let nextTrigger: AutomationTrigger;
  switch (trigger.type) {
    case "schedule":
      nextTrigger = { type: "schedule", cron: value("trigger.cron"), ...optional("trigger.timezone") };
      break;
    case "block":
      nextTrigger = { type: "block", network: value("trigger.network"), every: value("trigger.every") };
      break;
    case "event":
      nextTrigger = {
        type: "event",
        network: value("trigger.network"),
        contract: value("trigger.contract"),
        event: value("trigger.event"),
        ...optional("trigger.abi"),
      };
      break;
    case "tempo-payment":
      nextTrigger = {
        type: "tempo-payment",
        network: value("trigger.network"),
        recipient: value("trigger.recipient"),
        token: value("trigger.token"),
        ...optional("trigger.memo"),
      };
      break;
    default:
      nextTrigger = trigger;
  }

  const steps = definition.steps.map((step, index) => {
    const prefix = `steps.${index}.`;
    if (step.action === CONDITION_STEP) return { ...step, params: { condition: value(`${prefix}condition`) } };
    const entry = getOperationEntry(step.action);
    if (entry === undefined) return step;
    const stepValues: FormValues = {};
    for (const field of entry.fields) stepValues[field.key] = values[`${prefix}${field.key}`];
    const fieldKeys = new Set(entry.fields.map((field) => field.key));
    const kept = Object.fromEntries(Object.entries(step.params).filter(([key]) => !fieldKeys.has(key)));
    return { ...step, params: { ...kept, ...buildParams(entry.fields, stepValues) } };
  });

  return {
    name: value("name"),
    ...(definition.description !== undefined ? { description: definition.description } : {}),
    trigger: nextTrigger,
    steps,
  };
}

/** The proposal check's issues on the form's fields, and the rest as a note. */
export function automationFieldErrors(issues: EditIssue[], form: AutomationForm): { byField: Record<string, FieldError>; other: string[] } {
  const keys = new Set(form.fields.map((field) => field.key));
  const byField: Record<string, FieldError> = {};
  const other: string[] = [];
  for (const issue of issues) {
    const key = issue.path.replace(/^(steps\.\d+)\.params\./, "$1.");
    if (keys.has(key)) byField[key] ??= { message: issue.message };
    else other.push(issue.message);
  }
  return { byField, other };
}

function prefixField(field: FieldSpec, prefix: string, label: string): FieldSpec {
  const sibling = (key: string | undefined) => (key === undefined ? undefined : `${prefix}${key}`);
  return {
    ...field,
    key: `${prefix}${field.key}`,
    label,
    ...(field.showWhen !== undefined ? { showWhen: prefixShowWhen(field.showWhen, prefix) } : {}),
    ...(field.abiField !== undefined ? { abiField: sibling(field.abiField) } : {}),
    ...(field.abiFunctionField !== undefined ? { abiFunctionField: sibling(field.abiFunctionField) } : {}),
    ...(field.contractAddressField !== undefined ? { contractAddressField: sibling(field.contractAddressField) } : {}),
    ...(field.networkField !== undefined ? { networkField: sibling(field.networkField) } : {}),
  };
}

function prefixShowWhen(showWhen: ShowWhen, prefix: string): ShowWhen {
  if ("computed" in showWhen) {
    return { ...showWhen, abiField: `${prefix}${showWhen.abiField}`, functionField: `${prefix}${showWhen.functionField}` };
  }
  return { ...showWhen, field: `${prefix}${showWhen.field}` };
}

function strings(list: readonly unknown[]): string[] {
  return list.filter((item): item is string => typeof item === "string");
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
