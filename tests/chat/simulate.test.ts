import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession }));

const { routeToolCall } = vi.hoisted(() => ({ routeToolCall: vi.fn() }));
vi.mock("@/lib/execution", () => ({ routeToolCall }));

import { POST } from "@/app/api/chat/simulate/route";

const SESSION = { id: "s1", userId: "u1", orgId: "org-1", scope: "mcp:read", accessToken: "tok" };

function post(body: unknown): Request {
  return new Request("http://localhost/api/chat/simulate", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const CONTRACT_WRITE = {
  conversationId: "conv-1",
  tool: "execute_contract_call",
  args: { contract_address: "0xabc", chain_id: "1", function_name: "transfer", stateMutability: "nonpayable" },
  toolCallId: "tc-1",
};

beforeEach(() => {
  getSession.mockReset();
  routeToolCall.mockReset();
  getSession.mockResolvedValue(SESSION);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/chat/simulate (Story 2.3, AC 1/2)", () => {
  it("returns 401 when signed out", async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(post(CONTRACT_WRITE));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
    expect(routeToolCall).not.toHaveBeenCalled();
  });

  it("400s a non-write tool or a malformed body", async () => {
    for (const body of [
      "not-json",
      { conversationId: "c", tool: "search_actions", args: {} },
      { conversationId: "c", tool: "execute_contract_call" },
      { tool: "execute_contract_call", args: {} },
    ]) {
      const res = await POST(post(body));
      expect(res.status).toBe(400);
    }
    expect(routeToolCall).not.toHaveBeenCalled();
  });

  it("routes through the ONE door with write:'simulate' and maps a simulated preview (AC 1)", async () => {
    routeToolCall.mockResolvedValue({
      ok: true,
      tool: "execute_contract_call",
      state: "simulated",
      preview: { gasEstimate: "21000", wouldRevert: false },
    });
    const res = await POST(post(CONTRACT_WRITE));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      kind: "simulated",
      preview: { gasEstimate: "21000", wouldRevert: false },
    });
    expect(routeToolCall.mock.calls[0][0]).toMatchObject({
      toolName: "execute_contract_call",
      write: "simulate",
      conversationId: "conv-1",
      toolCallId: "tc-1",
    });
  });

  it("accepts execute_transfer and maps its simulated preview (Story 2.5, D25)", async () => {
    routeToolCall.mockResolvedValue({
      ok: true,
      tool: "execute_transfer",
      state: "simulated",
      preview: { gasEstimate: "21000", wouldRevert: false, sponsored: true },
    });
    const res = await POST(
      post({
        conversationId: "conv-1",
        tool: "execute_transfer",
        args: { chain_id: "11155111", to_address: "0xrec", amount: "0.1" },
        toolCallId: "tc-t",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      kind: "simulated",
      preview: { gasEstimate: "21000", wouldRevert: false, sponsored: true },
    });
    expect(routeToolCall.mock.calls[0][0]).toMatchObject({
      toolName: "execute_transfer",
      write: "simulate",
    });
  });

  it("maps a Solana transfer no-preview coercion (AC 2, D28)", async () => {
    routeToolCall.mockResolvedValue({ ok: true, tool: "execute_transfer", state: "no-preview" });
    const res = await POST(
      post({
        conversationId: "c",
        tool: "execute_transfer",
        args: { chain_id: "101", to_address: "SoLaNa", amount: "1.5" },
      }),
    );
    expect(await res.json()).toEqual({ ok: true, kind: "no-preview" });
  });

  it("maps a protocol-action no-preview coercion (AC 2)", async () => {
    routeToolCall.mockResolvedValue({
      ok: true,
      tool: "execute_protocol_action",
      state: "no-preview",
      opId: "web3/transfer-token",
    });
    const res = await POST(
      post({ conversationId: "c", tool: "execute_protocol_action", args: { actionType: "web3/transfer-token", params: {} } }),
    );
    expect(await res.json()).toEqual({ ok: true, kind: "no-preview" });
  });

  it("maps a needs-credential pre-state (setup, not ceremony — D17b display)", async () => {
    routeToolCall.mockResolvedValue({
      ok: true,
      tool: "execute_protocol_action",
      state: "needs-credential",
      opId: "web3/transfer-token",
      integration: "web3",
      message: "needs web3",
    });
    const res = await POST(
      post({ conversationId: "c", tool: "execute_protocol_action", args: { actionType: "web3/transfer-token", params: {} } }),
    );
    expect(await res.json()).toEqual({
      ok: true,
      kind: "needs-credential",
      integration: "web3",
      message: "needs web3",
    });
  });

  it("passes an error envelope through (a failing simulate surfaces its reason)", async () => {
    routeToolCall.mockResolvedValue({
      ok: false,
      tool: "execute_contract_call",
      error: { code: "tool_error", message: "boom", decoded: { reason: "bad" } },
    });
    const res = await POST(post(CONTRACT_WRITE));
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("tool_error");
  });
});
