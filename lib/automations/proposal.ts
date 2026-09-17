import { getInputSchema, getOperationEntry } from "../registry/index.ts";
import type { FieldSpec } from "../registry/index.ts";
import { isSolanaChainId } from "../registry/simulatability.ts";

import { automationDefinitionSchema, CONDITION_STEP, type AutomationDefinition, type AutomationTrigger } from "./build.ts";

/*
 * The check an automation proposal passes before anyone is asked to save it
 * (decision 19). The card runs it on every edit and the server runs it again
 * before re-signing or saving, so a bad step stays in the card with its reason.
 * KeeperHub checks shape loosely on save (fork app/api/workflows/create) and a
 * bad cron saves but never fires, so this catches what KeeperHub would not:
 * unknown actions, fields the action does not have, missing or malformed
 * values, a network the action does not run on, a step reading a later step.
 * Values written as {{@node:Label.field}} references pass the shape checks, as
 * they do in KeeperHub. Warnings never block; issues do.
 */

export type ProposalIssue = { path: string; message: string };

export type AutomationCheck =
  | { ok: true; definition: AutomationDefinition; warnings: ProposalIssue[] }
  | { ok: false; issues: ProposalIssue[]; warnings: ProposalIssue[] };

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const CHAIN_ID = /^\d+$/;
const EVENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TEMPLATE = /\{\{.+\}\}/;
const REFERENCE = /\{\{@([^:}]+):/g;
const TEMPO_NETWORKS = new Set(["4217", "42431"]);
// Mirrors lib/registry/surface-tools.ts: classes the chat cannot run yet.
const UNAVAILABLE_CLASSES = new Set(["quarantined", "listing-payment", "mixed-effect"]);
const ALWAYS_ALLOWED_PARAMS = new Set(["integrationId"]);

export function checkAutomationDefinition(input: unknown, options: { requireAbi?: boolean } = {}): AutomationCheck {
  const parsed = automationDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      warnings: [],
    };
  }
  const definition = parsed.data;
  const issues: ProposalIssue[] = [];
  const warnings: ProposalIssue[] = [];
  checkTrigger(definition.trigger, options.requireAbi === true, issues, warnings);
  definition.steps.forEach((step, index) => {
    const path = `steps.${index}`;
    if (step.action === CONDITION_STEP) {
      checkCondition(step.params, path, issues);
    } else {
      checkActionStep(step.action, step.params, path, issues, warnings);
    }
    checkReferences(step.params, index, path, issues);
  });
  return issues.length > 0 ? { ok: false, issues, warnings } : { ok: true, definition, warnings };
}

function checkTrigger(trigger: AutomationTrigger, requireAbi: boolean, issues: ProposalIssue[], warnings: ProposalIssue[]): void {
  switch (trigger.type) {
    case "manual":
      return;
    case "webhook":
      warnings.push({
        path: "trigger",
        message: "Whatever calls this automation's webhook needs a webhook key (wfb_…) made in KeeperHub settings.",
      });
      return;
    case "schedule": {
      const fields = trigger.cron.trim().split(/\s+/).length;
      if (fields !== 5 && fields !== 6) {
        issues.push({ path: "trigger.cron", message: "Write the schedule as a cron line with five parts, like 0 9 * * 1-5." });
      }
      if (trigger.timezone !== undefined && trigger.timezone.trim() !== "" && !validTimeZone(trigger.timezone.trim())) {
        issues.push({ path: "trigger.timezone", message: "Use a timezone name such as UTC or Europe/London." });
      }
      return;
    }
    case "block":
      if (!CHAIN_ID.test(trigger.network)) issues.push({ path: "trigger.network", message: "Choose a network." });
      if (!/^[1-9]\d*$/.test(trigger.every)) issues.push({ path: "trigger.every", message: "Enter a whole number of blocks, 1 or more." });
      return;
    case "event": {
      if (!CHAIN_ID.test(trigger.network)) issues.push({ path: "trigger.network", message: "Choose a network." });
      if (!EVM_ADDRESS.test(trigger.contract)) issues.push({ path: "trigger.contract", message: "Enter a valid contract address." });
      if (!EVENT_NAME.test(trigger.event)) {
        issues.push({ path: "trigger.event", message: "Enter the event's name as the contract spells it, like Transfer." });
        return;
      }
      if (trigger.abi === undefined || trigger.abi.trim() === "") {
        if (requireAbi) {
          issues.push({ path: "trigger.abi", message: "This contract's ABI couldn't be found. Paste it to watch its events." });
        }
        return;
      }
      const events = abiEventNames(trigger.abi);
      if (events === null) issues.push({ path: "trigger.abi", message: "The contract ABI isn't a valid JSON list." });
      else if (!events.includes(trigger.event)) {
        issues.push({ path: "trigger.event", message: `The contract has no event named ${trigger.event}.` });
      }
      return;
    }
    case "tempo-payment":
      if (!TEMPO_NETWORKS.has(trigger.network)) {
        issues.push({ path: "trigger.network", message: "Tempo payments are watched on Tempo (4217) or Moderato (42431)." });
      }
      if (!EVM_ADDRESS.test(trigger.token)) issues.push({ path: "trigger.token", message: "Enter a valid token contract address." });
      if (!EVM_ADDRESS.test(trigger.recipient)) issues.push({ path: "trigger.recipient", message: "Enter a valid deposit address." });
      return;
  }
}

