import { beforeEach, describe, expect, it, vi } from "vitest";

// The voice routes behind the session gate. The accessor, the transcript writer
// and the execution door are mocked; the voice policy, the approval signature and
// the UI message check run for real.
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession }));

const { getConversation } = vi.hoisted(() => ({ getConversation: vi.fn() }));
vi.mock("@/lib/data", () => ({ getConversation }));

const { persistMessages } = vi.hoisted(() => ({ persistMessages: vi.fn() }));
vi.mock("@/lib/transcript", () => ({ persistMessages }));

const { routeToolCall, requiresConfirmation } = vi.hoisted(() => ({ routeToolCall: vi.fn(), requiresConfirmation: vi.fn() }));
vi.mock("@/lib/execution", () => ({ routeToolCall, requiresConfirmation }));

const SECRET = "s".repeat(40);
vi.mock("@/lib/config", () => ({
  getAiConfig: () => ({ toolApprovalSecret: SECRET, openaiApiKey: "sk-test", chatModel: "m", keeperhubMcpUrl: "u" }),
  getVoiceConfig: () => ({ openaiApiKey: "sk-test", realtimeModel: "gpt-realtime-2.1", realtimeVoice: null, sessionSeconds: 600 }),
}));

import { signToolApproval } from "@/app/api/chat/approval-signature";
import { POST as startSession } from "@/app/api/voice/session/route";
import { POST as callTool } from "@/app/api/voice/tool/route";
import { POST as saveTranscript } from "@/app/api/voice/transcript/route";

const SESSION = { id: "s1", userId: "u1", orgId: "org-1", scope: "mcp:read mcp:write", accessToken: "tok" };
const A = `0x${"a".repeat(40)}`;
const TRANSFER = { chain_id: "84532", to_address: A, amount: "0" };

function conversation(transcript: unknown[] = [], updatedAt = new Date()) {
  return { id: "conv-1", orgId: "org-1", title: "New conversation", transcript, revision: 1, createdAt: updatedAt, updatedAt };
}

function post(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "kh_network=84532" },
    body: JSON.stringify(body),
  });
}

const WAITING = {
  id: "m-card",
  role: "assistant",
  parts: [{ type: "tool-execute_transfer", toolCallId: "t1", state: "approval-requested", input: TRANSFER, approval: { id: "ap1" } }],
};

beforeEach(() => {
  getSession.mockReset();
  getConversation.mockReset();
  persistMessages.mockReset();
  routeToolCall.mockReset();
  requiresConfirmation.mockReset();
  getSession.mockResolvedValue(SESSION);
  getConversation.mockResolvedValue(conversation());
  persistMessages.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("the voice routes' gates", () => {
  it("turn away signed-out visitors", async () => {
    getSession.mockResolvedValue(null);
    for (const response of [
      await startSession(post("/api/voice/session", { conversationId: "conv-1" })),
      await callTool(post("/api/voice/tool", { conversationId: "conv-1", toolName: "search_actions", args: {} })),
      await saveTranscript(post("/api/voice/transcript", { conversationId: "conv-1", items: [] })),
    ]) {
      expect(response.status).toBe(401);
    }
  });

  it("refuse an archived or missing conversation, and an unknown tool", async () => {
    getConversation.mockResolvedValue(conversation([], new Date(Date.now() - 31 * 60_000)));
    expect((await callTool(post("/api/voice/tool", { conversationId: "conv-1", toolName: "search_actions", args: {} }))).status).toBe(409);
    getConversation.mockResolvedValue(null);
    expect((await startSession(post("/api/voice/session", { conversationId: "gone" }))).status).toBe(404);
    getConversation.mockResolvedValue(conversation());
    expect((await callTool(post("/api/voice/tool", { conversationId: "conv-1", toolName: "teleport", args: {} }))).status).toBe(400);
  });
});

describe("starting a voice session", () => {
  it("mints a short-lived key for the realtime model and hands back the rules and tools", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ value: "ek_test", expires_at: 1_900_000_000 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await startSession(post("/api/voice/session", { conversationId: "conv-1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ value: "ek_test", model: "gpt-realtime-2.1", sessionSeconds: 600 });
    expect(body.instructions).toContain("Base Sepolia (chain id 84532)");
    expect(body.tools).toHaveLength(14);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/realtime/client_secrets");
    expect(init.headers.authorization).toBe("Bearer sk-test");
    expect(JSON.parse(init.body)).toMatchObject({ session: { type: "realtime", model: "gpt-realtime-2.1" } });
    vi.unstubAllGlobals();
  });

  it("answers in the picked language and hears it in the transcript (decisions 38–40)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ value: "ek_test", expires_at: 1_900_000_000 })));
    const picked = await startSession(
      new Request("http://localhost/api/voice/session", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: "kh_network=84532; kh_locale=ja" },
        body: JSON.stringify({ conversationId: "conv-1" }),
      }),
    );
    const body = await picked.json();
    expect(body.transcriptionLanguage).toBe("ja");
    expect(body.instructions).toContain("Reply only in Japanese (日本語)");

    const unpicked = await (await startSession(post("/api/voice/session", { conversationId: "conv-1" }))).json();
    expect(unpicked.transcriptionLanguage).toBe("en");
    vi.unstubAllGlobals();
  });

  it("says so plainly when OpenAI refuses the key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401 })));
    const response = await startSession(post("/api/voice/session", { conversationId: "conv-1" }));
    expect(response.status).toBe(502);
    vi.unstubAllGlobals();
  });
});

