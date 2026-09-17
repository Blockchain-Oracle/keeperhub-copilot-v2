/*
 * Field-type -> Zod mapper (Story 1.3, spine AD-3/AD-11).
 *
 * The SINGLE schema source: the generator bakes Realtime function parameters
 * from these Zod schemas via z.toJSONSchema(), and runtime chat tools consume
 * the same schemas built from the same generated FieldSpecs. Changing this
 * mapper without regenerating the artifact fails the registry:check
 * regen-diff, so mapper and artifact cannot silently diverge.
 *
 * Load-bearing rules (non-negotiable):
 * - Amounts and integers travel as STRINGS, never z.number() (AD-11).
 *   Decimals live in no schema surface; human-unit conversion is a
 *   rendering-edge concern, not the registry's.
 * - Advisory format refinements admit {{template}} references so workflow
 *   composition never fails schema validation.
 * - hidden fields are excluded from the user-editable schema; their defaults
 *   travel in passthroughDefaults and are merged at execution time.
 * - showWhen conditionality is renderer metadata, never schema required-ness.
 * - A field type that cannot be faithfully typed falls back to a safe shape;
 *   it never quarantines the op (only unresolvable EFFECT quarantines).
 */
import { z } from "zod";

import type { FieldSpec, FieldType, SelectOption, ShowWhen } from "./types.ts";

/** The vendored snapshot's raw field shape (plugins/registry.ts DSL). */
export type SnapshotFieldBase = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hidden?: boolean;
  options?: SelectOption[];
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  placeholder?: string;
  defaultValue?: string;
  example?: string;
  helpTip?: string;
  docUrl?: string;
  isAddressField?: boolean;
  solidityType?: string;
  showWhen?: ShowWhen;
  tupleComponents?: Array<{
    name: string;
    type: string;
    components?: Array<{ name: string; type: string }>;
  }>;
  chainTypeFilter?: string | string[];
  allowedChainIds?: string[];
  showPrivateVariants?: boolean;
  abiField?: string;
  abiFunctionField?: string;
  functionFilter?: "read" | "write";
  contractAddressField?: string;
  contractInteractionType?: "read" | "write";
  networkField?: string;
  actionSlug?: string;
};

export type SnapshotFieldGroup = {
  type: "group";
  label: string;
  fields: SnapshotFieldBase[];
  defaultExpanded?: boolean;
};

export type SnapshotConfigField = SnapshotFieldBase | SnapshotFieldGroup;

const FIELD_TYPES: ReadonlySet<string> = new Set([
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
]);

/**
 * Compile vendored configFields into flattened, renderer-facing FieldSpecs.
 * Groups flatten (nested fields keep the group label); hidden fields are
 * excluded but their defaultValues are returned as passthroughDefaults.
 */
export function compileFieldSpecs(configFields: SnapshotConfigField[]): {
  fields: FieldSpec[];
  passthroughDefaults: Record<string, string>;
} {
  const fields: FieldSpec[] = [];
  const passthroughDefaults: Record<string, string> = {};

  const visit = (field: SnapshotConfigField, group?: string): void => {
    if (field.type === "group") {
      for (const nested of (field as SnapshotFieldGroup).fields) {
        visit(nested, field.label);
      }
      return;
    }
    if (!FIELD_TYPES.has(field.type)) {
      throw new Error(
        `Unknown configField type "${field.type}" on key "${field.key}" - ` +
          "the closed DSL set changed upstream; re-verify the snapshot before generating.",
      );
    }
    if (field.hidden) {
      if (field.defaultValue !== undefined) {
        passthroughDefaults[field.key] = field.defaultValue;
      }
      return;
    }
    const { required, ...rest } = field;
    delete (rest as { hidden?: boolean }).hidden;
    fields.push({
      ...rest,
      required: required === true,
      ...(group !== undefined ? { group } : {}),
    });
  };

  for (const field of configFields) {
    visit(field);
  }
  return { fields, passthroughDefaults };
}

// Advisory format refinements. Each admits a {{template}} reference so
// workflow-composed values never fail schema validation; single combined
// regexes keep z.toJSONSchema() output a plain "pattern".
const TEMPLATE = String.raw`\{\{.+\}\}`;
const ADDRESS_PATTERN = new RegExp(`^(?:${TEMPLATE}|0x[0-9a-fA-F]{40})$`);
const UINT_PATTERN = new RegExp(`^(?:${TEMPLATE}|[0-9]+)$`);
const INT_PATTERN = new RegExp(`^(?:${TEMPLATE}|-?[0-9]+)$`);
const BYTES_PATTERN = new RegExp(`^(?:${TEMPLATE}|0x(?:[0-9a-fA-F]{2})*)$`);
const ETH_VALUE_PATTERN = new RegExp(`^(?:${TEMPLATE}|[0-9]+(?:\\.[0-9]+)?)$`);

