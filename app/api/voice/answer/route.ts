import { validateUIMessages, type UIMessage } from "ai";

import { checkInputAnswer, findOpenForm, readInputRequest, withFormAnswer } from "@/lib/chat/input-request";
import { persistMessages } from "@/lib/transcript";

import { errorResponse, gateSession } from "../../automations/_shared/gate";
import { liveConversation, logLine, readJson } from "../_shared/voice";

/*
 * The answer to a form voice put on screen (decision 33). The person filled it
 * in above the voice bar; the answer is checked against the stored form (never
 * the browser's copy), stored on that form's part, and handed back for the chat
 * to show. No chat model runs: voice is the one talking, and the chat's watcher
 * tells it what was entered.
 */
export const dynamic = "force-dynamic";

export type VoiceAnswerResponse = { messages: UIMessage[] };

export async function POST(request: Request): Promise<Response> {
  const gate = await gateSession("voice_answer_session_error");
  if (!gate.ok) return gate.response;
  const { session, requestId } = gate;
  const body = await readJson(request);
  const live = await liveConversation(session, body.conversationId, requestId);
  if (!live.ok) return live.response;
  const { conversation } = live;
  const fields = { conversationId: conversation.id, requestId, orgId: session.orgId };

  const toolCallId = body.toolCallId;
  if (typeof toolCallId !== "string" || toolCallId === "") {
    return errorResponse(400, "bad_request", "Which form this answers is missing.");
  }
  const open = findOpenForm(conversation.transcript, toolCallId);
  const formRequest = open === null ? null : readInputRequest(open.input);
  if (open === null || formRequest === null) {
    return errorResponse(409, "not_found", "This form is no longer waiting.");
  }

  const checked = checkInputAnswer(formRequest, body.answer);
  if (!checked.ok) {
    return Response.json(
      { error: { code: "validation_failed", message: "Check the highlighted details.", issues: checked.issues } },
      { status: 400 },
    );
  }

  const transcript = withFormAnswer(conversation.transcript, toolCallId, checked.answer);
  const answered = transcript?.find((message) => message.id === open.message.id);
  if (transcript === null || answered === undefined) {
    return errorResponse(409, "not_found", "This form is no longer waiting.");
  }
  try {
    await validateUIMessages({ messages: transcript });
  } catch (error) {
    console.error(logLine("voice_answer_invalid", { ...fields, error }));
    return errorResponse(500, "server_error", "Your details could not be saved to this conversation.");
  }
  try {
    await persistMessages({ session, conversationId: conversation.id, messages: [answered], requestId });
  } catch (error) {
    console.error(logLine("voice_persist_failed", { ...fields, error }));
    return errorResponse(500, "server_error", "Your details could not be saved. Try again in a moment.");
  }

  console.log(logLine("voice_form_answered", { ...fields, toolCallId, cancelled: "cancelled" in checked.answer }));
  return Response.json({ messages: [answered] } satisfies VoiceAnswerResponse, { headers: { "cache-control": "no-store" } });
}