describe("a tool voice called", () => {
  it("refuses what cannot run without storing anything", async () => {
    const response = await callTool(post("/api/voice/tool", { conversationId: "conv-1", toolName: "execute_contract_call", args: {} }));
    expect(await response.json()).toMatchObject({ ok: false, pending: false, messages: [] });
    expect(routeToolCall).not.toHaveBeenCalled();
    expect(persistMessages).not.toHaveBeenCalled();
  });

  it("runs a read and stores what was said before it, then its card", async () => {
    requiresConfirmation.mockReturnValue(false);
    routeToolCall.mockResolvedValue({ ok: true, tool: "search_actions", result: { matches: [] } });
    const response = await callTool(
      post("/api/voice/tool", {
        conversationId: "conv-1",
        toolName: "search_actions",
        args: { query: "eth price" },
        said: [{ id: "item_1", role: "user", text: "What's the ETH price?" }],
      }),
    );
    const body = await response.json();

    expect(body).toMatchObject({ ok: true, pending: false });
    expect(body.forModel).toContain("search_actions");
    const stored = persistMessages.mock.calls[0][0].messages;
    expect(stored.map((message: { id: string; role: string }) => message.role)).toEqual(["user", "assistant"]);
    expect(stored[0]).toMatchObject({ id: "voice-item_1", metadata: { source: "voice" } });
    expect(stored[1].parts[0]).toMatchObject({ type: "tool-search_actions", state: "output-available" });
    expect(routeToolCall).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "conv-1", toolName: "search_actions" }));
  });

  it("stores a change as the chat's signed card and tells voice it is waiting, without running it", async () => {
    requiresConfirmation.mockReturnValue(true);
    const response = await callTool(post("/api/voice/tool", { conversationId: "conv-1", toolName: "execute_transfer", args: TRANSFER }));
    const body = await response.json();

    expect(body).toMatchObject({ ok: true, pending: true });
    expect(body.forModel).toContain("has NOT happened");
    expect(routeToolCall).not.toHaveBeenCalled();
    const [card] = persistMessages.mock.calls[0][0].messages;
    const part = card.parts[0];
    expect(body.cardToolCallId).toBe(part.toolCallId);
    expect(card.metadata).toEqual({ source: "voice" });
    expect(part).toMatchObject({ type: "tool-execute_transfer", state: "approval-requested", input: TRANSFER });
    const expected = await signToolApproval({
      secret: SECRET,
      approvalId: part.approval.id,
      toolCallId: part.toolCallId,
      toolName: "execute_transfer",
      input: TRANSFER,
    });
    expect(part.approval.signature).toBe(expected);
  });

  it("refuses a second card while one waits, and a change whose details don't fit", async () => {
    requiresConfirmation.mockReturnValue(true);
    getConversation.mockResolvedValue(conversation([WAITING]));
    const second = await callTool(post("/api/voice/tool", { conversationId: "conv-1", toolName: "execute_transfer", args: TRANSFER }));
    expect((await second.json()).forModel).toContain("already waiting");

    getConversation.mockResolvedValue(conversation());
    const broken = await callTool(post("/api/voice/tool", { conversationId: "conv-1", toolName: "execute_transfer", args: { amount: "1" } }));
    expect(await broken.json()).toMatchObject({ ok: false, pending: false });
    expect(persistMessages).not.toHaveBeenCalled();
  });

  it("does not store a proposal the check sent back, so voice can fix it", async () => {
    requiresConfirmation.mockReturnValue(false);
    routeToolCall.mockResolvedValue({ ok: false, tool: "create_automation", error: { code: "validation_failed", message: "fix it" } });
    const response = await callTool(post("/api/voice/tool", { conversationId: "conv-1", toolName: "create_automation", args: { name: "x" } }));
    expect(await response.json()).toMatchObject({ ok: false, messages: [] });
    expect(persistMessages).not.toHaveBeenCalled();
  });
});

describe("saving what was said", () => {
  it("stores each finished line once, under a stable id", async () => {
    getConversation.mockResolvedValue(conversation([{ id: "voice-item_1", role: "user", parts: [{ type: "text", text: "hi" }] }]));
    const response = await saveTranscript(
      post("/api/voice/transcript", {
        conversationId: "conv-1",
        items: [
          { id: "item_1", role: "user", text: "hi" },
          { id: "item_2", role: "assistant", text: "Hello." },
          { id: "item_3", role: "user", text: "   " },
        ],
      }),
    );
    const body = await response.json();
    expect(body.held).toBe(false);
    expect(body.messages.map((message: { id: string }) => message.id)).toEqual(["voice-item_2"]);
  });

  it("holds everything while a card waits", async () => {
    getConversation.mockResolvedValue(conversation([WAITING]));
    const response = await saveTranscript(
      post("/api/voice/transcript", { conversationId: "conv-1", items: [{ id: "item_9", role: "assistant", text: "Waiting." }] }),
    );
    expect(await response.json()).toEqual({ held: true, messages: [] });
    expect(persistMessages).not.toHaveBeenCalled();
  });
});
