import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  buildInputSchema,
  buildSystemInputSchema,
  compileFieldSpecs,
} from "@/lib/registry/field-schema";
import type { SnapshotConfigField } from "@/lib/registry/field-schema";

describe("compileFieldSpecs (vendored configFields -> FieldSpec[])", () => {
  it("flattens groups, keeping the group label on nested fields", () => {
    const { fields } = compileFieldSpecs([
      { key: "to", label: "To", type: "protocol-address", required: true },
      {
        type: "group",
        label: "Advanced",
        fields: [
          { key: "gasLimitMultiplier", label: "Gas Limit", type: "gas-limit-multiplier" },
        ],
      },
    ] as SnapshotConfigField[]);
    expect(fields.map((f) => f.key)).toEqual(["to", "gasLimitMultiplier"]);
    expect(fields[0].group).toBeUndefined();
    expect(fields[1].group).toBe("Advanced");
  });

  it("excludes hidden fields from specs but carries their defaults", () => {
    const { fields, passthroughDefaults } = compileFieldSpecs([
      { key: "amount", label: "Amount", type: "protocol-uint", required: true },
      {
        key: "_protocolMeta",
        label: "Protocol Metadata",
        type: "text",
        defaultValue: '{"protocol":"aave-v3"}',
        hidden: true,
      },
    ] as SnapshotConfigField[]);
    expect(fields.map((f) => f.key)).toEqual(["amount"]);
    expect(passthroughDefaults).toEqual({
      _protocolMeta: '{"protocol":"aave-v3"}',
    });
  });

  it("normalizes required to a boolean (DSL default false)", () => {
    const { fields } = compileFieldSpecs([
      { key: "memo", label: "Memo", type: "text" },
    ] as SnapshotConfigField[]);
    expect(fields[0].required).toBe(false);
  });

  it("fails loud on an unknown field type instead of silently dropping", () => {
    expect(() =>
      compileFieldSpecs([
        { key: "x", label: "X", type: "not-a-real-type" },
      ] as unknown as SnapshotConfigField[]),
    ).toThrow(/not-a-real-type/);
  });
});

