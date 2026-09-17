import { getOperationEntry } from "../registry/index.ts";

import { CONDITION_STEP, stepLabel, type AutomationDefinition, type AutomationStepInput, type AutomationTrigger } from "./build.ts";

/*
 * What changing an automation would change, as plain lines for its card
 * (decision 21): the name, how it starts, and each step, old value → new.
 * Both sides are in the chat's shape, so an automation read back from
 * KeeperHub and the proposal compare like for like. Pure.
 */

const VALUE_MAX = 48;

const START_NAMES: Record<AutomationTrigger["type"], string> = {
  manual: "On demand",
  schedule: "On a schedule",
  block: "Every N blocks",
  event: "On a contract event",
  webhook: "When its webhook is called",
  "tempo-payment": "On a Tempo payment",
};

const TRIGGER_FIELD_LABELS: Record<string, string> = {
  cron: "Schedule",
  timezone: "Timezone",
  network: "Network",
  every: "Every N blocks",
  contract: "Contract",
  event: "Event",
  token: "Token",
  recipient: "Deposit address",
  memo: "Memo",
};

export function describeChanges(before: AutomationDefinition, after: AutomationDefinition): string[] {
  const lines: string[] = [];
  if (before.name !== after.name) lines.push(`Name: ${change(before.name, after.name)}`);
  if ((before.description ?? "") !== (after.description ?? "")) {
    lines.push(`Description: ${change(before.description, after.description)}`);
  }
  lines.push(...triggerChanges(before.trigger, after.trigger));
  const count = Math.max(before.steps.length, after.steps.length);
  for (let index = 0; index < count; index++) {
    lines.push(...stepChanges(index, before.steps[index], after.steps[index]));
  }
  return lines;
}

function triggerChanges(before: AutomationTrigger, after: AutomationTrigger): string[] {
  if (before.type !== after.type) return [`Starts: ${START_NAMES[before.type]} → ${START_NAMES[after.type]}`];
  const a = triggerFields(before);
  const b = triggerFields(after);
  const lines: string[] = [];
  for (const key of union(Object.keys(a), Object.keys(b))) {
    if (key === "abi") {
      if ((a.abi ?? "") !== (b.abi ?? "")) lines.push("Contract ABI: replaced");
    } else if (!same(a[key], b[key])) {
      lines.push(`${TRIGGER_FIELD_LABELS[key] ?? key}: ${change(a[key], b[key])}`);
    }
  }
  return lines;
}

function triggerFields(trigger: AutomationTrigger): Record<string, unknown> {
  const fields: Record<string, unknown> = Object.fromEntries(Object.entries(trigger).filter(([key]) => key !== "type"));
  if (trigger.type === "schedule") fields.timezone = trigger.timezone?.trim() || "UTC";
  return fields;
}

function stepChanges(index: number, before: AutomationStepInput | undefined, after: AutomationStepInput | undefined): string[] {
  const step = `Step ${index + 1}`;
  if (before === undefined) return after === undefined ? [] : [`${step} added: ${stepLabel(after)}`];
  if (after === undefined) return [`${step} removed: ${stepLabel(before)}`];
  if (before.action !== after.action) return [`${step} replaced: ${stepLabel(before)} → ${stepLabel(after)}`];

  const lines: string[] = [];
  if (stepLabel(before) !== stepLabel(after)) lines.push(`${step} renamed: ${stepLabel(before)} → ${stepLabel(after)}`);
  const entry = after.action === CONDITION_STEP ? undefined : getOperationEntry(after.action);
  const hidden = entry?.passthroughDefaults ?? {};
  for (const key of union(Object.keys(before.params), Object.keys(after.params))) {
    if (Object.hasOwn(hidden, key) || same(before.params[key], after.params[key])) continue;
    const label = after.action === CONDITION_STEP ? "Continues when" : (entry?.fields.find((field) => field.key === key)?.label ?? key);
    lines.push(`${step} · ${label}: ${change(before.params[key], after.params[key])}`);
  }
  return lines;
}

function shown(value: unknown, full = false): string {
  if (value === undefined || value === null || value === "") return "empty";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return !full && text.length > VALUE_MAX ? `${text.slice(0, VALUE_MAX - 1)}…` : text;
}

/** Old → new, shortened unless shortening would make the two read the same (a long condition changed near its end). */
function change(before: unknown, after: unknown): string {
  const full = shown(before) === shown(after);
  return `${shown(before, full)} → ${shown(after, full)}`;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? "") === JSON.stringify(b ?? "");
}

function union(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])];
}
