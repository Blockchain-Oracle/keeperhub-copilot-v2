import "server-only";

import { and, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { ulid } from "ulid";

import type { LedgerKind } from "@/lib/activity";
import { getDb } from "@/lib/db";
import {
  ledgerEntry,
  type LedgerEntryRow,
  type NewLedgerEntryRow,
} from "@/lib/db/schema";

import type { SessionScope } from "./index";

/*
 * The ledger DB accessor (Story 2.2, AD-9) — the ONLY new module that imports
 * lib/db. It mirrors lib/data/transcript.ts, with one deliberate difference:
 * there is NO single-importer depcruise rule here. lib/ledger writes through it
 * now, and the Story 5.7 run-poller will write through it from a non-execution
 * path (AD-14) — so pinning it to one importer would break 5.7. The single-
 * WRITER invariant (AD-2, "only lib/execution writes the ledger") is enforced by
 * 2.2 having exactly one caller of lib/ledger's writers, not by this seam.
 *
 * Every function takes a SessionScope / AuthenticatedSession and derives orgId
 * INSIDE the module (lib/data/index.ts law): a caller never passes a raw org id,
 * so another org's row is structurally unreachable.
 *
 * neon-http has NO interactive transactions, so the write-once terminal
 * transition is a single-statement compare-and-set on `state` (the casWrite-
 * Transcript pattern), never a db.transaction().
 */

/**
 * The AC-3 terminal states — where a ledger row ENDS. A terminal transition is
 * write-once: the first writer to move the row out of its non-terminal state
 * wins; a second writer's CAS matches nothing and loses.
 */
export const TERMINAL_STATES = [
  "receipt",
  "failure",
  "declined",
  "paid-but-failed",
  "expired",
] as const;
export type TerminalState = (typeof TERMINAL_STATES)[number];

/**
 * What lib/ledger hands the accessor for a new row: everything EXCEPT the
 * server-owned id/org/timestamps, which are stamped here (AD-9) — the caller
 * never mints a DB key or names an org.
 */
export type LedgerRowInput = Omit<
  NewLedgerEntryRow,
  "id" | "orgId" | "createdAt" | "updatedAt"
>;

/** Insert a new ledger row (a read row or a write intent row) with a server
 *  ULID `id` and the scope's org. Returns the created row. */
export async function insertLedgerRow(
  scope: SessionScope,
  row: LedgerRowInput,
): Promise<LedgerEntryRow> {
  const [created] = await getDb()
    .insert(ledgerEntry)
    .values({ ...row, id: ulid(), orgId: scope.orgId })
    .returning();
  return created;
}

/**
 * The write-once terminal transition (D11): a single-statement CAS that moves a
 * row to `terminal.state` only WHILE it is still one of `expectedStates`
 * (non-terminal). Returns the updated row on a win, or null when a second writer
 * already wrote a terminal (the row no longer matches the expected state). The
 * caller NEVER overwrites on a null — a terminal is final by definition.
 */
export async function casWriteTerminal(
  scope: SessionScope,
  id: string,
  terminal: {
    state: TerminalState;
    txHash?: string | null;
    receipt?: Record<string, unknown> | null;
    keeperhubExecutionId?: string | null;
    workflowId?: string | null;
  },
  expectedStates: readonly string[],
): Promise<LedgerEntryRow | null> {
  const [row] = await getDb()
    .update(ledgerEntry)
    .set({
      state: terminal.state,
      txHash: terminal.txHash ?? null,
      receipt: terminal.receipt ?? null,
      // Only overwrite when the caller supplies it (the intent row seeded it null);
      // omitting leaves the existing column untouched (review P9).
      ...(terminal.keeperhubExecutionId !== undefined
        ? { keeperhubExecutionId: terminal.keeperhubExecutionId }
        : {}),
      // Same rule for a saved automation's id, known only once KeeperHub answers.
      ...(terminal.workflowId !== undefined ? { workflowId: terminal.workflowId } : {}),
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(ledgerEntry.id, id),
        eq(ledgerEntry.orgId, scope.orgId),
        inArray(ledgerEntry.state, [...expectedStates]),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * A single keyed point-read of one row, scoped to the org. It exists ONLY to
 * serve D11's lost-race branch: when a terminal CAS loses, lib/ledger reads the
 * row back to return the authoritative existing terminal. This is NOT the
 * Epic-3 ledger overlay / FR14 record-query surface (org-wide reads back into
 * transcripts) — that arrives with its own story.
 */
export async function readLedgerRowById(
  scope: SessionScope,
  id: string,
): Promise<LedgerEntryRow | null> {
  const [row] = await getDb()
    .select()
    .from(ledgerEntry)
    .where(and(eq(ledgerEntry.id, id), eq(ledgerEntry.orgId, scope.orgId)))
    .limit(1);
  return row ?? null;
}

const LEDGER_PAGE_MAX = 100;

/**
 * The org's ledger, newest first — the data source for History and Activity.
 * Rides `ledger_entry_org_created_idx`. `before` pages by created_at: pass the
 * last row's createdAt to fetch the next page. Org is derived from the scope,
 * so another org's rows are unreachable.
 */
export async function listLedgerRows(
  scope: SessionScope,
  options: { limit?: number; before?: Date; kind?: LedgerKind } = {},
): Promise<LedgerEntryRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), LEDGER_PAGE_MAX);
  // Decision 17: reads are the `read` rows; actions are every other row.
  const kind =
    options.kind === "reads"
      ? eq(ledgerEntry.state, "read")
      : options.kind === "actions"
        ? ne(ledgerEntry.state, "read")
        : undefined;
  return getDb()
    .select()
    .from(ledgerEntry)
    .where(
      and(
        eq(ledgerEntry.orgId, scope.orgId),
        options.before ? lt(ledgerEntry.createdAt, options.before) : undefined,
        kind,
      ),
    )
    .orderBy(desc(ledgerEntry.createdAt))
    .limit(limit);
}

/**
 * Stamp KeeperHub's execution id on a write's intent row the moment the
 * broadcast returns it, before the receipt poll. If that poll never finishes (a
 * tab closed, a dropped connection) recovery can still ask KeeperHub about the
 * execution. Only a row still in `intent` takes it; a terminal is never touched.
 * Returns whether a row was stamped.
 */
export async function setIntentExecutionId(
  scope: SessionScope,
  id: string,
  executionId: string,
): Promise<boolean> {
  const rows = await getDb()
    .update(ledgerEntry)
    .set({ keeperhubExecutionId: executionId, updatedAt: sql`now()` })
    .where(
      and(
        eq(ledgerEntry.id, id),
        eq(ledgerEntry.orgId, scope.orgId),
        eq(ledgerEntry.state, "intent"),
      ),
    )
    .returning({ id: ledgerEntry.id });
  return rows.length > 0;
}

/**
 * Write intents still open and created before `createdBefore`, newest first:
 * recovery's work list when someone comes back. Org-scoped like every read here.
 */
export async function listOpenIntentRows(
  scope: SessionScope,
  options: { createdBefore: Date; limit: number },
): Promise<LedgerEntryRow[]> {
  const limit = Math.min(Math.max(options.limit, 1), LEDGER_PAGE_MAX);
  return getDb()
    .select()
    .from(ledgerEntry)
    .where(
      and(
        eq(ledgerEntry.orgId, scope.orgId),
        eq(ledgerEntry.state, "intent"),
        lt(ledgerEntry.createdAt, options.createdBefore),
      ),
    )
    .orderBy(desc(ledgerEntry.createdAt))
    .limit(limit);
}
