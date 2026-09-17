import "server-only";

import { and, eq, sql } from "drizzle-orm";
import type { UIMessage } from "ai";

import { getDb } from "@/lib/db";
import { conversation } from "@/lib/db/schema";

import type { SessionScope } from "./index";

/*
 * The transcript WRITE accessor (Story 1.5) — deliberately a separate module
 * from lib/data/index.ts and NOT re-exported there. Its only permitted
 * importer is lib/transcript/ (depcruise rule ad13-transcript-sole-writer):
 * that structural restriction is what makes AD-13's "sole writer" a
 * mechanism, not review discipline. Row TYPES stay on lib/data's main
 * boundary — the rule counts type-only imports too (tsPreCompilationDeps).
 *
 * neon-http has no interactive transactions, so the atomic write is a
 * single-statement compare-and-set on `revision` (the 1.2 rotation pattern):
 * only the writer holding the current revision lands; a lost race returns
 * null and the caller re-reads.
 */

export type TranscriptRead = {
  transcript: UIMessage[];
  revision: number;
};

export async function readTranscriptForWrite(
  scope: SessionScope,
  conversationId: string,
): Promise<TranscriptRead | null> {
  const [row] = await getDb()
    .select({
      transcript: conversation.transcript,
      revision: conversation.revision,
    })
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

/** Returns the new revision on a landed write, or null on a lost race. */
export async function casWriteTranscript(
  scope: SessionScope,
  conversationId: string,
  transcript: UIMessage[],
  expectedRevision: number,
): Promise<{ revision: number } | null> {
  const [row] = await getDb()
    .update(conversation)
    .set({
      transcript,
      revision: sql`${conversation.revision} + 1`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(conversation.id, conversationId),
        eq(conversation.orgId, scope.orgId),
        eq(conversation.revision, expectedRevision),
      ),
    )
    .returning({ revision: conversation.revision });
  return row ?? null;
}
