import { describe, expect, it } from "vitest";

import {
  buildHeaders,
  extractRetryAfter,
  MCP_PROTOCOL_VERSION,
  parseJsonRpcBody,
  rateLimitMessage,
  readApiFailure,
  unwrapToolResult,
} from "@/lib/mcp/wire";

describe("buildHeaders", () => {
  it("sets the server's protocol version and both required Accept media types", () => {
    const headers = buildHeaders({ accessToken: "tok-abc" });
    expect(headers.Authorization).toBe("Bearer tok-abc");
    expect(headers["Content-Type"]).toBe("application/json");
    // Both are required or the server 406s.
    expect(headers.Accept).toContain("application/json");
    expect(headers.Accept).toContain("text/event-stream");
    // The SERVER's advertised version, not the AI SDK client's default.
    expect(headers["Mcp-Protocol-Version"]).toBe(MCP_PROTOCOL_VERSION);
    expect(MCP_PROTOCOL_VERSION).toBe("2025-06-18");
  });

  it("omits Mcp-Session-Id before init and includes it after", () => {
    expect(buildHeaders({ accessToken: "t" })["Mcp-Session-Id"]).toBeUndefined();
    expect(
      buildHeaders({ accessToken: "t", sessionId: "sess-1" })["Mcp-Session-Id"],
    ).toBe("sess-1");
  });
});

describe("parseJsonRpcBody", () => {
  it("parses a plain JSON body (the enableJsonResponse happy path)", () => {
    const parsed = parseJsonRpcBody(
      JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }),
      "application/json",
    );
    expect(parsed?.result).toEqual({ ok: true });
  });

  it("extracts the JSON-RPC message from an SSE data frame (defensive branch)", () => {
    const sse = `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 2, result: { v: 1 } })}\n\n`;
    const parsed = parseJsonRpcBody(sse, "text/event-stream");
    expect(parsed?.result).toEqual({ v: 1 });
  });

  it("uses the LAST data frame when several arrive", () => {
    const sse = [
      `data: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { first: true } })}`,
      `data: ${JSON.stringify({ jsonrpc: "2.0", id: 2, result: { last: true } })}`,
      "",
    ].join("\n");
    expect(parseJsonRpcBody(sse, "text/event-stream")?.result).toEqual({
      last: true,
    });
  });

  it("returns null for an empty body (a notification's 202)", () => {
    expect(parseJsonRpcBody("", null)).toBeNull();
    expect(parseJsonRpcBody("   ", "application/json")).toBeNull();
  });

  it("returns null for an unparseable body", () => {
    expect(parseJsonRpcBody("Bad Gateway", "text/html")).toBeNull();
  });
});

