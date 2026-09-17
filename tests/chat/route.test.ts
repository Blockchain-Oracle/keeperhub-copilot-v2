import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UIMessage } from "ai";

/*
 * Mock seams: the session gate, the data accessors, the transcript writer,
 * the AI config, and the model calls (streamText/generateText). Everything
 * else — validateUIMessages, sanitizeUserMessage, the envelope logic — runs
 * real. The streaming happy path against a live model stays with the
 * deferred live proof (Task 11).
 */
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession }));

const { getConversation, autoTitleConversation } = vi.hoisted(() => ({
  getConversation: vi.fn(),
  autoTitleConversation: vi.fn(),
}));
vi.mock("@/lib/data", () => ({
  getConversation,
  autoTitleConversation,
  NEW_CONVERSATION_TITLE: "New conversation",
}));

const { persistMessages } = vi.hoisted(() => ({ persistMessages: vi.fn() }));
vi.mock("@/lib/transcript", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/transcript")>()),
  persistMessages,
}));

const { getAiConfig } = vi.hoisted(() => ({ getAiConfig: vi.fn() }));
vi.mock("@/lib/config", () => ({ getAiConfig }));

const { streamText, generateText, toUIMessageStreamResponse } = vi.hoisted(
  () => ({
    streamText: vi.fn(),
    generateText: vi.fn(),
    toUIMessageStreamResponse: vi.fn(),
  }),
);
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  streamText,
  generateText,
}));

// Partial-mock lib/execution: keep requiresConfirmation + routeToolCall REAL (the
// buildTools + toolApproval tests bind the real gate), mock ONLY the declined-row
// writer so the decline hook never touches the DB (Story 2.4, D21).
const { recordWriteDecline } = vi.hoisted(() => ({ recordWriteDecline: vi.fn() }));
vi.mock("@/lib/execution", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/execution")>()),
  recordWriteDecline,
}));

import {
  applyApprovalDecision,
  buildTools,
  detectApprovalResume,
  isModelVisibleMessage,
  POST,
} from "@/app/api/chat/route";
import { signToolApproval } from "@/app/api/chat/approval-signature";

function post(body: string): Request {
  return new Request("http://localhost/api/chat", { method: "POST", body });
}

function chatBody(overrides?: Record<string, unknown>): string {
  return JSON.stringify({
    conversationId: "conv-1",
    message: {
      id: "client-msg-1",
      role: "user",
      parts: [{ type: "text", text: "What is my balance?" }],
    },
    ...overrides,
  });
}

function msg(id: string, role: UIMessage["role"], text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

const FAKE_SESSION = {
  id: "s1",
  userId: "u1",
  orgId: "org-1",
  scope: "mcp:read",
  accessToken: "tok",
};

function conversationRow(overrides?: Record<string, unknown>) {
  return {
    id: "conv-1",
    orgId: "org-1",
    title: "New conversation",
    transcript: [] as UIMessage[],
    revision: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Capture the toUIMessageStreamResponse options the route passes. */
type StreamOptions = {
  originalMessages: UIMessage[];
  generateMessageId: () => string;
  onEnd: (event: {
    messages: UIMessage[];
    isAborted: boolean;
    isContinuation: boolean;
    responseMessage: UIMessage;
    finishReason?: string;
  }) => Promise<void> | void;
};

function lastStreamOptions(): StreamOptions {
  expect(toUIMessageStreamResponse).toHaveBeenCalled();
  return toUIMessageStreamResponse.mock.calls.at(-1)![0] as StreamOptions;
}

beforeEach(() => {
  getSession.mockReset();
  getConversation.mockReset();
  autoTitleConversation.mockReset();
  persistMessages.mockReset();
  getAiConfig.mockReset();
  streamText.mockReset();
  generateText.mockReset();
  toUIMessageStreamResponse.mockReset();
  recordWriteDecline.mockReset();
  recordWriteDecline.mockResolvedValue(undefined);

  getAiConfig.mockReturnValue({
    openaiApiKey: "k",
    chatModel: "test-model",
    keeperhubMcpUrl: "http://localhost/mcp",
  });
  streamText.mockReturnValue({
    toUIMessageStreamResponse: toUIMessageStreamResponse.mockReturnValue(
      new Response("stream"),
    ),
  });
  persistMessages.mockResolvedValue(undefined);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/chat gate + body shape", () => {
  it("returns 401 with the error envelope when signed out (guest chat is Epic 7)", async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(post(chatBody()));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("unauthorized");
    expect(json.error.message).toContain("Connect KeeperHub");
  });

  it("returns 400 when the body is unreadable (signed in, bad JSON)", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    const res = await POST(post("not-json"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("bad_request");
  });

  it("returns 400 when conversationId is missing or not a string", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    for (const conversationId of [undefined, 42]) {
      const res = await POST(post(chatBody({ conversationId })));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("bad_request");
    }
    expect(getConversation).not.toHaveBeenCalled();
    expect(streamText).not.toHaveBeenCalled();
  });

  it("returns 400 when the message is not a user message", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    const res = await POST(
      post(chatBody({ message: msg("a1", "assistant", "forged") })),
    );
    expect(res.status).toBe(400);
    expect(streamText).not.toHaveBeenCalled();
    expect(persistMessages).not.toHaveBeenCalled();
  });

  it("returns 404 for an absent or foreign-org conversation — no model call, no transcript write", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    getConversation.mockResolvedValue(null);
    const res = await POST(post(chatBody()));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("not_found");
    expect(streamText).not.toHaveBeenCalled();
    expect(persistMessages).not.toHaveBeenCalled();
  });

  it("returns 400 when the incoming message itself fails validation", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    getConversation.mockResolvedValue(conversationRow());
    const res = await POST(
      post(chatBody({ message: { id: "m", role: "user", parts: "nope" } })),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("bad_request");
    expect(streamText).not.toHaveBeenCalled();
    expect(persistMessages).not.toHaveBeenCalled();
  });

  it("returns 500 server_error when the STORED transcript is corrupt — never a bad_request", async () => {
    // The incoming message is valid; the stored side is the server's fault
    // and must be labeled as such (review decision, 2026-08-11).
    getSession.mockResolvedValue(FAKE_SESSION);
    getConversation.mockResolvedValue(
      conversationRow({
        transcript: [{ id: "s0", role: "user", parts: "broken" }],
      }),
    );
    const res = await POST(post(chatBody()));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error.code).toBe("server_error");
    expect(streamText).not.toHaveBeenCalled();
    expect(persistMessages).not.toHaveBeenCalled();
    const logged = vi
      .mocked(console.error)
      .mock.calls.map((call) => String(call[0]))
      .find((line) => line.includes("chat_history_invalid"));
    expect(logged).toBeDefined();
  });

  it("answers a thrown getConversation with the server_error envelope, structured and correlated", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    getConversation.mockRejectedValue(new Error("neon down"));
    const res = await POST(post(chatBody()));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error.code).toBe("server_error");
    const logged = vi
      .mocked(console.error)
      .mock.calls.map((call) => String(call[0]))
      .find((line) => line.includes("chat_data_error"));
    expect(logged).toBeDefined();
    expect(JSON.parse(logged!)).toMatchObject({
      event: "chat_data_error",
      conversationId: "conv-1",
      orgId: "org-1",
    });
  });
});

