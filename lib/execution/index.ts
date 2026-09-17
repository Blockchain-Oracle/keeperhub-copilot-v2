import "server-only";

/*
 * The one execution door (Story 1.4, spine AD-4). routeToolCall is THE single
 * entry the chat route's tool.execute fns call now, and the voice data channel
 * calls in Epic 4 — the AI SDK never talks to KeeperHub around it. The flow for
 * the three KeeperHub verbs is resolve → gate → validate → call → map;
 * search_actions runs locally (no network).
 *
 * This story implements the READ slice of the AD-6 gate: reads pass with zero
 * friction (AC 4); anything not a read is refused with a structured payload the
 * model reads and explains. Epic 2 extends the same gate to the ceremony
 * classes. No expected outcome throws — success and every refusal/error return
 * as a structured ToolOutput so the model can repair or explain and the
 * conversation continues (a throttle never fails it).
 */
import type { z } from "zod";

import { checkAutomationDefinition } from "@/lib/automations/proposal";
import { readSettledRun } from "@/lib/automations/shape";
import type { LedgerEntryRow } from "@/lib/data";
import {
  deriveIdempotencyKey,
  extractExecutionId,
  extractTxHash,
  listStaleIntents,
  readLedgerRow,
  recordDecline,
  recordExecutionId,
  recordRead,
  writeIntent,
  writeRunIntent,
  writeTerminal,
  type TerminalWriteResult,
} from "@/lib/ledger";
import { callTool, type McpError } from "@/lib/mcp";
import {
  getInputSchema,
  integrations,
  resolveMixedEffect,
  resolveOperation,
  runsDirectly,
  type EffectClass,
  type OperationEntry,
} from "@/lib/registry";
// The Solana-chain classification is shared with the client write card (Story 2.4,
// D20): ONE definition so the server's simulate refusal and the client's
// data-derived `simulated | no-preview` chip can never drift apart (AD-6).
import { isSolanaChainId } from "@/lib/registry/simulatability";
import {
  AUTOMATION_ONLY_NOTE,
  searchActions,
  type SearchActionsResult,
  type SurfaceToolName,
} from "@/lib/registry/surface-tools";
import type { AuthenticatedSession } from "@/lib/session";
import type { InsufficientScope } from "@/lib/session/insufficient-scope";

import {
  invalidateBoundIntegrations,
  normalizeIntegrationKey,
  resolveBoundIntegrations,
} from "./credentials.ts";
import {
  automationChangeLanded,
  isAutomationChangeOp,
  runAutomationTool,
  type AutomationToolOutput,
} from "./automations.ts";
import { toExecutionError } from "./errors.ts";
import { runOrgWalletBalances, type HoldingsOutput } from "./holdings.ts";

export {
  automationSwitchPreview,
  switchAutomationFromCard,
  type AutomationPreview,
  type AutomationReceipt,
  type SwitchPreview,
} from "./automations.ts";

export type ExecutionErrorCode =
  | "write_not_available"
  // Decision 35: KeeperHub runs this action only inside an automation; the model reroutes.
  | "automation_only"
  | "quarantined"
  | "validation_failed"
  | "unknown_tool"
  // Story 2.3: a confirmed write that could not be recorded or verified before
  // it would broadcast (intent-write failure, undeterminable credential) — an
  // honest internal stop, never a silent proceed.
  | "server_error"
  | McpError["code"];

export type FieldIssue = { path: string; message: string };

export type ExecutionError = {
  code: ExecutionErrorCode;
  message: string;
  /** Decoded revert reasons / structured payloads — verbatim. */
  decoded?: unknown;
  /** Field-level validation issues, for the model to repair. */
  issues?: FieldIssue[];
  /** Seconds, when code === "rate_limited". */
  retryAfter?: number;
  /** Normalized insufficient_scope payload (FR38 re-auth), when applicable. */
  scope?: InsufficientScope;
};

/** The KeeperHub verbs that can carry a write (Story 2.3; execute_transfer 2.5
 *  D25). Their ceremony outputs (simulated / no-preview / receipt) share these
 *  tool discriminators. */
export type WriteToolName =
  | "execute_protocol_action"
  | "execute_contract_call"
  | "execute_transfer";

/**
 * The tool output the model reads and the renderer draws. Discriminated by
 * `tool` + `ok`, plus the `state` field on the ceremony pre/terminal states.
 * execute_protocol_action success carries opId + fingerprint so the renderer can
 * key registry-backed rendering (and drift checks).
 */
export type ToolOutput =
  | { ok: true; tool: "search_actions"; result: SearchActionsResult }
  | {
      ok: true;
      tool: "execute_protocol_action";
      opId: string;
      fingerprint: string;
      data: unknown;
    }
  | {
      /**
       * The pre-confirm simulate PREVIEW (Story 2.3, AC 1). A simulable write
       * (an EVM contract call) dry-runs `simulate:true` and returns the decoded
       * effects + gas here. Served by the simulate endpoint to the write card
       * BEFORE Confirm is possible — never persisted, never a broadcast.
       */
      ok: true;
      tool: WriteToolName;
      state: "simulated";
      preview: unknown;
      opId?: string;
    }
  | {
      /**
       * The pre-confirm NO-PREVIEW coercion (Story 2.3, AC 2). A write the
       * platform structurally cannot simulate (a protocol action, Solana, an
       * off-chain send) says so plainly — the card shows the exact instruction to
       * confirm, never a silent pass to `simulated` (AD-6).
       */
      ok: true;
      tool: WriteToolName;
      state: "no-preview";
      opId?: string;
    }
  | {
      /**
       * The post-confirm verified RECEIPT (Story 2.3, AC 4). Written only after
       * the AD-5 approval verifies and the write broadcasts; the terminal ledger
       * row carries the same txHash + receipt (AD-2). Renders the receipt card.
       */
      ok: true;
      tool: WriteToolName;
      state: "receipt";
      txHash: string | null;
      receipt: unknown;
      opId?: string;
      executionId?: string;
    }
  | {
      ok: true;
      tool: "execute_protocol_action";
      /**
       * The FR7 needs-credential pre-state (D8): a bound credential is required
       * before this op can run. Not a success, not an error — setup. The `state`
       * discriminator routes select-renderer to the setup card, NEVER the read
       * card (registry key + persisted part state; the model never selects a
       * renderer).
       */
      state: "needs-credential";
      opId: string;
      /** The integration key the user must bind ("web3", "safe", ...). */
      integration: string;
      /** Model-readable + card-visible setup explanation (copy law). */
      message: string;
    }
  | { ok: true; tool: "execute_contract_call"; data: unknown }
  | { ok: true; tool: "get_wallet_integration"; data: unknown }
  // Automations from chat (decisions 19–21): list, describe, and the change previews and receipts.
  | AutomationToolOutput
  // The org wallet's holdings (decision 34).
  | HoldingsOutput
  | { ok: false; tool: SurfaceToolName; error: ExecutionError };

/**
 * The two ceremony phases a write can be routed in (Story 2.3). Absent = the
 * read path: a write neither simulates nor broadcasts, it is refused. Set ONLY by
 * trusted server code, never from client input:
 * - "broadcast": `buildTools.execute` sets it — reachable only AFTER the AI SDK
 *   verifies the confirm (AD-5), so a broadcast implies a verified approval.
 * - "simulate": the simulate endpoint sets it for the pre-confirm dry-run.
 * The re-run path passes neither, so a write there can never broadcast (a contract
 * call still simulates by the forced-simulate guarantee; a protocol write refuses).
 */
export type WritePhase = "simulate" | "broadcast";

export type RouteToolCallInput = {
  session: AuthenticatedSession;
  toolName: string;
  args: unknown;
  requestId: string;
  signal?: AbortSignal;
  /**
   * Story 2.3: which ceremony phase authorizes this write. Absent on reads and
   * the re-run path. See WritePhase — a client can never set it; only
   * `buildTools.execute` (post-approval) and the simulate endpoint do.
   */
  write?: WritePhase;
  /**
   * Story 2.2 review Patch: schedule the best-effort read-record OFF the response
   * path. The live routes pass Next's `after`, so a slow or hung ledger insert can
   * neither add latency to nor fail the read. Absent (tests, and any non-route
   * caller) → the record runs inline, awaited. Injecting the scheduler here keeps
   * lib/execution framework-agnostic — this module never imports `next`.
   */
  deferBackground?: (task: () => Promise<void>) => void;
  /**
   * Story 2.2 (AC 5, D12): the conversation and tool-call ids the ledger row is
   * keyed and correlated by. Both live paths supply them — the model path reads
   * toolCallId from the AI SDK's ToolCallOptions; the re-run path mints it. They
   * ride every call (only the protocol-action read records in 2.2), so a read is
   * always recordable and, from 2.3, a write intent row always has its key.
   */
  conversationId: string;
  toolCallId: string;
  /**
   * Story 2.1 D9: the persisted fingerprint of the card being re-run (the rerun
   * path threads it from the read card). A mismatch against the registry's
   * current fingerprint quarantines the op as drifted. Absent on the model path
   * (a fresh proposal has no prior fingerprint to check against).
   */
  expectedFingerprint?: string;
  /**
   * Whether a protocol-action read lands a ledger row. Default true. The price
   * card's history lookups pass false: they are the card's own chart data, not
   * reads the person asked for, so they stay out of Activity.
   */
  recordRead?: boolean;
};

