import { describe, expect, it } from "vitest";

import {
  decodeFieldValue,
  encodeFieldValue,
  widgetForField,
  type FieldWidget,
} from "@/components/cards/fields/field-widget";
import type { FieldSpec, FieldType } from "@/lib/registry";

function spec(type: FieldType, overrides: Partial<FieldSpec> = {}): FieldSpec {
  return { key: "f", label: "F", type, required: false, ...overrides };
}

// The closed DSL set (lib/registry/types.ts FieldType). Enumerated here so this
// test breaks LOUDLY if the union ever grows — every member must map to a
// widget. (The addendum cites "28"; the installed union is the ground truth.)
const ALL_FIELD_TYPES: FieldType[] = [
  "template-input",
  "template-textarea",
  "text",
  "number",
  "fail-on-error-switch",
  "datetime",
  "select",
  "chain-select",
  "schema-builder",
  "abi-function-select",
  "abi-function-args",
  "abi-with-auto-fetch",
  "token-select",
  "abi-event-select",
  "gas-limit-multiplier",
  "code-editor",
  "json-editor",
  "call-list-builder",
  "args-list-builder",
  "protocol-address",
  "protocol-uint",
  "protocol-int",
  "protocol-bool",
  "protocol-bytes",
  "protocol-eth-value",
  "protocol-tuple-array",
];

// Base widget kind per type WITHOUT options (options-bearing selects branch).
const EXPECTED_KIND: Record<FieldType, FieldWidget["kind"]> = {
  "template-input": "text",
  "template-textarea": "text",
  text: "text",
  number: "number",
  "fail-on-error-switch": "boolean",
  datetime: "text",
  select: "text",
  "chain-select": "text",
  "schema-builder": "fallback",
  "abi-function-select": "text",
  "abi-function-args": "fallback",
  "abi-with-auto-fetch": "text",
  "token-select": "text",
  "abi-event-select": "text",
  "gas-limit-multiplier": "number",
  "code-editor": "text",
  "json-editor": "text",
  "call-list-builder": "fallback",
  "args-list-builder": "fallback",
  "protocol-address": "text",
  "protocol-uint": "text",
  "protocol-int": "text",
  "protocol-bool": "boolean",
  "protocol-bytes": "text",
  "protocol-eth-value": "text",
  "protocol-tuple-array": "fallback",
};

describe("widgetForField (every FieldType maps to a widget kind)", () => {
  it("maps all 26 field types to their base widget kind", () => {
    expect(ALL_FIELD_TYPES).toHaveLength(26);
    for (const type of ALL_FIELD_TYPES) {
      expect(widgetForField(spec(type)).kind).toBe(EXPECTED_KIND[type]);
    }
  });

  it("options-bearing select/chain/token render as pills only WITH options", () => {
    const options = [
      { value: "1", label: "Ethereum" },
      { value: "137", label: "Polygon" },
    ];
    for (const type of ["select", "chain-select", "token-select"] as const) {
      const withOptions = widgetForField(spec(type, { options }));
      expect(withOptions.kind).toBe("options");
      expect(withOptions.options).toEqual(options);

      // Empty or absent options → text, nothing to switch between.
      expect(widgetForField(spec(type)).kind).toBe("text");
      expect(widgetForField(spec(type, { options: [] })).kind).toBe("text");
    }
  });

  it("marks code/json editors and template textareas multiline", () => {
    for (const type of ["code-editor", "json-editor", "template-textarea"] as const) {
      expect(widgetForField(spec(type)).multiline).toBe(true);
    }
    expect(widgetForField(spec("text")).multiline).toBe(false);
  });

  it("marks machine-truth text widgets mono (amounts, addresses, schedules)", () => {
    for (const type of [
      "protocol-address",
      "protocol-uint",
      "protocol-int",
      "protocol-bytes",
      "protocol-eth-value",
      "datetime",
      "code-editor",
      "json-editor",
    ] as const) {
      expect(widgetForField(spec(type)).mono).toBe(true);
    }
    expect(widgetForField(spec("text")).mono).toBe(false);
    expect(widgetForField(spec("template-input")).mono).toBe(false);
  });

  it("the fallback set is exactly the composite builders", () => {
    const fallback = ALL_FIELD_TYPES.filter(
      (type) => widgetForField(spec(type)).kind === "fallback",
    ).sort();
    expect(fallback).toEqual(
      [
        "abi-function-args",
        "args-list-builder",
        "call-list-builder",
        "protocol-tuple-array",
        "schema-builder",
      ].sort(),
    );
  });
});

describe("value codecs (round-trip; floats never touch an amount)", () => {
  const numberWidget = widgetForField(spec("number"));
  const textWidget = widgetForField(spec("text"));
  const uintWidget = widgetForField(spec("protocol-uint"));

  it("the number codec round-trips and guards NaN", () => {
    expect(encodeFieldValue(numberWidget, 5)).toBe("5");
    expect(decodeFieldValue(numberWidget, "5")).toBe(5);
    expect(decodeFieldValue(numberWidget, "1.5")).toBe(1.5);
    // Empty → undefined (a required check fires); junk → the raw string back
    // (so the shared Zod schema rejects it with a field error), never 0/NaN.
    expect(decodeFieldValue(numberWidget, "")).toBeUndefined();
    expect(decodeFieldValue(numberWidget, "   ")).toBeUndefined();
    expect(decodeFieldValue(numberWidget, "abc")).toBe("abc");
    expect(encodeFieldValue(numberWidget, undefined)).toBe("");
  });

  it("the number codec rejects non-decimal coercions back to the raw string", () => {
    // Number() would silently coerce these; the codec must return the raw string
    // so the shared Zod schema rejects it with a field error, never a
    // silently-different value.
    for (const raw of ["0x10", "0b11", "0o17", "1_000", "5abc", "Infinity", "NaN"]) {
      expect(decodeFieldValue(numberWidget, raw)).toBe(raw);
    }
    // 1e999 overflows to Infinity → not finite → the raw string, never Infinity.
    expect(decodeFieldValue(numberWidget, "1e999")).toBe("1e999");
    // Plain decimals (sign, decimal point, exponent) still decode to a number.
    expect(decodeFieldValue(numberWidget, "-3")).toBe(-3);
    expect(decodeFieldValue(numberWidget, "1e3")).toBe(1000);
    expect(decodeFieldValue(numberWidget, ".5")).toBe(0.5);
  });

  it("integer-string amounts stay strings — never parsed to a float (AD-11)", () => {
    const big = "100000000000000000";
    expect(decodeFieldValue(uintWidget, big)).toBe(big);
    expect(encodeFieldValue(uintWidget, big)).toBe(big);
    // A leading-zero / precision-losing value survives verbatim.
    expect(decodeFieldValue(uintWidget, "007")).toBe("007");
  });

  it("text and options are identity strings", () => {
    expect(decodeFieldValue(textWidget, "hello")).toBe("hello");
    expect(encodeFieldValue(textWidget, "hello")).toBe("hello");
    expect(encodeFieldValue(textWidget, undefined)).toBe("");
    const optionWidget = widgetForField(
      spec("select", { options: [{ value: "a", label: "A" }] }),
    );
    expect(decodeFieldValue(optionWidget, "a")).toBe("a");
    expect(encodeFieldValue(optionWidget, "a")).toBe("a");
  });
});
