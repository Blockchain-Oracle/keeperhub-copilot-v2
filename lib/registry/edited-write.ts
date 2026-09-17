/*
 * Decision 11 (Abu, 2026-09-13): a write card may edit everything but the
 * action. The chat route re-signs an edited proposal only when this check
 * passes, and the card runs the same check before it asks, so a bad edit stays
 * in the card with its field errors.
 *
 * What stays fixed, per verb:
 *   - execute_transfer: nothing but the verb. Amount, recipient, network and
 *     token may all change.
 *   - execute_contract_call: the contract, its network, the function, its
 *     declared mutability, the ABI and the gas settings. Arguments and value may
 *     change (an approve's spender and allowance are its arguments).
 *   - execute_protocol_action: the action and any parameter it has no field for
 *     (hidden routing settings). Every field may change, and the parameters
 *     must pass the action's own schema.
 *   - create_automation: the kind of start, and which steps run in which order.
 *     The name, the start's settings and every step's fields may change, and
 *     the result must pass the automation proposal check.
 *   - update_automation: the same, and which automation it changes.
 *
 * The surface schemas accept any string, so amounts, addresses and argument
 * lists get the shape checks KeeperHub would otherwise fail on later.
 * Client-safe: no server imports.
 */
import { automationDefinitionSchema } from "../automations/build.ts";
import { checkAutomationDefinition } from "../automations/proposal.ts";
import { englishTranslate, type Translate } from "../i18n/translate.ts";

import { getInputSchema, getOperationEntry } from "./index.ts";
import { isSolanaChainId } from "./simulatability.ts";
import { INPUT_SCHEMAS } from "./surface-tools.ts";

export type EditIssue = { path: string; message: string };
export type EditCheck = { ok: true } | { ok: false; issues: EditIssue[] };

const DECIMAL = /^\d+(\.\d+)?$/;
const UINT = /^\d+$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const CONTRACT_CALL_FIXED = [
  "contract_address",
  "chain_id",
  "function_name",
  "stateMutability",
  "abi",
  "gas_limit_multiplier",
  "priority_fee_gwei",
] as const;

export function checkEditedWrite(
  toolName: string,
  original: unknown,
  edited: unknown,
  t: Translate = englishTranslate,
): EditCheck {
  if (!isRecord(original) || !isRecord(edited)) {
    return fail([{ path: "", message: t("cards.editCheck.unreadable") }]);
  }
  switch (toolName) {
    case "execute_transfer":
      return checkTransfer(edited, t);
    case "execute_contract_call":
      return checkContractCall(original, edited, t);
    case "execute_protocol_action":
      return checkProtocolAction(original, edited, t);
    case "create_automation":
      return checkAutomation(original, edited, t);
    case "update_automation":
      if (typeof edited.workflowId !== "string" || edited.workflowId !== original.workflowId) {
        return fail([{ path: "workflowId", message: t("cards.editCheck.automationFixed") }]);
      }
      return checkAutomation(original, edited, t);
    default:
      return fail([{ path: "", message: t("cards.editCheck.notEditable") }]);
  }
}

function checkTransfer(edited: Record<string, unknown>, t: Translate): EditCheck {
  const issues = schemaIssues(INPUT_SCHEMAS.execute_transfer, edited);
  if (issues.length > 0) return fail(issues);
  const chainId = edited.chain_id as string;
  if (chainId.trim() === "") issues.push({ path: "chain_id", message: t("cards.checks.chooseNetwork") });
  if (!DECIMAL.test(edited.amount as string)) {
    issues.push({ path: "amount", message: t("cards.checks.amountDot") });
  }
  const validAddress = (value: string) => (isSolanaChainId(chainId) ? BASE58_ADDRESS : EVM_ADDRESS).test(value);
  if (!validAddress(edited.to_address as string)) {
    issues.push({ path: "to_address", message: t("cards.checks.addressForNetwork") });
  }
  if (edited.token_address !== undefined && !validAddress(edited.token_address as string)) {
    issues.push({ path: "token_address", message: t("cards.editCheck.tokenAddress") });
  }
  return issues.length > 0 ? fail(issues) : { ok: true };
}

