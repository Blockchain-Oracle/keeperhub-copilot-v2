import "server-only";

import { validateUIMessages, type UIMessage } from "ai";
import { after } from "next/server";
import { ulid } from "ulid";

import { awaitingApproval, isArchived } from "@/components/chat/chat-rules";
import { getConversation, type ConversationRow } from "@/lib/data";
import type { AuthenticatedSession } from "@/lib/session";
import { persistMessages } from "@/lib/transcript";

import { errorResponse } from "../../automations/_shared/gate";
import { signToolApproval } from "../../chat/approval-signature";

/*
 * What the three voice routes share (slice 9). Voice writes into the same
 * stored conversation as the chat, through the transcript's only writer, so a
 * reload shows what was said and every card exactly as chat would. Messages
 * voice wrote carry metadata.source "voice": the chat marks them, and the
 * approval resume keeps its reply to one sentence because voice says the result
 * (decision 28).
 */

export const VOICE_SOURCE = "voice";

// A realtime session is at most ten minutes (decision 29); anything longer than this is not one turn's speech.
const SAID_TEXT_MAX = 4_000;
const SAID_ITEMS_MAX = 20;
const MESSAGE_ID_MAX = 64;
const MODEL_TEXT_MAX = 6_000;

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/*
 * The conversation voice writes into, when it may: this org's, and still live.
 * The 30-minute rule (decision 10) is otherwise kept only by the browser, so the
 * voice routes hold it too.
 */
export async function liveConversation(
  session: AuthenticatedSession,
  conversationId: unknown,
  requestId: string,
): Promise<{ ok: true; conversation: ConversationRow } | { ok: false; response: Response }> {
  if (typeof conversationId !== "string" || conversationId === "") {
    return { ok: false, response: errorResponse(400, "bad_request", "A conversation id is required.") };
  }
  let conversation: ConversationRow | null;
  try {
    conversation = await getConversation(session, conversationId);
  } catch (error) {
    console.error(logLine("voice_conversation_read_failed", { conversationId, requestId, orgId: session.orgId, error }));
    return { ok: false, response: errorResponse(500, "server_error", "The conversation could not be loaded. Try again in a moment.") };
  }
  if (conversation === null) {
    return { ok: false, response: errorResponse(404, "not_found", "This conversation is not available.") };
  }
  if (isArchived(conversation.updatedAt.getTime(), Date.now())) {
    return { ok: false, response: errorResponse(409, "archived", "This conversation was archived. Start a new chat to use voice.") };
  }
  return { ok: true, conversation };
}

/** The stored conversation ends in a card still waiting for its click, so nothing may follow it yet. */
export function waitingForCard(conversation: ConversationRow): boolean {
  return awaitingApproval(conversation.transcript);
}

export type SaidItem = { id: string; role: "user" | "assistant"; text: string };

/** Finished speech from the browser: the realtime item id, who said it, and the transcript. Anything malformed is dropped. */
export function readSaid(value: unknown): SaidItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, SAID_ITEMS_MAX).flatMap((item): SaidItem[] => {
    const record = item as { id?: unknown; role?: unknown; text?: unknown } | null;
    if (record === null || typeof record !== "object") return [];
    if (typeof record.id !== "string" || record.id === "") return [];
    if (record.role !== "user" && record.role !== "assistant") return [];
    if (typeof record.text !== "string" || record.text.trim() === "") return [];
    return [{ id: record.id, role: record.role, text: record.text.trim().slice(0, SAID_TEXT_MAX) }];
  });
}

/** A realtime item as a stored message id: stable, so saving the same speech twice replaces rather than repeats. */
export function saidMessageId(itemId: string): string {
  return `voice-${itemId}`.slice(0, MESSAGE_ID_MAX);
}

/** The speech not yet stored, as text messages in the order it was said. */
export function saidMessages(said: readonly SaidItem[], transcript: readonly UIMessage[]): UIMessage[] {
  const stored = new Set(transcript.map((message) => message.id));
  return said.flatMap((item) => {
    const id = saidMessageId(item.id);
    if (stored.has(id)) return [];
    stored.add(id);
    return [{ id, role: item.role, metadata: { source: VOICE_SOURCE }, parts: [{ type: "text", text: item.text }] } as UIMessage];
  });
}