function tupleItemSchema(
  components: NonNullable<FieldSpec["tupleComponents"]>,
): z.ZodType {
  const shape: Record<string, z.ZodType> = {};
  for (const component of components) {
    // Solidity leaf values travel as strings (AD-11); one nesting level of
    // tuple-in-tuple covers all current protocols.
    shape[component.name] = component.components
      ? tupleItemSchema(component.components)
      : z.string();
  }
  return z.object(shape);
}

function fieldZod(spec: FieldSpec): z.ZodType {
  switch (spec.type) {
    case "number":
    case "gas-limit-multiplier": {
      let schema = z.number();
      if (spec.min !== undefined) schema = schema.min(spec.min);
      if (spec.max !== undefined) schema = schema.max(spec.max);
      return schema;
    }
    case "protocol-bool":
    case "fail-on-error-switch":
      return z.boolean();
    case "select":
      return spec.options && spec.options.length > 0
        ? z.enum(spec.options.map((option) => option.value) as [string, ...string[]])
        : z.string();
    case "protocol-address":
      return z.string().regex(ADDRESS_PATTERN);
    case "protocol-uint":
      return z.string().regex(UINT_PATTERN);
    case "protocol-int":
      return z.string().regex(INT_PATTERN);
    case "protocol-bytes":
      return z.string().regex(BYTES_PATTERN);
    case "protocol-eth-value":
      return z.string().regex(ETH_VALUE_PATTERN);
    case "protocol-tuple-array":
      return spec.tupleComponents
        ? z.array(tupleItemSchema(spec.tupleComponents))
        : z.array(z.unknown());
    case "abi-function-args":
    case "call-list-builder":
    case "args-list-builder":
      return z.array(z.unknown());
    case "schema-builder":
      return z.unknown();
    // Everything else is text-shaped: template inputs, datetime (ISO-8601),
    // chain/token selectors (id strings), ABI text/selections, code/JSON
    // editors. The generic-card floor renders them all.
    default:
      return z.string();
  }
}

/**
 * Build the per-operation Zod input schema from compiled FieldSpecs.
 * required:false and showWhen-conditional fields are optional at schema level
 * (conditional presence is a renderer concern, not schema validity).
 */
export function buildInputSchema(
  fields: FieldSpec[],
): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};
  for (const spec of fields) {
    if (Object.hasOwn(shape, spec.key)) {
      // Fail loud (matches the emitter's toolName-collision posture): a silent
      // last-wins overwrite would drop a field from validation entirely.
      throw new Error(
        `Duplicate field key "${spec.key}" - flattened FieldSpecs collide.`,
      );
    }
    let schema = fieldZod(spec).describe(spec.label);
    if (!spec.required || spec.showWhen !== undefined) {
      schema = schema.optional();
    }
    shape[spec.key] = schema;
  }
  return z.object(shape);
}

// The 5 system primitives carry prose-typed field maps ("number - Request
// timeout in seconds") - their sole canonical source. The leading type token
// before " - " is a stable convention of that module.
function systemFieldZod(description: string): z.ZodType {
  const head = description.split(" - ")[0].trim();
  if (head.startsWith('"')) {
    const literals = head
      .split("|")
      .map((part) => part.trim().replace(/^"|"$/g, ""))
      .filter((part) => part.length > 0);
    if (literals.length > 0) {
      return z.enum(literals as [string, ...string[]]);
    }
  }
  switch (head.split(" ")[0]) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    case "object":
      return z.record(z.string(), z.unknown());
    case "array":
      return z.array(z.unknown());
    default:
      return z.unknown();
  }
}

export function buildSystemInputSchema(systemFields: {
  requiredFields: Record<string, string>;
  optionalFields: Record<string, string>;
}): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, description] of Object.entries(systemFields.requiredFields)) {
    if (Object.hasOwn(shape, key)) {
      throw new Error(`Duplicate system field key "${key}" in requiredFields.`);
    }
    shape[key] = systemFieldZod(description).describe(description);
  }
  for (const [key, description] of Object.entries(systemFields.optionalFields)) {
    if (Object.hasOwn(shape, key)) {
      // A key in both required and optional would silently relax required ->
      // optional; refuse it instead.
      throw new Error(
        `Duplicate system field key "${key}" - present in both required and optional fields.`,
      );
    }
    shape[key] = systemFieldZod(description).describe(description).optional();
  }
  return z.object(shape);
}
