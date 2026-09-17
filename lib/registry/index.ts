/*
 * Operation registry - runtime API (Story 1.3, spine AD-3/AD-6).
 *
 * Runtime code (lib/execution/, components/cards/, app/) imports ONLY this
 * module and the generated artifact behind it - never the vendored snapshot,
 * never the generator. The Zod input schema is built from the artifact's
 * FieldSpecs by the SAME mapper the generator used to bake the Realtime
 * parameters, so chat and voice can never diverge (single-source rule).
 *
 * Quarantine (AC 3): an op id absent from the registry, an op whose persisted
 * fingerprint no longer matches the registry's, or an op whose effect is
 * unresolvable resolves to quarantined - and a quarantined resolution carries
 * no executable affordance. The AD-6 execution gate (Epic 2) consumes this
 * resolution; it is not built here.
 *
 * Drift honesty (NFR8): field-level configFields drift is undetectable
 * against the lossy live MCP surface. Detection here is exactly: op id
 * add/remove and fingerprint mismatch against persisted values, plus
 * validation failures at execution time. Nothing more is claimed.
 */
import type { z } from "zod";

import {
  buildInputSchema,
  buildSystemInputSchema,
} from "./field-schema.ts";
import {
  integrations,
  ops,
  opIdToToolName,
  registryMeta,
  toolNameToOpId,
} from "./generated/index.ts";
import { decodeToolName } from "./tool-name.ts";
import type { OperationEntry, ResolvedOperation } from "./types.ts";

export {
  AGGREGATE_EXECUTION_TOOLS,
  resolveEffectClass,
  resolveMixedEffect,
} from "./effect-class.ts";
export type { ClassifiableAction, MixedEffectContext } from "./effect-class.ts";
export { encodeToolName, decodeToolName } from "./tool-name.ts";
export { integrations, registryMeta, toolNameToOpId, opIdToToolName };
export type * from "./types.ts";

/** Raw entry access for rendering. Presence is not executability - resolve
 *  through resolveOperation before anything effectful. */
export function getOperationEntry(opId: string): OperationEntry | undefined {
  // Object.hasOwn, not `in`/bracket-read alone: the generated `ops` is a plain
  // object literal, so an inherited key ("constructor", "toString", "__proto__")
  // would otherwise resolve to a Function and fail the "absent -> quarantined"
  // contract (these ids are model-reachable via actionType).
  return Object.hasOwn(ops, opId) ? ops[opId] : undefined;
}

/*
 * Whether KeeperHub runs this action on its own (decision 35). Its execute
 * route runs an action directly only when it is a registered protocol's
 * contract action (fork app/api/execute/[...slug]/route.ts:432-458,
 * resolveProtocolMeta); every other plugin step answers 501 and runs only inside
 * an automation. Protocol actions are exactly the entries with a protocolType.
 */
export function runsDirectly(entry: OperationEntry): boolean {
  return entry.kind === "plugin" && entry.protocolType !== undefined;
}

export function listOperationEntries(): OperationEntry[] {
  return Object.values(ops);
}

/**
 * The lookup the execution gate consumes. `expectedFingerprint` is a
 * persisted per-op fingerprint (from a transcript part or ledger row); a
 * mismatch means the operation's shape drifted since that proposal - the
 * original must never re-fire against a changed schema. An empty string is
 * treated as "no expectation" (equivalent to undefined), so a client that
 * omits or blanks the field never trips a false drift quarantine.
 */
export function resolveOperation(
  opId: string,
  options?: { expectedFingerprint?: string },
): ResolvedOperation {
  const entry = Object.hasOwn(ops, opId) ? ops[opId] : undefined;
  if (entry === undefined) {
    return { status: "quarantined", reason: "absent", opId };
  }
  if (
    options?.expectedFingerprint !== undefined &&
    options.expectedFingerprint !== "" &&
    options.expectedFingerprint !== entry.fingerprint
  ) {
    return { status: "quarantined", reason: "fingerprint-drift", opId };
  }
  if (entry.effectClass === "quarantined") {
    return { status: "quarantined", reason: "quarantined-class", opId };
  }
  return { status: "ok", entry };
}

const schemaCache = new Map<string, z.ZodObject<Record<string, z.ZodType>>>();

/** The per-operation Zod input schema (memoized). Built from the generated
 *  FieldSpecs - the same derivation the baked Realtime parameters came from. */
export function getInputSchema(
  opId: string,
): z.ZodObject<Record<string, z.ZodType>> | undefined {
  const entry = Object.hasOwn(ops, opId) ? ops[opId] : undefined;
  if (entry === undefined) {
    return undefined;
  }
  let schema = schemaCache.get(opId);
  if (schema === undefined) {
    schema = entry.systemFields
      ? buildSystemInputSchema(entry.systemFields)
      : buildInputSchema(entry.fields);
    schemaCache.set(opId, schema);
  }
  return schema;
}

export type ChatToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodObject<Record<string, z.ZodType>>;
};

export type RealtimeFunctionDefinition = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/**
 * A per-operation chat tool definition. NOTE (Story 1.4, ratified D1): this is
 * NOT the live wire surface. The chat/voice surface is the aggregate 4-tool set
 * in lib/registry/surface-tools.ts (search_actions + the execution verbs); the
 * model never sees 442 tools. The per-op defs here remain the single source for
 * validation (getInputSchema), rendering (FieldSpecs/outputFields), and
 * fingerprints. Quarantined operations get NO tool surface - render, never fire.
 */
export function getChatTool(opId: string): ChatToolDefinition | undefined {
  const resolved = resolveOperation(opId);
  if (resolved.status !== "ok") {
    return undefined;
  }
  const inputSchema = getInputSchema(opId);
  if (inputSchema === undefined) {
    return undefined;
  }
  return {
    name: resolved.entry.toolName,
    description: resolved.entry.description,
    inputSchema,
  };
}

/** The OpenAI Realtime function tool. `parameters` is the JSON Schema baked
 *  at generation time from the same Zod source as getChatTool's schema. */
export function getRealtimeFunction(
  opId: string,
): RealtimeFunctionDefinition | undefined {
  const resolved = resolveOperation(opId);
  if (resolved.status !== "ok") {
    return undefined;
  }
  return {
    type: "function",
    name: resolved.entry.toolName,
    description: resolved.entry.description,
    parameters: resolved.entry.realtimeParameters,
  };
}

/** Map a wire toolName back to the canonical opId. The generated map is
 *  authoritative (it alone covers hash-truncated names); algorithmic decode
 *  is a fallback that must still land on a registered op. */
export function opIdForToolName(toolName: string): string | undefined {
  // Guard the plain-object maps against inherited-key lookups (see getOperationEntry).
  const mapped = Object.hasOwn(toolNameToOpId, toolName)
    ? toolNameToOpId[toolName]
    : undefined;
  if (mapped !== undefined) {
    return mapped;
  }
  const decoded = decodeToolName(toolName);
  return decoded !== null && Object.hasOwn(ops, decoded) ? decoded : undefined;
}
