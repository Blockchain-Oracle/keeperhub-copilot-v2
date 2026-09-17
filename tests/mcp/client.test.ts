import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The client reads only keeperhubMcpUrl from config — mock it so the test never
// touches process.env (the config-lint boundary) and stays hermetic.
vi.mock("@/lib/config", () => ({
  getAiConfig: () => ({
    openaiApiKey: "sk-test",
    chatModel: "gpt-test",
    keeperhubMcpUrl: "https://mcp.test.example.com/mcp",
  }),
}));

import { __resetMcpState, callTool } from "@/lib/mcp";
import { MCP_PROTOCOL_VERSION } from "@/lib/mcp/wire";

type Ctx = {
  method: string;
  body: { id?: number; method: string; params?: unknown };
  url: string;
  init: RequestInit;
};

function makeResponse(opts: {
  status?: number;
  body?: unknown;
  sessionId?: string;
  retryAfter?: number;
  contentType?: string | null;
}): Response {
  const {
    status = 200,
    body = "",
    sessionId,
    retryAfter,
    contentType = "application/json",
  } = opts;
  const headers = new Map<string, string>();
  if (contentType !== null) headers.set("content-type", contentType);
  if (sessionId !== undefined) headers.set("mcp-session-id", sessionId);
  if (retryAfter !== undefined) headers.set("retry-after", String(retryAfter));
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    status,
    text: async () => text,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
  } as unknown as Response;
}

