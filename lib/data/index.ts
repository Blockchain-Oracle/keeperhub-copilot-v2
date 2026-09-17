import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { ulid } from "ulid";

import { getDb } from "@/lib/db";
import {
  conversation,
  type ConversationRow,
  ledgerEntry,
  type NewSessionRow,
  session,
  type SessionRow,
} from "@/lib/db/schema";

/*
 * The accessor is also the TYPE boundary for persisted rows (AD-9): lib/db —
 * schema included — is reachable only from here, so callers (lib/session, the
 * auth routes) import row types from lib/data, never from lib/db/schema.
 * Transcript-row types included: lib/transcript imports ConversationRow from
 * HERE, never from lib/data/transcript.ts (whose only importer is
 * lib/transcript itself — the ad13 depcruise rule counts type-only imports).
 */
export type {
  ConversationRow,
  LedgerEntryRow,
  NewLedgerEntryRow,
  NewSessionRow,
  SessionRow,
} from "@/lib/db/schema";

/*
 * The session-scoped data accessor (AD-9): the ONLY module allowed to import
 * lib/db. Every query keys off the server-minted session id — never a raw
 * org_id/user_id passed by a caller — so scoping is structural, not review
 * discipline. Callers hand over a session id (or, for createSession, a fully
 * formed row); they never reach the query builder.
 *
 * neon-http has NO interactive transactions, so any atomicity here is a
 * single-statement compare-and-set, never a multi-statement db.transaction().
 */

/** Fields a token rotation writes atomically (Story 1.2 refresh CAS). */
export type SessionTokenUpdate = {
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
};

export async function createSession(row: NewSessionRow): Promise<SessionRow> {
  const [created] = await getDb().insert(session).values(row).returning();
  return created;
}

/*
 * The deliberate bootstrap exception: resolving a session row FROM a cookie id
 * is the one query that must run before a session object exists. It stays
 * inside lib/data so no caller ever reaches lib/db to do it.
 */
export async function getSessionById(id: string): Promise<SessionRow | null> {
  const [row] = await getDb()
    .select()
    .from(session)
    .where(eq(session.id, id))
    .limit(1);
  return row ?? null;
}

/*
 * Refresh rotation as a single-statement compare-and-set. The platform rotates
 * the refresh token on every use, so a lost race would invalidate the stored
 * token; guarding the UPDATE on the expected ciphertext means only the winner
 * writes. Returns the updated row on a match, or null when another request
 * already rotated (the caller then re-reads for the fresh pair).
 */
export async function rotateSessionTokens(
  id: string,
  expectedRefreshCiphertext: string,
  next: SessionTokenUpdate,
): Promise<SessionRow | null> {
  const [row] = await getDb()
    .update(session)
    .set({
      accessTokenCiphertext: next.accessTokenCiphertext,
      refreshTokenCiphertext: next.refreshTokenCiphertext,
      accessTokenExpiresAt: next.accessTokenExpiresAt,
      refreshTokenExpiresAt: next.refreshTokenExpiresAt,
      lastSeenAt: sql`now()`,
    })
    .where(
      and(
        eq(session.id, id),
        eq(session.refreshTokenCiphertext, expectedRefreshCiphertext),
      ),
    )
    .returning();
  return row ?? null;
}

export async function touchSession(id: string): Promise<void> {
  await getDb()
    .update(session)
    .set({ lastSeenAt: sql`now()` })
    .where(eq(session.id, id));
}

export async function deleteSession(id: string): Promise<void> {
  await getDb().delete(session).where(eq(session.id, id));
}

/*
 * Conversation accessors (Story 1.5). Every query TAKES THE SESSION and
 * derives org scope from it inside this module (AD-9): no caller ever passes
 * a raw org id, so another org's conversation resolves to null/absent
 * structurally — indistinguishable from not existing.
 *
 * SessionScope is declared here (not imported from lib/session) because
 * lib/session imports lib/data — importing the session type back would cycle.
 * AuthenticatedSession satisfies it structurally; call sites hand over the
 * resolved session object, never a bare org id in a wrapper.
 */
export type SessionScope = { orgId: string };

/** What the thread switcher lists — never the transcript payloads. */
export type ConversationListItem = {
  id: string;
  title: string;
  updatedAt: Date;
};

