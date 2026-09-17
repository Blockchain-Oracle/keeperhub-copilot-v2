/*
 * Pure editable-card logic (Story 1.6, AC 1/2/3). No JSX, no hooks — every
 * derivation the editable GenericReadCard relies on lives here so it is unit
 * tested directly in node (tests/cards/editable). The React component is a thin
 * controlled-input shell over these functions.
 *
 * The seed law (both UX spines, repeated): editable fields seed ONCE per
 * toolCallId from the SETTLED input, never from partials. Dirty is derived by
 * comparing live form values to that seed. Retirement (D5) is DERIVED from
 * persisted data (the conversation's superseded set), never a UI boolean and
 * never a mutation of a past part.
 */
import type { UIMessage } from "ai";

import { englishTranslate, type Translate } from "@/lib/i18n/translate";
import type { FieldSpec } from "@/lib/registry";

import {
  decodeFieldValue,
  encodeFieldValue,
  widgetForField,
} from "./fields/field-widget.ts";

/** Heterogeneous form state: strings for text/number/options controls, booleans
 *  for switches, the seeded value verbatim for read-only fallback widgets. */
export type FormValues = Record<string, unknown>;

/** A model-declared alternative interpretation (D4). `params` prefills the
 *  fresh proposal when the alternative is a different operation. */
export type ProposalAlternative = {
  actionType: string;
  label?: string;
  params?: Record<string, unknown>;
};

/** One field's inline error: the reason plus a concrete suggested fix (3.3.3). */
export type FieldError = { message: string; fix?: string };

/**
 * Seed form state ONCE from the settled input's params. Booleans coerce to a
 * real boolean; fallback widgets keep their value verbatim (read-only); every
 * other widget seeds as the display string. Called once per toolCallId so the
 * form survives re-renders (the seed law).
 */
export function seedFormState(
  fields: FieldSpec[],
  params: Record<string, unknown>,
): FormValues {
  const form: FormValues = {};
  for (const spec of fields) {
    const widget = widgetForField(spec);
    const value = params[spec.key];
    if (widget.kind === "boolean") {
      form[spec.key] = Boolean(value);
    } else if (widget.kind === "fallback") {
      form[spec.key] = value;
    } else {
      form[spec.key] = encodeFieldValue(widget, value);
    }
  }
  return form;
}

/**
 * Decode form state back to schema-shaped params for the re-run. Hidden
 * (showWhen=false) fields are omitted — a value the user cannot see must not
 * drive the operation. Empty text/number inputs omit too, so an optional blank
 * never trips a format regex; a required blank omits and surfaces as a missing
 * key the shared Zod schema rejects. Booleans always carry (false is a value).
 */
export function buildParams(
  fields: FieldSpec[],
  form: FormValues,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const spec of fields) {
    if (!isFieldVisible(spec, form)) {
      continue;
    }
    const widget = widgetForField(spec);
    if (widget.kind === "boolean") {
      out[spec.key] = Boolean(form[spec.key]);
      continue;
    }
    if (widget.kind === "fallback") {
      const value = form[spec.key];
      if (value !== undefined) {
        out[spec.key] = value;
      }
      continue;
    }
    const raw = form[spec.key];
    const decoded = decodeFieldValue(
      widget,
      typeof raw === "string" ? raw : raw == null ? "" : String(raw),
    );
    if (decoded === undefined || decoded === "") {
      continue;
    }
    out[spec.key] = decoded;
  }
  return out;
}

/**
 * Dirty = any visible field's live value differs from its seed. Fallback
 * (read-only) fields never change, so they never make a card dirty. Compares
 * only keys the field set knows about (extra form keys are ignored).
 */
export function isDirty(fields: FieldSpec[], seed: FormValues, form: FormValues): boolean {
  for (const spec of fields) {
    if (widgetForField(spec).kind === "fallback") {
      continue;
    }
    if (!valuesEqual(seed[spec.key], form[spec.key])) {
      return true;
    }
  }
  return false;
}

/**
 * Evaluate a field's showWhen against the current form values (renderer
 * metadata, never schema required-ness). The `computed` (abiFunctionMutability)
 * guard needs an ABI parse the pure layer does not have — it fails OPEN (shows
 * the field) so an editable value is never hidden and silently dropped.
 */
export function isFieldVisible(spec: FieldSpec, form: FormValues): boolean {
  const showWhen = spec.showWhen;
  if (showWhen === undefined) {
    return true;
  }
  if ("computed" in showWhen) {
    return true;
  }
  const controlling = asControlString(form[showWhen.field]);
  if ("oneOf" in showWhen) {
    return showWhen.oneOf.includes(controlling);
  }
  return controlling === showWhen.equals;
}

