import "server-only";

import { randomBytes } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { ledgerEntry, receiptShare, type LedgerEntryRow } from "@/lib/db/schema";
import { isShareable } from "@/lib/shares";

import type { SessionScope } from "./index";

/*
 * Shared receipt links (decision 37). Every function but one takes the session
 * scope and derives the org inside, like every other accessor (lib/data law).
 *
 * The exception is readSharedReceipt: the public /r/[token] page has no
 * session. Its scope comes from the live share row itself, joined to a ledger
 * row of the same org, and it returns nothing unless that row can still be
 * shared. What the page may draw from the row is decided by lib/shares.ts.
 */

export type ReceiptRef = { ledgerId: string } | { toolCallId: string };

export type ShareLookup =
  | { found: false }
  | { found: true; shareable: false; token: null }
  | { found: true; shareable: true; token: string | null };

const TOKEN = /^[A-Za-z0-9_-]{22}$/;

function newToken(): string {
  return randomBytes(16).toString("base64url");
}

async function findRow(scope: SessionScope, ref: ReceiptRef): Promise<LedgerEntryRow | null> {
  const match = "ledgerId" in ref ? eq(ledgerEntry.id, ref.ledgerId) : eq(ledgerEntry.toolCallId, ref.toolCallId);
  const [row] = await getDb()
    .select()
    .from(ledgerEntry)
    .where(and(match, eq(ledgerEntry.orgId, scope.orgId)))
    .limit(1);
  return row ?? null;
}

async function liveToken(scope: SessionScope, ledgerEntryId: string): Promise<string | null> {
  const [share] = await getDb()
    .select({ id: receiptShare.id })
    .from(receiptShare)
    .where(
      and(
        eq(receiptShare.ledgerEntryId, ledgerEntryId),
        eq(receiptShare.orgId, scope.orgId),
        isNull(receiptShare.revokedAt),
      ),
    )
    .limit(1);
  return share?.id ?? null;
}

/** Whether this org's receipt can be shared, and its live link when it has one. */
export async function shareStatus(scope: SessionScope, ref: ReceiptRef): Promise<ShareLookup> {
  const row = await findRow(scope, ref);
  if (row === null) return { found: false };
  if (!isShareable(row)) return { found: true, shareable: false, token: null };
  return { found: true, shareable: true, token: await liveToken(scope, row.id) };
}

/** The receipt's live link, made if it has none. Two clicks at once end with the same link (the live index). */
export async function createShare(scope: SessionScope & { userId: string }, ref: ReceiptRef): Promise<ShareLookup> {
  const row = await findRow(scope, ref);
  if (row === null) return { found: false };
  if (!isShareable(row)) return { found: true, shareable: false, token: null };
  const existing = await liveToken(scope, row.id);
  if (existing !== null) return { found: true, shareable: true, token: existing };
  await getDb()
    .insert(receiptShare)
    .values({ id: newToken(), orgId: scope.orgId, ledgerEntryId: row.id, createdByUserId: scope.userId })
    .onConflictDoNothing();
  return { found: true, shareable: true, token: await liveToken(scope, row.id) };
}

/** Turn the receipt's live link off for good. */
export async function revokeShare(scope: SessionScope, ref: ReceiptRef): Promise<ShareLookup> {
  const row = await findRow(scope, ref);
  if (row === null) return { found: false };
  await getDb()
    .update(receiptShare)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(receiptShare.ledgerEntryId, row.id), eq(receiptShare.orgId, scope.orgId), isNull(receiptShare.revokedAt)),
    );
  return isShareable(row) ? { found: true, shareable: true, token: null } : { found: true, shareable: false, token: null };
}

/** The ledger row behind a live link, for the public page. Null for an unknown, revoked or no-longer-shareable link. */
export async function readSharedReceipt(token: string): Promise<LedgerEntryRow | null> {
  if (!TOKEN.test(token)) return null;
  const [found] = await getDb()
    .select({ row: ledgerEntry })
    .from(receiptShare)
    .innerJoin(ledgerEntry, and(eq(ledgerEntry.id, receiptShare.ledgerEntryId), eq(ledgerEntry.orgId, receiptShare.orgId)))
    .where(and(eq(receiptShare.id, token), isNull(receiptShare.revokedAt)))
    .limit(1);
  return found !== undefined && isShareable(found.row) ? found.row : null;
}
