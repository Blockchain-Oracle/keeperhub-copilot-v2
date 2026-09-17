/*
 * The write card's edit form, JSX-free so it runs under node tests. Decision 11:
 * every field but the action itself is editable. Each verb gets field specs the
 * shared FieldEditor draws, a seed from the proposal, and a builder that turns
 * the form back into the tool input the chat route re-checks and re-signs
 * (lib/registry/edited-write.ts).
 *
 * The approve call edits its spender and allowance, which travel inside the
 * function_args list. Any other contract call is read from the ABI the proposal
 * carries: one labelled, typed field per argument, re-serialized into that list
 * on save. Only a call whose ABI we cannot read falls back to editing the raw
 * JSON list — which is all there was until Abu saw it on the hosted app
 * (2026-09-17): "nobody will understand this".
 */
import { englishTranslate, type Translate } from "@/lib/i18n/translate";
import { getOperationEntry, type FieldSpec, type FieldType } from "@/lib/registry";
import type { EditIssue } from "@/lib/registry/edited-write";

import { buildParams, seedFormState, type FieldError, type FormValues } from "./editable.ts";

export type WriteForm = { fields: FieldSpec[]; seed: FormValues };

function transferFields(t: Translate): FieldSpec[] {
  return [
    { key: "amount", label: t("cards.labels.amount"), type: "protocol-eth-value", required: true },
    { key: "to_address", label: t("cards.labels.recipient"), type: "protocol-address", required: true },
    { key: "chain_id", label: t("cards.labels.network"), type: "chain-select", required: true },
    {
      key: "token_address",
      label: t("cards.labels.token"),
      type: "protocol-address",
      required: false,
      placeholder: t("cards.writeForm.tokenPlaceholder"),
    },
  ];
}

function approveFields(t: Translate): FieldSpec[] {
  return [
    { key: "spender", label: t("cards.labels.spender"), type: "protocol-address", required: true },
    { key: "allowance", label: t("cards.labels.allowanceBaseUnits"), type: "protocol-uint", required: true },
  ];
}

function argsField(t: Translate): FieldSpec {
  return { key: "function_args", label: t("cards.labels.arguments"), type: "json-editor", required: false, rows: 3 };
}

/** arg0, arg1 … — the form's own keys for a contract call's positional arguments. */
const ARG_KEY = /^arg\d+$/;

type AbiArgument = { name: string; type: string };

/*
 * The arguments of `function_name` as the proposal's own ABI describes them.
 * KeeperHub sends the ABI with the call (surface-tools: "Auto-fetched for
 * verified contracts if omitted"), so the card can label and type each argument
 * instead of showing the list as JSON. An absent or unreadable ABI, or a
 * function it does not describe, returns undefined and keeps the JSON list.
 */
function abiArguments(abi: unknown, functionName: unknown): AbiArgument[] | undefined {
  if (typeof abi !== "string" || typeof functionName !== "string") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(abi);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const entry = parsed.find(
    (item): item is Record<string, unknown> => isRecord(item) && item.type === "function" && item.name === functionName,
  );
  if (entry === undefined || !Array.isArray(entry.inputs)) return undefined;
  const args: AbiArgument[] = [];
  for (const input of entry.inputs) {
    if (!isRecord(input) || typeof input.type !== "string") return undefined;
    args.push({ name: typeof input.name === "string" ? input.name : "", type: input.type });
  }
  return args;
}

/** The widget a Solidity type deserves. Lists and tuples stay JSON — honest, not guessed. */
function solidityFieldType(type: string): FieldType {
  if (type.endsWith("]")) return "json-editor";
  if (type === "address") return "protocol-address";
  if (type === "bool") return "protocol-bool";
  if (type === "string") return "text";
  if (type.startsWith("uint")) return "protocol-uint";
  if (type.startsWith("int")) return "protocol-int";
  if (type.startsWith("bytes")) return "protocol-bytes";
  return "text";
}

function abiArgumentFields(args: AbiArgument[]): FieldSpec[] {
  // Argument names and Solidity types are the contract's own words, so they stay
  // as written in every language (decision 42), like KeeperHub's action names.
  return args.map((arg, index) => ({
    key: `arg${index}`,
    label: arg.name === "" ? `#${index + 1} (${arg.type})` : `${arg.name} (${arg.type})`,
    type: solidityFieldType(arg.type),
    solidityType: arg.type,
    required: true,
  }));
}

/** One argument on its way back to the wire, keeping the JSON type it arrived as. */
function argValue(raw: unknown, original: unknown, field: FieldSpec): unknown {
  const value = trimmed(raw);
  if (field.type === "protocol-bool" || typeof original === "boolean") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
    return value;
  }
  if (field.type === "json-editor") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }
  // A number stays a number (a uint16 referral code arrives as 0, not "0").
  if (typeof original === "number" && value !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return value;
}

