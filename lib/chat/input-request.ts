import type { UIMessage } from "ai";
import { z } from "zod";

import { englishTranslate, type Translate } from "../i18n/translate.ts";
import type { FieldSpec } from "../registry/index.ts";
import { isSolanaChainId } from "../registry/simulatability.ts";

/*
 * Form cards (decisions 32–33): when the assistant needs a detail it doesn't
 * have, it calls request_input and the person fills in a form on screen, in chat
 * or above the voice bar, instead of spelling an address out loud. The model
 * only names the fields and their kind; the kind decides the control and the
 * check, so it can never ask for a raw widget or skip validation. Pure and
 * client-safe: the tool schema, the chat route, the voice answer route, the card
 * and the voice sheet all share it.
 */

export const INPUT_KINDS = ["address", "amount", "network", "token", "choice", "text"] as const;
export type InputKind = (typeof INPUT_KINDS)[number];

const KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const DECIMAL = /^\d+(\.\d+)?$/;
const CHAIN_ID = /^[A-Za-z0-9-]{1,40}$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TOKEN_SYMBOL = /^[A-Za-z0-9.$_-]{1,20}$/;
const TEXT_MAX = 500;

const inputFieldSchema = z.object({
  key: z.string().regex(KEY).describe("A short id for the answer, e.g. 'recipient'. Letters, digits and underscores."),
  kind: z
    .enum(INPUT_KINDS)
    .describe(
      "address: a wallet or contract address. amount: a decimal amount. network: a chain. token: a token symbol or address. choice: one of the options. text: anything else.",
    ),
  label: z.string().min(1).max(60).describe("What the person sees, e.g. 'Recipient address'."),
  required: z.boolean().optional().describe("Defaults to true."),
  network: z.string().optional().describe("For an address or token: the chain id it belongs to, when known."),
  unit: z.string().max(20).optional().describe("For an amount: its unit, e.g. 'ETH' or 'USDC'."),
  options: z
    .array(z.object({ value: z.string().min(1).max(100), label: z.string().min(1).max(60) }))
    .max(12)
    .optional()
    .describe("For a choice: the options to pick from."),
  prefill: z.string().max(TEXT_MAX).optional().describe("A value to start the field with, when you have a good guess."),
});

export const requestInputSchema = z
  .object({
    title: z.string().max(60).optional().describe("A short heading, e.g. 'Send ETH'."),
    reason: z.string().max(200).optional().describe("One sentence on why these details are needed."),
    fields: z.array(inputFieldSchema).min(1).max(6).describe("Every detail still missing, in one form."),
  })
  .superRefine((request, context) => {
    const seen = new Set<string>();
    request.fields.forEach((field, index) => {
      if (seen.has(field.key)) {
        context.addIssue({ code: "custom", path: ["fields", index, "key"], message: "Each field needs its own key." });
      }
      seen.add(field.key);
      if (field.kind === "choice" && (field.options?.length ?? 0) === 0) {
        context.addIssue({ code: "custom", path: ["fields", index, "options"], message: "A choice needs options." });
      }
    });
  });

export type InputRequest = z.infer<typeof requestInputSchema>;
export type InputField = InputRequest["fields"][number];

/** What the person sent back: the values by key, or that they closed the form. */
export type InputAnswer = { values: Record<string, string> } | { cancelled: true };

export type InputIssue = { path: string; message: string };

export const REQUEST_INPUT_TOOL = "request_input";

