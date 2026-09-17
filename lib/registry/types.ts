/*
 * Operation registry types (Story 1.3, spine AD-3/AD-6).
 *
 * opId is KeeperHub's own action slug ("plugin/action", or the bare label of
 * a system primitive) - the registry key, renderer key, and later the ledger
 * op_id. Never a parallel id (spine Consistency Conventions).
 */

/**
 * The full effect-class taxonomy (spine AD-6). All eight are defined from day
 * one so later stories slot tool-level ops in without a redesign. Story 1.3
 * populates: read, value-moving-write, off-chain-send, authorization-grant,
 * mixed-effect (the 4 aggregate execution tools) and quarantined.
 * listing-payment (Epic 6) and config-management-write (Epic 5) are defined
 * but unpopulated here.
 */
export const EFFECT_CLASSES = [
  "read",
  "value-moving-write",
  "off-chain-send",
  "listing-payment",
  "config-management-write",
  "authorization-grant",
  "mixed-effect",
  "quarantined",
] as const;

export type EffectClass = (typeof EFFECT_CLASSES)[number];

/** The closed set of rich configField DSL types (plugins/registry.ts @ 9d510a1). */
export type FieldType =
  | "template-input"
  | "template-textarea"
  | "text"
  | "number"
  | "fail-on-error-switch"
  | "datetime"
  | "select"
  | "chain-select"
  | "schema-builder"
  | "abi-function-select"
  | "abi-function-args"
  | "abi-with-auto-fetch"
  | "token-select"
  | "abi-event-select"
  | "gas-limit-multiplier"
  | "code-editor"
  | "json-editor"
  | "call-list-builder"
  | "args-list-builder"
  | "protocol-address"
  | "protocol-uint"
  | "protocol-int"
  | "protocol-bool"
  | "protocol-bytes"
  | "protocol-eth-value"
  | "protocol-tuple-array";

export type SelectOption = { value: string; label: string };

export type ShowWhen =
  | { field: string; equals: string }
  | { field: string; oneOf: string[] }
  | {
      computed: "abiFunctionMutability";
      abiField: string;
      functionField: string;
      equals: string;
    };

/**
 * A flattened, renderer-facing field spec compiled from the vendored
 * configFields. Groups are flattened; a field that lived inside a group keeps
 * the group label in `group`. Hidden fields are EXCLUDED from field specs -
 * their defaultValue travels in the entry's passthroughDefaults instead.
 */
export type FieldSpec = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  group?: string;
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
  /* ABI/gas widget wiring (which sibling field holds the ABI, the network,
   * the contract address, ...) - renderer metadata carried verbatim. */
  abiField?: string;
  abiFunctionField?: string;
  functionFilter?: "read" | "write";
  contractAddressField?: string;
  contractInteractionType?: "read" | "write";
  networkField?: string;
  actionSlug?: string;
};

export type OutputField = { field: string; description: string };

/**
 * One generated registry entry. Everything here is build-time data emitted by
 * scripts/generate-registry.ts - runtime code imports only this artifact
 * (AD-3) and derives the Zod input schema from `fields` via the same mapper
 * the generator used to bake `realtimeParameters`.
 */
export type OperationEntry = {
  opId: string;
  toolName: string;
  kind: "plugin" | "system";
  integration: string;
  label: string;
  description: string;
  category: string;
  effectClass: EffectClass;
  needsCredential: boolean;
  credentialIntegrationType?: string;
  /** rendererKey === opId (one identity everywhere); renderer marks the FR8
   *  generic-card floor vs the bespoke carve-outs (control-flow primitives,
   *  Solana value-movers, later money-movers). */
  rendererKey: string;
  renderer: "generic" | "bespoke";
  /** Stable hash over this op's canonicalized configFields + resolved effect
   *  class - the value the ledger's schema_fingerprint column will store. */
  fingerprint: string;
  fields: FieldSpec[];
  /** defaultValues of hidden fields (e.g. _protocolMeta), merged into the
   *  tool input at execution time - dropping them would break routing. */
  passthroughDefaults: Record<string, string>;
  /** JSON Schema for OpenAI Realtime function parameters, baked at generation
   *  time from the SAME Zod schema the chat tool uses (single-source rule). */
  realtimeParameters: Record<string, unknown>;
  outputFields?: OutputField[];
  outputSchema?: Record<string, unknown>;
  /** Protocol actions only: the source read/write flag from the protocol
   *  definition (lost in KeeperHub's own plugin conversion, recovered by the
   *  vendoring dump). */
  protocolType?: "read" | "write";
  /** System primitives only: the canonical prose-typed field maps from
   *  lib/mcp/workflow-schema-constants.ts - the bespoke cards' source. */
  systemFields?: {
    requiredFields: Record<string, string>;
    optionalFields: Record<string, string>;
    behavior?: string;
    sourceHandles?: string[];
  };
};

/** Registry-level metadata emitted alongside the ops. */
export type RegistryMeta = {
  /** Stable hash over the whole canonicalized snapshot - the ledger's
   *  registry_snapshot_id. */
  snapshotId: string;
  sourceCommit: string;
  actionCount: number;
};

export type IntegrationInfo = { label: string; description: string };

/** Why a lookup resolved to quarantined (AC 3). */
export type QuarantineReason =
  | "absent"
  | "fingerprint-drift"
  | "quarantined-class";

/**
 * The outcome of a runtime lookup. A quarantined resolution carries no
 * executable affordance - the AD-6 execution gate (Epic 2) refuses anything
 * that is not status "ok".
 */
export type ResolvedOperation =
  | { status: "ok"; entry: OperationEntry }
  | { status: "quarantined"; reason: QuarantineReason; opId: string };