function valueField(t: Translate): FieldSpec {
  return { key: "value", label: t("cards.labels.valueSent"), type: "protocol-eth-value", required: false };
}

/** The form for a write proposal, or null when the verb has nothing to edit. */
export function writeFormFor(toolName: string, input: unknown, t: Translate = englishTranslate): WriteForm | null {
  if (!isRecord(input)) return null;
  switch (toolName) {
    case "execute_transfer": {
      const fields = transferFields(t);
      return { fields, seed: strings(input, fields) };
    }
    case "execute_contract_call": {
      if (input.function_name === "approve") {
        const [spender, allowance] = parseArgs(input.function_args);
        return { fields: approveFields(t), seed: { spender: text(spender), allowance: text(allowance) } };
      }
      const payable = input.stateMutability === "payable";
      const args = abiArguments(input.abi, input.function_name);
      if (args !== undefined) {
        const fields = [...abiArgumentFields(args), ...(payable ? [valueField(t)] : [])];
        if (fields.length === 0) return null;
        const supplied = parseArgsList(input.function_args);
        const seed: FormValues = Object.fromEntries(
          fields.map((field, index) => [field.key, ARG_KEY.test(field.key) ? text(supplied[index]) : text(input[field.key])]),
        );
        return { fields, seed };
      }
      const fields = payable ? [argsField(t), valueField(t)] : [argsField(t)];
      return { fields, seed: strings(input, fields) };
    }
    case "execute_protocol_action": {
      const entry = typeof input.actionType === "string" ? getOperationEntry(input.actionType) : undefined;
      if (entry === undefined || entry.fields.length === 0) return null;
      const params = isRecord(input.params) ? input.params : {};
      return { fields: entry.fields, seed: seedFormState(entry.fields, params) };
    }
    default:
      return null;
  }
}

/** The proposal with the form applied. Fields the form does not own are carried unchanged. */
export function buildEditedWrite(toolName: string, input: unknown, form: WriteForm, values: FormValues): Record<string, unknown> {
  const original = isRecord(input) ? input : {};
  switch (toolName) {
    case "execute_transfer": {
      const next: Record<string, unknown> = {
        chain_id: trimmed(values.chain_id),
        to_address: trimmed(values.to_address),
        amount: trimmed(values.amount),
      };
      const token = trimmed(values.token_address);
      if (token !== "") next.token_address = token;
      return next;
    }
    case "execute_contract_call": {
      if (original.function_name === "approve") {
        return { ...original, function_args: JSON.stringify([trimmed(values.spender), trimmed(values.allowance)]) };
      }
      const next: Record<string, unknown> = { ...original };
      const argFields = form.fields.filter((field) => ARG_KEY.test(field.key));
      if (argFields.length > 0) {
        const supplied = parseArgsList(original.function_args);
        next.function_args = JSON.stringify(
          argFields.map((field, index) => argValue(values[field.key], supplied[index], field)),
        );
      }
      for (const field of form.fields) {
        if (ARG_KEY.test(field.key)) continue;
        const value = trimmed(values[field.key]);
        if (value === "") delete next[field.key];
        else next[field.key] = value;
      }
      return next;
    }
    case "execute_protocol_action": {
      const params = isRecord(original.params) ? original.params : {};
      const owned = new Set(form.fields.map((field) => field.key));
      const kept = Object.fromEntries(Object.entries(params).filter(([key]) => !owned.has(key)));
      return { ...original, params: { ...kept, ...buildParams(form.fields, values) } };
    }
    default:
      return { ...original };
  }
}

/** Issues from the edit check, keyed by the form field each one belongs to. */
export function fieldErrorsFrom(issues: EditIssue[], form: WriteForm): { byField: Record<string, FieldError>; other: string[] } {
  const keys = new Set(form.fields.map((field) => field.key));
  const byField: Record<string, FieldError> = {};
  const other: string[] = [];
  for (const issue of issues) {
    const segments = issue.path.split(".");
    const key = segments[0] === "params" ? (segments[1] ?? "") : segments[0];
    const target =
      key === "function_args" ? (keys.has("spender") ? "spender" : keys.has("arg0") ? "arg0" : key) : key;
    if (keys.has(target)) {
      byField[target] ??= { message: issue.message };
    } else {
      other.push(issue.message);
    }
  }
  return { byField, other };
}

function strings(input: Record<string, unknown>, fields: FieldSpec[]): FormValues {
  return Object.fromEntries(fields.map((field) => [field.key, text(input[field.key])]));
}

/** The proposal's function_args as a list; an unreadable one is empty, never a throw. */
function parseArgsList(value: unknown): unknown[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseArgs(value: unknown): [unknown, unknown] {
  if (typeof value !== "string") return [undefined, undefined];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? [parsed[0], parsed[1]] : [undefined, undefined];
  } catch {
    return [undefined, undefined];
  }
}

function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : String(value);
}

function trimmed(value: unknown): string {
  return text(value).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
