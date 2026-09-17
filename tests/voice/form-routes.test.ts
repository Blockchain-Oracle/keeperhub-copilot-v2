import type { UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Forms in voice (decision 33), behind the same seams as routes.test.ts.
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession }));

const { getConversation } = vi.hoisted(() => ({ getConversation: vi.fn() }));
vi.mock("@/lib/data", () => ({ getConversation }));

const { persistMessages } = vi.hoisted(() => ({ persistMessages: vi.fn() }));
vi.mock("@/lib/transcript", () => ({ persistMessages }));

const { routeToolCall, requiresConfirmation } = vi.hoisted(() => ({ routeToolCall: vi.fn(), requiresConfirmation: vi.fn() }));
vi.mock("@/lib/execution", () => ({ routeToolCall, requiresConfirmation }));

vi.mock("@/lib/config", () => ({
  getAiConfig: () => ({ toolApprovalSecret: "s".repeat(40), openaiApiKey: "sk-test", chatModel: "m", keeperhubMcpUrl: "u" }),
}));

import { POST as answerForm } from "@/app/api/voice/answer/route";
import { POST as callTool } from "@/app/api/voice/tool/route";
import { voiceLabel, voiceHint } from "@/components/voice/voice-rules";
import { voiceOutcome } from "@/lib/voice/outcome";
import { gateVoiceCall, VOICE_POLICY_PROMPT } from "@/lib/voice/policy";

const SESSION = { id: "s1", userId: "u1", orgId: "org-1", scope: "mcp:read mcp:write", accessToken: "tok" };
const EVM = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const FORM = {
  title: "Send ETH",
  fields: [
    { key: "recipient", kind: "address", label: "Recipient address" },
    { key: "amount", kind: "amount", label: "Amount", unit: "ETH" },
    { key: "network", kind: "network", label: "Network" },
  ],
};

function conversation(transcript: unknown[] = []) {
  const now = new Date();
  return { id: "conv-1", orgId: "org-1", title: "New conversation", transcript, revision: 1, createdAt: now, updatedAt: now };
}

function post(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const OPEN_FORM = {
  id: "m-form",
  role: "assistant",
  metadata: { source: "voice" },
  parts: [{ type: "tool-request_input", toolCallId: "form-1", state: "input-available", input: FORM }],
};

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(SESSION);
  getConversation.mockReset().mockResolvedValue(conversation());
  persistMessages.mockReset().mockResolvedValue(undefined);
  routeToolCall.mockReset();
  requiresConfirmation.mockReset().mockReturnValue(false);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("a form voice asks for", () => {
  it("is stored open, runs nothing, and tells the browser to show it above the voice bar", async () => {
    const response = await callTool(
      post("/api/voice/tool", {
        conversationId: "conv-1",
        toolName: "request_input",
        args: FORM,
        said: [{ id: "item-1", role: "user", text: "send some eth to a friend" }],
      }),
    );
    const body = (await response.json()) as { ok: boolean; pending: boolean; waitingKind: string; cardToolCallId: string; forModel: string; messages: UIMessage[] };
    expect(body).toMatchObject({ ok: true, pending: true, waitingKind: "form" });
    expect(body.forModel).toContain("form is on screen");
    expect(routeToolCall).not.toHaveBeenCalled();
    expect(body.messages).toHaveLength(2);
    expect(body.messages[1].parts[0]).toMatchObject({
      type: "tool-request_input",
      toolCallId: body.cardToolCallId,
      state: "input-available",
      input: FORM,
    });
    expect(persistMessages).toHaveBeenCalledTimes(1);
  });

  it("sends a form that doesn't fit back to voice, storing nothing", async () => {
    const response = await callTool(
      post("/api/voice/tool", { conversationId: "conv-1", toolName: "request_input", args: { fields: [{ key: "x", kind: "choice", label: "X" }] } }),
    );
    const body = (await response.json()) as { ok: boolean; pending: boolean; forModel: string };
    expect(body).toMatchObject({ ok: false, pending: false });
    expect(body.forModel).toContain("doesn't fit");
    expect(persistMessages).not.toHaveBeenCalled();
  });

  it("holds every other tool while the form waits", async () => {
    getConversation.mockResolvedValue(conversation([OPEN_FORM]));
    const response = await callTool(post("/api/voice/tool", { conversationId: "conv-1", toolName: "search_actions", args: {} }));
    const body = (await response.json()) as { ok: boolean; forModel: string };
    expect(body.ok).toBe(false);
    expect(routeToolCall).not.toHaveBeenCalled();
  });
});

describe("answering it above the voice bar", () => {
  beforeEach(() => {
    getConversation.mockResolvedValue(conversation([OPEN_FORM]));
  });

  it("stores the checked answer on the form's part and hands it back, with no model", async () => {
    const response = await answerForm(
      post("/api/voice/answer", {
        conversationId: "conv-1",
        toolCallId: "form-1",
        answer: { values: { recipient: EVM, amount: "0.01", network: "84532" } },
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { messages: UIMessage[] };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].id).toBe("m-form");
    expect(body.messages[0].parts[0]).toMatchObject({
      state: "output-available",
      output: { values: { recipient: EVM, amount: "0.01", network: "84532" } },
    });
    expect(persistMessages.mock.calls[0][0].messages).toEqual(body.messages);
  });

  it("returns the problems for the form to show, storing nothing", async () => {
    const response = await answerForm(
      post("/api/voice/answer", { conversationId: "conv-1", toolCallId: "form-1", answer: { values: { recipient: "nope", amount: "1", network: "84532" } } }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { issues: Array<{ path: string }> } };
    expect(body.error.issues.map((issue) => issue.path)).toEqual(["recipient"]);
    expect(persistMessages).not.toHaveBeenCalled();
  });

  it("answers 409 for a form no longer waiting, 400 without its id, 401 signed out", async () => {
    expect((await answerForm(post("/api/voice/answer", { conversationId: "conv-1", toolCallId: "other", answer: { cancelled: true } }))).status).toBe(409);
    expect((await answerForm(post("/api/voice/answer", { conversationId: "conv-1", answer: { cancelled: true } }))).status).toBe(400);
    getSession.mockResolvedValue(null);
    expect((await answerForm(post("/api/voice/answer", { conversationId: "conv-1", toolCallId: "form-1", answer: { cancelled: true } }))).status).toBe(401);
  });
});

describe("what voice hears and shows", () => {
  it("hears the exact values entered, with the network's name", () => {
    const line = voiceOutcome({
      type: "tool-request_input",
      state: "output-available",
      input: FORM,
      output: { values: { recipient: EVM, amount: "0.01", network: "84532" } },
    });
    expect(line).toContain(EVM);
    expect(line).toContain("Amount: 0.01 ETH");
    expect(line).toContain("Base Sepolia (chain id 84532)");
    expect(voiceOutcome({ type: "tool-request_input", state: "output-available", input: FORM, output: { cancelled: true } })).toContain(
      "closed the form",
    );
    expect(voiceOutcome({ type: "tool-request_input", state: "input-available", input: FORM })).toBeNull();
  });

  it("says it waits for details, not a card, and the rules teach the form", () => {
    expect(voiceLabel("waiting", true, "form")).toBe("Waiting for your details");
    expect(voiceHint("waiting", true, "form")).toBe("Fill in the form above to carry on.");
    expect(voiceLabel("waiting", true)).toBe("Waiting for your card");
    expect(gateVoiceCall("request_input", FORM).outcome).toBe("run");
    expect(VOICE_POLICY_PROMPT).toContain("request_input");
  });
});