/** The placeholder title; auto-titling (chat route) replaces it exactly once. */
export const NEW_CONVERSATION_TITLE = "New conversation";

export async function createConversation(
  scope: SessionScope,
): Promise<ConversationRow> {
  const [created] = await getDb()
    .insert(conversation)
    .values({
      // Server-minted ULID: a client-supplied id is never persisted as a key.
      id: ulid(),
      orgId: scope.orgId,
      title: NEW_CONVERSATION_TITLE,
    })
    .returning();
  return created;
}

export async function getConversation(
  scope: SessionScope,
  conversationId: string,
): Promise<ConversationRow | null> {
  const [row] = await getDb()
    .select()
    .from(conversation)
    .where(
      and(
        eq(conversation.id, conversationId),
        eq(conversation.orgId, scope.orgId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listConversations(
  scope: SessionScope,
): Promise<ConversationListItem[]> {
  return getDb()
    .select({
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
    })
    .from(conversation)
    .where(eq(conversation.orgId, scope.orgId))
    .orderBy(desc(conversation.updatedAt));
}

/** A History card: the conversation plus how many writes it executed (ledger receipts). */
export type ConversationSummaryRow = ConversationListItem & { executed: number };

const SUMMARY_LIMIT = 60;

/*
 * DeepBookie lib/db/chats.ts:14-29 on this schema: the org's conversations
 * with a transcript, newest first, capped at 60, each counting its ledger
 * receipts through a left join on the org-scoped ledger.
 */
export async function listConversationSummaries(
  scope: SessionScope,
): Promise<ConversationSummaryRow[]> {
  return getDb()
    .select({
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
      executed: sql<number>`count(${ledgerEntry.id}) filter (where ${ledgerEntry.state} = 'receipt')`.mapWith(Number),
    })
    .from(conversation)
    .leftJoin(
      ledgerEntry,
      and(eq(ledgerEntry.conversationId, conversation.id), eq(ledgerEntry.orgId, scope.orgId)),
    )
    .where(
      and(
        eq(conversation.orgId, scope.orgId),
        sql`jsonb_array_length(${conversation.transcript}) > 0`,
      ),
    )
    .groupBy(conversation.id)
    .orderBy(desc(conversation.updatedAt))
    .limit(SUMMARY_LIMIT);
}

/*
 * Returns the updated row, or null when absent/another org's (→ 404).
 * Deliberately no updated_at bump: a rename is not conversational activity,
 * so it must not re-sort the switcher — transcript writes own recency.
 */
export async function renameConversation(
  scope: SessionScope,
  conversationId: string,
  title: string,
): Promise<ConversationRow | null> {
  const [row] = await getDb()
    .update(conversation)
    .set({ title })
    .where(
      and(
        eq(conversation.id, conversationId),
        eq(conversation.orgId, scope.orgId),
      ),
    )
    .returning();
  return row ?? null;
}

/*
 * The auto-title write (chat route): a single-statement conditional update
 * that lands ONLY while the title is still the placeholder — so a user
 * rename, even one racing the in-flight generateText call, always wins
 * ("a rename is permanent" enforced in the statement, not by a re-read).
 * No updated_at bump: titling always rides a turn whose transcript write
 * already bumped it. Returns the row, or null when the conversation is
 * absent, another org's, or already renamed (the desired no-op).
 */
export async function autoTitleConversation(
  scope: SessionScope,
  conversationId: string,
  title: string,
): Promise<ConversationRow | null> {
  const [row] = await getDb()
    .update(conversation)
    .set({ title })
    .where(
      and(
        eq(conversation.id, conversationId),
        eq(conversation.orgId, scope.orgId),
        eq(conversation.title, NEW_CONVERSATION_TITLE),
      ),
    )
    .returning();
  return row ?? null;
}

/** Returns true when a row was deleted, false when absent/another org's. */
export async function deleteConversation(
  scope: SessionScope,
  conversationId: string,
): Promise<boolean> {
  const rows = await getDb()
    .delete(conversation)
    .where(
      and(
        eq(conversation.id, conversationId),
        eq(conversation.orgId, scope.orgId),
      ),
    )
    .returning({ id: conversation.id });
  return rows.length > 0;
}