export async function routeToolCall(
  input: RouteToolCallInput,
): Promise<ToolOutput> {
  const {
    session,
    toolName,
    args,
    requestId,
    signal,
    expectedFingerprint,
    conversationId,
    toolCallId,
    deferBackground,
    write,
    recordRead = true,
  } = input;
  switch (toolName) {
    case "search_actions":
      return runSearch(args);
    case "execute_protocol_action":
      return runProtocolAction(
        session,
        args,
        requestId,
        signal,
        expectedFingerprint,
        conversationId,
        toolCallId,
        deferBackground,
        write,
        recordRead,
      );
    case "execute_contract_call":
      return runContractCall(
        session,
        args,
        requestId,
        signal,
        conversationId,
        toolCallId,
        write,
      );
    case "execute_transfer":
      return runTransfer(
        session,
        args,
        requestId,
        signal,
        conversationId,
        toolCallId,
        write,
      );
    case "get_wallet_integration":
      return runWalletIntegration(session, args, requestId, signal);
    case "list_automations":
    case "get_automation":
    case "create_automation":
    case "set_automation_enabled":
    case "update_automation":
    case "run_automation":
    case "delete_automation":
      return runAutomationTool({ session, toolName, args, requestId, signal, conversationId, toolCallId, write });
    case "get_org_wallet_balances":
      return runOrgWalletBalances(session, args);
    case "request_input":
      // Decision 32: a form is answered by the person on screen, never run here.
      return { ok: false, tool: toolName, error: { code: "tool_error", message: "This form is answered by the person on screen." } };
    default:
      return {
        ok: false,
        tool: toolName as SurfaceToolName,
        error: {
          code: "unknown_tool",
          message: `The tool "${toolName}" is not available.`,
        },
      };
  }
}

// --- search_actions (local, no network) --------------------------------------

function runSearch(args: unknown): ToolOutput {
  const record = asRecord(args);
  const result = searchActions({
    query: asString(record.query),
    integration: asString(record.integration),
    effect: asString(record.effect),
  });
  return { ok: true, tool: "search_actions", result };
}

// --- execute_protocol_action -------------------------------------------------

async function runProtocolAction(
  session: AuthenticatedSession,
  args: unknown,
  requestId: string,
  signal: AbortSignal | undefined,
  expectedFingerprint: string | undefined,
  conversationId: string,
  toolCallId: string,
  deferBackground?: (task: () => Promise<void>) => void,
  write?: WritePhase,
  recordRead = true,
): Promise<ToolOutput> {
  const tool = "execute_protocol_action" as const;
  const record = asRecord(args);
  const actionType = asString(record.actionType) ?? "";
  const params = asRecord(record.params);

  // Classification step 1 (D7/D9): resolve the op. An absent, drifted, or
  // quarantined-class op has no resolvable effect class -> quarantined, which
  // carries no execution path. `expectedFingerprint` (the re-run's persisted
  // card fingerprint) makes the "drifted" trigger real: a mismatch against the
  // registry's current fingerprint quarantines before any network call.
  const resolved = resolveOperation(actionType, { expectedFingerprint });
  if (resolved.status !== "ok") {
    logGate("gate_quarantine", {
      requestId,
      orgId: session.orgId,
      opId: actionType,
      reason: resolved.reason,
    });
    return {
      ok: false,
      tool,
      error: {
        code: "quarantined",
        message: quarantineMessage(actionType, resolved.reason),
      },
    };
  }
  const entry = resolved.entry;
  // Decision 35: KeeperHub answers 501 for any action that is not a protocol
  // contract action, so refuse it before any credential check or card, with the
  // routes that do work, and the model tries one of those instead.
  if (!runsDirectly(entry)) {
    logGate("gate_automation_only", { requestId, orgId: session.orgId, opId: actionType });
    return {
      ok: false,
      tool,
      error: { code: "automation_only", message: `${entry.label}: ${AUTOMATION_ONLY_NOTE}` },
    };
  }
  // Classification step 2 (D7): the resolved op's effect class IS the operation-
  // time resolution of the execute_protocol_action mixed-effect aggregate tool
  // (AGGREGATE_EXECUTION_TOOLS.execute_protocol_action). Every branch below keys
  // off this single explicit class — no path reaches the wire unclassified.
  const effectClass = entry.effectClass;

  // The needs-credential axis (D8), keyed off `needsCredential` INDEPENDENT of
  // the effect class and BEFORE the read/write gate: a gated write with no bound
  // wallet shows setup (not "writes not available"), and a gated READ shows
  // setup (not a raw downstream credential error).
  //
  // Fail direction (D17b, Story 2.3): reads and the pre-confirm phases keep the
  // 2.1 fail-open posture (undeterminable -> proceed; NFR7). A BROADCAST write
  // fails CLOSED: an undeterminable binding must NOT let a gated write reach the
  // wire — one caller's throttle can never silently relax another's gate.
  if (entry.needsCredential) {
    const required = entry.credentialIntegrationType ?? entry.integration;
    const bound = await resolveBoundIntegrations({ session, requestId, signal });
    const unbound = bound !== undefined && !bound.has(normalizeIntegrationKey(required));
    if (unbound) {
      logGate("gate_needs_credential", {
        requestId,
        orgId: session.orgId,
        opId: actionType,
        integration: required,
      });
      // Recovery (DN1): forget the memoized unbound set so a bind-then-ask on the
      // next turn re-checks live rather than serving this stale "unbound" for the
      // TTL. Only on the unbound return — a bound proceed keeps the memo.
      invalidateBoundIntegrations(session.orgId);
      return {
        ok: true,
        tool,
        state: "needs-credential",
        opId: actionType,
        integration: required,
        message: needsCredentialMessage(entry, required),
      };
    }
    if (bound === undefined && write === "broadcast" && effectClass !== "read") {
      // Undeterminable binding on the confirmed broadcast path: fail closed. Never
      // broadcast a gated WRITE on an unverifiable credential (D17b). A gated READ
      // keeps the 2.1 fail-open posture (a throttle never fails a read — NFR7): the
      // model path passes write:"broadcast" for EVERY tool, so this guard MUST qualify
      // on the write effect class or it would wrongly fail a read closed (review P3).
      // No intent row.
      logGate("gate_credential_undeterminable_write", {
        requestId,
        orgId: session.orgId,
        opId: actionType,
        integration: required,
      });
      return {
        ok: false,
        tool,
        error: {
          code: "server_error",
          message:
            "We could not confirm your setup for this action, so it was not run. Try again in a moment.",
        },
      };
    }
  }

  // The write gate (AD-6, Story 2.3). A non-read runs ONLY through the confirm
  // ceremony's broadcast phase; every other path is pre-confirm or refused.
  if (effectClass !== "read") {
    if (write === "broadcast") {
      // Defense in depth (review P4): the SDK approval gate is keyed on
      // CEREMONY_WRITE_CLASSES (requiresConfirmation); the broadcast branch shares
      // that predicate so the two can never silently diverge. A non-read class
      // OUTSIDE the ceremony set (e.g. a future listing-payment ever reachable here)
      // has NOT cleared a confirm — refuse it fail-closed rather than broadcast
      // unconfirmed. Today the reachable protocol-action write classes are all in the
      // set, so this never fires; it is the structural guard, not a live branch.
      if (!CEREMONY_WRITE_CLASSES.has(effectClass)) {
        logGate("gate_write_refused", {
          requestId,
          orgId: session.orgId,
          opId: actionType,
          effectClass,
        });
        return {
          ok: false,
          tool,
          error: {
            code: "write_not_available",
            message: writeNotAvailableMessage(entry),
          },
        };
      }
      // Post-confirm: the AI SDK already verified the approval (AD-5), so a
      // broadcast here implies the person confirmed this exact instruction.
      return broadcastProtocolAction({
        session,
        entry,
        actionType,
        params,
        effectClass,
        requestId,
        signal,
        conversationId,
        toolCallId,
      });
    }
    if (write === "simulate") {
      // Pre-confirm: a protocol action structurally cannot simulate (D15), so the
      // preview coerces to no-preview — the card shows the exact instruction to
      // confirm, never a silent pass to `simulated` (AD-6).
      return { ok: true, tool, state: "no-preview", opId: actionType };
    }
    // No phase authorized this write to run (the re-run path, or a stray call):
    // never broadcast, never write an intent row. A write only runs through the
    // ceremony's confirmed execute.
    logGate("gate_write_refused", {
      requestId,
      orgId: session.orgId,
      opId: actionType,
      effectClass,
    });
    return {
      ok: false,
      tool,
      error: {
        code: "write_not_available",
        message: writeNotAvailableMessage(entry),
      },
    };
  }

  // A READ has no simulate preview, and the /api/chat/simulate dry-run endpoint is
  // side-effect-free by contract (review P8): from the simulate phase, never execute
  // the read nor record a ledger row — coerce to no-preview (the card shows the exact
  // instruction). The normal chat read path (write:"broadcast" or unset) is unaffected.
  if (write === "simulate") {
    return { ok: true, tool, state: "no-preview", opId: actionType };
  }

  // Validate BEFORE the network — a bad call spends zero rate budget.
  const schema = getInputSchema(actionType);
  if (schema === undefined) {
    return {
      ok: false,
      tool,
      error: {
        code: "quarantined",
        message: quarantineMessage(actionType, "absent"),
      },
    };
  }
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    return {
      ok: false,
      tool,
      error: {
        code: "validation_failed",
        message: "Some parameters need adjusting before this can run.",
        issues: toFieldIssues(parsed.error),
      },
    };
  }

  // Merge hidden passthrough defaults — dropping them breaks routing.
  const wireParams = { ...entry.passthroughDefaults, ...parsed.data };
  const result = await callTool({
    accessToken: session.accessToken,
    orgId: session.orgId,
    userId: session.userId,
    name: tool,
    args: { actionType, params: wireParams },
    // Retry-eligibility DERIVES from the resolved effect class (D7.5), never a
    // caller literal — a read may take lib/mcp's one sanctioned rate-limit retry;
    // a write never may. The gate now owns the invariant.
    idempotent: idempotentForClass(effectClass),
    requestId,
    signal,
  });
  if (!result.ok) {
    return toErrorOutput(tool, result.error);
  }
  // Record the read as a durable ledger fact (AC 5, D12): state "read", no
  // receipt. Best-effort — the read's value never gates on its evidence landing.
  // NOT recorded for the two non-registry read verbs (execute_contract_call /
  // get_wallet_integration): they carry no opId/fingerprint (D12). A caller that
  // reads for its own purposes (the price card's history) opts out.
  if (recordRead) {
    await recordReadBestEffort({
      session,
      conversationId,
      toolCallId,
      opId: actionType,
      confirmedInputs: wireParams,
      schemaFingerprint: entry.fingerprint,
      requestId,
      deferBackground,
    });
  }
  return {
    ok: true,
    tool,
    opId: actionType,
    fingerprint: entry.fingerprint,
    data: result.data,
  };
}

