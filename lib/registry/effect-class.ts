/*
 * Effect-class pure resolver (Story 1.3, spine AD-6).
 *
 * Copilot's OWN deterministic judgment - never derived from platform flags.
 * The naive keys are proven wrong (PRD reconcile-action-inventory Gap 1):
 * the [C] credential marker is not a write marker (safe/get-pending-
 * transactions is a gated READ), outputSchema presence is not read-ness, and
 * MCP readOnlyHint annotations are hints, not policy.
 *
 * Sources, in order:
 * 1. Protocol actions: the explicit ProtocolAction.type ("read"|"write")
 *    recovered into the snapshot by the vendoring dump - with every
 *    approve/authorization write escalated to authorization-grant.
 * 2. Static plugin actions and system primitives: the OWNED, enumerated
 *    allowlists below (cited in the story; verified against the 43 static +
 *    5 system actions in the 9d510a1 snapshot).
 * 3. Anything the resolver cannot place in exactly one class -> quarantined:
 *    never executable (no class -> no execution). A NEW static action
 *    appearing in a future snapshot therefore fails SAFE (quarantined until
 *    classified), instead of silently defaulting to read.
 */
import type { EffectClass } from "./types.ts";

/** The minimal snapshot slice the classifier keys on. */
export type ClassifiableAction = {
  id: string;
  kind: "plugin" | "system";
  integration: string;
  requiresCredentials: boolean;
  protocolType?: "read" | "write";
};

// Off-chain side-effecting sends: real-world third-party effects, no [C],
// not on-chain writes (reconcile-action-inventory Gap 1 class 3).
const OFF_CHAIN_SEND = new Set([
  "discord/send-message",
  "slack/send-message",
  "telegram/send-message",
  "sendgrid/send-email",
  "webhook/send-webhook",
]);

// Authorize future value movement without moving value now - the highest-risk
// writes, never mis-bucketed as low-impact (Gap 1 class 4). Protocol approve
// actions are caught by the slug rule below; these are the static/enumerated
// grants.
const AUTHORIZATION_GRANT = new Set([
  "web3/approve-token",
  "web3/sign-typed-data",
  "morpho/set-authorization",
  "superfluid/grant-flow-operator",
  "cowswap/set-pre-signature",
  "cowswap/create-conditional-order",
]);

const VALUE_MOVING_WRITE = new Set([
  "web3/transfer-funds",
  "web3/transfer-token",
  "web3/transfer-spl-token",
  "web3/call-solana-program-anchor",
  "web3/send-raw-solana-instruction",
  "web3/write-contract",
  "tempo/batch-payout",
  "tempo/dex-swap",
  "tempo/hold-payment",
  "tempo/transfer-with-memo",
]);

// Retrieve-only static actions. Enumerated explicitly (not a catch-all) so an
// unknown future action quarantines instead of silently executing without
// ceremony. blockscout's "user-destination" egress tier does not change its
// effect class: egress describes network reach, these actions' semantics are
// fixed retrieval.
const STATIC_READ = new Set([
  "blockscout/get-address-balance",
  "blockscout/get-address-counters",
  "blockscout/get-address-info",
  "blockscout/get-token-info",
  "blockscout/get-transaction",
  "hyperliquid/active-asset-data",
  "hyperliquid/clearinghouse-state",
  "hyperliquid/funding-history",
  "hyperliquid/referral",
  "hyperliquid/spot-deploy-state",
  "hyperliquid/sub-accounts",
  "hyperliquid/validator-summaries",
  "hyperliquid/vault-details",
  "math/aggregate",
  "safe/get-pending-transactions",
  "web3/assess-risk",
  "web3/batch-read-contract",
  "web3/check-allowance",
  "web3/check-balance",
  "web3/check-token-balance",
  "web3/decode-calldata",
  "web3/get-transaction",
  "web3/query-events",
  "web3/query-transactions",
  "web3/read-contract",
]);

// Unbounded-effect operations: statically unclassifiable in principle, not
// merely unlisted. Recorded here so the quarantine is a decision with a
// reason, not an allowlist gap.
// - Database Query executes arbitrary SQL against a user-connected database
//   (SELECT or INSERT - no static signal).
// - code/run-code executes arbitrary user JS with egress "user-destination"
//   (KeeperHub's own tier: the sandbox can reach hosts of the user's choosing).
const UNBOUNDED_EFFECT = new Set(["Database Query", "code/run-code"]);

