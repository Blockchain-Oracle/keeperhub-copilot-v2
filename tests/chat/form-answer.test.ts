import type { UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The chat route's form path (decision 32). The same seams as route.test.ts:
 * session, data, transcript writer, AI config and the model call are mocked;
 * the form check, the UI message check and the conversion run for real.
 */
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession }));

const { getConversation, autoTitleConversation } = vi.hoisted(() => ({ getConversation: vi.fn(), autoTitleConversation: vi.fn() }));
vi.mock("@/lib/data", () => ({ getConversation, autoTitleConversation, NEW_CONVERSATION_TITLE: "New conversation" }));

const { persistMessages } = vi.hoisted(() => ({ persistMessages: vi.fn() }));
vi.mock("@/lib/transcript", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/transcript")>()),
  persistMessages,
}));

const { getAiConfig } = vi.hoisted(() => ({ getAiConfig: vi.fn() }));
vi.mock("@/lib/config", () => ({ getAiConfig }));

const { orgWallet } = vi.hoisted(() => ({ orgWallet: vi.fn() }));
vi.mock("@/lib/session/org-wallet", () => ({ orgWallet }));

const { streamText, toUIMessageStreamResponse } = vi.hoisted(() => ({ streamText: vi.fn(), toUIMessageStreamResponse: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("ai")>()), streamText }));

import { buildTools, detectInputAnswers, POST } from "@/app/api/chat/route";

const SESSION = { id: "s1", userId: "u1", orgId: "org-1", scope: "mcp:read mcp:write", accessToken: "tok" };
const EVM = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const FORM = {
  title: "Send ETH",
  fields: [
    { key: "recipient", kind: "address", label: "Recipient address" },
    { key: "amount", kind: "amount", label: "Amount", unit: "ETH" },
  ],
};

function formPart(state: string, output?: unknown) {
  return { type: "tool-request_input", toolCallId: "form-1", state, input: FORM, ...(output !== undefined ? { output } : {}) };
}

const STORED_OPEN = [
  { id: "u1", role: "user", parts: [{ type: "text", text: "send some eth to a friend" }] },
  { id: "a1", role: "assistant", parts: [{ type: "step-start" }, formPart("input-available")] },
] as unknown as UIMessage[];

function row(transcript: UIMessage[]) {
  return { id: "conv-1", orgId: "org-1", title: "Send ETH", transcript, revision: 1, createdAt: new Date(), updatedAt: new Date() };
}

function post(message: unknown): Request {
  return new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify({ conversationId: "conv-1", message }) });
}

function answerMessage(output: unknown) {
  return { id: "a1", role: "assistant", parts: [{ type: "step-start" }, formPart("output-available", output)] };
}

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(SESSION);
  getConversation.mockReset().mockResolvedValue(row(STORED_OPEN));
  persistMessages.mockReset().mockResolvedValue(undefined);
  getAiConfig.mockReset().mockReturnValue({
    openaiApiKey: "k",
    chatModel: "test-model",
    keeperhubMcpUrl: "http://localhost/mcp",
    toolApprovalSecret: "s".repeat(32),
  });
  orgWallet.mockReset().mockResolvedValue({ evm: EVM, solana: null });
  toUIMessageStreamResponse.mockReset().mockReturnValue(new Response("stream"));
  streamText.mockReset().mockReturnValue({ toUIMessageStreamResponse });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("a form answered in the chat", () => {
  it("resumes the turn with the checked answer on the stored form", async () => {
    const response = await POST(post(answerMessage({ values: { recipient: ` ${EVM}`, amount: "0.01" } })));
    expect(response.status).toBe(200);
    expect(streamText).toHaveBeenCalledTimes(1);
    const options = toUIMessageStreamResponse.mock.calls[0][0] as { originalMessages: UIMessage[] };
    const part = options.originalMessages[1].parts[1] as { state: string; output: unknown; input: unknown };
    expect(part.state).toBe("output-available");
    expect(part.output).toEqual({ values: { recipient: EVM, amount: "0.01" } });
    expect(part.input).toEqual(FORM);
    // The org wallet rides in the instructions (decision 34).
    expect((streamText.mock.calls[0][0] as { instructions: string }).instructions).toContain(EVM);
  });

  it("takes a closed form", async () => {
    const response = await POST(post(answerMessage({ cancelled: true })));
    expect(response.status).toBe(200);
    const options = toUIMessageStreamResponse.mock.calls[0][0] as { originalMessages: UIMessage[] };
    expect((options.originalMessages[1].parts[1] as { output: unknown }).output).toEqual({ cancelled: true });
  });

  it("refuses an answer that fails the form's check, before the model", async () => {
    const response = await POST(post(answerMessage({ values: { recipient: "0x123", amount: "0.01" } })));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { issues: Array<{ path: string }> } };
    expect(body.error.issues.map((issue) => issue.path)).toEqual(["recipient"]);
    expect(streamText).not.toHaveBeenCalled();
  });

  it("refuses a detail the form never asked for", async () => {
    const response = await POST(post(answerMessage({ values: { recipient: EVM, amount: "1", to: EVM } })));
    expect(response.status).toBe(400);
    expect(streamText).not.toHaveBeenCalled();
  });

  it("answers 409 when the form is no longer waiting", async () => {
    getConversation.mockResolvedValue(
      row([STORED_OPEN[0], { id: "a1", role: "assistant", parts: [formPart("output-available", { cancelled: true })] }] as unknown as UIMessage[]),
    );
    const response = await POST(post(answerMessage({ values: { recipient: EVM, amount: "1" } })));
    expect(response.status).toBe(409);
    expect(streamText).not.toHaveBeenCalled();
  });

  it("refuses a new message while a form waits", async () => {
    const response = await POST(post({ id: "u2", role: "user", parts: [{ type: "text", text: "never mind" }] }));
    expect(response.status).toBe(409);
    expect(persistMessages).not.toHaveBeenCalled();
    expect(streamText).not.toHaveBeenCalled();
  });

  it("reads only answered forms from a posted message", () => {
    const message = {
      id: "a1",
      role: "assistant",
      parts: [
        formPart("input-available"),
        { type: "tool-search_actions", toolCallId: "s1", state: "output-available", output: {} },
        formPart("output-available", { cancelled: true }),
      ],
    } as unknown as UIMessage;
    expect(detectInputAnswers(message)).toEqual([{ toolCallId: "form-1", output: { cancelled: true } }]);
    expect(detectInputAnswers({ id: "u", role: "user", parts: [] } as UIMessage)).toEqual([]);
  });

  it("gives the model the form with no execute, so the turn stops on it", () => {
    const tools = buildTools(SESSION, "req", new AbortController().signal, "conv-1") as Record<string, { execute?: unknown }>;
    expect(tools.request_input).toBeDefined();
    expect(tools.request_input.execute).toBeUndefined();
    expect(typeof tools.search_actions.execute).toBe("function");
  });
});