/**
 * Record a protocol-action read as a durable ledger row (AC 5, D12) WITHOUT
 * blocking the read: a ledger-write failure logs `ledger_read_record_failed`
 * (NFR2 correlation) and the read still returns its data. Reads are
 * non-value-moving — their evidence value must never gate their function (NFR7,
 * the lib/execution contract that nothing throws into the conversation).
 */
async function recordReadBestEffort(input: {
  session: AuthenticatedSession;
  conversationId: string;
  toolCallId: string;
  opId: string;
  confirmedInputs: Record<string, unknown>;
  schemaFingerprint: string;
  requestId: string;
  deferBackground?: (task: () => Promise<void>) => void;
}): Promise<void> {
  // The record NEVER blocks or fails the read (NFR7): a failure is caught and
  // logged, and the read result returns regardless. On the live routes
  // `deferBackground` (Next's `after`) also runs it OFF the response path, so a
  // slow or hung ledger insert cannot add latency to — or fail — the read.
  const task = async (): Promise<void> => {
    try {
      await recordRead({
        session: input.session,
        conversationId: input.conversationId,
        toolCallId: input.toolCallId,
        opId: input.opId,
        confirmedInputs: input.confirmedInputs,
        schemaFingerprint: input.schemaFingerprint,
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "ledger_read_record_failed",
          conversationId: input.conversationId,
          toolCallId: input.toolCallId,
          opId: input.opId,
          requestId: input.requestId,
          orgId: input.session.orgId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };
  if (input.deferBackground) {
    input.deferBackground(task);
    return;
  }
  await task();
}

// --- the durable decline terminal (Story 2.4, AD-2 sole writer) --------------

/**
 * Record a declined write as the durable ledger `declined` terminal (Story 2.4,
 * AC 2, D21). AD-2: lib/execution is the SOLE ledger writer. A decline moves no
 * value; its AUTHORITATIVE fact is the SDK-native `output-denied` transcript part,
 * and this row is the queryable evidence overlay — so it is best-effort-but-loud
 * (surfaced-decision 3): a transient DB error is logged (never a silent catch —
 * project-context.md:49-50) and the person's "no" still resolves. The row is BORN
 * terminal (a fresh insert), never a CAS — a declined card has no intent row. The
 * `(org, tool_call_id)` unique index makes a double-decline a caught unique
 * violation → one row (treated as already-declined).
 */
export async function recordWriteDecline(input: {
  session: AuthenticatedSession;
  conversationId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
  requestId: string;
}): Promise<void> {
  const reviewed = asRecord(input.input);
  const { opId, schemaFingerprint } = declineOpIdentity(input.toolName, reviewed);
  try {
    await recordDecline({
      session: input.session,
      conversationId: input.conversationId,
      toolCallId: input.toolCallId,
      opId,
      // The exact instruction the person reviewed and refused, verbatim (AD-11: any
      // amount rides as its integer base-unit string, never reshaped).
      confirmedInputs: reviewed,
      schemaFingerprint,
    });
  } catch (error) {
    logDeclineRecordFailed(input, error);
  }
}

/**
 * The declined row's op identity, mirroring the intent row's: a protocol action is
 * keyed by its actionType and stamps its registry fingerprint (null if the op no
 * longer resolves — the decline is still recorded as evidence of what was refused);
 * a contract call carries no registry slug, so opId is the verb and the fingerprint
 * is null (broadcastContractCall's `opId: tool` pattern).
 */
function declineOpIdentity(
  toolName: string,
  input: Record<string, unknown>,
): { opId: string; schemaFingerprint: string | null } {
  if (toolName === "execute_protocol_action") {
    const actionType = asString(input.actionType) ?? "";
    const resolved = actionType !== "" ? resolveOperation(actionType) : undefined;
    return {
      opId: actionType !== "" ? actionType : toolName,
      schemaFingerprint:
        resolved !== undefined && resolved.status === "ok"
          ? resolved.entry.fingerprint
          : null,
    };
  }
  return { opId: toolName, schemaFingerprint: null };
}

/** A caught decline-record error: a benign duplicate (the idempotency guard doing
 *  its job) logs at info; a genuine DB failure logs loudly. Both greppable (NFR2),
 *  never silent. */
function logDeclineRecordFailed(
  input: {
    conversationId: string;
    toolCallId: string;
    requestId: string;
    session: AuthenticatedSession;
  },
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : String(error);
  const duplicate = isUniqueViolation(message);
  const line = JSON.stringify({
    event: duplicate ? "ledger_decline_duplicate" : "ledger_decline_record_failed",
    conversationId: input.conversationId,
    toolCallId: input.toolCallId,
    requestId: input.requestId,
    orgId: input.session.orgId,
    message,
  });
  if (duplicate) {
    console.log(line);
  } else {
    console.error(line);
  }
}

/** Whether a caught DB error is the (org, tool_call_id) unique-index violation —
 *  the structural double-decline guard working (Postgres 23505). */
function isUniqueViolation(message: string): boolean {
  return (
    message.includes("23505") ||
    message.includes("duplicate key") ||
    message.includes("ledger_entry_org_tool_call_idx")
  );
}

// --- execute_contract_call (read + the ceremony's simulate/broadcast) --------

const CONTRACT_MUTABILITIES = ["view", "pure", "nonpayable", "payable"] as const;
type ContractMutability = (typeof CONTRACT_MUTABILITIES)[number];

async function runContractCall(
  session: AuthenticatedSession,
  args: unknown,
  requestId: string,
  signal: AbortSignal | undefined,
  conversationId: string,
  toolCallId: string,
  write?: WritePhase,
): Promise<ToolOutput> {
  const tool = "execute_contract_call" as const;
  const record = asRecord(args);

  const contractAddress = asString(record.contract_address);
  const chainId = asString(record.chain_id);
  const functionName = asString(record.function_name);
  const missing = [
    contractAddress ? null : "contract_address",
    chainId ? null : "chain_id",
    functionName ? null : "function_name",
  ].filter((key): key is string => key !== null);
  if (missing.length > 0) {
    return {
      ok: false,
      tool,
      error: {
        code: "validation_failed",
        message: `Missing required fields: ${missing.join(", ")}.`,
        issues: missing.map((path) => ({ path, message: "required" })),
      },
    };
  }

  // Simulation is EVM-only: KeeperHub rejects `simulate` on Solana chains, so a
  // Solana contract call can never be given the no-broadcast dry-run guarantee
  // the ceremony's preview rests on — refuse it rather than send it un-simulated
  // (broadcast for Solana contract calls arrives with the bespoke cards, 2.5).
  if (isSolanaChainId(chainId)) {
    logGate("gate_write_refused", {
      requestId,
      orgId: session.orgId,
      tool,
      reason: "solana-no-simulate",
      chainId,
    });
    return {
      ok: false,
      tool,
      error: {
        code: "write_not_available",
        message:
          "Contract calls on Solana are not available in this release. Ask for a Solana read through a protocol action instead.",
      },
    };
  }

  // The model DECLARES stateMutability; a state-changing value resolves to a
  // write. Untrustworthy (below), so it decides the ceremony, never the safety.
  const mutability = record.stateMutability;
  const isWrite =
    isContractMutability(mutability) &&
    resolveMixedEffect({ tool, stateMutability: mutability }) !== "read";

  // The CONFIRMED broadcast leg (Story 2.3, AC 4): only a write the AI SDK
  // already approved (write === "broadcast"). This is the ONLY path that sends
  // `simulate:false`; a broadcast here implies the person confirmed the exact
  // instruction shown (AD-5). Everything else falls through to forced simulate.
  if (isWrite && write === "broadcast") {
    return broadcastContractCall({
      session,
      record,
      contractAddress: contractAddress as string,
      chainId: chainId as string,
      functionName: functionName as string,
      requestId,
      signal,
      conversationId,
      toolCallId,
    });
  }

  // Forced simulate:true — the hard no-broadcast guarantee (Story 1.4). Covers
  // reads, the pre-confirm dry-run of a write (AC 1), and ANY un-authorized write
  // path (a re-run, a stray call): the wire call can never broadcast, whatever
  // the model claimed. The guarantee does NOT rest on stateMutability.
  const wireArgs: Record<string, unknown> = {
    contract_address: contractAddress,
    chain_id: chainId,
    function_name: functionName,
    simulate: true,
  };
  const functionArgs = asString(record.function_args);
  if (functionArgs !== undefined) {
    wireArgs.function_args = functionArgs;
  }
  const abi = asString(record.abi);
  if (abi !== undefined) {
    wireArgs.abi = abi;
  }

  // Classification (D7): the forced simulate:true guarantee makes the wire call
  // a READ regardless of the model-declared mutability (the security boundary),
  // so retry-eligibility is the read class — derived, never a caller literal.
  const result = await callTool({
    accessToken: session.accessToken,
    orgId: session.orgId,
    userId: session.userId,
    name: tool,
    args: wireArgs,
    idempotent: idempotentForClass("read"),
    requestId,
    signal,
  });
  if (!result.ok) {
    return toErrorOutput(tool, result.error);
  }
  // A write being previewed (the simulate phase) → the decoded simulate preview
  // (AC 1); a plain read → the read data (unchanged from 1.4).
  if (isWrite && write === "simulate") {
    return { ok: true, tool, state: "simulated", preview: result.data };
  }
  return { ok: true, tool, data: result.data };
}

/**
 * The post-confirm contract-call broadcast (Story 2.3, AC 4). Intent BEFORE the
 * wire (AD-2), then `simulate:false` + the durable idempotency key (D16), then
 * poll get_direct_execution_status to the verified receipt (NFR1), then the
 * write-once terminal. Reached ONLY from runContractCall's broadcast leg, i.e.
 * only after the AI SDK verified the approval.
 */
async function broadcastContractCall(input: {
  session: AuthenticatedSession;
  record: Record<string, unknown>;
  contractAddress: string;
  chainId: string;
  functionName: string;
  requestId: string;
  signal: AbortSignal | undefined;
  conversationId: string;
  toolCallId: string;
}): Promise<ToolOutput> {
  const tool = "execute_contract_call" as const;
  const { session, record, requestId, signal, conversationId, toolCallId } = input;

  // The confirmed tx-path inputs — stored on the intent row (AD-2) and sent on
  // the wire. Amounts travel as strings (money law); no floats.
  const confirmedInputs: Record<string, unknown> = {
    contract_address: input.contractAddress,
    chain_id: input.chainId,
    function_name: input.functionName,
  };
  for (const key of ["function_args", "abi", "value", "gas_limit_multiplier", "priority_fee_gwei"]) {
    const value = asString(record[key]);
    if (value !== undefined) {
      confirmedInputs[key] = value;
    }
  }

  // Durable intent BEFORE the wire (AD-2), NOT best-effort. A raw contract call
  // carries no registry slug/fingerprint, so the opId is the verb itself and the
  // fingerprint is null. If the intent write fails, do NOT broadcast.
  let intentId: string;
  try {
    const intentRow = await writeIntent({
      session,
      conversationId,
      toolCallId,
      opId: tool,
      confirmedInputs,
      schemaFingerprint: null,
    });
    intentId = intentRow.id;
  } catch (error) {
    logIntentWriteFailed({ tool, conversationId, toolCallId, requestId, session, error });
    return { ok: false, tool, error: intentWriteFailedError() };
  }

  const wireArgs: Record<string, unknown> = {
    ...confirmedInputs,
    simulate: false,
    idempotency_key: deriveIdempotencyKey(toolCallId),
  };
  const result = await callTool({
    accessToken: session.accessToken,
    orgId: session.orgId,
    userId: session.userId,
    name: tool,
    args: wireArgs,
    // A write NEVER takes lib/mcp's rate-limit retry (idempotentForClass → false).
    idempotent: idempotentForClass("value-moving-write"),
    requestId,
    signal,
  });
  if (!result.ok) {
    await writeTerminal({
      session,
      id: intentId,
      state: "failure",
      requestId,
      conversationId,
      toolCallId,
    });
    return toErrorOutput(tool, result.error);
  }

  // The broadcast returns { executionId, status }; poll to the verified receipt.
  const executionId = extractExecutionId(result.data);
  if (executionId !== null) {
    await recordExecutionId({ session, id: intentId, executionId, requestId });
  }
  const settled = await pollForReceipt({ session, executionId, requestId, signal });
  if (!settled.ok) {
    await writeTerminal({
      session,
      id: intentId,
      state: "failure",
      txHash: settled.txHash ?? null,
      receipt: settled.receipt,
      requestId,
      conversationId,
      toolCallId,
      ...(executionId !== null ? { executionId } : {}),
    });
    return {
      ok: false,
      tool,
      error: { code: "tool_error", message: settled.message, decoded: settled.decoded },
    };
  }
  const landed = await writeTerminal({
    session,
    id: intentId,
    state: "receipt",
    txHash: settled.txHash,
    receipt: settled.receipt,
    requestId,
    conversationId,
    toolCallId,
    ...(executionId !== null ? { executionId } : {}),
  });
  logTerminalIfNotLanded(landed, { tool, toolCallId, conversationId, requestId, session });
  return {
    ok: true,
    tool,
    state: "receipt",
    txHash: settled.txHash,
    receipt: settled.receipt,
    ...(executionId !== null ? { executionId } : {}),
  };
}

// --- execute_transfer (native + ERC-20 transfer; the simulating value-mover) -

/**
 * The transfer money-mover (Story 2.5, D25/D28/D29). Every transfer is a
 * value-moving write, so it ALWAYS runs the confirm ceremony. Mirrors
 * runContractCall: the confirmed broadcast leg runs ONLY on write === "broadcast"
 * (post-approval); every other path is the forced-simulate no-broadcast dry-run.
 * Unlike a Solana contract call it REFUSES nothing — a Solana transfer broadcasts
 * (KeeperHub's transfer route has a Solana branch) but cannot simulate, so its
 * pre-confirm phase coerces to `no-preview` (D28), never a refusal. The wire
 * `amount` is HUMAN units (D25/D26), parsed server-side by KeeperHub; it rides
 * verbatim, never reshaped (AD-11).
 */
async function runTransfer(
  session: AuthenticatedSession,
  args: unknown,
  requestId: string,
  signal: AbortSignal | undefined,
  conversationId: string,
  toolCallId: string,
  write?: WritePhase,
): Promise<ToolOutput> {
  const tool = "execute_transfer" as const;
  const record = asRecord(args);

  const chainId = asString(record.chain_id);
  const toAddress = asString(record.to_address);
  const amount = asString(record.amount);
  const missing = [
    chainId ? null : "chain_id",
    toAddress ? null : "to_address",
    amount ? null : "amount",
  ].filter((key): key is string => key !== null);
  if (missing.length > 0) {
    return {
      ok: false,
      tool,
      error: {
        code: "validation_failed",
        message: `Missing required fields: ${missing.join(", ")}.`,
        issues: missing.map((path) => ({ path, message: "required" })),
      },
    };
  }
  const tokenAddress = asString(record.token_address);

  // The CONFIRMED broadcast leg (AC 3/4): only a transfer the AI SDK already
  // approved (write === "broadcast"). EVM and Solana both broadcast here — the
  // KeeperHub transfer route dispatches by chain. This is the ONLY path that
  // sends simulate:false; a broadcast here implies the person confirmed the exact
  // instruction shown (AD-5).
  if (write === "broadcast") {
    return broadcastTransfer({
      session,
      chainId: chainId as string,
      toAddress: toAddress as string,
      amount: amount as string,
      tokenAddress,
      requestId,
      signal,
      conversationId,
      toolCallId,
    });
  }

  // Pre-confirm / re-run: NEVER broadcast. A Solana transfer cannot be simulated
  // (KeeperHub rejects `simulate` on Solana), so it coerces to `no-preview` — the
  // card shows the exact instruction to confirm (AD-6). Unlike a Solana CONTRACT
  // CALL it is NOT refused: a Solana transfer is broadcastable (D28).
  if (isSolanaChainId(chainId)) {
    return { ok: true, tool, state: "no-preview" };
  }

  // EVM: forced simulate:true dry-run — the hard no-broadcast guarantee. Returns
  // the decoded effects (→ `simulated`), or the decoded revert of an unaffordable
  // transfer (KeeperHub's nativeShortfallFailure surfaces as an error envelope the
  // card renders as "This would not succeed. <reason>" — AC 3).
  const wireArgs: Record<string, unknown> = {
    chain_id: chainId,
    to_address: toAddress,
    // The transfer wire amount is HUMAN units (D25/D26); it rides verbatim — no
    // float ever touches it (AD-11).
    amount,
    simulate: true,
  };
  if (tokenAddress !== undefined) {
    wireArgs.token_address = tokenAddress;
  }
  const result = await callTool({
    accessToken: session.accessToken,
    orgId: session.orgId,
    userId: session.userId,
    name: tool,
    args: wireArgs,
    // Forced simulate:true makes this a non-broadcasting read; retry-eligibility
    // derives from that class, never a caller literal.
    idempotent: idempotentForClass("read"),
    requestId,
    signal,
  });
  if (!result.ok) {
    return toErrorOutput(tool, result.error);
  }
  return { ok: true, tool, state: "simulated", preview: result.data };
}

/**
 * The post-confirm transfer broadcast (Story 2.5, D29). Mirrors
 * broadcastContractCall: intent BEFORE the wire (AD-2), then `simulate:false` +
 * the durable idempotency key (D16), then poll get_direct_execution_status for the
 * VERIFIED receipt, then the write-once terminal. execute_transfer returns a
 * terminal status + tx hash SYNCHRONOUSLY, but AD-2's independent-verification law
 * wants `receipts[].verified` from the status read — a transfer settles
 * synchronously so a single poll suffices (D29/D30). A transfer carries no
 * registry slug, so opId is the verb and the fingerprint is null. Reached ONLY
 * after the AI SDK verified the approval.
 */
async function broadcastTransfer(input: {
  session: AuthenticatedSession;
  chainId: string;
  toAddress: string;
  amount: string;
  tokenAddress: string | undefined;
  requestId: string;
  signal: AbortSignal | undefined;
  conversationId: string;
  toolCallId: string;
}): Promise<ToolOutput> {
  const tool = "execute_transfer" as const;
  const { session, requestId, signal, conversationId, toolCallId } = input;

  // The confirmed inputs — stored on the intent row (AD-2) and sent on the wire.
  // The amount is a human-unit string (D25/D26); no floats (money law).
  const confirmedInputs: Record<string, unknown> = {
    chain_id: input.chainId,
    to_address: input.toAddress,
    amount: input.amount,
  };
  if (input.tokenAddress !== undefined) {
    confirmedInputs.token_address = input.tokenAddress;
  }

  // Durable intent BEFORE the wire (AD-2), NOT best-effort: if the intent write
  // fails, do NOT broadcast. A transfer has no registry slug → opId = the verb,
  // fingerprint null (broadcastContractCall's pattern).
  let intentId: string;
  try {
    const intentRow = await writeIntent({
      session,
      conversationId,
      toolCallId,
      opId: tool,
      confirmedInputs,
      schemaFingerprint: null,
    });
    intentId = intentRow.id;
  } catch (error) {
    logIntentWriteFailed({ tool, conversationId, toolCallId, requestId, session, error });
    return { ok: false, tool, error: intentWriteFailedError() };
  }

  const wireArgs: Record<string, unknown> = {
    ...confirmedInputs,
    simulate: false,
    idempotency_key: deriveIdempotencyKey(toolCallId),
  };
  const result = await callTool({
    accessToken: session.accessToken,
    orgId: session.orgId,
    userId: session.userId,
    name: tool,
    args: wireArgs,
    // A write NEVER takes lib/mcp's rate-limit retry (idempotentForClass → false).
    idempotent: idempotentForClass("value-moving-write"),
    requestId,
    signal,
  });
  if (!result.ok) {
    await writeTerminal({
      session,
      id: intentId,
      state: "failure",
      requestId,
      conversationId,
      toolCallId,
    });
    return toErrorOutput(tool, result.error);
  }

  // The transfer returns { executionId, status, transactionHash } synchronously;
  // poll once to the VERIFIED receipt (receipts[].verified — AD-2, D29).
  const executionId = extractExecutionId(result.data);
  if (executionId !== null) {
    await recordExecutionId({ session, id: intentId, executionId, requestId });
  }
  const settled = await pollForReceipt({ session, executionId, requestId, signal });
  if (!settled.ok) {
    await writeTerminal({
      session,
      id: intentId,
      state: "failure",
      txHash: settled.txHash ?? null,
      receipt: settled.receipt,
      requestId,
      conversationId,
      toolCallId,
      ...(executionId !== null ? { executionId } : {}),
    });
    return {
      ok: false,
      tool,
      error: { code: "tool_error", message: settled.message, decoded: settled.decoded },
    };
  }
  const landed = await writeTerminal({
    session,
    id: intentId,
    state: "receipt",
    txHash: settled.txHash,
    receipt: settled.receipt,
    requestId,
    conversationId,
    toolCallId,
    ...(executionId !== null ? { executionId } : {}),
  });
  logTerminalIfNotLanded(landed, { tool, toolCallId, conversationId, requestId, session });
  return {
    ok: true,
    tool,
    state: "receipt",
    txHash: settled.txHash,
    receipt: settled.receipt,
    ...(executionId !== null ? { executionId } : {}),
  };
}

/**
 * The post-confirm protocol-action broadcast (Story 2.3, AC 4). A protocol action
 * cannot simulate and returns its tx hash INLINE (no executionId, D15), so there
 * is no poll: intent BEFORE the wire (AD-2), broadcast, then the write-once
 * terminal from the inline receipt. Reached ONLY after the AI SDK verified the
 * approval (via runProtocolAction's broadcast leg).
 */
async function broadcastProtocolAction(input: {
  session: AuthenticatedSession;
  entry: OperationEntry;
  actionType: string;
  params: Record<string, unknown>;
  effectClass: EffectClass;
  requestId: string;
  signal: AbortSignal | undefined;
  conversationId: string;
  toolCallId: string;
}): Promise<ToolOutput> {
  const tool = "execute_protocol_action" as const;
  const {
    session,
    entry,
    actionType,
    params,
    effectClass,
    requestId,
    signal,
    conversationId,
    toolCallId,
  } = input;

  // Validate BEFORE the network (a bad call spends zero rate budget), same as
  // reads. The confirmed instruction must still be well-formed.
  const schema = getInputSchema(actionType);
  if (schema === undefined) {
    return {
      ok: false,
      tool,
      error: { code: "quarantined", message: quarantineMessage(actionType, "absent") },
    };
  }
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    return {
      ok: false,
      tool,
      error: {
        code: "validation_failed",
        message: "Some parameters need adjusting before this can run.",
        issues: toFieldIssues(parsed.error),
      },
    };
  }
  const wireParams = { ...entry.passthroughDefaults, ...parsed.data };

  // Durable intent BEFORE the wire (AD-2), NOT best-effort: if the intent write
  // fails, do NOT broadcast — a write must be recorded before it can happen.
  let intentId: string;
  try {
    const intentRow = await writeIntent({
      session,
      conversationId,
      toolCallId,
      opId: actionType,
      confirmedInputs: wireParams,
      schemaFingerprint: entry.fingerprint,
    });
    intentId = intentRow.id;
  } catch (error) {
    logIntentWriteFailed({ tool, conversationId, toolCallId, requestId, session, error });
    return { ok: false, tool, error: intentWriteFailedError() };
  }

  const result = await callTool({
    accessToken: session.accessToken,
    orgId: session.orgId,
    userId: session.userId,
    name: tool,
    args: { actionType, params: wireParams },
    // A write NEVER takes lib/mcp's rate-limit retry (idempotentForClass → false).
    idempotent: idempotentForClass(effectClass),
    requestId,
    signal,
  });
  if (!result.ok) {
    await writeTerminal({
      session,
      id: intentId,
      state: "failure",
      requestId,
      conversationId,
      toolCallId,
    });
    return toErrorOutput(tool, result.error);
  }

  // A protocol action returns its outcome inline (D15). An MCP-ok result is NOT
  // proof of on-chain success (review P1, NFR1): KeeperHub re-verifies the tx and
  // returns HTTP 200 { success:false, error } on a broadcast-then-reverted write,
  // which the wire surfaces as ok:true. Treat an explicit success:false as a
  // FAILURE terminal with the decoded reason (AC 5), never a receipt.
  const data = asRecord(result.data);
  const txHash = extractTxHash(result.data);
  if (data.success === false) {
    const reason = asString(data.error) ?? "The transaction did not succeed.";
    const failed = await writeTerminal({
      session,
      id: intentId,
      state: "failure",
      txHash,
      receipt: result.data,
      requestId,
      conversationId,
      toolCallId,
    });
    logTerminalIfNotLanded(failed, { tool, toolCallId, conversationId, requestId, session });
    return {
      ok: false,
      tool,
      error: { code: "tool_error", message: reason, decoded: result.data },
    };
  }
  // The verified inline hash is the receipt evidence. Store it verbatim (AD-2).
  const settled = await writeTerminal({
    session,
    id: intentId,
    state: "receipt",
    txHash,
    receipt: result.data,
    requestId,
    conversationId,
    toolCallId,
  });
  logTerminalIfNotLanded(settled, { tool, toolCallId, conversationId, requestId, session });
  return { ok: true, tool, state: "receipt", opId: actionType, txHash, receipt: result.data };
}

// --- the receipt poll (get_direct_execution_status) --------------------------

/** A settled poll outcome: a verified receipt, or a decoded failure/revert. */
type PollResult =
  | { ok: true; txHash: string | null; receipt: unknown }
  | { ok: false; message: string; decoded?: unknown; receipt?: unknown; txHash?: string | null };

// Bounded so a hung execution can never hold the confirmed write open past the
// route's maxDuration (20 * 1500ms = 30s < 60s). The REST route's
// X-Poll-Interval-Hint is an HTTP header not surfaced through the MCP result, so
// 2.3 polls at a fixed interval; honoring the hint is a live-tuning item (2.5).
const POLL_MAX_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 1_500;

/**
 * Poll get_direct_execution_status until the execution settles, honoring the
 * independent-verification law (NFR1): the stored receipt is KeeperHub's verified
 * result, and a non-success receiptStatus is a FAILURE terminal, never a receipt.
 */
async function pollForReceipt(input: {
  session: AuthenticatedSession;
  executionId: string | null;
  requestId: string;
  signal: AbortSignal | undefined;
}): Promise<PollResult> {
  const { session, executionId, requestId, signal } = input;
  if (executionId === null) {
    return {
      ok: false,
      message:
        "The transaction was submitted but no execution id came back to confirm it. Check the record before trying again.",
    };
  }
  // Remembered across attempts so a transient status-read error does not fail the
  // write outright (review P2); only surfaced if the poll window exhausts.
  let lastTransientMessage: string | undefined;
  let lastTransientDecoded: unknown;
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
    const status = await callTool({
      accessToken: session.accessToken,
      orgId: session.orgId,
      userId: session.userId,
      name: "get_direct_execution_status",
      // KeeperHub's tool names it execution_id (fork lib/mcp/tools.ts:1935-1963).
      args: { execution_id: executionId },
      // A status read is idempotent — eligible for the one sanctioned retry.
      idempotent: true,
      requestId,
      signal,
    });
    if (!status.ok) {
      // A transient status-read error (throttle / transport / session blip) AFTER a
      // successful broadcast must NOT record a false failure for a tx that may have
      // landed (review P2, AD-2 truthfulness). Remember it, keep polling; surface a
      // failure only if the whole window exhausts with no settled receipt.
      lastTransientMessage = status.error.message;
      lastTransientDecoded = status.error.decoded;
      console.error(
        JSON.stringify({
          event: "poll_status_transient_error",
          executionId,
          attempt,
          requestId,
          message: status.error.message,
        }),
      );
      await sleepPoll(POLL_INTERVAL_MS, signal);
      continue;
    }
    const settled = readSettledReceipt(status.data);
    if (settled !== null) {
      return settled;
    }
    // Not terminal yet — wait and poll again.
    await sleepPoll(POLL_INTERVAL_MS, signal);
  }
  // Exhausted the window. If the last reads were transient errors, say so honestly —
  // the tx may have landed, so never present it as a definite failure (review P2).
  if (lastTransientMessage !== undefined) {
    return {
      ok: false,
      message:
        "The transaction was submitted but its status could not be confirmed. Check the record before trying again.",
      decoded: lastTransientDecoded,
    };
  }
  return {
    ok: false,
    message:
      "The transaction did not confirm in time. Check the record and try again if it did not land.",
  };
}

/** The receiptStatus values KeeperHub returns; only `success` is a receipt. */
const SUCCESS_RECEIPT_STATUS = "success";

/**
 * Read a get_direct_execution_status payload: a settled receipt (verified block
 * data), a decoded failure/revert, or null when still pending (keep polling).
 */
export function readSettledReceipt(data: unknown): PollResult | null {
  const record = asRecord(data);
  const receipts = record.receipts;
  const txHash = extractTxHash(data);
  if (Array.isArray(receipts) && receipts.length > 0) {
    const first = asRecord(receipts[0]);
    const receiptStatus = asString(first.receiptStatus);
    if (receiptStatus === undefined) {
      return null; // a receipt row exists but has not resolved yet
    }
    if (receiptStatus === SUCCESS_RECEIPT_STATUS) {
      return { ok: true, txHash, receipt: data };
    }
    // reverted / safe_inner_failure / timeout / not_found → a failure terminal
    // with the decoded human reason (AC 5). Never a receipt.
    return {
      ok: false,
      message: receiptFailureMessage(receiptStatus, first),
      decoded: first,
      receipt: data,
      txHash,
    };
  }
  // No receipts yet — a terminal top-level status is still honoured as a failure.
  const status = asString(record.status);
  if (status === "failed" || status === "error" || status === "reverted") {
    return {
      ok: false,
      message: "The transaction did not succeed.",
      decoded: data,
      receipt: data,
      txHash,
    };
  }
  return null; // still pending
}

/** The decoded human reason for a non-success receiptStatus (copy law). */
function receiptFailureMessage(
  receiptStatus: string,
  receipt: Record<string, unknown>,
): string {
  const decoded = asString(receipt.revertReason) ?? asString(receipt.reason);
  if (decoded !== undefined && decoded !== "") {
    return decoded;
  }
  switch (receiptStatus) {
    case "reverted":
      return "The transaction reverted on chain.";
    case "safe_inner_failure":
      return "The transaction was included but its inner call failed.";
    case "timeout":
      return "The transaction timed out before it confirmed.";
    case "not_found":
      return "The transaction could not be found on chain.";
    default:
      return "The transaction did not succeed.";
  }
}

// Abort-aware sleep for the poll backoff: resolve early on the caller's abort so
// the next attempt sees the aborted signal and stops. (Mirrors lib/mcp's sleep.)
function sleepPoll(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      resolve();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// --- recovery on return (Masayume features/recovery/WriteRecovery.tsx) -------

/**
 * What recovery found for a write left open: a tab closed while its receipt was
 * still being polled, or a dropped connection. Nothing is re-sent; a row moves
 * only on KeeperHub's answer, exactly as Masayume's journal moves only on the
 * chain's.
 */
export type RecoveryOutcome = "landed" | "failed" | "expired" | "pending";

export type RecoveredWrite = {
  ledgerId: string;
  opId: string;
  outcome: RecoveryOutcome;
  txHash: string | null;
};

// Longer than a live write can still be polling (a 30s window inside a 60s
// route), so recovery never races the request that owns the row.
export const RECOVERY_MIN_AGE_MS = 2 * 60_000;
// KeeperHub's idempotency window. Past it an intent that never got an execution
// id cannot be matched to anything, so it closes as expired.
export const RECOVERY_EXPIRY_MS = 24 * 60 * 60_000;
const RECOVERY_BATCH = 10;

export async function recoverOpenWrites(input: {
  session: AuthenticatedSession;
  requestId: string;
  now?: number;
  signal?: AbortSignal;
}): Promise<RecoveredWrite[]> {
  const now = input.now ?? Date.now();
  const rows = await listStaleIntents(input.session, {
    createdBefore: new Date(now - RECOVERY_MIN_AGE_MS),
    limit: RECOVERY_BATCH,
  });
  const results: RecoveredWrite[] = [];
  for (const row of rows) {
    results.push(await recoverOne({ ...input, row, now }));
  }
  return results;
}

async function recoverOne(input: {
  session: AuthenticatedSession;
  requestId: string;
  signal?: AbortSignal;
  row: LedgerEntryRow;
  now: number;
}): Promise<RecoveredWrite> {
  const { session, requestId, signal, row, now } = input;
  const base = { ledgerId: row.id, opId: row.opId };
  const correlation = {
    requestId,
    ...(row.conversationId !== null ? { conversationId: row.conversationId } : {}),
    ...(row.toolCallId !== null ? { toolCallId: row.toolCallId } : {}),
  };

  // An automation change has no execution to ask about: the automation as
  // KeeperHub has it now says whether the change took effect.
  if (isAutomationChangeOp(row.opId)) {
    if (await automationChangeLanded({ session, row, requestId, signal })) {
      const landed = await writeTerminal({
        session,
        id: row.id,
        state: "receipt",
        receipt: { workflowId: row.workflowId, recovered: true },
        ...correlation,
      });
      return recoveredFrom(base, landed, "landed", null);
    }
    if (now - row.createdAt.getTime() < RECOVERY_EXPIRY_MS) {
      return { ...base, outcome: "pending", txHash: null };
    }
    const expired = await writeTerminal({ session, id: row.id, state: "expired", ...correlation });
    return recoveredFrom(base, expired, "expired", null);
  }

  const executionId = row.keeperhubExecutionId;
  if (executionId === null) {
    if (now - row.createdAt.getTime() < RECOVERY_EXPIRY_MS) {
      return { ...base, outcome: "pending", txHash: null };
    }
    const expired = await writeTerminal({ session, id: row.id, state: "expired", ...correlation });
    return recoveredFrom(base, expired, "expired", null);
  }

  // An automation run is a workflow execution: its status comes from get_execution.
  if (row.workflowId) {
    const run = await readRunStatus({ session, executionId, requestId, signal });
    if (run === null || run.outcome === "pending") {
      return { ...base, outcome: "pending", txHash: null };
    }
    const written = await writeTerminal({
      session,
      id: row.id,
      state: run.outcome,
      txHash: run.txHash,
      receipt: run.receipt,
      executionId,
      ...correlation,
    });
    return recoveredFrom(base, written, run.outcome === "receipt" ? "landed" : "failed", run.txHash);
  }

  const status = await callTool({
    accessToken: session.accessToken,
    orgId: session.orgId,
    userId: session.userId,
    name: "get_direct_execution_status",
    // KeeperHub's tool names it execution_id (fork lib/mcp/tools.ts:1935-1963).
    args: { execution_id: executionId },
    idempotent: true,
    requestId,
    signal,
  });
  if (!status.ok) {
    return { ...base, outcome: "pending", txHash: null };
  }
  const settled = readSettledReceipt(status.data);
  if (settled === null) {
    return { ...base, outcome: "pending", txHash: null };
  }
  const txHash = settled.txHash ?? null;
  const written = await writeTerminal({
    session,
    id: row.id,
    state: settled.ok ? "receipt" : "failure",
    txHash,
    receipt: settled.receipt,
    executionId,
    ...correlation,
  });
  return recoveredFrom(base, written, settled.ok ? "landed" : "failed", txHash);
}

/** A terminal another writer already recorded is reported as that writer left
 *  it; any other miss stays pending rather than guessing. */
function recoveredFrom(
  base: { ledgerId: string; opId: string },
  result: TerminalWriteResult,
  outcome: RecoveryOutcome,
  txHash: string | null,
): RecoveredWrite {
  if (result.landed) {
    return { ...base, outcome, txHash };
  }
  if (result.reason === "lost-race") {
    const state = result.existing.state;
    const existing: RecoveryOutcome =
      state === "receipt" ? "landed" : state === "expired" ? "expired" : "failed";
    return { ...base, outcome: existing, txHash: result.existing.txHash };
  }
  return { ...base, outcome: "pending", txHash: null };
}

// --- automation runs (decision 18) -------------------------------------------

/*
 * Run now on the Automations page, or run_automation authorized on its chat
 * card (decision 21). The click is the authorization, as Authorize is on a
 * chat write card. Like a chat write: the intent row lands BEFORE the run is
 * triggered, the execution id is stamped as soon as KeeperHub returns it, and
 * the terminal is written only from KeeperHub's own execution status. Nothing
 * is ever re-sent. A chat run is keyed by its tool call, so a replayed approval
 * reaches KeeperHub under the same idempotency key.
 */

export type WorkflowRunStart =
  | { ok: true; ledgerId: string; executionId: string }
  | { ok: false; error: ExecutionError };

export async function startWorkflowRun(input: {
  session: AuthenticatedSession;
  workflowId: string;
  name: string;
  requestId: string;
  /** Present when the chat started it: the conversation and tool call the row belongs to. */
  chat?: { conversationId: string; toolCallId: string };
}): Promise<WorkflowRunStart> {
  const { session, workflowId, requestId, chat } = input;
  const idempotencyKey = chat !== undefined ? deriveIdempotencyKey(chat.toolCallId) : crypto.randomUUID();
  const confirmedInputs = { workflowId, name: input.name };

  let ledgerId: string;
  try {
    const row =
      chat !== undefined
        ? await writeIntent({
            session,
            conversationId: chat.conversationId,
            toolCallId: chat.toolCallId,
            opId: "workflow/run",
            confirmedInputs,
            schemaFingerprint: null,
            workflowId,
          })
        : await writeRunIntent({ session, workflowId, idempotencyKey, confirmedInputs });
    ledgerId = row.id;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "ledger_intent_write_failed",
        tool: "execute_workflow",
        workflowId,
        requestId,
        orgId: session.orgId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return { ok: false, error: intentWriteFailedError() };
  }

  const result = await callTool({
    accessToken: session.accessToken,
    orgId: session.orgId,
    userId: session.userId,
    name: "execute_workflow",
    args: { workflowId, idempotency_key: idempotencyKey },
    // A run can move value; it never takes the rate-limit retry.
    idempotent: idempotentForClass("value-moving-write"),
    requestId,
  });
  if (!result.ok) {
    await writeTerminal({ session, id: ledgerId, state: "failure", requestId, ...chat });
    const output = toErrorOutput("execute_protocol_action", result.error);
    return { ok: false, error: output.ok ? { code: "server_error", message: result.error.message } : output.error };
  }

  const executionId = extractExecutionId(result.data);
  if (executionId === null) {
    // It may still be running; the intent stays open rather than claiming a failure.
    return {
      ok: false,
      error: {
        code: "server_error",
        message: "KeeperHub accepted the run but returned no execution id. Check the automation's runs before trying again.",
      },
    };
  }
  await recordExecutionId({ session, id: ledgerId, executionId, requestId });
  return { ok: true, ledgerId, executionId };
}

export type WorkflowRunState = {
  state: "pending" | "receipt" | "failure";
  status: string | null;
  txHash: string | null;
  workflowId: string;
};

/** Where a run started from this app stands; a run KeeperHub has finished gets its terminal here. */
export async function settleWorkflowRun(input: {
  session: AuthenticatedSession;
  ledgerId: string;
  requestId: string;
}): Promise<WorkflowRunState | null> {
  const { session, requestId } = input;
  const row = await readLedgerRow(session, input.ledgerId);
  if (row === null || !row.workflowId) return null;
  const workflowId = row.workflowId;
  if (row.state !== "intent") {
    return { state: row.state === "receipt" ? "receipt" : "failure", status: null, txHash: row.txHash, workflowId };
  }
  const executionId = row.keeperhubExecutionId;
  if (executionId === null) return { state: "pending", status: null, txHash: null, workflowId };

  const run = await readRunStatus({ session, executionId, requestId });
  if (run === null || run.outcome === "pending") {
    return { state: "pending", status: run?.status ?? null, txHash: null, workflowId };
  }
  const written = await writeTerminal({
    session,
    id: row.id,
    state: run.outcome,
    txHash: run.txHash,
    receipt: run.receipt,
    executionId,
    requestId,
  });
  if (!written.landed && written.reason === "lost-race") {
    const existing = written.existing;
    return { state: existing.state === "receipt" ? "receipt" : "failure", status: run.status, txHash: existing.txHash, workflowId };
  }
  return { state: run.outcome, status: run.status, txHash: run.txHash, workflowId };
}

/** KeeperHub's status for a workflow execution, or null when it could not be read (treated as still pending). */
async function readRunStatus(input: {
  session: AuthenticatedSession;
  executionId: string;
  requestId: string;
  signal?: AbortSignal;
}): Promise<(ReturnType<typeof readSettledRun> & { receipt: Record<string, unknown> | null }) | null> {
  const { session, executionId, requestId, signal } = input;
  const status = await callTool({
    accessToken: session.accessToken,
    orgId: session.orgId,
    userId: session.userId,
    name: "get_execution",
    args: { executionId, includeData: false },
    idempotent: true,
    requestId,
    signal,
  });
  if (!status.ok) return null;
  const settled = readSettledRun(status.data);
  const receipt = status.data !== null && typeof status.data === "object" && !Array.isArray(status.data)
    ? (status.data as Record<string, unknown>)
    : null;
  return { ...settled, receipt };
}

// --- confirm-ceremony classifier (drives the AI SDK toolApproval config) ------

/** The write effect classes that run the confirm ceremony in this release. The
 *  paid-listing path (x402) is deferred to Epic 6; quarantined never executes. */
const CEREMONY_WRITE_CLASSES: ReadonlySet<EffectClass> = new Set([
  "value-moving-write",
  "off-chain-send",
  "config-management-write",
  "authorization-grant",
]);

/**
 * Whether a proposed tool call is a WRITE that must run the confirm ceremony
 * (AD-5/AD-6). The chat route builds the AI SDK `toolApproval` config from this:
 * a write returns 'user-approval' (the SDK holds `execute` until the person
 * confirms); a read, an unresolvable/quarantined op, or a paid listing returns
 * false and runs immediately. Server-side + deterministic — the model never
 * decides. For execute_contract_call the model-declared stateMutability decides
 * the ceremony; that is untrustworthy but SAFE, because a mis-declared write can
 * never broadcast (runContractCall forces simulate on every non-broadcast call).
 */
export function requiresConfirmation(toolName: string, input: unknown): boolean {
  const record = asRecord(input);
  // Every transfer moves value — it ALWAYS runs the confirm ceremony (2.5 D25).
  // Unconditional (no mutability to weigh): a transfer is never a read.
  if (toolName === "execute_transfer") {
    return true;
  }
  if (toolName === "execute_contract_call") {
    const mutability = record.stateMutability;
    return (
      isContractMutability(mutability) &&
      resolveMixedEffect({ tool: "execute_contract_call", stateMutability: mutability }) !==
        "read"
    );
  }
  if (toolName === "execute_protocol_action") {
    const actionType = asString(record.actionType) ?? "";
    const resolved = resolveOperation(actionType);
    // An action KeeperHub won't run on its own never gets a card: execution refuses it (decision 35).
    return resolved.status === "ok" && runsDirectly(resolved.entry) && CEREMONY_WRITE_CLASSES.has(resolved.entry.effectClass);
  }
  // An automation change stops for the person only once its input can be acted
  // on. A broken proposal goes straight back to the model as validation_failed
  // to repair: the execute path runs the same check (stricter: an event start
  // must have its ABI) before anything is recorded or sent, so an unchecked
  // proposal can never save.
  if (toolName === "create_automation") {
    return checkAutomationDefinition(input).ok;
  }
  const namesAutomation = typeof record.workflowId === "string" && record.workflowId.trim() !== "";
  if (toolName === "set_automation_enabled") {
    return namesAutomation && typeof record.enabled === "boolean";
  }
  if (toolName === "update_automation") {
    return namesAutomation && checkAutomationDefinition(input).ok;
  }
  if (toolName === "run_automation" || toolName === "delete_automation") {
    return namesAutomation;
  }
  return false;
}

// --- get_wallet_integration (read verb pass-through) -------------------------

async function runWalletIntegration(
  session: AuthenticatedSession,
  args: unknown,
  requestId: string,
  signal: AbortSignal | undefined,
): Promise<ToolOutput> {
  const tool = "get_wallet_integration" as const;
  const integrationId = asString(asRecord(args).integrationId);
  if (integrationId === undefined || integrationId === "") {
    return {
      ok: false,
      tool,
      error: {
        code: "validation_failed",
        message: "integrationId is required.",
        issues: [{ path: "integrationId", message: "required" }],
      },
    };
  }
  // Classification (D7.3): get_wallet_integration is a KeeperHub READ verb, so
  // the CLASSIFIER — not an implicit surface-name assumption — is what lets it
  // reach the wire. Closes the 1.4 deferred bypass ("reaches the wire" ⟺
  // "passed the gate"). It is an ungated wallet read: no needsCredential axis.
  const effectClass: EffectClass = "read";
  const result = await callTool({
    accessToken: session.accessToken,
    orgId: session.orgId,
    userId: session.userId,
    name: tool,
    args: { integrationId },
    idempotent: idempotentForClass(effectClass),
    requestId,
    signal,
  });
  if (!result.ok) {
    return toErrorOutput(tool, result.error);
  }
  return { ok: true, tool, data: result.data };
}

// --- error mapping -----------------------------------------------------------

function toErrorOutput(tool: SurfaceToolName, error: McpError): ToolOutput {
  return { ok: false, tool, error: toExecutionError(error) };
}

// --- classification helpers --------------------------------------------------

/**
 * Retry-eligibility DERIVES from the resolved effect class (D7.5), never a
 * caller literal. A read is the only idempotent class — safe to take lib/mcp's
 * one sanctioned rate-limit retry; a write never may (Story 2.3: writes now
 * execute, and a double-broadcast on a retried write is exactly what this forbids).
 */
function idempotentForClass(effectClass: EffectClass): boolean {
  return effectClass === "read";
}

/** Structured gate-decision log (NFR2 correlation). A returned pre-state or
 *  refusal is never a silent drop — the decision is logged AND surfaced. */
function logGate(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields }));
}