// Effect-free workflow control-flow primitives.
const SYSTEM_READ = new Set(["Condition", "For Each", "Collect"]);

/** Every protocol approve is an authorization grant, keyed on the slug. */
function isApproveSlug(id: string): boolean {
  const slug = id.split("/")[1] ?? "";
  return /(^|-)approve(-|$)/.test(slug);
}

/**
 * The pure classifier: one action in, exactly one effect class out.
 * Deterministic, total, and safe - anything unplaceable is quarantined.
 */
export function resolveEffectClass(action: ClassifiableAction): EffectClass {
  if (UNBOUNDED_EFFECT.has(action.id)) {
    return "quarantined";
  }
  if (action.kind === "system") {
    if (action.id === "HTTP Request") {
      return "off-chain-send";
    }
    return SYSTEM_READ.has(action.id) ? "read" : "quarantined";
  }
  if (action.protocolType === "read") {
    return "read";
  }
  if (action.protocolType === "write") {
    return AUTHORIZATION_GRANT.has(action.id) || isApproveSlug(action.id)
      ? "authorization-grant"
      : "value-moving-write";
  }
  if (OFF_CHAIN_SEND.has(action.id)) {
    return "off-chain-send";
  }
  if (AUTHORIZATION_GRANT.has(action.id)) {
    return "authorization-grant";
  }
  if (VALUE_MOVING_WRITE.has(action.id)) {
    return "value-moving-write";
  }
  if (STATIC_READ.has(action.id)) {
    return "read";
  }
  return "quarantined";
}

/**
 * The 4 aggregate MCP execution tools are mixed-effect: their effect depends
 * on what they are asked to do, resolved at operation time by lib/execution/
 * (Epic 2) through resolveMixedEffect below. Stamped here as data so the
 * artifact and the execution gate share one definition.
 */
export const AGGREGATE_EXECUTION_TOOLS = {
  execute_contract_call: {
    effectClass: "mixed-effect",
    resolution: "view/pure functions read; state-changing functions submit",
  },
  execute_check_and_execute: {
    effectClass: "mixed-effect",
    resolution: "reads a condition, may then submit the configured execution",
  },
  execute_protocol_action: {
    effectClass: "mixed-effect",
    resolution: "effect = the resolved protocol action's effect class",
  },
  call_workflow: {
    effectClass: "mixed-effect",
    resolution:
      "read listing executes; write listing returns calldata; paid listing pays (402)",
  },
} as const satisfies Record<
  string,
  { effectClass: "mixed-effect"; resolution: string }
>;

export type MixedEffectContext =
  | {
      tool: "execute_contract_call";
      stateMutability: "view" | "pure" | "nonpayable" | "payable";
    }
  | {
      tool: "execute_check_and_execute";
      willExecute: boolean;
      executionEffect?: EffectClass;
    }
  | { tool: "execute_protocol_action"; actionEffectClass: EffectClass }
  | { tool: "call_workflow"; listing: "read" | "write" | "paid" };

/**
 * The pure operation-time resolver for mixed-effect tools. Unresolvable
 * contexts quarantine (no class -> no execution), matching AD-6.
 */
export function resolveMixedEffect(context: MixedEffectContext): EffectClass {
  switch (context.tool) {
    case "execute_contract_call":
      return context.stateMutability === "view" || context.stateMutability === "pure"
        ? "read"
        : "value-moving-write";
    case "execute_check_and_execute":
      if (!context.willExecute) {
        return "read";
      }
      return context.executionEffect ?? "quarantined";
    case "execute_protocol_action":
      return context.actionEffectClass;
    case "call_workflow":
      switch (context.listing) {
        case "read":
          return "read";
        case "write":
          return "value-moving-write";
        case "paid":
          return "listing-payment";
        default:
          // Out-of-domain listing (bad wire data) quarantines - no class, no
          // execution (AD-6). The union is exhaustive at compile time; this is
          // the runtime fail-closed floor.
          return "quarantined";
      }
    default:
      // Unknown aggregate tool: fail closed rather than fall through to undefined.
      return "quarantined";
  }
}
