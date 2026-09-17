import type { UIMessage } from "ai";
import { ulid } from "ulid";

import { requestInputSchema, REQUEST_INPUT_TOOL } from "@/lib/chat/input-request";
import { getAiConfig } from "@/lib/config";
import { requiresConfirmation, routeToolCall } from "@/lib/execution";
import { INPUT_SCHEMAS, SURFACE_TOOL_NAMES, type SurfaceToolName } from "@/lib/registry/surface-tools";
import { gateVoiceCall } from "@/lib/voice/policy";

import { errorResponse, gateSession } from "../../automations/_shared/gate";
import {
  afterResponse,
  forVoiceModel,
  liveConversation,
  logLine,
  readJson,
  readSaid,
  saidMessages,
  storeVoiceMessages,
  voiceForm,
  voiceProposal,
  voiceResult,
  waitingForCard,
} from "../_shared/voice";

/*
 * A tool the voice model called (slice 9, decision 26). The browser only
 * forwards the call; everything is decided here, through the same doors as the
 * chat route:
 *   - gateVoiceCall refuses what cannot run (never shown as a card);
 *   - a conversation already ending in a waiting card refuses another one;
 *   - a change (requiresConfirmation, as the chat's toolApproval) is stored as
 *     the chat's signed approval-requested card and voice is told it is waiting;
 *     it runs only when the person authorizes that card;
 *   - a form for details (request_input, decision 33) is stored open and voice
 *     waits; the person answers it above the voice bar (/api/voice/answer);
 *   - anything else runs through routeToolCall and is stored as its card.
 * The speech said before the call is stored first, so the conversation reads in
 * order. A proposal the check sends back is not stored: voice fixes it, as the
 * chat model does.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export type VoiceToolResponse = {
  /** Whether the call did what was asked (a card waiting counts). */
  ok: boolean;
  /** A card now waits for the person's click; the browser mutes the mic (decision 30). */
  pending: boolean;
  /** The waiting card's tool call id, which the chat watches to tell voice how it ended. */
  cardToolCallId?: string;
  /** A card to authorize, or a form of details shown above the voice bar. */
  waitingKind?: "card" | "form";
  /** What the voice model reads as the tool's result. */
  forModel: string;
  /** What was stored, for the open chat to show. */
  messages: UIMessage[];
};

const CARD_WAITING =
  "The card is on screen, waiting for the person to authorize or cancel it. It has NOT happened. Say that in one short sentence, then stop and wait for a system message with the outcome.";

const FORM_WAITING =
  "A form is on screen above the voice bar, asking the person for these details. Say that in one short sentence, then stop and wait for a system message with their answer.";

export async function POST(request: Request): Promise<Response> {
  const gate = await gateSession("voice_tool_session_error");
  if (!gate.ok) return gate.response;
  const { session, requestId } = gate;
  const body = await readJson(request);
  const live = await liveConversation(session, body.conversationId, requestId);
  if (!live.ok) return live.response;
  const { conversation } = live;

  const toolName = body.toolName;
  if (typeof toolName !== "string" || !(SURFACE_TOOL_NAMES as readonly string[]).includes(toolName)) {
    return errorResponse(400, "unknown_tool", "This tool is not available.");
  }
  const surfaceTool = toolName as SurfaceToolName;
  const args = body.args;
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    return errorResponse(400, "bad_request", "The tool's arguments could not be read.");
  }
  const input = args as Record<string, unknown>;

  const decision = gateVoiceCall(surfaceTool, input);
  if (decision.outcome === "block") {
    return answer({ ok: false, pending: false, forModel: `Not run. ${decision.reason}`, messages: [] });
  }
  if (waitingForCard(conversation)) {
    return answer({
      ok: false,
      pending: false,
      forModel: "Not run. A card is already waiting on screen. Tell the person to authorize or cancel it first.",
      messages: [],
    });
  }

  const before = saidMessages(readSaid(body.said), conversation.transcript);

  if (surfaceTool === REQUEST_INPUT_TOOL) {
    const parsed = requestInputSchema.safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
      return answer({ ok: false, pending: false, forModel: `Not shown. This form doesn't fit the tool: ${issues}`, messages: [] });
    }
    const toolCallId = ulid();
    const messages = [...before, voiceForm({ toolCallId, args: input })];
    const stored = await storeVoiceMessages({ session, conversation, messages, requestId });
    if (!stored.ok) return stored.response;
    console.log(logLine("voice_form_shown", { conversationId: conversation.id, requestId, orgId: session.orgId, toolCallId }));
    return answer({ ok: true, pending: true, waitingKind: "form", cardToolCallId: toolCallId, forModel: FORM_WAITING, messages });
  }

  if (requiresConfirmation(surfaceTool, input)) {
    const parsed = INPUT_SCHEMAS[surfaceTool].safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
      return answer({ ok: false, pending: false, forModel: `Not shown. These details don't fit the tool: ${issues}`, messages: [] });
    }
    let secret: string;
    try {
      secret = getAiConfig().toolApprovalSecret;
    } catch (error) {
      console.error(logLine("voice_config_error", { requestId, orgId: session.orgId, error }));
      return errorResponse(500, "server_error", "Voice is not configured yet.");
    }
    const { message, toolCallId } = await voiceProposal({ toolName: surfaceTool, args: input, secret });
    const messages = [...before, message];
    const stored = await storeVoiceMessages({ session, conversation, messages, requestId });
    if (!stored.ok) return stored.response;
    console.log(logLine("voice_card_proposed", { conversationId: conversation.id, requestId, orgId: session.orgId, toolName, toolCallId }));
    return answer({ ok: true, pending: true, waitingKind: "card", cardToolCallId: toolCallId, forModel: CARD_WAITING, messages });
  }

  const toolCallId = ulid();
  const output = await routeToolCall({
    session,
    toolName: surfaceTool,
    args: input,
    requestId,
    signal: request.signal,
    conversationId: conversation.id,
    toolCallId,
    deferBackground: afterResponse,
  });

  // A proposal the check sent back, or an action KeeperHub runs only in automations, never reaches the person as a card; voice repairs or reroutes it.
  const returned = output.ok === false && (output.error.code === "validation_failed" || output.error.code === "automation_only");
  const messages = returned ? before : [...before, voiceResult({ toolName: surfaceTool, toolCallId, args: input, output })];
  const stored = await storeVoiceMessages({ session, conversation, messages, requestId });
  if (!stored.ok) return stored.response;
  return answer({ ok: output.ok, pending: false, forModel: forVoiceModel(output), messages });
}

function answer(payload: VoiceToolResponse): Response {
  return Response.json(payload, { headers: { "cache-control": "no-store" } });
}
