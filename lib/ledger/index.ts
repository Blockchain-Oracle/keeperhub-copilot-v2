import "server-only";

import type { LedgerEntryRow, SessionScope } from "@/lib/data";
import {
  casWriteTerminal,
  insertLedgerRow,
  listOpenIntentRows,
  readLedgerRowById,
  setIntentExecutionId,
  TERMINAL_STATES,
  type TerminalState,
} from "@/lib/data/ledger";
import { registryMeta } from "@/lib/registry";

/*
 * The outcome ledger's domain writer (Story 2.2, AD-2). It is the layer that
 * KNOWS ledger shape — read rows carry no receipt, intent rows precede a write,
 * terminals are write-once — and calls the AD-9 accessor (lib/data/ledger) to
 * touch the DB. It stamps the AD-3 provenance (registry snapshot id) so callers
 * (lib/execution) never import the registry for it.
 *
 * Single writer (AD-2): lib/execution is the ONLY module that calls these
 * writers in Epic 2. The Story 5.7 run-poller will also write terminals from a
 * non-execution path (AD-14) — which is why the accessor carries no single-
 * importer lint rule. `writeIntent` / `writeTerminal` are built as module API
 * here; no write EXECUTES in 2.2 (the confirm→execute seam is Story 2.3). Only
 * `recordRead` has a live caller this story.
 */

/** A read execution recorded as a durable fact (AC 5, D12): state `read`, no
 *  receipt, no idempotency key — the receipt invariant applies to writes. The
 *  caller (lib/execution) wraps this best-effort so a failure never fails the
 *  read. Returns the created row. */
export async function recordRead(input: {
  session: SessionScope;
  conversationId: string;
  toolCallId: string;
  opId: string;
  confirmedInputs: Record<string, unknown>;
  schemaFingerprint: string;
}): Promise<LedgerEntryRow> {
  return insertLedgerRow(input.session, {
    toolCallId: input.toolCallId,
    keeperhubExecutionId: null,
    workflowId: null,
    conversationId: input.conversationId,
    opId: input.opId,
    state: "read",
    confirmedInputs: input.confirmedInputs,
    txHash: null,
    receipt: null,
    idempotencyKey: null,
    schemaFingerprint: input.schemaFingerprint,
    registrySnapshotId: registryMeta.snapshotId,
  });
}

/**
 * The durable `declined` terminal (Story 2.4, AC 2, D21). A decline moves no value
 * and never executed — so there is NO intent row to CAS from; the row is BORN
 * terminal, a fresh `insertLedgerRow` mirroring `recordRead` (a receiptless fact),
 * NOT a `writeTerminal` CAS. Keyed by tool call id: the `(org, tool_call_id)`
 * unique index makes a double-decline a caught unique violation → one row (the
 * caller treats it as already-declined). No receipt / txHash / idempotency key (a
 * declined write never reaches the wire). `schemaFingerprint` is the op's
 * fingerprint for a registry action, null for a schema-free contract-call decline.
 */
export async function recordDecline(input: {
  session: SessionScope;
  conversationId: string;
  toolCallId: string;
  opId: string;
  confirmedInputs: Record<string, unknown>;
  schemaFingerprint: string | null;
}): Promise<LedgerEntryRow> {
  return insertLedgerRow(input.session, {
    toolCallId: input.toolCallId,
    keeperhubExecutionId: null,
    workflowId: null,
    conversationId: input.conversationId,
    opId: input.opId,
    state: "declined",
    confirmedInputs: input.confirmedInputs,
    txHash: null,
    receipt: null,
    idempotencyKey: null,
    schemaFingerprint: input.schemaFingerprint,
    registrySnapshotId: registryMeta.snapshotId,
  });
}

/** The pre-execution WRITE row (AD-2): written by lib/execution BEFORE a write
 *  executes (Story 2.3), keyed by tool call id, carrying the durable
 *  idempotency key. Built as module API in 2.2; no write reaches it yet. */