function checkCondition(params: Record<string, unknown>, path: string, issues: ProposalIssue[]): void {
  if (typeof params.condition !== "string" || params.condition.trim() === "") {
    issues.push({ path: `${path}.params.condition`, message: "Write the check this step makes." });
  }
  for (const key of Object.keys(params)) {
    if (key !== "condition") issues.push({ path: `${path}.params.${key}`, message: "A condition step takes only its check." });
  }
}

function checkActionStep(
  action: string,
  params: Record<string, unknown>,
  path: string,
  issues: ProposalIssue[],
  warnings: ProposalIssue[],
): void {
  const entry = getOperationEntry(action);
  if (entry === undefined) {
    issues.push({ path: `${path}.action`, message: `"${action}" isn't a KeeperHub action. Look it up with search_actions.` });
    return;
  }
  if (entry.kind !== "plugin") {
    issues.push({ path: `${path}.action`, message: `${entry.label} can't be a step in an automation made here.` });
    return;
  }
  if (UNAVAILABLE_CLASSES.has(entry.effectClass)) {
    issues.push({ path: `${path}.action`, message: `${entry.label} isn't available in automations made here.` });
    return;
  }

  const fields = new Map(entry.fields.map((field) => [field.key, field]));
  for (const key of Object.keys(params)) {
    if (!fields.has(key) && !Object.hasOwn(entry.passthroughDefaults, key) && !ALWAYS_ALLOWED_PARAMS.has(key)) {
      issues.push({ path: `${path}.params.${key}`, message: `${entry.label} has no field "${key}".` });
    }
  }

  const schema = getInputSchema(action);
  const result = schema?.safeParse(params);
  if (result !== undefined && !result.success) {
    const reported = new Set<string>();
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (reported.has(key)) continue;
      reported.add(key);
      issues.push({ path: `${path}.params.${key}`, message: fieldMessage(fields.get(key), params[key], issue.message) });
    }
  }

  // Text fields that hold an address get the check the step itself runs later:
  // KeeperHub flags some (isAddressField, fork lib/workflow/validation/action-config.ts)
  // and its transfer steps refuse anything ethers.isAddress rejects
  // (plugins/web3/steps/transfer-funds-core.ts:180), names included.
  const network = params.network;
  const solana = typeof network === "string" && isSolanaChainId(network);
  for (const field of entry.fields) {
    const value = params[field.key];
    const holdsAddress = field.isAddressField === true || /address$/i.test(field.key);
    if (field.type === "protocol-address" || !holdsAddress) continue;
    if (typeof value !== "string" || value === "" || TEMPLATE.test(value)) continue;
    if (!(solana ? BASE58_ADDRESS : EVM_ADDRESS).test(value)) {
      issues.push({ path: `${path}.params.${field.key}`, message: `${field.label}: enter a valid address or an earlier step's output.` });
    }
  }

  const networkField = fields.get("network");
  if (
    typeof network === "string" &&
    !TEMPLATE.test(network) &&
    networkField?.allowedChainIds !== undefined &&
    networkField.allowedChainIds.length > 0 &&
    !networkField.allowedChainIds.includes(network)
  ) {
    issues.push({ path: `${path}.params.network`, message: `${entry.label} doesn't run on network ${network}.` });
  }

  const integration = entry.credentialIntegrationType;
  if (entry.needsCredential && integration !== undefined && integration !== "web3" && params.integrationId === undefined) {
    warnings.push({
      path,
      message: `${entry.label} needs a ${entry.category} connection set up in KeeperHub before it can run.`,
    });
  }
}

function fieldMessage(field: FieldSpec | undefined, value: unknown, fallback: string): string {
  if (field === undefined) return fallback;
  if (value === undefined || value === "") return `${field.label} is required.`;
  switch (field.type) {
    case "protocol-address":
      return `${field.label}: enter a valid address or an earlier step's output.`;
    case "protocol-uint":
      return `${field.label}: enter a whole number or an earlier step's output.`;
    case "protocol-int":
      return `${field.label}: enter a whole number or an earlier step's output.`;
    case "protocol-eth-value":
      return `${field.label}: enter an amount as digits or an earlier step's output.`;
    case "protocol-bytes":
      return `${field.label}: enter 0x-prefixed bytes or an earlier step's output.`;
    case "select":
      return `${field.label}: choose one of ${(field.options ?? []).map((option) => option.value).join(", ")}.`;
    default:
      return `${field.label}: ${fallback}`;
  }
}

/** A step may read the trigger and earlier steps, never itself or a later one. */
function checkReferences(params: Record<string, unknown>, index: number, path: string, issues: ProposalIssue[]): void {
  const later = new Set<string>();
  for (const value of strings(params)) {
    for (const match of value.matchAll(REFERENCE)) {
      const step = /^step-(\d+)$/.exec(match[1].trim());
      if (step !== null && Number(step[1]) > index) later.add(match[1].trim());
    }
  }
  for (const id of later) {
    issues.push({ path: `${path}.params`, message: `Step ${index + 1} can only use the output of earlier steps, not ${id}.` });
  }
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

/** The event names a contract ABI declares, or null when it is not a JSON list. */
export function abiEventNames(abi: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(abi);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed.flatMap((item) =>
    item !== null && typeof item === "object" && (item as { type?: unknown }).type === "event" && typeof (item as { name?: unknown }).name === "string"
      ? [(item as { name: string }).name]
      : [],
  );
}

function validTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