export function readInputRequest(input: unknown): InputRequest | null {
  const parsed = requestInputSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export function isRequired(field: InputField): boolean {
  return field.required !== false;
}

/** The control each kind draws, in the card field grammar (components/cards/fields). */
export function fieldSpecFor(field: InputField, t: Translate = englishTranslate): FieldSpec {
  const base = { key: field.key, label: field.label, required: isRequired(field) };
  switch (field.kind) {
    case "address":
      return { ...base, type: "protocol-address", placeholder: "0x…", isAddressField: true };
    case "amount":
      return { ...base, type: "protocol-eth-value", placeholder: field.unit !== undefined ? `0.0 ${field.unit}` : "0.0" };
    case "network":
      return { ...base, type: "chain-select" };
    case "token":
      return field.options !== undefined && field.options.length > 0
        ? { ...base, type: "select", options: field.options }
        : { ...base, type: "text", placeholder: t("cards.form.tokenPlaceholder") };
    case "choice":
      return { ...base, type: "select", options: field.options ?? [] };
    case "text":
      return { ...base, type: "text" };
  }
}

/** The network an address or token field belongs to: its own, else the form's network field's answer. */
export function networkFor(field: InputField, request: InputRequest, values: Record<string, string>): string | undefined {
  if (field.network !== undefined && field.network !== "") return field.network;
  const networkField = request.fields.find((candidate) => candidate.kind === "network");
  const chosen = networkField !== undefined ? values[networkField.key] : undefined;
  return chosen !== undefined && chosen !== "" ? chosen : undefined;
}

/*
 * The only answer that reaches the model: declared keys, each required one
 * filled, each value the shape its kind needs. Values are trimmed; an empty
 * optional one is left out.
 */
export function checkInputAnswer(
  request: InputRequest,
  answer: unknown,
  t: Translate = englishTranslate,
): { ok: true; answer: InputAnswer } | { ok: false; issues: InputIssue[] } {
  if (answer === null || typeof answer !== "object" || Array.isArray(answer)) {
    return { ok: false, issues: [{ path: "", message: t("cards.form.issues.unreadable") }] };
  }
  const record = answer as Record<string, unknown>;
  if (record.cancelled === true) {
    return Object.keys(record).length === 1
      ? { ok: true, answer: { cancelled: true } }
      : { ok: false, issues: [{ path: "", message: t("cards.form.issues.unreadable") }] };
  }
  const raw = record.values;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw) || Object.keys(record).length !== 1) {
    return { ok: false, issues: [{ path: "", message: t("cards.form.issues.unreadable") }] };
  }
  const posted = raw as Record<string, unknown>;
  const declared = new Map(request.fields.map((field) => [field.key, field]));
  const issues: InputIssue[] = [];
  const values: Record<string, string> = {};

  for (const key of Object.keys(posted)) {
    if (!declared.has(key)) issues.push({ path: key, message: t("cards.form.issues.notAsked") });
  }
  for (const field of request.fields) {
    const value = posted[field.key];
    if (value !== undefined && typeof value !== "string") {
      issues.push({ path: field.key, message: t("cards.form.issues.asText") });
      continue;
    }
    const text = (value ?? "").trim();
    if (text === "") {
      if (isRequired(field)) issues.push({ path: field.key, message: t("cards.form.issues.needed", { label: field.label }) });
      continue;
    }
    values[field.key] = text;
  }
  if (issues.length > 0) return { ok: false, issues };

  for (const field of request.fields) {
    const text = values[field.key];
    if (text === undefined) continue;
    const problem = kindProblem(field, text, networkFor(field, request, values), t);
    if (problem !== null) issues.push({ path: field.key, message: problem });
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, answer: { values } };
}

function kindProblem(field: InputField, text: string, network: string | undefined, t: Translate): string | null {
  if (text.length > TEXT_MAX) return t("cards.form.issues.tooLong");
  switch (field.kind) {
    case "address":
      return validAddress(text, network) ? null : t("cards.checks.addressForNetwork");
    case "amount":
      return DECIMAL.test(text) ? null : t("cards.checks.amountDot");
    case "network":
      return CHAIN_ID.test(text) ? null : t("cards.checks.chooseNetwork");
    case "token":
      if (field.options !== undefined && field.options.length > 0) {
        return field.options.some((option) => option.value === text) ? null : t("cards.form.issues.chooseToken");
      }
      return TOKEN_SYMBOL.test(text) || validAddress(text, network) ? null : t("cards.form.issues.token");
    case "choice":
      return (field.options ?? []).some((option) => option.value === text) ? null : t("cards.checks.chooseListedOption");
    case "text":
      return null;
  }
}

function validAddress(text: string, network: string | undefined): boolean {
  if (network === undefined) return EVM_ADDRESS.test(text) || BASE58_ADDRESS.test(text);
  return (isSolanaChainId(network) ? BASE58_ADDRESS : EVM_ADDRESS).test(text);
}

type LoosePart = { type?: unknown; state?: unknown; toolCallId?: unknown; input?: unknown };

function isOpenForm(part: unknown, toolCallId: string): boolean {
  const loose = (part ?? {}) as LoosePart;
  return loose.type === `tool-${REQUEST_INPUT_TOOL}` && loose.toolCallId === toolCallId && loose.state === "input-available";
}

/** The stored form still waiting for this call id: its message and what it asked. Null once answered or unknown. */
export function findOpenForm(transcript: readonly UIMessage[], toolCallId: string): { message: UIMessage; input: unknown } | null {
  for (const message of transcript) {
    if (message.role !== "assistant" || !Array.isArray(message.parts)) continue;
    const part = message.parts.find((candidate) => isOpenForm(candidate, toolCallId));
    if (part !== undefined) return { message, input: (part as LoosePart).input };
  }
  return null;
}

/** The transcript with one open form answered, everything else untouched; null when that form isn't waiting. */
export function withFormAnswer(transcript: readonly UIMessage[], toolCallId: string, answer: InputAnswer): UIMessage[] | null {
  let found = false;
  const next = transcript.map((message) => {
    if (message.role !== "assistant" || !message.parts.some((part) => isOpenForm(part, toolCallId))) return message;
    found = true;
    return {
      ...message,
      parts: message.parts.map((part) => (isOpenForm(part, toolCallId) ? { ...part, state: "output-available", output: answer } : part)),
    } as UIMessage;
  });
  return found ? next : null;
}

/** The answer a form part holds, or null while it is open. */
export function readInputAnswer(output: unknown): InputAnswer | null {
  if (output === null || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  if (record.cancelled === true) return { cancelled: true };
  const values = record.values;
  if (values === null || typeof values !== "object" || Array.isArray(values)) return null;
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) if (typeof value === "string") clean[key] = value;
  return { values: clean };
}