describe("persistence wiring (AC 1)", () => {
  beforeEach(() => {
    getSession.mockResolvedValue(FAKE_SESSION);
  });

  it("persists the sanitized user message BEFORE the stream starts", async () => {
    getConversation.mockResolvedValue(conversationRow());
    const res = await POST(post(chatBody()));
    expect(res.status).toBe(200);

    expect(persistMessages).toHaveBeenCalledTimes(1);
    const call = persistMessages.mock.calls[0][0];
    expect(call.conversationId).toBe("conv-1");
    expect(call.session).toBe(FAKE_SESSION);
    expect(call.messages).toHaveLength(1);
    expect(call.messages[0].role).toBe("user");
    expect(call.messages[0].id).toBe("client-msg-1");

    // Before, not after: the user's words survive a dead model call.
    expect(persistMessages.mock.invocationCallOrder[0]).toBeLessThan(
      streamText.mock.invocationCallOrder[0],
    );
  });

  it("streams with originalMessages (stored + user), a server generateMessageId, and onEnd", async () => {
    const stored = [msg("u0", "user", "earlier"), msg("a0", "assistant", "reply")];
    getConversation.mockResolvedValue(conversationRow({ transcript: stored }));
    await POST(post(chatBody()));

    const options = lastStreamOptions();
    expect(options.originalMessages.map((m) => m.id)).toEqual([
      "u0",
      "a0",
      "client-msg-1",
    ]);
    expect(options.generateMessageId).toBeTypeOf("function");
    expect(options.generateMessageId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(options.onEnd).toBeTypeOf("function");
  });

  it("mints a fresh id when the client id collides with a stored message of a different role", async () => {
    const stored = [msg("client-msg-1", "assistant", "already an answer")];
    getConversation.mockResolvedValue(conversationRow({ transcript: stored }));
    await POST(post(chatBody()));
    const call = persistMessages.mock.calls[0][0];
    expect(call.messages[0].id).not.toBe("client-msg-1");
    expect(call.messages[0].id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("onEnd persists the full updated message set — isAborted included", async () => {
    getConversation.mockResolvedValue(conversationRow({ title: "Named already" }));
    await POST(post(chatBody()));
    persistMessages.mockClear();

    const options = lastStreamOptions();
    const full = [
      msg("client-msg-1", "user", "What is my balance?"),
      msg("srv-a1", "assistant", "Here it is."),
    ];
    await options.onEnd({
      messages: full,
      isAborted: true,
      isContinuation: false,
      responseMessage: full[1],
    });

    expect(persistMessages).toHaveBeenCalledTimes(1);
    expect(persistMessages.mock.calls[0][0].messages).toBe(full);
  });

  it("a persistence failure inside onEnd logs structured and never throws (the stream already happened)", async () => {
    getConversation.mockResolvedValue(conversationRow({ title: "Named already" }));
    await POST(post(chatBody()));
    persistMessages.mockRejectedValue(new Error("cas exhausted"));

    const options = lastStreamOptions();
    await expect(
      options.onEnd({
        messages: [msg("m", "user", "x")],
        isAborted: false,
        isContinuation: false,
        responseMessage: msg("m", "user", "x"),
      }),
    ).resolves.toBeUndefined();

    const logged = vi
      .mocked(console.error)
      .mock.calls.map((call) => String(call[0]))
      .find((line) => line.includes("chat_persist_failed"));
    expect(logged).toBeDefined();
    expect(JSON.parse(logged!)).toMatchObject({
      event: "chat_persist_failed",
      conversationId: "conv-1",
      orgId: "org-1",
    });
  });
});

describe("auto-generated titles (AC 3)", () => {
  beforeEach(() => {
    getSession.mockResolvedValue(FAKE_SESSION);
  });

  async function runOnEnd() {
    const options = lastStreamOptions();
    await options.onEnd({
      messages: [
        msg("client-msg-1", "user", "What is my balance on Base today?"),
        msg("srv-a1", "assistant", "Your balance is on the card."),
      ],
      isAborted: false,
      isContinuation: false,
      responseMessage: msg("srv-a1", "assistant", "Your balance is on the card."),
    });
  }

  it("generates a title when the stored title is still the placeholder — via the CONDITIONAL write", async () => {
    getConversation.mockResolvedValue(conversationRow());
    generateText.mockResolvedValue({ text: "  Base balance check  " });
    autoTitleConversation.mockResolvedValue(
      conversationRow({ title: "Base balance check" }),
    );

    await POST(post(chatBody()));
    await runOnEnd();

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(autoTitleConversation).toHaveBeenCalledWith(
      FAKE_SESSION,
      "conv-1",
      "Base balance check",
    );
  });

  it("answers and titles in the picked language (decisions 38–40)", async () => {
    getConversation.mockResolvedValue(conversationRow());
    generateText.mockResolvedValue({ text: "Precio de ETH" });
    autoTitleConversation.mockResolvedValue(conversationRow({ title: "Precio de ETH" }));

    await POST(new Request("http://localhost/api/chat", { method: "POST", body: chatBody(), headers: { cookie: "kh_locale=es" } }));
    expect(streamText.mock.calls[0][0].instructions).toContain("Reply only in Spanish (Español)");
    await runOnEnd();
    expect(generateText.mock.calls[0][0].prompt).toContain("Write the title in Spanish.");
  });

  it("scrubs model output to the copy law: quotes, trailing period, exclamation marks, newlines", async () => {
    getConversation.mockResolvedValue(conversationRow());
    generateText.mockResolvedValue({ text: '"Base\nbalance check!."' });
    autoTitleConversation.mockResolvedValue(conversationRow());

    await POST(post(chatBody()));
    await runOnEnd();

    const [, , title] = autoTitleConversation.mock.calls[0];
    expect(title).toBe("Base balance check");
  });

  it("never re-titles a conversation the user renamed (rename is permanent)", async () => {
    getConversation.mockResolvedValue(conversationRow({ title: "My thread" }));
    await POST(post(chatBody()));
    await runOnEnd();

    expect(generateText).not.toHaveBeenCalled();
    expect(autoTitleConversation).not.toHaveBeenCalled();
  });

  it("re-checks the title at onEnd so a mid-stream rename skips generation entirely", async () => {
    // Load said placeholder, but the user renamed while the stream ran: the
    // fresh read returns their title and generation must not fire.
    getConversation
      .mockResolvedValueOnce(conversationRow())
      .mockResolvedValueOnce(conversationRow({ title: "Renamed mid-stream" }));
    await POST(post(chatBody()));
    await runOnEnd();

    expect(generateText).not.toHaveBeenCalled();
    expect(autoTitleConversation).not.toHaveBeenCalled();
  });

  it("a rename landing DURING generateText wins: the conditional write returns null and that is the desired no-op", async () => {
    getConversation.mockResolvedValue(conversationRow());
    generateText.mockResolvedValue({ text: "Generated title" });
    // lib/data's WHERE title = placeholder matched nothing: the user renamed
    // mid-generation. Null is success-shaped here — no error, no log.
    autoTitleConversation.mockResolvedValue(null);

    await POST(post(chatBody()));
    await expect(runOnEnd()).resolves.toBeUndefined();

    expect(autoTitleConversation).toHaveBeenCalledTimes(1);
    const logged = vi
      .mocked(console.error)
      .mock.calls.map((call) => String(call[0]))
      .find((line) => line.includes("title_write_failed"));
    expect(logged).toBeUndefined();
  });

  it("logs and skips titling when the pre-check read fails — never fatal, never silent", async () => {
    getConversation
      .mockResolvedValueOnce(conversationRow())
      .mockRejectedValueOnce(new Error("neon blip"));
    await POST(post(chatBody()));
    await expect(runOnEnd()).resolves.toBeUndefined();

    expect(generateText).not.toHaveBeenCalled();
    expect(autoTitleConversation).not.toHaveBeenCalled();
    const logged = vi
      .mocked(console.error)
      .mock.calls.map((call) => String(call[0]))
      .find((line) => line.includes("title_recheck_failed"));
    expect(logged).toBeDefined();
  });

  it("falls back to the truncated first user message when generation fails — the turn is unaffected", async () => {
    getConversation.mockResolvedValue(conversationRow());
    generateText.mockRejectedValue(new Error("model down"));
    autoTitleConversation.mockResolvedValue(conversationRow());

    await POST(post(chatBody()));
    await runOnEnd();

    expect(autoTitleConversation).toHaveBeenCalledTimes(1);
    const [, , fallbackTitle] = autoTitleConversation.mock.calls[0];
    expect(fallbackTitle).toBe("What is my balance on Base today?");
    const logged = vi
      .mocked(console.error)
      .mock.calls.map((call) => String(call[0]))
      .find((line) => line.includes("title_fallback"));
    expect(logged).toBeDefined();
  });

  it("truncates the fallback at a word boundary near 48 chars", async () => {
    getConversation.mockResolvedValue(conversationRow());
    generateText.mockRejectedValue(new Error("model down"));
    autoTitleConversation.mockResolvedValue(conversationRow());

    const longAsk =
      "Please compare the historical yield of every vault I have ever touched";
    await POST(
      post(
        chatBody({
          message: {
            id: "client-msg-1",
            role: "user",
            parts: [{ type: "text", text: longAsk }],
          },
        }),
      ),
    );
    const options = lastStreamOptions();
    await options.onEnd({
      messages: [msg("client-msg-1", "user", longAsk)],
      isAborted: false,
      isContinuation: false,
      responseMessage: msg("client-msg-1", "user", longAsk),
    });

    const [, , fallbackTitle] = autoTitleConversation.mock.calls[0];
    expect(fallbackTitle.length).toBeLessThanOrEqual(48);
    expect(fallbackTitle.endsWith(" ")).toBe(false);
    // Cut between words, never inside one.
    expect(longAsk.startsWith(fallbackTitle)).toBe(true);
    expect(longAsk.charAt(fallbackTitle.length)).toBe(" ");
  });

  it("a title write failure never fails the turn", async () => {
    getConversation.mockResolvedValue(conversationRow());
    generateText.mockResolvedValue({ text: "A title" });
    autoTitleConversation.mockRejectedValue(new Error("db blip"));

    await POST(post(chatBody()));
    const options = lastStreamOptions();
    await expect(
      options.onEnd({
        messages: [msg("client-msg-1", "user", "hi")],
        isAborted: false,
        isContinuation: false,
        responseMessage: msg("client-msg-1", "user", "hi"),
      }),
    ).resolves.toBeUndefined();
  });
});

describe("buildTools binds the route surface to the gate (M13)", () => {
  it("execute_protocol_action.execute delegates to routeToolCall — a quarantined op is refused before any wire call", async () => {
    // Binds the production wire (route -> gate). A refactor that skipped the gate
    // (calling lib/mcp directly) would make this fail rather than ship green. A
    // quarantined op refuses inside the gate with zero network, so this stays
    // hermetic (no @/lib/mcp mock) while still proving the delegation.
    const tools = buildTools(
      FAKE_SESSION as never,
      "req-x",
      new AbortController().signal,
      "conv-1",
    );
    const exec = tools.execute_protocol_action?.execute;
    expect(exec).toBeTypeOf("function");
    const out = await exec!(
      { actionType: "code/run-code", params: {} } as never,
      { toolCallId: "call-x" } as never,
    );
    expect(out).toMatchObject({ ok: false, error: { code: "quarantined" } });
  });
});

describe("the confirm ceremony is wired on streamText (Story 2.3, AC 3, D14)", () => {
  beforeEach(() => {
    getSession.mockResolvedValue(FAKE_SESSION);
    getConversation.mockResolvedValue(conversationRow({ title: "Named" }));
  });

  it("gates the write verbs for user approval and passes the approval secret", async () => {
    getAiConfig.mockReturnValue({
      openaiApiKey: "k",
      chatModel: "test-model",
      keeperhubMcpUrl: "http://localhost/mcp",
      toolApprovalSecret: "s".repeat(32),
    });
    await POST(post(chatBody()));

    expect(streamText).toHaveBeenCalledTimes(1);
    const opts = streamText.mock.calls[0][0];
    // The secret rides on streamText — never on the response helper.
    expect(opts.experimental_toolApprovalSecret).toBe("s".repeat(32));

    // The write verbs resolve to 'user-approval' for a write, 'not-applicable'
    // for a read; the read verbs are not gated at all.
    const approval = opts.toolApproval;
    expect(approval.execute_protocol_action({ actionType: "aave-v3/supply", params: {} })).toBe(
      "user-approval",
    );
    expect(approval.execute_protocol_action({ actionType: "chronicle/eth-usd-read", params: {} })).toBe(
      "not-applicable",
    );
    expect(approval.execute_contract_call({ stateMutability: "nonpayable" })).toBe(
      "user-approval",
    );
    expect(approval.execute_contract_call({ stateMutability: "view" })).toBe(
      "not-applicable",
    );
    // execute_transfer is UNCONDITIONALLY user-approval — every transfer moves
    // value (2.5 D25). Omitting it here would broadcast a transfer with no confirm.
    expect(approval.execute_transfer({ chain_id: "1", to_address: "0x", amount: "1" })).toBe(
      "user-approval",
    );
    expect(approval.execute_transfer({})).toBe("user-approval");
    expect(approval.search_actions).toBeUndefined();
    expect(approval.get_wallet_integration).toBeUndefined();

    // Automation changes stop on their card once the proposal can be acted on;
    // listing and describing run straight away (decisions 19–21).
    const proposal = {
      name: "Morning balance",
      trigger: { type: "schedule", cron: "0 9 * * 1-5" },
      steps: [{ action: "web3/check-balance", params: { network: "84532", address: `0x${"a".repeat(40)}` } }],
    };
    expect(approval.create_automation(proposal)).toBe("user-approval");
    expect(approval.create_automation({ ...proposal, steps: [] })).toBe("not-applicable");
    expect(approval.set_automation_enabled({ workflowId: "wf-1", enabled: true })).toBe("user-approval");
    expect(approval.update_automation({ workflowId: "wf-1", ...proposal })).toBe("user-approval");
    expect(approval.update_automation(proposal)).toBe("not-applicable");
    expect(approval.run_automation({ workflowId: "wf-1" })).toBe("user-approval");
    expect(approval.delete_automation({ workflowId: "wf-1" })).toBe("user-approval");
    expect(approval.delete_automation({})).toBe("not-applicable");
    expect(approval.list_automations).toBeUndefined();
    expect(approval.get_automation).toBeUndefined();
  });

  it("the write-refusal system-prompt line is gone — writes now run with confirmation", async () => {
    await POST(post(chatBody()));
    const instructions = streamText.mock.calls[0][0].instructions as string;
    expect(instructions).not.toContain("Only reads run in this release");
    expect(instructions).not.toContain("Do not attempt writes");
    expect(instructions.toLowerCase()).toContain("confirm");
  });

  it("tells the model which network the header has selected, Base Sepolia until one is picked", async () => {
    await POST(post(chatBody()));
    expect(streamText.mock.calls[0][0].instructions).toContain("Base Sepolia (chain id 84532)");

    streamText.mockClear();
    await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: chatBody(),
        headers: { cookie: "kh_session=abc; kh_network=8453" },
      }),
    );
    expect(streamText.mock.calls[0][0].instructions).toContain("Base (chain id 8453)");
  });
});

describe("confirm-ceremony resume (Story 2.3, AD-5; Task 1 + signature round-trip)", () => {
  const WRITE_INPUT = {
    contract_address: "0xabc",
    chain_id: "1",
    function_name: "transfer",
    stateMutability: "nonpayable",
  };

  function writePart(state: string, extraApproval: Record<string, unknown> = {}) {
    return {
      type: "tool-execute_contract_call",
      toolCallId: "tc-1",
      state,
      input: WRITE_INPUT,
      approval: { id: "appr-1", signature: "sig-abc", ...extraApproval },
    };
  }

  const storedRequested = [
    msg("u0", "user", "transfer usdc"),
    { id: "a-write", role: "assistant", parts: [writePart("approval-requested")] },
  ] as unknown as UIMessage[];

  it("detectApprovalResume reads the toolCallId, decision, and the confirmed posted input (Story 2.5)", () => {
    const confirm = {
      role: "assistant",
      parts: [writePart("approval-responded", { approved: true })],
    } as unknown as UIMessage;
    // The posted input rides along (for a plain confirm it equals the stored
    // proposal; an in-card amount edit differs and is validated server-side).
    expect(detectApprovalResume(confirm)).toEqual({
      toolCallId: "tc-1",
      approved: true,
      postedInput: WRITE_INPUT,
    });
    // A normal user turn is not a resume.
    expect(detectApprovalResume(msg("u", "user", "hi"))).toBeNull();
    // An approval-REQUESTED part (no decision yet) is not a resume.
    const requested = {
      role: "assistant",
      parts: [writePart("approval-requested")],
    } as unknown as UIMessage;
    expect(detectApprovalResume(requested)).toBeNull();
  });

  it("applyApprovalDecision flips only the decision, preserving the stored input + signature (D14 §5)", () => {
    const out = applyApprovalDecision(storedRequested, { toolCallId: "tc-1", approved: true });
    expect(out).not.toBeNull();
    const part = out![1].parts[0] as {
      state: string;
      input: unknown;
      approval: { approved: boolean; signature: string };
    };
    expect(part.state).toBe("approval-responded");
    expect(part.approval.approved).toBe(true);
    // The signature and the exact instruction come from the trusted store, never
    // the client — this is what makes the resumed verification pass.
    expect(part.approval.signature).toBe("sig-abc");
    expect(part.input).toEqual(WRITE_INPUT);
  });

  it("applyApprovalDecision returns null for an unknown/already-resolved toolCallId (stale)", () => {
    expect(applyApprovalDecision(storedRequested, { toolCallId: "nope", approved: true })).toBeNull();
  });

  it("POST resumes streamText from the STORED transcript on a confirm decision", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    getConversation.mockResolvedValue(
      conversationRow({ transcript: storedRequested, title: "Named" }),
    );
    getAiConfig.mockReturnValue({
      openaiApiKey: "k",
      chatModel: "test-model",
      keeperhubMcpUrl: "http://localhost/mcp",
      toolApprovalSecret: "s".repeat(32),
    });

    const res = await POST(
      post(
        JSON.stringify({
          conversationId: "conv-1",
          // The client sends the assistant message with the decision; the server
          // rebuilds from its store (only the decision is taken from the client).
          message: {
            id: "a-write",
            role: "assistant",
            parts: [writePart("approval-responded", { approved: true })],
          },
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(streamText).toHaveBeenCalledTimes(1);
    const opts = streamText.mock.calls[0][0];
    expect(opts.experimental_toolApprovalSecret).toBe("s".repeat(32));

    // The resumed originalMessages carry the approval-responded part with its
    // signature intact — the round-trip the SDK verifies against.
    const streamOpts = lastStreamOptions();
    const resumed = streamOpts.originalMessages.find((m) => m.id === "a-write");
    const part = resumed?.parts.find(
      (p) => (p as { toolCallId?: string }).toolCallId === "tc-1",
    ) as { state: string; approval: { approved: boolean; signature: string } } | undefined;
    expect(part?.state).toBe("approval-responded");
    expect(part?.approval.approved).toBe(true);
    expect(part?.approval.signature).toBe("sig-abc");
  });

  it("POST returns 409 for a confirm whose card is no longer pending (stale)", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    // Stored transcript has NO pending approval for tc-1 (already resolved).
    getConversation.mockResolvedValue(
      conversationRow({ transcript: [msg("u0", "user", "hi")], title: "Named" }),
    );
    const res = await POST(
      post(
        JSON.stringify({
          conversationId: "conv-1",
          message: {
            id: "a-write",
            role: "assistant",
            parts: [writePart("approval-responded", { approved: true })],
          },
        }),
      ),
    );
    expect(res.status).toBe(409);
    expect(streamText).not.toHaveBeenCalled();
  });

  // --- Story 2.4: the durable declined terminal on the decline branch (AC 2, D21)

  function declinePost() {
    return post(
      JSON.stringify({
        conversationId: "conv-1",
        message: {
          id: "a-write",
          role: "assistant",
          parts: [writePart("approval-responded", { approved: false })],
        },
      }),
    );
  }

  it("a DECLINE resume records the durable declined ledger row from the STORED input (AD-2, D21)", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    getConversation.mockResolvedValue(
      conversationRow({ transcript: storedRequested, title: "Named" }),
    );
    getAiConfig.mockReturnValue({
      openaiApiKey: "k",
      chatModel: "test-model",
      keeperhubMcpUrl: "http://localhost/mcp",
      toolApprovalSecret: "s".repeat(32),
    });

    const res = await POST(declinePost());
    expect(res.status).toBe(200);
    // The row is written from the STORED proposal (toolName + input), never the client.
    expect(recordWriteDecline).toHaveBeenCalledTimes(1);
    const arg = recordWriteDecline.mock.calls[0][0];
    expect(arg).toMatchObject({
      session: FAKE_SESSION,
      conversationId: "conv-1",
      toolCallId: "tc-1",
      toolName: "execute_contract_call",
      input: WRITE_INPUT,
    });
    // The resume still runs so the SDK produces + persists the output-denied part.
    expect(streamText).toHaveBeenCalledTimes(1);
    // The row lands BEFORE the resume stream (D21).
    expect(recordWriteDecline.mock.invocationCallOrder[0]).toBeLessThan(
      streamText.mock.invocationCallOrder[0],
    );
  });

  it("a CONFIRM resume records NO declined row (only a decline writes one)", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    getConversation.mockResolvedValue(
      conversationRow({ transcript: storedRequested, title: "Named" }),
    );
    getAiConfig.mockReturnValue({
      openaiApiKey: "k",
      chatModel: "test-model",
      keeperhubMcpUrl: "http://localhost/mcp",
      toolApprovalSecret: "s".repeat(32),
    });
    const res = await POST(
      post(
        JSON.stringify({
          conversationId: "conv-1",
          message: {
            id: "a-write",
            role: "assistant",
            parts: [writePart("approval-responded", { approved: true })],
          },
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(recordWriteDecline).not.toHaveBeenCalled();
  });

  it("a STALE decline (no pending card → 409) records NO declined row and never re-broadcasts", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    // No pending approval-requested part for tc-1 — already resolved / unknown id.
    getConversation.mockResolvedValue(
      conversationRow({ transcript: [msg("u0", "user", "hi")], title: "Named" }),
    );
    const res = await POST(declinePost());
    expect(res.status).toBe(409);
    // The 409 short-circuits BEFORE any ledger write (do not write a row on a stale id).
    expect(recordWriteDecline).not.toHaveBeenCalled();
    expect(streamText).not.toHaveBeenCalled();
  });

  it("a resume for an ALREADY-declined card (output-denied) → 409, never re-broadcasts or writes a second row (D22)", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    // The card already resolved to output-denied — no pending approval-requested
    // part remains, so applyApprovalDecision returns null (stale) → 409. The SDK
    // itself never re-executes / re-issues an approval for output-denied.
    getConversation.mockResolvedValue(
      conversationRow({
        transcript: [
          msg("u0", "user", "transfer usdc"),
          {
            id: "a-write",
            role: "assistant",
            parts: [writePart("output-denied", { approved: false })],
          },
        ] as unknown as UIMessage[],
        title: "Named",
      }),
    );
    const res = await POST(declinePost());
    expect(res.status).toBe(409);
    expect(recordWriteDecline).not.toHaveBeenCalled();
    expect(streamText).not.toHaveBeenCalled();
  });

  // --- Story 2.5 (Task 4): in-card amount edit, re-signed at Confirm ----------

  function transferPart(
    state: string,
    extraApproval: Record<string, unknown> = {},
    input: Record<string, unknown> = { chain_id: "11155111", to_address: "0xrecipient", amount: "0.1" },
  ) {
    return {
      type: "tool-execute_transfer",
      toolCallId: "tc-t",
      state,
      input,
      approval: { id: "appr-t", signature: "orig-sig", ...extraApproval },
    };
  }
  const storedTransfer = [
    msg("u0", "user", "send 0.1 eth"),
    { id: "a-transfer", role: "assistant", parts: [transferPart("approval-requested")] },
  ] as unknown as UIMessage[];

  function withTransferConfig() {
    getSession.mockResolvedValue(FAKE_SESSION);
    getConversation.mockResolvedValue(conversationRow({ transcript: storedTransfer, title: "Named" }));
    getAiConfig.mockReturnValue({
      openaiApiKey: "k",
      chatModel: "test-model",
      keeperhubMcpUrl: "http://localhost/mcp",
      toolApprovalSecret: "s".repeat(32),
    });
  }

  it("applyApprovalDecision writes the EDITED input + a fresh signature when an edit is supplied", () => {
    const out = applyApprovalDecision(
      storedTransfer,
      { toolCallId: "tc-t", approved: true },
      { input: { chain_id: "11155111", to_address: "0xrecipient", amount: "45" }, signature: "fresh-sig" },
    );
    const part = out![1].parts[0] as {
      input: { amount: string };
      approval: { approved: boolean; signature: string };
    };
    expect(part.input.amount).toBe("45");
    expect(part.approval.signature).toBe("fresh-sig");
    expect(part.approval.approved).toBe(true);
  });

  it("POST executes an EDITED transfer amount: the resumed part carries the edited input + a re-signed signature", async () => {
    withTransferConfig();
    const editedInput = { chain_id: "11155111", to_address: `0x${"a".repeat(40)}`, amount: "45" };
    const res = await POST(
      post(
        JSON.stringify({
          conversationId: "conv-1",
          message: {
            id: "a-transfer",
            role: "assistant",
            parts: [transferPart("approval-responded", { approved: true }, editedInput)],
          },
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(streamText).toHaveBeenCalledTimes(1);

    const resumed = lastStreamOptions().originalMessages.find((m) => m.id === "a-transfer");
    const part = resumed?.parts.find(
      (p) => (p as { toolCallId?: string }).toolCallId === "tc-t",
    ) as { input: { amount: string }; approval: { signature: string } } | undefined;
    // The EDITED amount is what will execute — not the model's original 0.1.
    expect(part?.input.amount).toBe("45");
    // Re-signed over the EDITED input with the server secret (not the stored orig-sig).
    const expectedSig = await signToolApproval({
      secret: "s".repeat(32),
      approvalId: "appr-t",
      toolCallId: "tc-t",
      toolName: "execute_transfer",
      input: editedInput,
    });
    expect(part?.approval.signature).toBe(expectedSig);
    expect(part?.approval.signature).not.toBe("orig-sig");
  });

  it("POST re-signs an edit to the recipient and network too (decision 11)", async () => {
    withTransferConfig();
    const editedInput = { chain_id: "84532", to_address: `0x${"b".repeat(40)}`, amount: "0" };
    const res = await POST(
      post(
        JSON.stringify({
          conversationId: "conv-1",
          message: {
            id: "a-transfer",
            role: "assistant",
            parts: [transferPart("approval-responded", { approved: true }, editedInput)],
          },
        }),
      ),
    );
    expect(res.status).toBe(200);
    const resumed = lastStreamOptions().originalMessages.find((m) => m.id === "a-transfer");
    const part = resumed?.parts.find((p) => (p as { toolCallId?: string }).toolCallId === "tc-t") as
      | { input: unknown; approval: { signature: string } }
      | undefined;
    expect(part?.input).toEqual(editedInput);
    expect(part?.approval.signature).toBe(
      await signToolApproval({
        secret: "s".repeat(32),
        approvalId: "appr-t",
        toolCallId: "tc-t",
        toolName: "execute_transfer",
        input: editedInput,
      }),
    );
  });

  it("POST rejects an edit that fails the edit check with 400, never resumes (fail-closed)", async () => {
    withTransferConfig();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(
      post(
        JSON.stringify({
          conversationId: "conv-1",
          message: {
            id: "a-transfer",
            role: "assistant",
            parts: [
              transferPart("approval-responded", { approved: true }, {
                chain_id: "11155111",
                to_address: "0xEVIL",
                amount: "0.1",
              }),
            ],
          },
        }),
      ),
    );
    expect(res.status).toBe(400);
    expect(streamText).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("a plain confirm (posted input EQUALS the stored proposal) is NOT treated as an edit — keeps the original signature", async () => {
    withTransferConfig();
    const res = await POST(
      post(
        JSON.stringify({
          conversationId: "conv-1",
          message: {
            id: "a-transfer",
            role: "assistant",
            // Same input as stored → no edit → the trusted stored signature stands.
            parts: [transferPart("approval-responded", { approved: true })],
          },
        }),
      ),
    );
    expect(res.status).toBe(200);
    const resumed = lastStreamOptions().originalMessages.find((m) => m.id === "a-transfer");
    const part = resumed?.parts.find(
      (p) => (p as { toolCallId?: string }).toolCallId === "tc-t",
    ) as { approval: { signature: string } } | undefined;
    expect(part?.approval.signature).toBe("orig-sig");
  });
});

describe("the model view drops textless re-run turns (Story 1.6 prune)", () => {
  beforeEach(() => {
    getSession.mockResolvedValue(FAKE_SESSION);
  });

  it("isModelVisibleMessage keeps text/non-user turns, drops textless user turns", () => {
    expect(isModelVisibleMessage(msg("u", "user", "hi"))).toBe(true);
    expect(isModelVisibleMessage(msg("a", "assistant", "reply"))).toBe(true);
    // A data-only re-run user message (no text) is not model-visible.
    expect(
      isModelVisibleMessage({
        id: "r",
        role: "user",
        parts: [
          { type: "data-rerun", data: { tool: "execute_protocol_action", args: {} } },
        ],
      } as unknown as UIMessage),
    ).toBe(false);
    // A whitespace-only text user turn is also dropped.
    expect(isModelVisibleMessage(msg("w", "user", "   "))).toBe(false);
    // Text alongside a data part still counts as visible.
    expect(
      isModelVisibleMessage({
        id: "r2",
        role: "user",
        parts: [
          { type: "data-rerun", data: {} },
          { type: "text", text: "hello" },
        ],
      } as unknown as UIMessage),
    ).toBe(true);
  });

  it("a stored data-only re-run user message never reaches the model as an empty turn", async () => {
    // The exact hazard the completion note claimed was regression-tested: a
    // persisted data-rerun user turn must not surface to the model as empty
    // content on the NEXT normal turn (which the provider rejects). Drives the
    // real validateUIMessages + convertToModelMessages + the prune end-to-end.
    const stored = [
      msg("u0", "user", "eth price"),
      {
        id: "a0",
        role: "assistant",
        parts: [
          {
            type: "tool-execute_protocol_action",
            toolCallId: "01JOLD",
            state: "output-available",
            input: { actionType: "chronicle/eth-usd-read", params: {} },
            output: {
              ok: true,
              tool: "execute_protocol_action",
              opId: "chronicle/eth-usd-read",
              fingerprint: "f",
              data: { value: "3000" },
            },
          },
        ],
      },
      {
        id: "u-rerun",
        role: "user",
        parts: [
          {
            type: "data-rerun",
            data: {
              tool: "execute_protocol_action",
              args: { actionType: "chronicle/btc-usd-read", params: {} },
              supersedesToolCallId: "01JOLD",
            },
          },
        ],
      },
      {
        id: "a-fresh",
        role: "assistant",
        metadata: { supersedes: "01JOLD" },
        parts: [
          {
            type: "tool-execute_protocol_action",
            toolCallId: "01JNEW",
            state: "output-available",
            input: { actionType: "chronicle/btc-usd-read", params: {} },
            output: {
              ok: true,
              tool: "execute_protocol_action",
              opId: "chronicle/btc-usd-read",
              fingerprint: "f",
              data: { value: "60000" },
            },
          },
        ],
      },
    ] as unknown as UIMessage[];
    getConversation.mockResolvedValue(
      conversationRow({ transcript: stored, title: "Named" }),
    );

    const res = await POST(post(chatBody()));
    expect(res.status).toBe(200);
    expect(streamText).toHaveBeenCalledTimes(1);

    const model = streamText.mock.calls[0][0].messages as Array<{
      role: string;
      content: unknown;
    }>;
    // No empty user turn reaches the provider (the break the prune prevents).
    const emptyUser = model.find(
      (m) =>
        m.role === "user" && Array.isArray(m.content) && m.content.length === 0,
    );
    expect(emptyUser).toBeUndefined();
    // The data-only re-run turn is gone; only the stored ask and the incoming
    // message remain as user turns.
    const userText = model
      .filter((m) => m.role === "user")
      .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)));
    expect(userText).toHaveLength(2);
    expect(userText.join(" ")).toContain("eth price");
    expect(userText.join(" ")).toContain("What is my balance?");
  });
});