/**
 * Map Zod validation issues to per-field errors, keyed by the first path
 * segment (the field key). The first issue per field wins (one anchored message
 * per row), each paired with a concrete suggested fix from the field's type.
 */
export function mapIssuesToFieldErrors(
  issues: Array<{ path: string; message: string }>,
  fieldsByKey: Record<string, FieldSpec>,
  t: Translate = englishTranslate,
): Record<string, FieldError> {
  const errors: Record<string, FieldError> = {};
  for (const issue of issues) {
    const key = issue.path.split(".")[0];
    if (key === "" || Object.hasOwn(errors, key)) {
      continue;
    }
    const spec = fieldsByKey[key];
    errors[key] = {
      message: issue.message,
      ...(spec !== undefined ? { fix: suggestFix(spec, t) } : {}),
    };
  }
  return errors;
}

/** A concrete, plain-language fix hint for a field type (copy law: sentence
 *  case, periods, no em-dashes, no exclamation marks). */
export function suggestFix(spec: FieldSpec, t: Translate = englishTranslate): string {
  switch (spec.type) {
    case "number":
    case "gas-limit-multiplier":
      return t("cards.fix.number");
    case "protocol-bool":
    case "fail-on-error-switch":
      return t("cards.fix.yesNo");
    case "protocol-address":
      return t("cards.fix.address");
    case "protocol-uint":
      return t("cards.fix.uint");
    case "protocol-int":
      return t("cards.fix.int");
    case "protocol-bytes":
      return t("cards.fix.bytes");
    case "protocol-eth-value":
      return t("cards.checks.amountDot");
    case "datetime":
      return t("cards.fix.datetime");
    case "select":
    case "chain-select":
    case "token-select":
      return t("cards.checks.chooseListedOption");
    default:
      return t("cards.fix.other");
  }
}

/**
 * Keep only alternatives whose actionType still resolves in the registry — the
 * system disposes of a model-declared alternative naming an absent op (NFR6 /
 * quarantine law). `isKnown` is injected so this stays pure and node-testable.
 */
export function filterAlternatives(
  alternatives: unknown,
  isKnown: (actionType: string) => boolean,
): ProposalAlternative[] {
  if (!Array.isArray(alternatives)) {
    return [];
  }
  const kept: ProposalAlternative[] = [];
  for (const raw of alternatives) {
    if (raw === null || typeof raw !== "object") {
      continue;
    }
    const actionType = (raw as { actionType?: unknown }).actionType;
    if (typeof actionType !== "string" || actionType === "" || !isKnown(actionType)) {
      continue;
    }
    const label = (raw as { label?: unknown }).label;
    const params = (raw as { params?: unknown }).params;
    kept.push({
      actionType,
      ...(typeof label === "string" ? { label } : {}),
      ...(params !== null && typeof params === "object"
        ? { params: params as Record<string, unknown> }
        : {}),
    });
  }
  return kept;
}

/**
 * The conversation's superseded set: every toolCallId named by a `supersedes`
 * message-metadata stamp (D5). A card whose toolCallId is in this set renders
 * retired. Derived from persisted data, so live and reload agree by construction.
 */
export function deriveSupersededSet(messages: UIMessage[]): Set<string> {
  const set = new Set<string>();
  for (const message of messages) {
    const metadata = message.metadata;
    if (metadata === null || typeof metadata !== "object") {
      continue;
    }
    const supersedes = (metadata as { supersedes?: unknown }).supersedes;
    if (typeof supersedes === "string" && supersedes !== "") {
      set.add(supersedes);
    }
  }
  return set;
}

// The separator for the content signature — a newline never appears in a ULID
// toolCallId, so the join/split round-trips losslessly.
const SIGNATURE_SEP = "\n";

/**
 * A stable content signature of the superseded set: sorted so message order
 * does not matter, joined into one string. Conversation memoizes the Set on
 * this string, so the Set keeps its identity across stream chunks when contents
 * are unchanged — the memoized MessageView must not re-render every settled card
 * per streamed token (the 1.5 win). Reconstruct the set with splitSignature.
 */
export function supersededSignature(messages: UIMessage[]): string {
  return [...deriveSupersededSet(messages)].sort().join(SIGNATURE_SEP);
}

/** Reconstruct the id list from a signature (the inverse of the join above). */
export function splitSignature(signature: string): string[] {
  return signature === "" ? [] : signature.split(SIGNATURE_SEP);
}

// --- helpers -----------------------------------------------------------------

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  // Read-card form values are strings/booleans; a structural compare covers the
  // rare fallback-value case without pulling in a deep-equal dependency.
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function asControlString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}