/** Log a terminal write that did NOT land (a lost race, a missing/unexpected row,
 *  or a DB write failure). After a successful broadcast the money already moved, so
 *  the caller still returns the receipt to the user; this surfaces the ledger/user
 *  divergence for reconciliation (review P5, NFR2) rather than swallowing it. */
function logTerminalIfNotLanded(
  result: { landed: boolean; reason?: string },
  ctx: {
    tool: string;
    toolCallId: string;
    conversationId: string;
    requestId: string;
    session: AuthenticatedSession;
  },
): void {
  if (result.landed) {
    return;
  }
  console.error(
    JSON.stringify({
      event: "ledger_terminal_not_landed",
      reason: result.reason,
      tool: ctx.tool,
      toolCallId: ctx.toolCallId,
      conversationId: ctx.conversationId,
      requestId: ctx.requestId,
      orgId: ctx.session.orgId,
    }),
  );
}

/** A structured, correlated log when the durable intent row fails to land: the
 *  write is refused rather than broadcast (AD-2), never a silent catch (NFR2). */
function logIntentWriteFailed(input: {
  tool: string;
  conversationId: string;
  toolCallId: string;
  requestId: string;
  session: AuthenticatedSession;
  error: unknown;
}): void {
  console.error(
    JSON.stringify({
      event: "ledger_intent_write_failed",
      tool: input.tool,
      conversationId: input.conversationId,
      toolCallId: input.toolCallId,
      requestId: input.requestId,
      orgId: input.session.orgId,
      message:
        input.error instanceof Error ? input.error.message : String(input.error),
    }),
  );
}