function checkContractCall(original: Record<string, unknown>, edited: Record<string, unknown>, t: Translate): EditCheck {
  const issues = schemaIssues(INPUT_SCHEMAS.execute_contract_call, edited);
  if (issues.length > 0) return fail(issues);
  for (const key of CONTRACT_CALL_FIXED) {
    if (!same(original[key], edited[key])) {
      issues.push({ path: key, message: t("cards.editCheck.callFixed") });
    }
  }
  const args = edited.function_args;
  let parsed: unknown[] | undefined;
  if (args !== undefined) {
    parsed = parseArray(args as string);
    if (parsed === undefined) issues.push({ path: "function_args", message: t("cards.editCheck.argumentsList") });
  }
  if (edited.value !== undefined && !DECIMAL.test(edited.value as string)) {
    issues.push({ path: "value", message: t("cards.checks.amountDot") });
  }
  if (edited.function_name === "approve" && parsed !== undefined) {
    if (typeof parsed[0] !== "string" || !EVM_ADDRESS.test(parsed[0])) {
      issues.push({ path: "spender", message: t("cards.editCheck.spender") });
    }
    if (typeof parsed[1] !== "string" || !UINT.test(parsed[1])) {
      issues.push({ path: "allowance", message: t("cards.editCheck.allowance") });
    }
  }
  return issues.length > 0 ? fail(issues) : { ok: true };
}

function checkProtocolAction(original: Record<string, unknown>, edited: Record<string, unknown>, t: Translate): EditCheck {
  const issues = schemaIssues(INPUT_SCHEMAS.execute_protocol_action, edited);
  if (issues.length > 0) return fail(issues);
  const actionType = original.actionType;
  if (edited.actionType !== actionType || typeof actionType !== "string") {
    return fail([{ path: "actionType", message: t("cards.editCheck.actionFixed") }]);
  }
  const schema = getInputSchema(actionType);
  if (getOperationEntry(actionType) === undefined || schema === undefined) {
    return fail([{ path: "actionType", message: t("cards.editCheck.actionGone") }]);
  }
  const before = isRecord(original.params) ? original.params : {};
  const after = edited.params as Record<string, unknown>;
  // A parameter the action has no field for (its hidden routing settings) stays as proposed.
  // Some real fields start with "_" too (lido/wrap's _stETHAmount), so the field list decides, not the name.
  const fieldKeys = new Set(getOperationEntry(actionType)?.fields.map((field) => field.key));
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!fieldKeys.has(key) && !same(before[key], after[key])) {
      issues.push({ path: `params.${key}`, message: t("cards.editCheck.hiddenSetting") });
    }
  }
  const parsed = schema.safeParse(after);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) issues.push({ path: issue.path.join("."), message: issue.message });
  }
  return issues.length > 0 ? fail(issues) : { ok: true };
}

function checkAutomation(original: Record<string, unknown>, edited: Record<string, unknown>, t: Translate): EditCheck {
  const before = automationDefinitionSchema.safeParse(original);
  if (!before.success) return fail([{ path: "", message: t("cards.editCheck.unreadable") }]);
  const check = checkAutomationDefinition(edited);
  if (!check.ok) return fail(check.issues);
  const after = check.definition;
  const issues: EditIssue[] = [];
  if (after.trigger.type !== before.data.trigger.type) {
    issues.push({ path: "trigger.type", message: t("cards.editCheck.startFixed") });
  }
  const sameSteps =
    after.steps.length === before.data.steps.length && after.steps.every((step, index) => step.action === before.data.steps[index].action);
  if (!sameSteps) {
    issues.push({ path: "steps", message: t("cards.editCheck.stepsFixed") });
  }
  return issues.length > 0 ? fail(issues) : { ok: true };
}

function schemaIssues(schema: (typeof INPUT_SCHEMAS)[keyof typeof INPUT_SCHEMAS], value: unknown): EditIssue[] {
  const parsed = schema.safeParse(value);
  return parsed.success ? [] : parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

function parseArray(value: string): unknown[] | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(issues: EditIssue[]): EditCheck {
  return { ok: false, issues };
}
