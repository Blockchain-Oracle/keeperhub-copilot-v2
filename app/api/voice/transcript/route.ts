import type { UIMessage } from "ai";

import { gateSession } from "../../automations/_shared/gate";
import { liveConversation, readJson, readSaid, saidMessages, storeVoiceMessages, waitingForCard } from "../_shared/voice";

/*
 * What was said in a voice session, saved into its conversation (slice 9):
 * the person's words and the voice's replies as ordinary text messages with
 * stable ids, so the chat shows them and a reload keeps them. Nothing may follow
 * a card still waiting for its click (the chat's lock and the approval resume
 * both read the last message), so speech that arrives then is not saved; the
 * card is the record, and the mic is muted while it waits (decision 30).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export type VoiceTranscriptResponse = {
  /** True when a card was waiting and nothing was saved. */
  held: boolean;
  messages: UIMessage[];
};

export async function POST(request: Request): Promise<Response> {
  const gate = await gateSession("voice_transcript_session_error");
  if (!gate.ok) return gate.response;
  const { session, requestId } = gate;
  const body = await readJson(request);
  const live = await liveConversation(session, body.conversationId, requestId);
  if (!live.ok) return live.response;
  const { conversation } = live;

  if (waitingForCard(conversation)) return answer({ held: true, messages: [] });

  const messages = saidMessages(readSaid(body.items), conversation.transcript);
  const stored = await storeVoiceMessages({ session, conversation, messages, requestId });
  if (!stored.ok) return stored.response;
  return answer({ held: false, messages });
}

function answer(payload: VoiceTranscriptResponse): Response {
  return Response.json(payload, { headers: { "cache-control": "no-store" } });
}