export async function writeIntent(input: {
  session: SessionScope;
  conversationId: string;
  toolCallId: string;
  opId: string;
  confirmedInputs: Record<string, unknown>;
  // Null for a schema-free write (a raw execute_contract_call carries no registry
  // op fingerprint, Story 2.3); a registry protocol action passes its fingerprint.
  schemaFingerprint: string | null;
  // The automation a chat change acts on (decision 19); null for every other write.
  workflowId?: string | null;
}): Promise<LedgerEntryRow> {
  return insertLedgerRow(input.session, {
    toolCallId: input.toolCallId,
    keeperhubExecutionId: null,
    workflowId: input.workflowId ?? null,
    conversationId: input.conversationId,
    opId: input.opId,
    state: "intent",
    confirmedInputs: input.confirmedInputs,
    txHash: null,
    receipt: null,
    idempotencyKey: deriveIdempotencyKey(input.toolCallId),
    schemaFingerprint: input.schemaFingerprint,
    registrySnapshotId: registryMeta.snapshotId,
  });
}

/** The intent row for an automation change made outside a chat tool call: a
 *  run started from the Automations page (decision 18) or Turn on from a saved
 *  automation's card (decision 19). No conversation or tool call, keyed by the
 *  workflow, with a fresh idempotency key. Written BEFORE KeeperHub is called,
 *  like writeIntent. */
export async function writeRunIntent(input: {
  session: SessionScope;
  workflowId: string;
  idempotencyKey: string;
  confirmedInputs: Record<string, unknown>;
  /** "workflow/run" unless given: "workflow/enable" or "workflow/disable" for a switch. */
  opId?: string;
}): Promise<LedgerEntryRow> {
  return insertLedgerRow(input.session, {
    toolCallId: null,
    keeperhubExecutionId: null,
    workflowId: input.workflowId,
    conversationId: null,
    opId: input.opId ?? "workflow/run",
    state: "intent",
    confirmedInputs: input.confirmedInputs,
    txHash: null,
    receipt: null,
    idempotencyKey: input.idempotencyKey,
    schemaFingerprint: null,
    registrySnapshotId: registryMeta.snapshotId,
  });
}

/** One of this org's rows by id (another org's is unreachable), for settling an automation run. */
export function readLedgerRow(session: SessionScope, id: string): Promise<LedgerEntryRow | null> {
  return readLedgerRowById(session, id);
}

/** The states a row may transition FROM into a terminal. A write goes
 *  intent → terminal; the write-once CAS matches only while still non-terminal. */
const DEFAULT_NON_TERMINAL: readonly string[] = ["intent"];

/**
 * A non-landing terminal write is one of four HONEST outcomes, never a single
 * ambiguous "lost race" (review Decision 2). A caller (Story 2.3+) must be able
 * to tell a real terminal collision from a bad id or a stale/non-terminal row.
 */
export type TerminalWriteResult =
  | { landed: true; row: LedgerEntryRow }
  // A second writer already wrote a terminal — the authoritative existing row.
  | { landed: false; reason: "lost-race"; existing: LedgerEntryRow }
  // No row matched id + org — a wrong id or a hard-deleted row (a programming error).
  | { landed: false; reason: "not-found"; existing: null }
  // The row exists but sits in an unexpected NON-terminal state (the CAS's
  // expectedStates did not include it) — a programming error, not a race.
  | { landed: false; reason: "unexpected-state"; existing: LedgerEntryRow }
  // The CAS lost but the authoritative read-back itself failed — indeterminate.
  | { landed: false; reason: "readback-failed"; existing: null }
  // The CAS write itself threw (a DB / transport error), NOT a race — the terminal
  // did not land and the row state is indeterminate (review P5). writeTerminal
  // never throws out to the caller: a write already broadcast must not crash the route.
  | { landed: false; reason: "write-failed"; existing: null };

/**
 * The write-once terminal transition (AC 3, D11). A single-statement CAS moves
 * the row to `state` only while it is still non-terminal. On a win, the row is
 * returned. On a null CAS the outcome is classified from an authoritative
 * read-back (review Decision 2): a genuine LOST race (existing is already
 * terminal) logs `ledger_terminal_cas_lost` and returns the existing terminal;
 * a missing row logs `ledger_terminal_target_missing`; an unexpected non-terminal
 * row logs `ledger_terminal_unexpected_state`. This NEVER overwrites and NEVER
 * throws (NFR2 correlation; no silent catch). Accepts the full AC-3 terminal set;
 * the live callers land later (`receipt` / `failure` → 2.3/2.5, `declined` → 2.4,
 * `expired` → Epic 3, `paid-but-failed` → 6.4). Built + unit-tested in 2.2.
 */