/** The honest stop when a confirmed write cannot be recorded before it would
 *  broadcast (durable-intent-before-execute, AD-2). No wire call happened. */
function intentWriteFailedError(): ExecutionError {
  return {
    code: "server_error",
    message:
      "This action could not be recorded, so it was not run. Try again in a moment.",
  };
}

// --- messages (UI copy law: sentence case, periods, no em-dash/exclamation) --

/** The refusal when a write reaches the gate WITHOUT a ceremony phase (a re-run
 *  or a stray call): a write runs only through the on-screen confirm (AD-5). */
function writeNotAvailableMessage(entry: OperationEntry): string {
  return `${entry.label} changes state, so it runs only through the on-screen confirm. It was not run.`;
}

/**
 * The needs-credential setup copy (D8). Copy law: sentence case, periods, no
 * em-dash/exclamation. "Connect KeeperHub" is reserved for the OAuth reconnect,
 * so per-op binding is framed as setup, never "connect wallet" — and users never
 * see, fund, or manage a wallet, so the copy directs binding the credential in
 * KeeperHub itself.
 */
function needsCredentialMessage(
  entry: OperationEntry,
  integration: string,
): string {
  const label = integrations[integration]?.label ?? integration;
  return `${entry.label} needs the ${label} credential before it can run.`;
}

function quarantineMessage(
  actionType: string,
  reason: "absent" | "fingerprint-drift" | "quarantined-class",
): string {
  const because =
    reason === "absent"
      ? "it is not in the action catalog"
      : reason === "fingerprint-drift"
        ? "its definition changed since it was proposed"
        : "it cannot be classified as safe to run";
  const named = actionType === "" ? "That action" : `The action "${actionType}"`;
  return `${named} is not available because ${because}.`;
}

// --- helpers -----------------------------------------------------------------

function toFieldIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function isContractMutability(value: unknown): value is ContractMutability {
  return (
    typeof value === "string" &&
    (CONTRACT_MUTABILITIES as readonly string[]).includes(value)
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