describe("buildInputSchema (FieldSpec[] -> Zod)", () => {
  const specs = (raw: SnapshotConfigField[]) => compileFieldSpecs(raw).fields;

  it("keeps amounts as base-unit STRINGS, never numbers (AD-11)", () => {
    const schema = buildInputSchema(
      specs([
        { key: "amount", label: "Amount", type: "protocol-uint", required: true },
      ] as SnapshotConfigField[]),
    );
    expect(schema.safeParse({ amount: "1000000000000000000" }).success).toBe(true);
    expect(schema.safeParse({ amount: 1 }).success).toBe(false);
    expect(schema.safeParse({ amount: "{{@node:Check.balance}}" }).success).toBe(true);
    expect(schema.safeParse({ amount: "1.5" }).success).toBe(false);
  });

  it("validates address format advisorily while allowing templates", () => {
    const schema = buildInputSchema(
      specs([
        { key: "to", label: "To", type: "protocol-address", required: true },
      ] as SnapshotConfigField[]),
    );
    expect(
      schema.safeParse({ to: "0x000000000000000000000000000000000000dEaD" }).success,
    ).toBe(true);
    expect(schema.safeParse({ to: "not-an-address" }).success).toBe(false);
  });

  it("maps select options to an enum", () => {
    const schema = buildInputSchema(
      specs([
        {
          key: "mode",
          label: "Mode",
          type: "select",
          required: true,
          options: [
            { value: "fast", label: "Fast" },
            { value: "safe", label: "Safe" },
          ],
        },
      ] as SnapshotConfigField[]),
    );
    expect(schema.safeParse({ mode: "fast" }).success).toBe(true);
    expect(schema.safeParse({ mode: "reckless" }).success).toBe(false);
  });

  it("makes required:false fields optional", () => {
    const schema = buildInputSchema(
      specs([
        { key: "memo", label: "Memo", type: "text" },
      ] as SnapshotConfigField[]),
    );
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("keeps showWhen-conditional fields optional at schema level", () => {
    const schema = buildInputSchema(
      specs([
        {
          key: "ethValue",
          label: "ETH Value",
          type: "protocol-eth-value",
          required: true,
          showWhen: { field: "mode", equals: "payable" },
        },
      ] as SnapshotConfigField[]),
    );
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("maps booleans and genuine numerics faithfully", () => {
    const schema = buildInputSchema(
      specs([
        { key: "failOnError", label: "Fail on error", type: "fail-on-error-switch" },
        { key: "flag", label: "Flag", type: "protocol-bool", required: true },
        { key: "count", label: "Count", type: "number", required: true, min: 1, max: 10 },
      ] as SnapshotConfigField[]),
    );
    expect(schema.safeParse({ flag: true, count: 5 }).success).toBe(true);
    expect(schema.safeParse({ flag: "yes", count: 5 }).success).toBe(false);
    expect(schema.safeParse({ flag: true, count: 99 }).success).toBe(false);
  });

  it("maps tuple arrays to arrays of string-leaf objects", () => {
    const schema = buildInputSchema(
      specs([
        {
          key: "tokenAmounts",
          label: "Token Amounts",
          type: "protocol-tuple-array",
          required: true,
          tupleComponents: [
            { name: "token", type: "address" },
            { name: "amount", type: "uint256" },
          ],
        },
      ] as SnapshotConfigField[]),
    );
    expect(
      schema.safeParse({ tokenAmounts: [{ token: "0xabc", amount: "1" }] }).success,
    ).toBe(true);
    expect(schema.safeParse({ tokenAmounts: [{ token: 1, amount: "1" }] }).success).toBe(
      false,
    );
  });

  it("serializes to valid JSON Schema via z.toJSONSchema", () => {
    const schema = buildInputSchema(
      specs([
        { key: "to", label: "To", type: "protocol-address", required: true },
        { key: "memo", label: "Memo", type: "text" },
      ] as SnapshotConfigField[]),
    );
    const json = z.toJSONSchema(schema) as {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
    expect(json.type).toBe("object");
    expect(Object.keys(json.properties)).toEqual(["to", "memo"]);
    expect(json.required).toEqual(["to"]);
  });
});

describe("buildSystemInputSchema (prose-typed system field maps -> Zod)", () => {
  it("parses leading type tokens and required/optional maps", () => {
    const schema = buildSystemInputSchema({
      requiredFields: {
        endpoint: "string - Full URL to call",
        httpMethod: "string - GET, POST, PUT, DELETE, or PATCH",
      },
      optionalFields: {
        timeout: "number - Request timeout in seconds (default 5, min 1, max 30)",
        failOnError: "boolean - Default true.",
        httpHeaders: "string - JSON object of headers",
      },
    });
    expect(
      schema.safeParse({ endpoint: "https://x.dev", httpMethod: "GET" }).success,
    ).toBe(true);
    expect(schema.safeParse({ endpoint: "https://x.dev" }).success).toBe(false);
    expect(
      schema.safeParse({
        endpoint: "https://x.dev",
        httpMethod: "GET",
        timeout: "5",
      }).success,
    ).toBe(false);
  });

  it("parses quoted literal unions to enums", () => {
    const schema = buildSystemInputSchema({
      requiredFields: {},
      optionalFields: {
        concurrency:
          '"sequential" | "parallel" | "custom" - Execution mode for iterations (default: "sequential").',
      },
    });
    expect(schema.safeParse({ concurrency: "parallel" }).success).toBe(true);
    expect(schema.safeParse({ concurrency: "warp-speed" }).success).toBe(false);
  });

  it("maps object and array tokens to structured types", () => {
    const schema = buildSystemInputSchema({
      requiredFields: { conditionConfig: "object - Visual condition builder config." },
      optionalFields: { items: "array - Things to iterate" },
    });
    expect(
      schema.safeParse({ conditionConfig: { group: {} }, items: [1] }).success,
    ).toBe(true);
    expect(schema.safeParse({ conditionConfig: "nope" }).success).toBe(false);
  });
});
