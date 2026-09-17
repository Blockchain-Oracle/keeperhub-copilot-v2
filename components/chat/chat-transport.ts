import { DefaultChatTransport, type UIMessage } from "ai";

/*
 * The chat's connection to /api/chat. The server keeps the transcript, so every
 * post is { conversationId, message }: which conversation, and the one new
 * message (v1 components/chat/Conversation.tsx).
 */
export const chatTransport = new DefaultChatTransport<UIMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ messages, body }) => ({
    body: { ...body, message: messages[messages.length - 1] },
  }),
});

/*
 * A write card's Authorize or Cancel, in the shape the AI SDK takes it. The SDK
 * posts the decision by itself (sendAutomaticallyWhen) with only the body given
 * here, so the conversation id has to ride on the decision. Without it the route
 * refused every decision with 400 and KeeperHub was never asked to run anything
 * (hosted app, 2026-09-15). A form's answer carries its id the same way.
 */
export function cardDecision(
  approvalId: string,
  approved: boolean,
  conversationId: string,
): { id: string; approved: boolean; options: { body: { conversationId: string } } } {
  return { id: approvalId, approved, options: { body: { conversationId } } };
}