export async function writeTerminal(input: {
  session: SessionScope;
  id: string;
  state: TerminalState;
  txHash?: string | null;
  receipt?: unknown;
  expectedStates?: readonly string[];
  requestId: string;
  conversationId?: string;
  toolCallId?: string;
  executionId?: string;
  /** A saved automation's id, known only once KeeperHub answers the save. */
  workflowId?: string;
}): Promise<TerminalWriteResult> {
  let won: LedgerEntryRow | null;
  try {
    won = await casWriteTerminal(
      input.session,
      input.id,
      {
        state: input.state,
        txHash: input.txHash ?? null,
        receipt: parseReceipt(input.receipt),
        // Persist the KeeperHub execution id on the terminal (review P9): the intent
        // row seeded it null, so a direct write's row only gains it here — the key
        // the Story 5.7 run-poller reconciles on.
        ...(input.executionId !== undefined
          ? { keeperhubExecutionId: input.executionId }
          : {}),
        ...(input.workflowId !== undefined ? { workflowId: input.workflowId } : {}),
      },
      input.expectedStates ?? DEFAULT_NON_TERMINAL,
    );
  } catch (error) {
    // The CAS statement itself failed (DB / transport). A write may already have
    // broadcast, so NEVER throw out to routeToolCall — classify and return (review P5).
    console.error(
      JSON.stringify({
        event: "ledger_terminal_write_failed",
        ledgerId: input.id,
        requestId: input.requestId,
        orgId: input.session.orgId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return { landed: false, reason: "write-failed", existing: null };
  }
  if (won !== null) {
    return { landed: true, row: won };
  }

  // The CAS matched nothing — NOT automatically a lost race. Read the row back
  // (scoped to the org) and classify honestly; a read blip must not turn this
  // into a throw (no silent catch either).
  let existing: LedgerEntryRow | null = null;
  try {
    existing = await readLedgerRowById(input.session, input.id);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "ledger_terminal_readback_failed",
        ledgerId: input.id,
        requestId: input.requestId,
        orgId: input.session.orgId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return { landed: false, reason: "readback-failed", existing: null };
  }

  const correlation = {
    ledgerId: input.id,
    attemptedState: input.state,
    existingState: existing?.state ?? null,
    requestId: input.requestId,
    orgId: input.session.orgId,
    ...(input.conversationId !== undefined
      ? { conversationId: input.conversationId }
      : {}),
    ...(input.toolCallId !== undefined ? { toolCallId: input.toolCallId } : {}),
    ...(input.executionId !== undefined
      ? { executionId: input.executionId }
      : {}),
  };

  if (existing === null) {
    // A wrong id or a hard-deleted row — surfaced as the programming error it is.
    console.error(
      JSON.stringify({ event: "ledger_terminal_target_missing", ...correlation }),
    );
    return { landed: false, reason: "not-found", existing: null };
  }
  if (!isTerminalState(existing.state)) {
    // Still non-terminal but not in expectedStates — an unexpected transition,
    // NOT a race. Never report a non-terminal row as the winning terminal.
    console.error(
      JSON.stringify({ event: "ledger_terminal_unexpected_state", ...correlation }),
    );
    return { landed: false, reason: "unexpected-state", existing };
  }
  // A genuine lost race: the row is already terminal. Return it as authoritative;
  // NEVER overwrite — a terminal is final by definition.
  console.error(JSON.stringify({ event: "ledger_terminal_cas_lost", ...correlation }));
  return { landed: false, reason: "lost-race", existing };
}

/**
 * Record KeeperHub's execution id on the intent row as soon as a broadcast
 * returns it, before the receipt poll, so a write whose poll never finished can
 * be recovered later. Best-effort: the value may already be moving, so a failed
 * stamp is logged and never stops the write. Never throws.
 */
export async function recordExecutionId(input: {
  session: SessionScope;
  id: string;
  executionId: string;
  requestId: string;
}): Promise<void> {
  const correlation = {
    ledgerId: input.id,
    executionId: input.executionId,
    requestId: input.requestId,
    orgId: input.session.orgId,
  };
  try {
    const stamped = await setIntentExecutionId(input.session, input.id, input.executionId);
    if (!stamped) {
      console.error(JSON.stringify({ event: "ledger_execution_id_not_stamped", ...correlation }));
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "ledger_execution_id_write_failed",
        ...correlation,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

/** Open write intents created before `createdBefore`, newest first: the rows
 *  recovery asks KeeperHub about. */
export function listStaleIntents(
  session: SessionScope,
  options: { createdBefore: Date; limit: number },
): Promise<LedgerEntryRow[]> {
  return listOpenIntentRows(session, options);
}

/** Whether a persisted `state` string is one of the AC-3 terminal states. */
function isTerminalState(state: string): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

/**
 * The durable idempotency key derives from the tool call id (AD-5): it is
 * Copilot's own long-horizon re-execution guard (NFR1), stored so a re-run past
 * KeeperHub's 24h idempotency window still resolves to the same execution. The
 * guard LOGIC is Story 2.3 / Epic 3; 2.2 only STORES the key, and only on a
 * WRITE intent row (reads store a null key), so this is inert until 2.3.
 *
 * NOTE (review Decision 3): the tool call id is a server ULID ONLY on the re-run
 * path; on the model path it is the AI SDK / provider per-call id (unique per
 * call, but NOT server-minted, NOT guaranteed stable across re-proposals).
 * Whether that per-call id is a sufficient long-horizon key, or the model-path
 * call must be re-mapped to a server ULID before it becomes a ledger key, is
 * DEFERRED to Story 2.3 — where the write path makes this key load-bearing.
 */
export function deriveIdempotencyKey(toolCallId: string): string {
  return toolCallId;
}

/**
 * Defensive coercion of a KeeperHub receipt payload into a jsonb-storable
 * object, or null. McpResult.data is `unknown` (lib/mcp/types.ts); a non-object
 * yields null so the `receipt` column stores an object or nothing. The block
 * data is stored verbatim — never reshaped. Consumed by 2.3+.
 */
export function parseReceipt(data: unknown): Record<string, unknown> | null {
  return isRecord(data) ? data : null;
}

/**
 * The KeeperHub execution id from a write/enqueue payload, or null. Direct EVM
 * writes return `{ executionId }`; a defensive single `{ data }` / `{ result }`
 * envelope is unwrapped ONLY when the id is absent at the top level (review
 * Patch: a top-level id must win over an unrelated `data`/`result` sibling).
 * Consumed by 2.3+ (the dual-origin `keeperhub_execution_id` column).
 */
export function extractExecutionId(data: unknown): string | null {
  const record = unwrapEnvelope(data, ["executionId"]);
  if (record === null) {
    return null;
  }
  return firstNonEmptyString(record.executionId);
}

/**
 * The settled transaction hash from a receipt/status payload, or null. Accepts
 * `{ txHash }` / `{ transactionHash }` (direct execution) and the first entry of
 * a `{ transactionHashes: [{ hash }] }` list (workflow-run reconciliation). An
 * empty-string `txHash` never shadows a valid `transactionHash` (review Patch:
 * coalesce on emptiness, not just null). Consumed by 2.3+ (the `tx_hash` column).
 */
export function extractTxHash(data: unknown): string | null {
  const record = unwrapEnvelope(data, [
    "txHash",
    "transactionHash",
    "transactionHashes",
  ]);
  if (record === null) {
    return null;
  }
  const direct = firstNonEmptyString(record.txHash, record.transactionHash);
  if (direct !== null) {
    return direct;
  }
  // Multi-leg "which hash is the settled one" semantics are deferred (5.7/6.4);
  // 2.2 reads only the first entry, as documented.
  const list = record.transactionHashes;
  if (Array.isArray(list) && list.length > 0) {
    const first: unknown = list[0];
    if (isRecord(first) && typeof first.hash === "string" && first.hash !== "") {
      return first.hash;
    }
  }
  return null;
}

/** The first argument that is a non-empty string, else null. Empty strings are
 *  treated as absent so a "" never shadows a later valid candidate. */
function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value !== "") {
      return value;
    }
  }
  return null;
}

/**
 * Unwrap a single `{ data }` / `{ result }` envelope, but PREFER the current
 * level: only descend when none of `keys` is present at the top (review Patch).
 * A top-level `executionId`/`txHash` must not be shadowed by an unrelated nested
 * object sibling.
 */
function unwrapEnvelope(
  data: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  if (!isRecord(data)) {
    return null;
  }
  if (keys.some((key) => data[key] !== undefined)) {
    return data;
  }
  if (isRecord(data.data)) {
    return data.data;
  }
  if (isRecord(data.result)) {
    return data.result;
  }
  return data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
