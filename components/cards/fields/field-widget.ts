/*
 * Field-type -> widget mapping + value codecs (Story 1.6, AC 1). PURE — no JSX,
 * so it is unit tested directly in node (tests/cards/fields). The editable card
 * (GenericReadCard) renders one control per FieldSpec by asking widgetForField
 * what KIND of control to draw, and moves values across the string/schema
 * boundary with the codecs here.
 *
 * The load-bearing rule (AD-11, project-context money law): amounts and integers
 * travel as STRINGS and are NEVER parsed to a float. Only the two genuinely
 * numeric field types (`number`, `gas-limit-multiplier`) use the numeric codec;
 * every protocol-uint/-int/-eth-value stays text. Exotic composite widgets
 * (schema/list/tuple/abi-args builders) degrade to a read-only mono display —
 * the card stays re-runnable AROUND them, it never blocks on them. The
 * addendum's ~85-90% trivially-auto-render figure is the target.
 */
import type { FieldSpec, FieldType, SelectOption } from "@/lib/registry";

export type FieldWidgetKind =
  | "text"
  | "number"
  | "boolean"
  | "options"
  | "fallback";

export type FieldWidget = {
  kind: FieldWidgetKind;
  /** text kind: render as a multi-line textarea rather than a single-line input. */
  multiline: boolean;
  /** text/number kind: mono font + tabular-nums (machine values, code, amounts). */
  mono: boolean;
  /** options kind: the switchable options (value + label) for the pill group. */
  options?: SelectOption[];
};

// The genuinely-numeric field types — the ONLY ones that cross the string↔number
// codec. Everything amount-shaped (protocol-uint/-int/-eth-value) is text.
const NUMERIC_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  "number",
  "gas-limit-multiplier",
]);

const BOOLEAN_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  "protocol-bool",
  "fail-on-error-switch",
]);

// Options-bearing selects: pills WHEN they carry an enum, plain text otherwise
// (an empty/dynamic option list has nothing to switch between).
const OPTION_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  "select",
  "chain-select",
  "token-select",
]);

// Composite editors with no faithful inline control — read-only mono display
// with an honest note; the card stays re-runnable around them.
const FALLBACK_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  "schema-builder",
  "call-list-builder",
  "args-list-builder",
  "protocol-tuple-array",
  "abi-function-args",
]);

// Multi-line text widgets (code/JSON editors and template textareas).
const MULTILINE_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  "template-textarea",
  "code-editor",
  "json-editor",
]);

// Mono (machine-truth / code) text widgets: addresses, integers, byte strings,
// eth values, schedules, and the code/JSON editors. DESIGN: mono + tabular-nums
// for every amount, address, hash, and schedule.
const MONO_TEXT_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  "protocol-address",
  "protocol-uint",
  "protocol-int",
  "protocol-bytes",
  "protocol-eth-value",
  "datetime",
  "code-editor",
  "json-editor",
]);

/**
 * Map a FieldSpec to the widget the editable card should draw. Options-bearing
 * selects become pills only when they actually carry options; otherwise they
 * degrade to a text input (a dynamic/empty option list has nothing to pick).
 */
export function widgetForField(spec: FieldSpec): FieldWidget {
  const type = spec.type;
  if (NUMERIC_TYPES.has(type)) {
    return { kind: "number", multiline: false, mono: true };
  }
  if (BOOLEAN_TYPES.has(type)) {
    return { kind: "boolean", multiline: false, mono: false };
  }
  if (OPTION_TYPES.has(type)) {
    if (spec.options !== undefined && spec.options.length > 0) {
      return { kind: "options", multiline: false, mono: false, options: spec.options };
    }
    return { kind: "text", multiline: false, mono: false };
  }
  if (FALLBACK_TYPES.has(type)) {
    return { kind: "fallback", multiline: false, mono: true };
  }
  return {
    kind: "text",
    multiline: MULTILINE_TYPES.has(type),
    mono: MONO_TEXT_TYPES.has(type),
  };
}

/**
 * Settled schema value -> the string shown in a text/number input. Only used
 * for the string-shaped widgets (text, number, options); boolean and fallback
 * carry their value directly. undefined/null seed as an empty control.
 */
export function encodeFieldValue(widget: FieldWidget, value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (widget.kind === "number") {
    // Numbers stringify verbatim; a value that arrived as a string (schema
    // drift, template ref) is shown as-is rather than coerced.
    return String(value);
  }
  if (typeof value === "string") {
    return value;
  }
  // A non-string leaked into a string widget (drift): show it, don't crash.
  return String(value);
}

/**
 * Raw input string -> the schema-shaped value for a text/number/options widget.
 * The number codec guards NaN: an empty input decodes to undefined (so a
 * required-field check fires), and an unparseable input decodes back to the raw
 * string so the shared Zod schema rejects it with a field error — never a
 * silent 0 or NaN. Text and options are identity (strings stay strings; floats
 * never touch an amount).
 */
export function decodeFieldValue(widget: FieldWidget, raw: string): unknown {
  if (widget.kind === "number") {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return undefined;
    }
    // Only plain decimal numerals decode to a number. Number() would silently
    // coerce 0x/0o/0b (and other non-decimal forms) to a different value, so
    // reject anything that is not a decimal numeral back to the raw string — the
    // shared Zod schema then rejects it with a field error, never a
    // silently-wrong number (nor 0/NaN/Infinity).
    if (!DECIMAL_NUMERAL.test(trimmed)) {
      return raw;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : raw;
  }
  return raw;
}

// A plain decimal numeral: optional sign, digits with an optional decimal point,
// and an optional decimal exponent. Deliberately excludes 0x/0o/0b, separators,
// and Infinity/NaN so those surface as a field error instead of a coercion.
const DECIMAL_NUMERAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