describe("unwrapToolResult", () => {
  it("unwraps content[0].text parsed as JSON on a synchronous read", () => {
    const data = { balance: "1000000000000000000", symbol: "ETH" };
    const result = unwrapToolResult({
      content: [{ type: "text", text: JSON.stringify(data) }],
    });
    expect(result).toEqual({ ok: true, data });
  });

  it("prefers structuredContent when the server provides it", () => {
    const result = unwrapToolResult({
      content: [{ type: "text", text: "ignored" }],
      structuredContent: { rich: true },
    });
    expect(result).toEqual({ ok: true, data: { rich: true } });
  });

  it("keeps a non-JSON text payload as a string rather than failing", () => {
    const result = unwrapToolResult({ content: [{ type: "text", text: "42" }] });
    // "42" is valid JSON (the number 42); a bare word is a string.
    const word = unwrapToolResult({ content: [{ type: "text", text: "pong" }] });
    expect(result).toEqual({ ok: true, data: 42 });
    expect(word).toEqual({ ok: true, data: "pong" });
  });

  it("classifies insufficient_scope from the error payload", () => {
    const payload = {
      error: "insufficient_scope",
      message: "needs mcp:write",
      required_scope: "mcp:write",
      granted_scope: "mcp:read",
      upgrade_url: "/settings/mcp/reauthorize",
      hint: "Reauthorize.",
    };
    const result = unwrapToolResult({
      content: [{ type: "text", text: JSON.stringify(payload) }],
      isError: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("insufficient_scope");
      expect(result.error.decoded).toEqual(payload);
      expect(result.error.message).toBe("needs mcp:write");
    }
  });

  it("maps a generic tool error to tool_error with the decoded payload", () => {
    const payload = { error: "validation_failed", message: "bad param" };
    const result = unwrapToolResult({
      content: [{ type: "text", text: JSON.stringify(payload) }],
      isError: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("tool_error");
      expect(result.error.message).toBe("bad param");
      expect(result.error.decoded).toEqual(payload);
    }
  });

  it("never silently succeeds on a missing envelope", () => {
    const result = unwrapToolResult(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("tool_error");
    }
  });
});

describe("extractRetryAfter", () => {
  it("reads retryAfter from the JSON-RPC error data", () => {
    expect(extractRetryAfter({ code: -32029, data: { retryAfter: 7 } }, null)).toBe(7);
  });

  it("reads retryAfter from the error object directly", () => {
    expect(extractRetryAfter({ code: -32029, retryAfter: 3 }, null)).toBe(3);
  });

  it("falls back to the Retry-After header", () => {
    expect(extractRetryAfter(undefined, "12")).toBe(12);
  });

  it("returns undefined when no source carries a number", () => {
    expect(extractRetryAfter(undefined, null)).toBeUndefined();
    expect(extractRetryAfter({ code: -32029 }, "not-a-number")).toBeUndefined();
  });
});

describe("rateLimitMessage", () => {
  it("is sentence case with a period and no exclamation or em-dash", () => {
    const withSeconds = rateLimitMessage(5);
    expect(withSeconds).toMatch(/\.$/);
    expect(withSeconds).not.toMatch(/[!—]/);
    expect(withSeconds).toContain("5 seconds");
    expect(rateLimitMessage()).toMatch(/\.$/);
  });
});

/*
 * KeeperHub throws its failures as `API call failed: <status> <statusText> -
 * <body>`. Before this the whole string was the message and the body never
 * reached the app, so a dry run's own verdict was invisible and an ethers dump
 * filled the card (Abu, hosted, 2026-09-17).
 */
describe("readApiFailure (KeeperHub's glued-on error body)", () => {
  it("reads the field complaint out of a 400 and keeps the body", () => {
    const failure = readApiFailure(
      'API call failed: 400 Bad Request - {"error":"Invalid field type","field":"priorityFeeGwei","details":"priorityFeeGwei must be a non-empty decimal string in gwei"}',
    );
    expect(failure?.message).toBe(
      "Invalid field type: priorityFeeGwei must be a non-empty decimal string in gwei",
    );
    expect(failure?.payload).toMatchObject({ field: "priorityFeeGwei" });
  });

  it("prefers a dry run's revert reason and drops the ethers call dump", () => {
    const failure = readApiFailure(
      'API call failed: 400 Bad Request - {"success":false,"status":"simulated","wouldRevert":true,"revertReason":"Simulation reverted: missing revert data (action=\\"call\\", data=null, code=CALL_EXCEPTION)"}',
    );
    expect(failure?.message).toBe("Simulation reverted: missing revert data");
    expect(failure?.payload).toMatchObject({ wouldRevert: true });
  });

  it("keeps a body that is not JSON, and ignores text that is not an API failure", () => {
    expect(readApiFailure("API call failed: 502 Bad Gateway - upstream said no")?.message).toBe(
      "upstream said no",
    );
    expect(readApiFailure("something else entirely")).toBeUndefined();
  });

  it("an error envelope carrying one gives the app the body, not the sentence", () => {
    const result = unwrapToolResult({
      isError: true,
      content: [
        {
          type: "text",
          text: 'API call failed: 400 Bad Request - {"wouldRevert":true,"revertReason":"insufficient collateral"}',
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("insufficient collateral");
      expect(result.error.decoded).toEqual({ wouldRevert: true, revertReason: "insufficient collateral" });
    }
  });
});
