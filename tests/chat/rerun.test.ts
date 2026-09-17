import { beforeEach, describe, expect, it, vi } from "vitest";

import { validateUIMessages, type UIMessage } from "ai";

/*
 * The re-run branch runs the REAL gate (lib/execution.routeToolCall with the
 * registry classification intact) and the REAL createUIMessageStream — only the
 * session, data accessors, transcript writer, and the wire client are mocked.
 * That is deliberate: the point of these tests is that the read gate BINDS on
 * the re-run path (a write refuses, a contract call simulates, Solana refuses)
 * and that persistence flows through the sole writer, user message first.
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

const { callTool } = vi.hoisted(() => ({ callTool: vi.fn() }));
vi.mock("@/lib/mcp", () => ({ callTool }));

// Mock the ledger writer seam (Story 2.2): the real gate now records a `read`
// row on a successful protocol read. Mocking it keeps the "no test hits the DB"
// convention — the re-run tests exercise the gate + stream, not the ledger DB.
const { recordRead } = vi.hoisted(() => ({ recordRead: vi.fn() }));
vi.mock("@/lib/ledger", () => ({ recordRead }));

const { getAiConfig } = vi.hoisted(() => ({ getAiConfig: vi.fn() }));
vi.mock("@/lib/config", () => ({ getAiConfig }));

import { POST } from "@/app/api/chat/route";
import { detectRerun, supersedesInTranscript } from "@/app/api/chat/rerun";
import { __resetCredentialCache } from "@/lib/execution/credentials";

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

function rerunBody(
  payload: unknown,
  overrides?: Record<string, unknown>,
): string {
  return JSON.stringify({
    conversationId: "conv-1",
    message: {
      id: "client-rerun-1",
      role: "user",
      parts: [{ type: "data-rerun", data: payload }],
    },
    ...overrides,
  });
}

function post(body: string): Request {
  return new Request("http://localhost/api/chat", { method: "POST", body });
}

/** Consume the SSE response into parsed UIMessageChunks. onEnd has run by the
 *  time this resolves (the stream closes after the flush callback). */
async function readChunks(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  const chunks: Array<Record<string, unknown>> = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) {
      continue;
    }
    const payload = trimmed.slice("data:".length).trim();
    if (payload === "" || payload === "[DONE]") {
      continue;
    }
    try {
      chunks.push(JSON.parse(payload));
    } catch {
      /* non-JSON keepalive — ignore */
    }
  }
  return chunks;
}

function chunk(
  chunks: Array<Record<string, unknown>>,
  type: string,
): Record<string, unknown> | undefined {
  return chunks.find((c) => c.type === type);
}

function loggedEvents(): string[] {
  return [
    ...vi.mocked(console.error).mock.calls,
    ...vi.mocked(console.log).mock.calls,
  ].map((call) => String(call[0]));
}

beforeEach(() => {
  getSession.mockReset();
  getConversation.mockReset();
  autoTitleConversation.mockReset();
  persistMessages.mockReset();
  callTool.mockReset();
  recordRead.mockReset();
  getAiConfig.mockReset();
  __resetCredentialCache();
  persistMessages.mockResolvedValue(undefined);
  getSession.mockResolvedValue(FAKE_SESSION);
  getConversation.mockResolvedValue(conversationRow());
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("detectRerun / supersedesInTranscript (unit)", () => {
  function userMessage(parts: unknown): UIMessage {
    return { id: "m", role: "user", parts } as unknown as UIMessage;
  }

  it("returns none for a plain text message (normal path)", () => {
    expect(detectRerun(userMessage([{ type: "text", text: "hi" }])).kind).toBe(
      "none",
    );
  });

  it("returns none for a malformed parts field (falls through to validation)", () => {
    expect(detectRerun(userMessage("nope")).kind).toBe("none");
  });

  it("returns ok for a valid data-rerun payload", () => {
    const detection = detectRerun(
      userMessage([
        {
          type: "data-rerun",
          data: { tool: "execute_protocol_action", args: { actionType: "x", params: {} } },
        },
      ]),
    );
    expect(detection.kind).toBe("ok");
  });

  it("returns malformed for a data-rerun naming a non-re-runnable tool (search_actions)", () => {
    expect(
      detectRerun(
        userMessage([{ type: "data-rerun", data: { tool: "search_actions", args: {} } }]),
      ).kind,
    ).toBe("malformed");
  });

  it("finds a tool part by toolCallId in the stored transcript", () => {
    const transcript = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          { type: "tool-execute_protocol_action", toolCallId: "01JOLD", state: "output-available" },
        ],
      },
    ] as unknown as UIMessage[];
    expect(supersedesInTranscript(transcript, "01JOLD")).toBe(true);
    expect(supersedesInTranscript(transcript, "01JGHOST")).toBe(false);
  });
});