/*
 * A change voice proposed, as the chat stores one: an assistant message with an
 * approval-requested tool part and an AI SDK approval signature over its exact
 * input (app/api/chat/approval-signature.ts), so the card's Authorize resumes it
 * through the chat route like any chat proposal.
 */
export async function voiceProposal(input: {
  toolName: string;
  args: Record<string, unknown>;
  secret: string;
}): Promise<{ message: UIMessage; toolCallId: string }> {
  const toolCallId = ulid();
  const approvalId = ulid();
  const signature = await signToolApproval({
    secret: input.secret,
    approvalId,
    toolCallId,
    toolName: input.toolName,
    input: input.args,
  });
  const message = {
    id: ulid(),
    role: "assistant",
    metadata: { source: VOICE_SOURCE },
    parts: [
      {
        type: `tool-${input.toolName}`,
        toolCallId,
        state: "approval-requested",
        input: input.args,
        approval: { id: approvalId, signature },
      },
    ],
  } as UIMessage;
  return { message, toolCallId };
}

/** A form voice put on screen (decision 33): the open request_input part the chat draws, answered above the voice bar or, once voice ends, in the chat. */
export function voiceForm(input: { toolCallId: string; args: Record<string, unknown> }): UIMessage {
  return {
    id: ulid(),
    role: "assistant",
    metadata: { source: VOICE_SOURCE },
    parts: [{ type: "tool-request_input", toolCallId: input.toolCallId, state: "input-available", input: input.args }],
  } as UIMessage;
}

/** A tool voice ran straight away, as a finished tool part: the same card chat draws. */
export function voiceResult(input: { toolName: string; toolCallId: string; args: Record<string, unknown>; output: unknown }): UIMessage {
  return {
    id: ulid(),
    role: "assistant",
    metadata: { source: VOICE_SOURCE },
    parts: [
      {
        type: `tool-${input.toolName}`,
        toolCallId: input.toolCallId,
        state: "output-available",
        input: input.args,
        output: input.output,
      },
    ],
  } as UIMessage;
}

/** Check the conversation with the voice messages added, then store them. */
export async function storeVoiceMessages(input: {
  session: AuthenticatedSession;
  conversation: ConversationRow;
  messages: UIMessage[];
  requestId: string;
}): Promise<{ ok: true } | { ok: false; response: Response }> {
  const { session, conversation, messages, requestId } = input;
  if (messages.length === 0) return { ok: true };
  const fields = { conversationId: conversation.id, requestId, orgId: session.orgId };
  try {
    await validateUIMessages({ messages: [...conversation.transcript, ...messages] });
  } catch (error) {
    console.error(logLine("voice_messages_invalid", { ...fields, error }));
    return { ok: false, response: errorResponse(500, "server_error", "What was said could not be saved to this conversation.") };
  }
  try {
    await persistMessages({ session, conversationId: conversation.id, messages, requestId });
  } catch (error) {
    console.error(logLine("voice_persist_failed", { ...fields, error }));
    return { ok: false, response: errorResponse(500, "server_error", "This could not be saved to the conversation. Try again in a moment.") };
  }
  return { ok: true };
}

/** A tool result for the voice model to read: the same JSON the chat model gets, cut to a size a spoken turn needs. */
export function forVoiceModel(output: unknown): string {
  const text = JSON.stringify(output) ?? "";
  return text.length > MODEL_TEXT_MAX ? `${text.slice(0, MODEL_TEXT_MAX)}… (cut short; the card shows everything)` : text;
}

/** Best-effort work after the response (the read's ledger row), inline when there is no request scope. */
export function afterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

export function logLine(event: string, fields: Record<string, unknown> & { error?: unknown }): string {
  const { error, ...rest } = fields;
  return JSON.stringify({
    event,
    ...rest,
    ...(error !== undefined ? { message: error instanceof Error ? error.message : String(error) } : {}),
  });
}
