import { Chat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import { cardDecision, chatTransport } from "@/components/chat/chat-transport";

/*
 * What actually leaves the browser for /api/chat, driven through the real AI SDK
 * Chat and the app's own transport. The route needs { conversationId, message }
 * on every post. The SDK posts a write card's Authorize or Cancel by itself, and
 * those posts once went out without the id, so KeeperHub was never asked to run
 * anything (hosted app, 2026-09-15).
 */

const user: UIMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "Borrow on Aave" }] };

const waitingCard: UIMessage = {
  id: "a1",
  role: "assistant",
  parts: [
    { type: "step-start" },
    {
      type: "tool-execute_protocol_action",
      toolCallId: "call_1",
      state: "approval-requested",
      input: { actionType: "aave-v3/borrow", params: { network: "11155111", amount: "100" } },
      approval: { id: "approval_1" },
    },
  ] as UIMessage["parts"],
};

/* Every post's JSON body; the server answers 400 so nothing streams. */
function capturePosts(): Array<Record<string, unknown>> {
  const bodies: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ error: { code: "test", message: "stop here" } }), { status: 400 });
    }),
  );
  return bodies;
}

function chatWith(messages: UIMessage[]) {
  return new Chat<UIMessage>({
    messages,
    transport: chatTransport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: () => {},
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chat transport", () => {
  it.each([
    ["authorized", true],
    ["cancelled", false],
  ])("an %s write card posts with the conversation id", async (_label, approved) => {
    const bodies = capturePosts();
    const chat = chatWith([user, waitingCard]);

    await chat.addToolApprovalResponse(cardDecision("approval_1", approved, "conv_1"));

    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect(Object.keys(bodies[0] ?? {}).sort()).toEqual(["conversationId", "message"]);
    expect(bodies[0]?.conversationId).toBe("conv_1");
    const message = bodies[0]?.message as UIMessage;
    expect(message.role).toBe("assistant");
    expect(message.parts[1]).toMatchObject({ state: "approval-responded", approval: { id: "approval_1", approved } });
  });

  it("Try again after a failed post names the conversation again", async () => {
    const bodies = capturePosts();
    const chat = chatWith([user, waitingCard]);

    await chat.addToolApprovalResponse(cardDecision("approval_1", true, "conv_1"));
    await vi.waitFor(() => expect(chat.status).toBe("error"));
    chat.clearError();
    await chat.addToolApprovalResponse(cardDecision("approval_1", true, "conv_1"));

    await vi.waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies.map((body) => body.conversationId)).toEqual(["conv_1", "conv_1"]);
  });

  it("sends a typed message as the conversation id and that one message", async () => {
    const bodies = capturePosts();
    const chat = chatWith([]);

    await chat.sendMessage({ text: "hello" }, { body: { conversationId: "conv_1" } });

    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect(Object.keys(bodies[0] ?? {}).sort()).toEqual(["conversationId", "message"]);
    expect((bodies[0]?.message as UIMessage).role).toBe("user");
  });
});