describe("POST /api/chat re-run branch — gate + envelopes", () => {
  it("401 when signed out (a re-run is still gated)", async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(
      post(rerunBody({ tool: "execute_protocol_action", args: { actionType: "x", params: {} } })),
    );
    expect(res.status).toBe(401);
    expect(persistMessages).not.toHaveBeenCalled();
    expect(callTool).not.toHaveBeenCalled();
  });

  it("404 for an absent / foreign-org conversation — no execution, no write", async () => {
    getConversation.mockResolvedValue(null);
    const res = await POST(
      post(rerunBody({ tool: "execute_protocol_action", args: { actionType: "x", params: {} } })),
    );
    expect(res.status).toBe(404);
    expect(persistMessages).not.toHaveBeenCalled();
    expect(callTool).not.toHaveBeenCalled();
  });

  it("400 for a malformed re-run payload — nothing persisted, nothing executed", async () => {
    const res = await POST(post(rerunBody({ tool: "execute_protocol_action" /* no args */ })));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("bad_request");
    expect(persistMessages).not.toHaveBeenCalled();
    expect(callTool).not.toHaveBeenCalled();
  });

  it("400 for a re-run naming search_actions (not a re-runnable proposal)", async () => {
    const res = await POST(post(rerunBody({ tool: "search_actions", args: {} })));
    expect(res.status).toBe(400);
    expect(callTool).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat re-run branch — valid protocol read (AC 3)", () => {
  it("routes the EXACT edited args through the gate, streams the tool part, persists user-first", async () => {
    callTool.mockResolvedValue({ ok: true, data: { value: "3100" } });
    const res = await POST(
      post(
        rerunBody({
          tool: "execute_protocol_action",
          args: { actionType: "chronicle/eth-usd-read", params: { network: "1" } },
        }),
      ),
    );
    expect(res.status).toBe(200);
    const chunks = await readChunks(res);

    // input = the exact edited args (the edited values drive it).
    const input = chunk(chunks, "tool-input-available");
    expect(input?.toolName).toBe("execute_protocol_action");
    expect(input?.input).toEqual({
      actionType: "chronicle/eth-usd-read",
      params: { network: "1" },
    });
    const serverToolCallId = input?.toolCallId;
    expect(serverToolCallId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);

    // The gate ran for real and the wire got the edited params + merged defaults.
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool.mock.calls[0][0].args.params).toMatchObject({ network: "1" });

    // output streams the structured ToolOutput.
    const output = chunk(chunks, "tool-output-available") as {
      output?: { ok?: boolean; opId?: string; data?: unknown };
    };
    expect(output.output?.ok).toBe(true);
    expect(output.output?.opId).toBe("chronicle/eth-usd-read");
    expect(output.output?.data).toEqual({ value: "3100" });

    // Persist: the user re-run message BEFORE the stream, the full set in onEnd.
    expect(persistMessages.mock.calls.length).toBeGreaterThanOrEqual(2);
    const first = persistMessages.mock.calls[0][0];
    expect(first.messages).toHaveLength(1);
    expect(first.messages[0].role).toBe("user");
    expect(first.messages[0].parts[0].type).toBe("data-rerun");
    const last = persistMessages.mock.calls.at(-1)![0];
    const assistant = last.messages.find((m: UIMessage) => m.role === "assistant");
    const toolPart = assistant?.parts.find(
      (p: { type?: string }) => typeof p.type === "string" && p.type.startsWith("tool-"),
    );
    expect(toolPart?.state).toBe("output-available");

    // Resolves the deferred 1.5 id-reuse item BY DESIGN: the re-run appends a
    // NEW assistant message with a fresh server ULID, never replaces by id.
    expect(assistant?.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(assistant?.id).not.toBe(first.messages[0].id);

    // No first-turn concerns on a re-run.
    expect(autoTitleConversation).not.toHaveBeenCalled();

    // Structured, correlated log.
    const rerunLog = loggedEvents().find((line) => line.includes("chat_rerun"));
    expect(rerunLog).toBeDefined();
    expect(JSON.parse(rerunLog!)).toMatchObject({
      event: "chat_rerun",
      conversationId: "conv-1",
      orgId: "org-1",
      tool: "execute_protocol_action",
    });
  });
});

describe("POST /api/chat re-run branch — the gate binds", () => {
  it("a bound write actionType is REFUSED (write_not_available); the write never reaches the wire", async () => {
    // aave-v3/supply is credential-gated (integration: web3). Bind web3 so
    // the needs-credential axis passes and the read gate refuses the write (D8).
    callTool.mockImplementation((opts: { name: string }) =>
      Promise.resolve(
        opts.name === "list_integrations"
          ? { ok: true, data: [{ id: "web3", name: "web3", type: "web3" }] }
          : { ok: true, data: {} },
      ),
    );
    const res = await POST(
      post(
        rerunBody({
          tool: "execute_protocol_action",
          args: { actionType: "aave-v3/supply", params: {} },
        }),
      ),
    );
    expect(res.status).toBe(200);
    const chunks = await readChunks(res);
    const output = chunk(chunks, "tool-output-available") as {
      output?: { ok?: boolean; error?: { code?: string } };
    };
    expect(output.output?.ok).toBe(false);
    expect(output.output?.error?.code).toBe("write_not_available");
    // The binding read may run (gated op); the WRITE execution never does.
    const execCalls = callTool.mock.calls.filter(
      (c: unknown[]) => (c[0] as { name: string }).name !== "list_integrations",
    );
    expect(execCalls).toHaveLength(0);
  });

  it("a contract call keeps simulate:true (no broadcast) and streams the read", async () => {
    callTool.mockResolvedValue({ ok: true, data: { result: "42" } });
    const res = await POST(
      post(
        rerunBody({
          tool: "execute_contract_call",
          args: {
            contract_address: "0x0000000000000000000000000000000000000001",
            chain_id: "1",
            function_name: "balanceOf",
            stateMutability: "view",
          },
        }),
      ),
    );
    expect(res.status).toBe(200);
    await readChunks(res);
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool.mock.calls[0][0].args.simulate).toBe(true);
  });

  it("a Solana contract call is REFUSED (cannot simulate), never sent to the wire", async () => {
    const res = await POST(
      post(
        rerunBody({
          tool: "execute_contract_call",
          args: {
            contract_address: "So11111111111111111111111111111111111111112",
            chain_id: "101",
            function_name: "balance",
            stateMutability: "view",
          },
        }),
      ),
    );
    expect(res.status).toBe(200);
    const chunks = await readChunks(res);
    const output = chunk(chunks, "tool-output-available") as {
      output?: { ok?: boolean; error?: { code?: string } };
    };
    expect(output.output?.ok).toBe(false);
    expect(output.output?.error?.code).toBe("write_not_available");
    expect(callTool).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat re-run branch — supersede (D5)", () => {
  it("stamps a verified supersede id on the response message (live + persisted)", async () => {
    callTool.mockResolvedValue({ ok: true, data: { value: "1" } });
    getConversation.mockResolvedValue(
      conversationRow({
        transcript: [
          {
            id: "a-old",
            role: "assistant",
            parts: [
              {
                type: "tool-execute_protocol_action",
                toolCallId: "01JOLD",
                state: "output-available",
                input: { actionType: "chronicle/eth-usd-read", params: {} },
                output: { ok: true, tool: "execute_protocol_action", opId: "chronicle/eth-usd-read", fingerprint: "f", data: {} },
              },
            ],
          },
        ] as unknown as UIMessage[],
      }),
    );

    const res = await POST(
      post(
        rerunBody({
          tool: "execute_protocol_action",
          args: { actionType: "chronicle/btc-usd-read", params: {} },
          supersedesToolCallId: "01JOLD",
        }),
      ),
    );
    const chunks = await readChunks(res);
    // Live: the start chunk carries the supersede stamp for the client.
    const start = chunk(chunks, "start") as { messageMetadata?: { supersedes?: string } };
    expect(start.messageMetadata?.supersedes).toBe("01JOLD");
    // Persisted: onEnd's response message carries it too (identical derivation).
    const last = persistMessages.mock.calls.at(-1)![0];
    const fresh = last.messages.find(
      (m: UIMessage) => (m.metadata as { supersedes?: string } | undefined)?.supersedes === "01JOLD",
    );
    expect(fresh).toBeDefined();
  });

  it("DROPS a supersede id absent from the stored transcript (logs, never fails the run)", async () => {
    callTool.mockResolvedValue({ ok: true, data: { value: "1" } });
    const res = await POST(
      post(
        rerunBody({
          tool: "execute_protocol_action",
          args: { actionType: "chronicle/eth-usd-read", params: { network: "1" } },
          supersedesToolCallId: "01JGHOST",
        }),
      ),
    );
    expect(res.status).toBe(200);
    const chunks = await readChunks(res);
    const start = chunk(chunks, "start") as { messageMetadata?: { supersedes?: string } };
    expect(start.messageMetadata?.supersedes).toBeUndefined();
    const dropped = loggedEvents().find((line) =>
      line.includes("chat_rerun_supersede_dropped"),
    );
    expect(dropped).toBeDefined();
  });
});

describe("carrier regression — the 1.5 reopen path (Task 4b)", () => {
  it("a stored transcript with a re-run message + superseding assistant message validates on load", async () => {
    const transcript = [
      { id: "u0", role: "user", parts: [{ type: "text", text: "eth price" }] },
      {
        id: "a0",
        role: "assistant",
        parts: [
          {
            type: "tool-execute_protocol_action",
            toolCallId: "01JOLD",
            state: "output-available",
            input: { actionType: "chronicle/eth-usd-read", params: {} },
            output: { ok: true, tool: "execute_protocol_action", opId: "chronicle/eth-usd-read", fingerprint: "f", data: { value: "3000" } },
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
            output: { ok: true, tool: "execute_protocol_action", opId: "chronicle/btc-usd-read", fingerprint: "f", data: { value: "60000" } },
          },
        ],
      },
    ] as unknown as UIMessage[];

    await expect(
      validateUIMessages({ messages: transcript }),
    ).resolves.toHaveLength(4);
  });
});