function installFetch(handler: (ctx: Ctx) => Response) {
  const calls: Ctx[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    const ctx: Ctx = { method: body.method, body, url, init };
    calls.push(ctx);
    return handler(ctx);
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

// A handler that answers the mandatory handshake, delegating tools/call to `onCall`.
function handshakeThen(
  onCall: (ctx: Ctx) => Response,
  sessionId = "sess-1",
): (ctx: Ctx) => Response {
  return (ctx) => {
    if (ctx.method === "initialize") {
      return makeResponse({
        body: { jsonrpc: "2.0", id: ctx.body.id, result: { protocolVersion: MCP_PROTOCOL_VERSION } },
        sessionId,
      });
    }
    if (ctx.method === "notifications/initialized") {
      return makeResponse({ status: 202, body: "", contentType: null });
    }
    return onCall(ctx);
  };
}

function okRead(ctx: Ctx, data: unknown): Response {
  return makeResponse({
    body: {
      jsonrpc: "2.0",
      id: ctx.body.id,
      result: { content: [{ type: "text", text: JSON.stringify(data) }] },
    },
  });
}

const READ_CALL = {
  accessToken: "tok-xyz",
  orgId: "org-1",
  userId: "user-1",
  name: "execute_protocol_action",
  args: { actionType: "chronicle/eth-usd-read", params: { network: "1" } },
  idempotent: true,
  requestId: "req-1",
} as const;

beforeEach(() => {
  __resetMcpState();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("callTool handshake", () => {
  it("performs initialize → initialized → tools/call in order and unwraps the read", async () => {
    const { calls } = installFetch(handshakeThen((ctx) => okRead(ctx, { price: "3000" })));

    const result = await callTool({ ...READ_CALL });

    expect(result).toEqual({ ok: true, data: { price: "3000" } });
    expect(calls.map((c) => c.method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/call",
    ]);
    // The tools/call carries the tool name + arguments verbatim.
    expect(calls[2].body.params).toEqual({
      name: "execute_protocol_action",
      arguments: READ_CALL.args,
    });
  });

  it("echoes Authorization + protocol version on every request and the session id after init", async () => {
    const { calls } = installFetch(handshakeThen((ctx) => okRead(ctx, {})));
    await callTool({ ...READ_CALL });

    for (const call of calls) {
      const headers = call.init.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer tok-xyz");
      expect(headers["Mcp-Protocol-Version"]).toBe(MCP_PROTOCOL_VERSION);
      expect(headers.Accept).toContain("text/event-stream");
    }
    // initialize has no session id; initialized + tools/call echo the minted one.
    expect((calls[0].init.headers as Record<string, string>)["Mcp-Session-Id"]).toBeUndefined();
    expect((calls[1].init.headers as Record<string, string>)["Mcp-Session-Id"]).toBe("sess-1");
    expect((calls[2].init.headers as Record<string, string>)["Mcp-Session-Id"]).toBe("sess-1");
  });

  it("sets redirect:'error' on every fetch (SSRF guard)", async () => {
    const { calls } = installFetch(handshakeThen((ctx) => okRead(ctx, {})));
    await callTool({ ...READ_CALL });
    for (const call of calls) {
      expect(call.init.redirect).toBe("error");
    }
  });

  it("reuses the org session on a second call (no re-handshake)", async () => {
    const { calls } = installFetch(handshakeThen((ctx) => okRead(ctx, { n: 1 })));
    await callTool({ ...READ_CALL });
    await callTool({ ...READ_CALL });
    // 3 for the first call (init, initialized, call) + 1 for the warm second call.
    expect(calls.map((c) => c.method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/call",
      "tools/call",
    ]);
  });
});

describe("callTool session renewal + re-init", () => {
  it("adopts a renewed Mcp-Session-Id from a response header", async () => {
    let toolCalls = 0;
    const { calls } = installFetch((ctx) => {
      if (ctx.method === "initialize") {
        return makeResponse({
          body: { jsonrpc: "2.0", id: ctx.body.id, result: {} },
          sessionId: "sess-1",
        });
      }
      if (ctx.method === "notifications/initialized") {
        return makeResponse({ status: 202, body: "", contentType: null });
      }
      toolCalls += 1;
      // The first tools/call rotates the session id via its response header.
      return makeResponse({
        body: {
          jsonrpc: "2.0",
          id: ctx.body.id,
          result: { content: [{ type: "text", text: JSON.stringify({ n: toolCalls }) }] },
        },
        sessionId: toolCalls === 1 ? "sess-2" : undefined,
      });
    });

    await callTool({ ...READ_CALL });
    await callTool({ ...READ_CALL });

    // The warm second call must carry the rotated id, not the original.
    expect((calls[3].init.headers as Record<string, string>)["Mcp-Session-Id"]).toBe("sess-2");
  });

  it("re-initializes once and replays on -32003 session_not_initialized", async () => {
    let toolCalls = 0;
    const { calls } = installFetch((ctx) => {
      if (ctx.method === "initialize") {
        return makeResponse({
          body: { jsonrpc: "2.0", id: ctx.body.id, result: {} },
          sessionId: `sess-${calls.filter((c) => c.method === "initialize").length}`,
        });
      }
      if (ctx.method === "notifications/initialized") {
        return makeResponse({ status: 202, body: "", contentType: null });
      }
      toolCalls += 1;
      if (toolCalls === 1) {
        return makeResponse({
          body: {
            jsonrpc: "2.0",
            id: ctx.body.id,
            error: { code: -32003, message: "session_not_initialized" },
          },
        });
      }
      return okRead(ctx, { recovered: true });
    });

    const result = await callTool({ ...READ_CALL });

    expect(result).toEqual({ ok: true, data: { recovered: true } });
    // init, initialized, call(#1 -32003), init(again), initialized(again), call(#2 ok)
    expect(calls.map((c) => c.method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/call",
      "initialize",
      "notifications/initialized",
      "tools/call",
    ]);
  });

  it("does NOT re-init+replay a non-idempotent (write) call on -32003 — no double-broadcast (D17a)", async () => {
    const { calls } = installFetch((ctx) => {
      if (ctx.method === "initialize") {
        return makeResponse({ body: { jsonrpc: "2.0", id: ctx.body.id, result: {} }, sessionId: "s" });
      }
      if (ctx.method === "notifications/initialized") {
        return makeResponse({ status: 202, body: "", contentType: null });
      }
      return makeResponse({
        body: { jsonrpc: "2.0", id: ctx.body.id, error: { code: -32003, message: "nope" } },
      });
    });

    // A write that reached the server and got a session error must NOT replay —
    // the replay could double-broadcast. The guard holds on the session path too.
    const result = await callTool({ ...READ_CALL, idempotent: false });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("session");
    // Exactly ONE tools/call — no re-init + replay for a non-idempotent call.
    expect(calls.filter((c) => c.method === "tools/call")).toHaveLength(1);
  });

  it("gives up with a session error if -32003 persists after one re-init", async () => {
    const { calls } = installFetch((ctx) => {
      if (ctx.method === "initialize") {
        return makeResponse({ body: { jsonrpc: "2.0", id: ctx.body.id, result: {} }, sessionId: "s" });
      }
      if (ctx.method === "notifications/initialized") {
        return makeResponse({ status: 202, body: "", contentType: null });
      }
      return makeResponse({
        body: { jsonrpc: "2.0", id: ctx.body.id, error: { code: -32003, message: "nope" } },
      });
    });

    const result = await callTool({ ...READ_CALL });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("session");
    // Exactly one re-init: two tools/call attempts, no infinite loop.
    expect(calls.filter((c) => c.method === "tools/call")).toHaveLength(2);
  });
});

describe("callTool rate limiting", () => {
  it("retries a read-class call once, honoring retryAfter <= 10s, then succeeds", async () => {
    vi.useFakeTimers();
    let toolCalls = 0;
    installFetch(
      handshakeThen((ctx) => {
        toolCalls += 1;
        if (toolCalls === 1) {
          return makeResponse({
            status: 429,
            retryAfter: 2,
            body: {
              jsonrpc: "2.0",
              id: ctx.body.id,
              error: { code: -32029, message: "rate", data: { retryAfter: 2 } },
            },
          });
        }
        return okRead(ctx, { afterBackoff: true });
      }),
    );

    const promise = callTool({ ...READ_CALL });
    await vi.advanceTimersByTimeAsync(2000 + 300);
    const result = await promise;

    expect(result).toEqual({ ok: true, data: { afterBackoff: true } });
    expect(toolCalls).toBe(2);
  });

  it("does NOT retry a non-idempotent call — returns rate_limited immediately", async () => {
    let toolCalls = 0;
    installFetch(
      handshakeThen((ctx) => {
        toolCalls += 1;
        return makeResponse({
          status: 429,
          retryAfter: 2,
          body: { jsonrpc: "2.0", id: ctx.body.id, error: { code: -32029, data: { retryAfter: 2 } } },
        });
      }),
    );

    const result = await callTool({ ...READ_CALL, idempotent: false });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("rate_limited");
      expect(result.error.retryAfter).toBe(2);
    }
    expect(toolCalls).toBe(1);
  });

  it("does NOT retry when retryAfter exceeds the 10s ceiling", async () => {
    let toolCalls = 0;
    installFetch(
      handshakeThen((ctx) => {
        toolCalls += 1;
        return makeResponse({
          status: 429,
          retryAfter: 45,
          body: { jsonrpc: "2.0", id: ctx.body.id, error: { code: -32029, data: { retryAfter: 45 } } },
        });
      }),
    );
    const result = await callTool({ ...READ_CALL });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("rate_limited");
    expect(toolCalls).toBe(1);
  });
});

describe("callTool error mapping", () => {
  it("surfaces insufficient_scope with the decoded upgrade payload", async () => {
    const payload = {
      error: "insufficient_scope",
      message: "needs mcp:write",
      required_scope: "mcp:write",
      granted_scope: "mcp:read",
      upgrade_url: "/settings/mcp/reauthorize?required=mcp%3Awrite",
      hint: "Reauthorize.",
    };
    installFetch(
      handshakeThen((ctx) =>
        makeResponse({
          body: {
            jsonrpc: "2.0",
            id: ctx.body.id,
            result: { content: [{ type: "text", text: JSON.stringify(payload) }], isError: true },
          },
        }),
      ),
    );
    const result = await callTool({ ...READ_CALL });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("insufficient_scope");
      expect(result.error.decoded).toEqual(payload);
    }
  });

  it("maps a non-2xx without a JSON-RPC error to a transport error", async () => {
    installFetch(
      handshakeThen(() => makeResponse({ status: 502, body: "Bad Gateway", contentType: "text/html" })),
    );
    const result = await callTool({ ...READ_CALL });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("transport");
      expect(result.error.message).toContain("502");
    }
  });

  it("maps a thrown fetch (network failure) to a transport error, never throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );
    const result = await callTool({ ...READ_CALL });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("transport");
      expect(result.error.message).toContain("network down");
    }
  });
});
