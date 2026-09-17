import "server-only";

import type { UIMessage } from "ai";
import { ulid } from "ulid";

import type { SessionScope } from "@/lib/data";
import {
  casWriteTranscript,
  readTranscriptForWrite,
} from "@/lib/data/transcript";

/*
 * The transcript's SOLE writer (AD-13, Story 1.5). Every persisted UIMessage
 * flows through persistMessages — chat now, the Realtime voice normalizer in
 * Epic 4 joins through this same door. The browser never writes the
 * transcript column: this module is server-only and reached from route
 * handlers only; structurally, lib/data/transcript.ts (the write accessor)
 * is importable by nothing but this module (depcruise
 * ad13-transcript-sole-writer).
 *
 * The message-id law:
 * - The conversation row id is a server ULID; a client-supplied id is NEVER
 *   persisted as a DB key.
 * - UIMessage ids inside the jsonb document are upsert keys only.
 *   Assistant/response ids are server-minted (the chat route's
 *   generateMessageId). A client-generated user-message id is accepted after
 *   sanitization: non-empty string of at most 64 chars, and never colliding
 *   with a stored message of a DIFFERENT role — otherwise a fresh ULID is
 *   minted instead (sanitizeUserMessage).
 * - Epic 7's guest adoption re-mints everything per AD-7 — not this story.
 */

export class TranscriptCasExhaustedError extends Error {
  constructor(conversationId: string) {
    super(
      `Transcript write for conversation ${conversationId} lost the revision race twice.`,
    );
    this.name = "TranscriptCasExhaustedError";
  }
}

export class TranscriptConversationMissingError extends Error {
  constructor(conversationId: string) {
    super(`Conversation ${conversationId} is not available for a transcript write.`);
    this.name = "TranscriptConversationMissingError";
  }
}

const USER_MESSAGE_ID_MAX_LENGTH = 64;

/*
 * Merge incoming UIMessages into the stored transcript, upserted by stable
 * message id: a matching id is replaced IN PLACE (stored order preserved),
 * unknown ids append in incoming order. Union semantics fall out of starting
 * from `stored`: a concurrent tab's messages, absent from `incoming`, always
 * survive. Pure — exhaustive tests hit it without a DB.
 */
export function mergeTranscript(
  stored: UIMessage[],
  incoming: UIMessage[],
): UIMessage[] {
  const merged = [...stored];
  const indexById = new Map(merged.map((message, index) => [message.id, index]));
  for (const message of incoming) {
    const existing = indexById.get(message.id);
    if (existing !== undefined) {
      merged[existing] = message;
    } else {
      indexById.set(message.id, merged.length);
      merged.push(message);
    }
  }
  return merged;
}

/*
 * Enforce the message-id law on a client-authored user message: accept a
 * well-formed id verbatim; mint a fresh ULID when the id is absent,
 * malformed, over-long, or collides with a stored message of a different
 * role (same-role collision is a legitimate replace). Never mutates input.
 */
export function sanitizeUserMessage(
  message: UIMessage,
  stored: UIMessage[],
  mintId: () => string = ulid,
): UIMessage {
  const id: unknown = message.id;
  const wellFormed =
    typeof id === "string" && id.length > 0 && id.length <= USER_MESSAGE_ID_MAX_LENGTH;
  const collides =
    wellFormed &&
    stored.some((existing) => existing.id === id && existing.role !== message.role);
  if (wellFormed && !collides) {
    return message;
  }
  return { ...message, id: mintId() };
}

/*
 * Persist messages into a conversation's transcript: merge into the stored
 * document, then a single-statement CAS write. On a lost race, re-read and
 * re-merge ONCE (union merge keeps the concurrent writer's messages); a
 * second miss logs structured and throws a named error — no silent catch.
 */
export async function persistMessages({
  session,
  conversationId,
  messages,
  requestId,
}: {
  session: SessionScope;
  conversationId: string;
  messages: UIMessage[];
  requestId: string;
}): Promise<void> {
  const attempts = 2;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const current = await readTranscriptForWrite(session, conversationId);
    if (current === null) {
      console.error(
        JSON.stringify({
          event: "transcript_conversation_missing",
          conversationId,
          requestId,
          orgId: session.orgId,
        }),
      );
      throw new TranscriptConversationMissingError(conversationId);
    }
    const merged = mergeTranscript(current.transcript, messages);
    const written = await casWriteTranscript(
      session,
      conversationId,
      merged,
      current.revision,
    );
    if (written !== null) {
      return;
    }
  }
  console.error(
    JSON.stringify({
      event: "transcript_cas_exhausted",
      conversationId,
      requestId,
      orgId: session.orgId,
    }),
  );
  throw new TranscriptCasExhaustedError(conversationId);
}
