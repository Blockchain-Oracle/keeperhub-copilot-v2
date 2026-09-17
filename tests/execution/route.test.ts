import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the wire client so gate/validation refusals can assert "no network", and
// success/error mappings can be driven without a live KeeperHub. Registry
// classification stays REAL (the valuable part of the gate).
const { callTool } = vi.hoisted(() => ({ callTool: vi.fn() }));
vi.mock("@/lib/mcp", () => ({ callTool }));

// Mock the ledger DB WRITERS (Story 2.2/2.3): recordRead (read rows), writeIntent
// (the pre-broadcast intent), writeTerminal (the write-once terminal). Mocking
// only the writers keeps the "no test hits the DB" convention AND lets the pure
// parsers (deriveIdempotencyKey / extractTxHash / extractExecutionId) run for real
// so the broadcast path is exercised end-to-end. Row-shape + CAS assertions live
// in tests/ledger where the writers run over a mocked accessor.
const { recordRead, writeIntent, writeTerminal, recordDecline, recordExecutionId } = vi.hoisted(() => ({
  recordRead: vi.fn(),
  writeIntent: vi.fn(),
  writeTerminal: vi.fn(),
  recordDecline: vi.fn(),
  recordExecutionId: vi.fn(),
}));
vi.mock("@/lib/ledger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ledger")>()),
  recordRead,
  writeIntent,
  writeTerminal,
  recordDecline,
  recordExecutionId,
}));

import {
  readSettledReceipt,
  recordWriteDecline,
  requiresConfirmation,
  routeToolCall,
} from "@/lib/execution";
import { __resetCredentialCache } from "@/lib/execution/credentials";
import { getOperationEntry } from "@/lib/registry";

const session = {
  id: "s1",
  userId: "u1",
  orgId: "org-1",
  scope: "mcp:read mcp:write",
  accessToken: "tok-abc",
};
// conversationId + toolCallId are now required on every routeToolCall (Story
// 2.2); spreading base into all ~27 call sites supplies them uniformly.
const base = {
  session,
  requestId: "req-1",
  conversationId: "conv-1",
  toolCallId: "call-1",
} as const;

// The needs-credential binding check (D8) reads list_integrations via the SAME
// mocked callTool. This drives it: list_integrations reports `bound` integration
// types; every other call (the actual execute) resolves to `exec`.
function mockWire(
  bound: string[],
  exec: { ok: true; data: unknown } | { ok: false; error: unknown } = {
    ok: true,
    data: {},
  },
): void {
  callTool.mockImplementation((opts: { name: string }) =>
    Promise.resolve(
      opts.name === "list_integrations"
        ? { ok: true, data: bound.map((type) => ({ id: type, name: type, type })) }
        : exec,
    ),
  );
}

/** Wire calls that are NOT the list_integrations binding read (i.e. real
 *  executes). A gated refusal may read integrations but must never execute. */
function executeCalls(): unknown[] {
  return callTool.mock.calls.filter(
    (c: unknown[]) => (c[0] as { name: string }).name !== "list_integrations",
  );
}

beforeEach(() => {
  callTool.mockReset();
  recordRead.mockReset();
  writeIntent.mockReset();
  writeTerminal.mockReset();
  recordDecline.mockReset();
  // The confirmed-write path lands an intent row then a terminal; default them to
  // success so a ceremony test only overrides what it is checking.
  writeIntent.mockResolvedValue({ id: "ledger-1" });
  writeTerminal.mockResolvedValue({ landed: true, row: { id: "ledger-1" } });
  // The binding memo is module-level (session-stable per org); every case reuses
  // org-1, so clear it or a bound result leaks into the next case.
  __resetCredentialCache();
});

/** Wire calls to a specific tool name (broadcast, status poll, binding read). */
function callsTo(name: string): unknown[] {
  return callTool.mock.calls.filter(
    (c: unknown[]) => (c[0] as { name: string }).name === name,
  );
}

describe("routeToolCall — read path (AC 1, 4)", () => {
  it("passes a read with no gate friction, calls the wire, and merges passthroughDefaults", async () => {
    callTool.mockResolvedValue({ ok: true, data: { value: "3000", success: true } });

    const out = await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType: "chronicle/eth-usd-read", params: { network: "1" } },
    });

    expect(out).toEqual({
      ok: true,
      tool: "execute_protocol_action",
      opId: "chronicle/eth-usd-read",
      fingerprint: expect.stringMatching(/^sha256:/),
      data: { value: "3000", success: true },
    });
    expect(callTool).toHaveBeenCalledTimes(1);
    const passed = callTool.mock.calls[0][0];
    expect(passed.name).toBe("execute_protocol_action");
    expect(passed.args.actionType).toBe("chronicle/eth-usd-read");
    // The hidden _protocolMeta default is merged in — dropping it breaks routing.
    expect(passed.args.params).toMatchObject({
      network: "1",
      _protocolMeta: expect.any(String),
    });
    expect(passed.idempotent).toBe(true);
    expect(passed.accessToken).toBe("tok-abc");
    expect(passed.orgId).toBe("org-1");
    // The MCP session is keyed per user (H1) — the caller must pass userId.
    expect(passed.userId).toBe("u1");
  });

  it("records a read in the ledger unless the caller opts out (decision 13)", async () => {
    callTool.mockResolvedValue({ ok: true, data: { value: "3000", success: true } });
    const args = { actionType: "chronicle/eth-usd-read", params: { network: "1" } };

    await routeToolCall({ ...base, toolName: "execute_protocol_action", args });
    expect(recordRead).toHaveBeenCalledTimes(1);

    recordRead.mockReset();
    const out = await routeToolCall({ ...base, toolName: "execute_protocol_action", args, recordRead: false });
    expect(out.ok).toBe(true);
    expect(recordRead).not.toHaveBeenCalled();
  });

  it("never sends the model-declared alternatives to the wire (card data, not a param) — Story 1.6", async () => {
    callTool.mockResolvedValue({ ok: true, data: { value: "3000" } });

    await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: {
        actionType: "chronicle/eth-usd-read",
        params: { network: "1" },
        alternatives: [
          { actionType: "chronicle/btc-usd-read", label: "BTC price" },
        ],
      },
    });

    expect(callTool).toHaveBeenCalledTimes(1);
    const passed = callTool.mock.calls[0][0];
    // alternatives lives beside params, not inside — it is structurally ignored.
    expect(passed.args).not.toHaveProperty("alternatives");
    expect(passed.args.params).not.toHaveProperty("alternatives");
  });

  it("runs search_actions locally without touching the wire", async () => {
    const out = await routeToolCall({
      ...base,
      toolName: "search_actions",
      args: { query: "eth", integration: "chronicle" },
    });
    expect(out.ok).toBe(true);
    if (out.ok && out.tool === "search_actions") {
      expect(out.result.matches.length).toBeGreaterThan(0);
    }
    expect(callTool).not.toHaveBeenCalled();
  });

  it("forces simulate:true on a view/pure contract call and never sends the model stateMutability (D1)", async () => {
    callTool.mockResolvedValue({ ok: true, data: { result: "42" } });
    const out = await routeToolCall({
      ...base,
      toolName: "execute_contract_call",
      args: {
        contract_address: "0xabc",
        chain_id: "1",
        function_name: "balanceOf",
        function_args: '["0x1"]',
        stateMutability: "view",
      },
    });
    expect(out).toEqual({ ok: true, tool: "execute_contract_call", data: { result: "42" } });
    const passed = callTool.mock.calls[0][0];
    // simulate:true is the hard no-broadcast guarantee; stateMutability never
    // crosses the wire (it is not the security boundary).
    expect(passed.args).toEqual({
      contract_address: "0xabc",
      chain_id: "1",
      function_name: "balanceOf",
      function_args: '["0x1"]',
      simulate: true,
    });
    expect(passed.args.stateMutability).toBeUndefined();
    // Forced simulate makes the wire call a read; idempotent derives from that.
    expect(passed.idempotent).toBe(true);
  });

  it("passes get_wallet_integration through as a read verb", async () => {
    callTool.mockResolvedValue({ ok: true, data: { id: "wallet-1", address: "0xwallet" } });
    const out = await routeToolCall({
      ...base,
      toolName: "get_wallet_integration",
      args: { integrationId: "wallet-1" },
    });
    expect(out).toEqual({
      ok: true,
      tool: "get_wallet_integration",
      data: { id: "wallet-1", address: "0xwallet" },
    });
    expect(callTool.mock.calls[0][0].args).toEqual({ integrationId: "wallet-1" });
    // Classified read (D7.3) — reaches the wire through the classifier, and the
    // wire idempotent flag is DERIVED from that class (read → true), not a literal.
    expect(callTool.mock.calls[0][0].idempotent).toBe(true);
  });
});

describe("routeToolCall — the gate refuses non-reads WITHOUT a network call", () => {
  it("refuses a bound value-moving-write with write_not_available; the write never reaches the wire", async () => {
    // aave-v3/supply is credential-gated (integration: web3). With web3
    // BOUND, the needs-credential axis passes and the read gate refuses the
    // write (D8: unbound would instead show needs-credential — covered below).
    mockWire(["web3"]);
    const out = await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType: SUPPLY, params: {} },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("write_not_available");
    // The binding read may run (gated op); the WRITE execution never does.
    expect(executeCalls()).toHaveLength(0);
  });

  it("refuses a quarantined action with its reason", async () => {
    const out = await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType: "code/run-code", params: {} },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("quarantined");
    expect(callTool).not.toHaveBeenCalled();
  });

  it("refuses an absent action as quarantined", async () => {
    const out = await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType: "nope/does-not-exist", params: {} },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("quarantined");
    expect(callTool).not.toHaveBeenCalled();
  });

  it("a state-changing contract call with NO ceremony phase never broadcasts — forced simulate:true", async () => {
    // With no `write` phase (a re-run or stray call), the forced-simulate
    // guarantee still holds: the wire call is simulate:true, never a broadcast.
    callTool.mockResolvedValue({ ok: true, data: { gasEstimate: "21000" } });
    const out = await routeToolCall({
      ...base,
      toolName: "execute_contract_call",
      args: {
        contract_address: "0xabc",
        chain_id: "1",
        function_name: "transfer",
        stateMutability: "nonpayable",
      },
    });
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool.mock.calls[0][0].args.simulate).toBe(true);
    expect(callTool.mock.calls[0][0].args).not.toHaveProperty("idempotency_key");
    expect(out.ok).toBe(true);
  });
});

describe("routeToolCall — validation happens before the network (AC 1)", () => {
  it("returns field-level issues for a missing required param, no network call", async () => {
    const out = await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType: "chronicle/eth-usd-read", params: {} },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("validation_failed");
      expect(out.error.issues?.some((issue) => issue.path === "network")).toBe(true);
    }
    expect(callTool).not.toHaveBeenCalled();
  });

  it("returns validation_failed for a contract call missing function_name, no network call", async () => {
    const out = await routeToolCall({
      ...base,
      toolName: "execute_contract_call",
      args: { contract_address: "0xabc", chain_id: "1", stateMutability: "view" },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("validation_failed");
      expect(out.error.issues?.some((issue) => issue.path === "function_name")).toBe(
        true,
      );
    }
    expect(callTool).not.toHaveBeenCalled();
  });

  it("returns validation_failed for a view call missing contract_address, no network call", async () => {
    const out = await routeToolCall({
      ...base,
      toolName: "execute_contract_call",
      args: { chain_id: "1", function_name: "balanceOf", stateMutability: "view" },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("validation_failed");
      expect(out.error.issues?.some((issue) => issue.path === "contract_address")).toBe(true);
    }
    expect(callTool).not.toHaveBeenCalled();
  });
});

describe("routeToolCall — error mapping surfaces reasons honestly", () => {
  const READ = {
    toolName: "execute_protocol_action" as const,
    args: { actionType: "chronicle/eth-usd-read", params: { network: "1" } },
  };

  it("normalizes insufficient_scope via 1.2's parser (upgrade path for FR38)", async () => {
    const payload = {
      error: "insufficient_scope",
      message: "needs mcp:write",
      required_scope: "mcp:write",
      granted_scope: "mcp:read",
      upgrade_url: "/settings/mcp/reauthorize?required=mcp%3Awrite",
      hint: "Reauthorize.",
    };
    callTool.mockResolvedValue({
      ok: false,
      error: { code: "insufficient_scope", message: "needs mcp:write", decoded: payload },
    });

    const out = await routeToolCall({ ...base, ...READ });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("insufficient_scope");
      expect(out.error.scope?.requiredScope).toBe("mcp:write");
      expect(out.error.scope?.upgradeUrl).toBe("/settings/mcp/reauthorize?required=mcp%3Awrite");
      expect(out.error.decoded).toEqual(payload);
    }
  });

  it("carries rate_limited + retryAfter and returns (never throws) so chat continues", async () => {
    callTool.mockResolvedValue({
      ok: false,
      error: { code: "rate_limited", message: "limited", retryAfter: 30 },
    });
    const out = await routeToolCall({ ...base, ...READ });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("rate_limited");
      expect(out.error.retryAfter).toBe(30);
    }
  });

  it("passes a decoded revert reason through untouched", async () => {
    callTool.mockResolvedValue({
      ok: false,
      error: { code: "tool_error", message: "execution reverted", decoded: { reason: "insufficient balance" } },
    });
    const out = await routeToolCall({ ...base, ...READ });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("tool_error");
      expect(out.error.decoded).toEqual({ reason: "insufficient balance" });
    }
  });

  it("refuses an unknown tool name", async () => {
    const out = await routeToolCall({ ...base, toolName: "execute_teleport", args: {} });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("unknown_tool");
    expect(callTool).not.toHaveBeenCalled();
  });
});

describe("execute_contract_call is read-only by mechanism, not by trusting the model (D1)", () => {
  it("refuses a Solana contract call (cannot be simulated) without a network call", async () => {
    const out = await routeToolCall({
      ...base,
      toolName: "execute_contract_call",
      args: {
        contract_address: "0xabc",
        chain_id: "101",
        function_name: "x",
        stateMutability: "view",
      },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("write_not_available");
    expect(callTool).not.toHaveBeenCalled();
  });

  it("a payable contract call with no ceremony phase still forces simulate:true (never sends value)", async () => {
    callTool.mockResolvedValue({ ok: true, data: { gasEstimate: "50000" } });
    const out = await routeToolCall({
      ...base,
      toolName: "execute_contract_call",
      args: {
        contract_address: "0xabc",
        chain_id: "1",
        function_name: "deposit",
        stateMutability: "payable",
        value: "1000000000000000000",
      },
    });
    expect(callTool).toHaveBeenCalledTimes(1);
    // simulate:true and NO broadcast — value is never sent on a non-broadcast path.
    expect(callTool.mock.calls[0][0].args.simulate).toBe(true);
    expect(out.ok).toBe(true);
  });

  it("tolerates an unrecognized stateMutability — safety is the forced simulate, not the model field", async () => {
    callTool.mockResolvedValue({ ok: true, data: { result: "1" } });
    const out = await routeToolCall({
      ...base,
      toolName: "execute_contract_call",
      args: {
        contract_address: "0xabc",
        chain_id: "1",
        function_name: "x",
        stateMutability: "weird",
      },
    });
    expect(out.ok).toBe(true);
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool.mock.calls[0][0].args.simulate).toBe(true);
  });
});

describe("the read gate refuses every non-read effect class of execute_protocol_action (M14)", () => {
  it("refuses a bound authorization-grant (approve) with write_not_available; the write never reaches the wire", async () => {
    // aerodrome/aero-approve is credential-gated (integration: web3). Bound → the
    // read gate refuses; the grant never reaches the wire.
    mockWire(["web3"]);
    const out = await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType: "aerodrome/aero-approve", params: {} },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("write_not_available");
    expect(executeCalls()).toHaveLength(0);
  });
});

describe("actions KeeperHub runs only inside automations are refused before anything else (decision 35)", () => {
  it.each([
    ["web3/check-balance", { network: "11155111", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" }],
    ["web3/transfer-token", VALID_TRANSFER_PARAMS],
    ["slack/send-message", {}],
    ["safe/get-pending-transactions", { safeAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", network: "1" }],
  ])("%s answers automation_only with the working routes, no binding check, no wire, no card", async (actionType, params) => {
    mockWire(["web3", "safe", "slack"]);
    const out = await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType, params },
      write: "broadcast",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("automation_only");
      expect(out.error.message).toContain("execute_transfer");
      expect(out.error.message).toContain("get_org_wallet_balances");
    }
    expect(callTool).not.toHaveBeenCalled();
    expect(writeIntent).not.toHaveBeenCalled();
    expect(requiresConfirmation("execute_protocol_action", { actionType, params })).toBe(false);
  });
});

describe("routeToolCall — the drift trigger quarantines a stale re-run (AC 2, D9)", () => {
  const REAL_OP = "chronicle/eth-usd-read";

  it("quarantines a re-run carrying a STALE expectedFingerprint, with no network", async () => {
    const out = await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType: REAL_OP, params: { network: "1" } },
      expectedFingerprint: "sha256:stale-does-not-match",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("quarantined");
      // The drift-specific reason copy (sentence case, period, no em-dash).
      expect(out.error.message).toContain("changed since it was proposed");
    }
    expect(callTool).not.toHaveBeenCalled();
  });

  it("executes normally when the expectedFingerprint MATCHES the registry (no false drift)", async () => {
    callTool.mockResolvedValue({ ok: true, data: { value: "3000" } });
    const current = getOperationEntry(REAL_OP)?.fingerprint;
    expect(current).toMatch(/^sha256:/);
    const out = await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType: REAL_OP, params: { network: "1" } },
      expectedFingerprint: current,
    });
    expect(out.ok).toBe(true);
    expect(callTool).toHaveBeenCalledTimes(1);
  });
});

describe("routeToolCall — needs-credential, keyed off needsCredential (AC 3, D8)", () => {
  // Every credential-gated READ in the registry (safe/get-pending-transactions)
  // is one KeeperHub runs only inside automations (decision 35), so the gate is
  // proven on a gated protocol write, checked before the write gate.
  const gatedWriteArgs = { actionType: SUPPLY, params: VALID_SUPPLY_PARAMS };

  it("keys off needsCredential: the gated op names its integration", () => {
    const entry = getOperationEntry(SUPPLY);
    expect(entry?.needsCredential).toBe(true);
    expect(entry?.credentialIntegrationType ?? entry?.integration).toBe("web3");
  });

  it("gated + UNBOUND → needs-credential pre-state, no execution", async () => {
    mockWire([]); // nothing bound
    const out = await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: gatedWriteArgs,
    });
    expect(out.ok).toBe(true);
    if (out.ok && "state" in out && out.state === "needs-credential") {
      expect(out.integration).toBe("web3");
      expect(out.opId).toBe(SUPPLY);
      expect(out.message.length).toBeGreaterThan(0);
    } else {
      throw new Error("expected a needs-credential pre-state");
    }
    // Never executed — only the binding read ran.
    expect(executeCalls()).toHaveLength(0);
  });

  it("gated + BOUND → passes the credential axis and reaches the write gate", async () => {
    mockWire(["web3"]);
    const out = await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: gatedWriteArgs,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("write_not_available");
    expect(callsTo("list_integrations")).toHaveLength(1);
    expect(executeCalls()).toHaveLength(0);
  });

  it("an UNGATED read never triggers a binding check (no list_integrations call)", async () => {
    callTool.mockResolvedValue({ ok: true, data: { value: "3000" } });
    await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType: "chronicle/eth-usd-read", params: { network: "1" } },
    });
    expect(
      callTool.mock.calls.every(
        (c: unknown[]) => (c[0] as { name: string }).name !== "list_integrations",
      ),
    ).toBe(true);
  });

  it("a throttled binding check degrades to PROCEEDING (never a false pre-state)", async () => {
    // list_integrations rate-limited → undeterminable → proceed past the
    // credential axis to the next gate — the gate never fabricates a pre-state
    // and never fails the conversation (NFR7).
    callTool.mockImplementation((opts: { name: string }) =>
      Promise.resolve(
        opts.name === "list_integrations"
          ? {
              ok: false,
              error: { code: "rate_limited", message: "limited", retryAfter: 30 },
            }
          : { ok: true, data: {} },
      ),
    );
    const out = await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: gatedWriteArgs,
    });
    // Reached the write gate — not a fabricated needs-credential pre-state.
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("write_not_available");
    expect(executeCalls()).toHaveLength(0);
  });
});

describe("routeToolCall — read executions record a durable ledger row (AC 5, D12)", () => {
  it("records a protocol-action read once with the row keys the ledger needs", async () => {
    callTool.mockResolvedValue({ ok: true, data: { value: "3000" } });
    const out = await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType: "chronicle/eth-usd-read", params: { network: "1" } },
    });
    expect(out.ok).toBe(true);

    expect(recordRead).toHaveBeenCalledTimes(1);
    const arg = recordRead.mock.calls[0][0] as {
      session: unknown;
      conversationId: string;
      toolCallId: string;
      opId: string;
      schemaFingerprint: string;
      confirmedInputs: Record<string, unknown>;
    };
    expect(arg.session).toBe(session);
    expect(arg.conversationId).toBe("conv-1");
    expect(arg.toolCallId).toBe("call-1");
    expect(arg.opId).toBe("chronicle/eth-usd-read");
    expect(arg.schemaFingerprint).toMatch(/^sha256:/);
    // confirmedInputs = the validated params + the merged hidden passthroughDefaults.
    expect(arg.confirmedInputs).toMatchObject({
      network: "1",
      _protocolMeta: expect.any(String),
    });
  });

  it("a ledger-write failure NEVER fails the read (best-effort) and logs ledger_read_record_failed", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    callTool.mockResolvedValue({ ok: true, data: { value: "3000" } });
    recordRead.mockRejectedValue(new Error("neon down"));

    const out = await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType: "chronicle/eth-usd-read", params: { network: "1" } },
    });

    // The read still returns its data — evidence value never gates the read.
    expect(out.ok).toBe(true);
    if (out.ok && out.tool === "execute_protocol_action" && !("state" in out)) {
      expect(out.data).toEqual({ value: "3000" });
    } else {
      throw new Error("expected the read to return success");
    }

    const logged = errorSpy.mock.calls
      .map((call) => String(call[0]))
      .find((line) => line.includes("ledger_read_record_failed"));
    expect(logged).toBeDefined();
    expect(JSON.parse(logged!)).toMatchObject({
      event: "ledger_read_record_failed",
      conversationId: "conv-1",
      toolCallId: "call-1",
      opId: "chronicle/eth-usd-read",
      orgId: "org-1",
    });
    errorSpy.mockRestore();
  });

  it("records NO read row when nothing executed — write refused, quarantined, needs-credential", async () => {
    // A bound write is refused (write_not_available) — nothing executes.
    mockWire(["web3"]);
    await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType: SUPPLY, params: {} },
    });

    // A quarantined-class op is refused before any execution.
    await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType: "code/run-code", params: {} },
    });

    // A gated action with nothing bound surfaces needs-credential — no execution.
    __resetCredentialCache();
    mockWire([]);
    await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType: SUPPLY, params: VALID_SUPPLY_PARAMS },
    });

    // An action KeeperHub runs only inside automations is refused — no execution.
    await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType: "web3/check-balance", params: { network: "1" } },
    });

    // Also the two non-registry read verbs are NOT recorded in 2.2 (D12).
    callTool.mockResolvedValue({ ok: true, data: { result: "42" } });
    await routeToolCall({
      ...base,
      toolName: "execute_contract_call",
      args: {
        contract_address: "0xabc",
        chain_id: "1",
        function_name: "balanceOf",
        stateMutability: "view",
      },
    });
    await routeToolCall({
      ...base,
      toolName: "get_wallet_integration",
      args: { integrationId: "wallet-1" },
    });

    expect(recordRead).not.toHaveBeenCalled();
  });
});

// --- Story 2.3: the confirm ceremony -----------------------------------------

const VALID_TRANSFER_PARAMS = {
  network: "1",
  tokenConfig: "usdc",
  amount: "1000",
  recipientAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
};

// A protocol write KeeperHub runs on its own (decision 35), credential-gated on web3.
const SUPPLY = "aave-v3/supply";
const VALID_SUPPLY_PARAMS = {
  network: "1",
  asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  amount: "1000",
  onBehalfOf: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
};

describe("requiresConfirmation drives the AI SDK toolApproval config (AC 3, D14)", () => {
  it("a contract-call WRITE mutability needs approval; view/pure/absent do not", () => {
    expect(
      requiresConfirmation("execute_contract_call", { stateMutability: "nonpayable" }),
    ).toBe(true);
    expect(
      requiresConfirmation("execute_contract_call", { stateMutability: "payable" }),
    ).toBe(true);
    expect(
      requiresConfirmation("execute_contract_call", { stateMutability: "view" }),
    ).toBe(false);
    expect(
      requiresConfirmation("execute_contract_call", { stateMutability: "pure" }),
    ).toBe(false);
    // No declared write → no ceremony. Safe: it can never broadcast either, by
    // the forced-simulate guarantee.
    expect(requiresConfirmation("execute_contract_call", {})).toBe(false);
  });

  it("a protocol-action WRITE needs approval; a read, quarantined, or unknown op does not", () => {
    expect(
      requiresConfirmation("execute_protocol_action", {
        actionType: SUPPLY,
        params: {},
      }),
    ).toBe(true);
    // A write KeeperHub runs only inside automations gets no card: execution refuses it (decision 35).
    expect(
      requiresConfirmation("execute_protocol_action", {
        actionType: "web3/transfer-token",
        params: {},
      }),
    ).toBe(false);
    expect(
      requiresConfirmation("execute_protocol_action", {
        actionType: "chronicle/eth-usd-read",
        params: {},
      }),
    ).toBe(false);
    expect(
      requiresConfirmation("execute_protocol_action", {
        actionType: "code/run-code",
        params: {},
      }),
    ).toBe(false);
    expect(
      requiresConfirmation("execute_protocol_action", {
        actionType: "nope/missing",
        params: {},
      }),
    ).toBe(false);
  });

  it("reads (search, wallet) never need approval — no ceremony friction", () => {
    expect(requiresConfirmation("search_actions", {})).toBe(false);
    expect(
      requiresConfirmation("get_wallet_integration", { integrationId: "w1" }),
    ).toBe(false);
  });
});

describe("PRE-confirm simulate phase — preview vs no-preview (AC 1, 2, 5-at-sim; Task 2)", () => {
  it("a simulable contract-call write dry-runs simulate:true and returns the decoded preview, NO broadcast", async () => {
    callTool.mockResolvedValue({
      ok: true,
      data: { gasEstimate: "21000", wouldRevert: false, simulatedReturnValue: "0x" },
    });
    const out = await routeToolCall({
      ...base,
      toolName: "execute_contract_call",
      args: {
        contract_address: "0xabc",
        chain_id: "1",
        function_name: "transfer",
        function_args: '["0xr","1000"]',
        stateMutability: "nonpayable",
      },
      write: "simulate",
    });
    expect(out.ok).toBe(true);
    if (out.ok && "state" in out && out.state === "simulated") {
      expect(out.preview).toEqual({
        gasEstimate: "21000",
        wouldRevert: false,
        simulatedReturnValue: "0x",
      });
    } else {
      throw new Error("expected a simulated preview");
    }
    // Dry-run only: simulate:true on the wire, no broadcast, no intent row.
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool.mock.calls[0][0].args.simulate).toBe(true);
    expect(writeIntent).not.toHaveBeenCalled();
  });

  it("a wouldRevert:true simulate surfaces the decoded reason on the preview (AC 5 at simulation)", async () => {
    callTool.mockResolvedValue({
      ok: true,
      data: { gasEstimate: "21000", wouldRevert: true, revertReason: "insufficient balance" },
    });
    const out = await routeToolCall({
      ...base,
      toolName: "execute_contract_call",
      args: {
        contract_address: "0xabc",
        chain_id: "1",
        function_name: "transfer",
        stateMutability: "nonpayable",
      },
      write: "simulate",
    });
    expect(out.ok).toBe(true);
    if (out.ok && "state" in out && out.state === "simulated") {
      expect(out.preview).toMatchObject({
        wouldRevert: true,
        revertReason: "insufficient balance",
      });
    } else {
      throw new Error("expected a simulated preview carrying the revert reason");
    }
  });

  it("a protocol-action write coerces to no-preview — no wire call, no broadcast (AC 2)", async () => {
    mockWire(["web3"]);
    const out = await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType: SUPPLY, params: VALID_SUPPLY_PARAMS },
      write: "simulate",
    });
    expect(out.ok).toBe(true);
    if (out.ok && "state" in out && out.state === "no-preview") {
      expect(out.opId).toBe(SUPPLY);
    } else {
      throw new Error("expected a no-preview coercion");
    }
    expect(executeCalls()).toHaveLength(0);
    expect(writeIntent).not.toHaveBeenCalled();
  });
});

describe("POST-confirm broadcast phase — intent, broadcast, terminal (AC 4, 5; Task 3)", () => {
  const contractWriteArgs = {
    contract_address: "0xabc",
    chain_id: "1",
    function_name: "transfer",
    function_args: '["0xr","1000"]',
    stateMutability: "nonpayable",
  };

  function mockContractBroadcast(
    receiptStatus: string,
    receiptExtra: Record<string, unknown> = {},
  ): void {
    callTool.mockImplementation((opts: { name: string }) => {
      if (opts.name === "execute_contract_call") {
        return Promise.resolve({ ok: true, data: { executionId: "exec-1", status: "pending" } });
      }
      if (opts.name === "get_direct_execution_status") {
        return Promise.resolve({
          ok: true,
          data: {
            executionId: "exec-1",
            status: "completed",
            transactionHash: "0xhash",
            receipts: [
              {
                hash: "0xhash",
                chainId: "1",
                verified: true,
                receiptStatus,
                blockNumber: 123,
                gasUsed: "21000",
                ...receiptExtra,
              },
            ],
          },
        });
      }
      return Promise.resolve({ ok: true, data: {} });
    });
  }

  it("a confirmed contract-call writes the intent BEFORE broadcasting, polls, lands a receipt (AC 4)", async () => {
    mockContractBroadcast("success");
    const out = await routeToolCall({
      ...base,
      toolName: "execute_contract_call",
      args: contractWriteArgs,
      write: "broadcast",
    });

    expect(out.ok).toBe(true);
    if (out.ok && "state" in out && out.state === "receipt") {
      expect(out.txHash).toBe("0xhash");
      expect(out.receipt).toMatchObject({
        receipts: [expect.objectContaining({ verified: true, receiptStatus: "success" })],
      });
    } else {
      throw new Error("expected a receipt terminal");
    }
    // KeeperHub's status tool names its argument execution_id; any other key fails the read.
    expect(callTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "get_direct_execution_status", args: { execution_id: "exec-1" } }),
    );
    // Intent BEFORE the broadcast (AD-2), keyed by the tool call id.
    expect(writeIntent).toHaveBeenCalledTimes(1);
    expect(writeIntent.mock.calls[0][0]).toMatchObject({
      conversationId: "conv-1",
      toolCallId: "call-1",
      opId: "execute_contract_call",
    });
    expect(writeIntent.mock.invocationCallOrder[0]).toBeLessThan(
      callTool.mock.invocationCallOrder[0],
    );
    // Broadcast: simulate:false + the durable idempotency key (D16); a write
    // NEVER takes the rate-limit retry.
    const broadcast = callsTo("execute_contract_call")[0] as [{ args: Record<string, unknown>; idempotent: boolean }];
    expect(broadcast[0].args.simulate).toBe(false);
    expect(broadcast[0].args.idempotency_key).toBe("call-1");
    expect(broadcast[0].idempotent).toBe(false);
    // Verified receipt terminal.
    expect(writeTerminal).toHaveBeenCalledTimes(1);
    expect(writeTerminal.mock.calls[0][0]).toMatchObject({ id: "ledger-1", state: "receipt", txHash: "0xhash" });
  });

  it("a reverted receiptStatus lands a FAILURE terminal with the decoded reason, not a receipt (AC 5)", async () => {
    mockContractBroadcast("reverted", { revertReason: "ERC20: transfer amount exceeds balance" });
    const out = await routeToolCall({
      ...base,
      toolName: "execute_contract_call",
      args: contractWriteArgs,
      write: "broadcast",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.message).toContain("transfer amount exceeds balance");
    }
    expect(writeTerminal).toHaveBeenCalledTimes(1);
    expect(writeTerminal.mock.calls[0][0].state).toBe("failure");
  });

  it("a confirmed protocol-action broadcasts with the inline tx hash, no idempotency_key, no poll (D15)", async () => {
    mockWire(["web3"], {
      ok: true,
      data: { transactionHash: "0xproto", transactionLink: "https://x", chainId: "1" },
    });
    const out = await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType: SUPPLY, params: VALID_SUPPLY_PARAMS },
      write: "broadcast",
    });
    expect(out.ok).toBe(true);
    if (out.ok && "state" in out && out.state === "receipt") {
      expect(out.txHash).toBe("0xproto");
      expect(out.opId).toBe(SUPPLY);
    } else {
      throw new Error("expected a receipt terminal");
    }
    expect(writeIntent).toHaveBeenCalledTimes(1);
    const exec = executeCalls() as Array<[{ args: Record<string, unknown> }]>;
    expect(exec).toHaveLength(1);
    // A protocol action carries NO idempotency_key and NEVER polls status (D15).
    expect(exec[0][0].args).not.toHaveProperty("idempotency_key");
    expect(callsTo("get_direct_execution_status")).toHaveLength(0);
    expect(writeTerminal.mock.calls[0][0].state).toBe("receipt");
  });

  it("an intent-write failure means NO broadcast (durable-intent-before-execute, AD-2)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    writeIntent.mockRejectedValue(new Error("neon down"));
    callTool.mockResolvedValue({ ok: true, data: { executionId: "exec-1" } });
    const out = await routeToolCall({
      ...base,
      toolName: "execute_contract_call",
      args: contractWriteArgs,
      write: "broadcast",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("server_error");
    // Nothing reached the wire.
    expect(callTool).not.toHaveBeenCalled();
    expect(writeTerminal).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("an unbound gated write reaching the broadcast phase fails closed — no intent, no wire (D17b)", async () => {
    mockWire([]); // nothing bound; aave-v3/supply needs web3
    const out = await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType: SUPPLY, params: VALID_SUPPLY_PARAMS },
      write: "broadcast",
    });
    // The needs-credential pre-state — never a broadcast.
    expect(out.ok).toBe(true);
    expect(out.ok && "state" in out && out.state === "needs-credential").toBe(true);
    expect(executeCalls()).toHaveLength(0);
    expect(writeIntent).not.toHaveBeenCalled();
  });

  it("an UNDETERMINABLE credential check fails CLOSED on the broadcast path (D17b) — no wire", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // list_integrations is throttled → undeterminable. A read would proceed
    // (fail-open); a BROADCAST write must not.
    callTool.mockImplementation((opts: { name: string }) =>
      Promise.resolve(
        opts.name === "list_integrations"
          ? { ok: false, error: { code: "rate_limited", message: "limited", retryAfter: 30 } }
          : { ok: true, data: { transactionHash: "0xproto" } },
      ),
    );
    const out = await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType: SUPPLY, params: VALID_SUPPLY_PARAMS },
      write: "broadcast",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("server_error");
    expect(executeCalls()).toHaveLength(0);
    expect(writeIntent).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("a protocol-action broadcast returning success:false lands a FAILURE terminal with the decoded reason, not a receipt (review P1)", async () => {
    // KeeperHub re-verifies on-chain and returns HTTP 200 { success:false, error }
    // for a broadcast-then-reverted write; the wire surfaces it as ok:true. An
    // MCP-ok result is NOT proof of on-chain success (NFR1).
    mockWire(["web3"], {
      ok: true,
      data: {
        success: false,
        error: "execution reverted: insufficient allowance",
        transactionHash: "0xrevert",
      },
    });
    const out = await routeToolCall({
      ...base,
      toolName: "execute_protocol_action",
      args: { actionType: SUPPLY, params: VALID_SUPPLY_PARAMS },
      write: "broadcast",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.message).toContain("insufficient allowance");
    }
    // A failure terminal, carrying the reverted tx hash — never a receipt.
    expect(writeTerminal).toHaveBeenCalledTimes(1);
    expect(writeTerminal.mock.calls[0][0]).toMatchObject({ state: "failure", txHash: "0xrevert" });
  });

  it("a transient status-read error mid-poll keeps polling and still lands the receipt (review P2)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      let statusReads = 0;
      callTool.mockImplementation((opts: { name: string }) => {
        if (opts.name === "execute_contract_call") {
          return Promise.resolve({ ok: true, data: { executionId: "exec-1", status: "pending" } });
        }
        if (opts.name === "get_direct_execution_status") {
          statusReads += 1;
          // The FIRST status read is a transient transport blip; the second settles.
          if (statusReads === 1) {
            return Promise.resolve({ ok: false, error: { message: "temporarily unavailable" } });
          }
          return Promise.resolve({
            ok: true,
            data: {
              transactionHash: "0xhash",
              receipts: [
                { hash: "0xhash", verified: true, receiptStatus: "success", blockNumber: 9 },
              ],
            },
          });
        }
        return Promise.resolve({ ok: true, data: {} });
      });

      const promise = routeToolCall({
        ...base,
        toolName: "execute_contract_call",
        args: contractWriteArgs,
        write: "broadcast",
      });
      // Advance past the one poll interval between the transient error and the settle.
      await vi.advanceTimersByTimeAsync(2000);
      const out = await promise;

      // A blip did NOT fail the write — it settled into a receipt after re-polling.
      expect(out.ok).toBe(true);
      if (out.ok && "state" in out) expect(out.state).toBe("receipt");
      expect(statusReads).toBe(2);
      expect(writeTerminal.mock.calls[0][0].state).toBe("receipt");
    } finally {
      vi.useRealTimers();
      errorSpy.mockRestore();
    }
  });

  it("two confirms of the SAME toolCallId broadcast exactly once — the unique-index intent write blocks the second (review P7, AC 4)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockContractBroadcast("success");
    // The intent unique index (org, tool_call_id) lets the first intent land and
    // rejects the second with a unique violation — the ledger IS the one-execution
    // guard, so a second tab cannot double-broadcast.
    writeIntent
      .mockResolvedValueOnce({ id: "ledger-1" })
      .mockRejectedValueOnce(
        new Error(
          "duplicate key value violates unique constraint ledger_entry_org_tool_call_idx",
        ),
      );

    const first = await routeToolCall({
      ...base,
      toolName: "execute_contract_call",
      args: contractWriteArgs,
      write: "broadcast",
    });
    const second = await routeToolCall({
      ...base,
      toolName: "execute_contract_call",
      args: contractWriteArgs,
      write: "broadcast",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("server_error");
    // Exactly ONE broadcast reached the wire across both confirms (AC 4).
    expect(callsTo("execute_contract_call")).toHaveLength(1);
    errorSpy.mockRestore();
  });
});

// --- Story 2.5: execute_transfer — the simulating value-mover ----------------

describe("execute_transfer — the simulating value-mover (Story 2.5, AC 1/2/3; D25/D28/D29)", () => {
  const EVM_TRANSFER = {
    toolName: "execute_transfer" as const,
    args: { chain_id: "11155111", to_address: "0xrecipient", amount: "0.1" },
  };
  const SOLANA_TRANSFER = {
    toolName: "execute_transfer" as const,
    args: { chain_id: "101", to_address: "So1anaBase58Addr", amount: "1.5" },
  };

  function mockTransferBroadcast(receiptStatus: string): void {
    callTool.mockImplementation((opts: { name: string }) => {
      if (opts.name === "execute_transfer") {
        // The transfer returns a terminal status + hash SYNCHRONOUSLY (D29).
        return Promise.resolve({
          ok: true,
          data: { executionId: "exec-t1", status: "completed", transactionHash: "0xtxfer" },
        });
      }
      if (opts.name === "get_direct_execution_status") {
        return Promise.resolve({
          ok: true,
          data: {
            executionId: "exec-t1",
            status: "completed",
            transactionHash: "0xtxfer",
            receipts: [
              { hash: "0xtxfer", chainId: "11155111", verified: true, receiptStatus, blockNumber: 42 },
            ],
          },
        });
      }
      return Promise.resolve({ ok: true, data: {} });
    });
  }

  it("requiresConfirmation is UNCONDITIONALLY true — every transfer is a value-moving write (D25)", () => {
    expect(requiresConfirmation("execute_transfer", EVM_TRANSFER.args)).toBe(true);
    expect(
      requiresConfirmation("execute_transfer", { chain_id: "1", to_address: "0x", amount: "1", token_address: "0xt" }),
    ).toBe(true);
    // Even sparse/empty input: a transfer is never a read.
    expect(requiresConfirmation("execute_transfer", {})).toBe(true);
  });

  it("validates chain_id/to_address/amount before the network (no wire call)", async () => {
    const out = await routeToolCall({ ...base, toolName: "execute_transfer", args: { chain_id: "1" } });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("validation_failed");
      expect(out.error.issues?.some((i) => i.path === "to_address")).toBe(true);
      expect(out.error.issues?.some((i) => i.path === "amount")).toBe(true);
    }
    expect(callTool).not.toHaveBeenCalled();
  });

  it("a pre-confirm EVM transfer forces simulate:true, returns the decoded preview, NEVER broadcasts; the wire amount is HUMAN form (AC 1/3, D26)", async () => {
    callTool.mockResolvedValue({
      ok: true,
      data: { status: "simulated", gasEstimate: "21000", wouldRevert: false, sponsored: true },
    });
    const out = await routeToolCall({ ...base, ...EVM_TRANSFER, write: "simulate" });
    expect(out.ok).toBe(true);
    if (out.ok && "state" in out && out.state === "simulated") {
      expect(out.preview).toMatchObject({ gasEstimate: "21000", sponsored: true });
    } else {
      throw new Error("expected a simulated preview");
    }
    expect(callTool).toHaveBeenCalledTimes(1);
    const passed = callTool.mock.calls[0][0];
    expect(passed.name).toBe("execute_transfer");
    expect(passed.args.simulate).toBe(true);
    // The transfer wire amount rides as its HUMAN string, never reshaped (AD-11/D26).
    expect(passed.args.amount).toBe("0.1");
    expect(passed.args).not.toHaveProperty("idempotency_key");
    // Forced simulate → a non-broadcasting read; idempotent derives from that.
    expect(passed.idempotent).toBe(true);
    expect(writeIntent).not.toHaveBeenCalled();
  });

  it("a re-run transfer (no ceremony phase) still forces simulate:true — never a broadcast", async () => {
    callTool.mockResolvedValue({ ok: true, data: { status: "simulated" } });
    await routeToolCall({ ...base, ...EVM_TRANSFER }); // no write phase
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool.mock.calls[0][0].args.simulate).toBe(true);
    expect(writeIntent).not.toHaveBeenCalled();
  });

  it("an unaffordable EVM transfer surfaces the decoded nativeShortfallFailure revert AT simulation (AC 3)", async () => {
    // KeeperHub's transfer simulate returns HTTP 400; lib/mcp maps it to an error
    // envelope carrying the decoded shortfall (revertReason passes through untouched).
    callTool.mockResolvedValue({
      ok: false,
      error: {
        code: "tool_error",
        message: "Insufficient ETH balance. Have: 0.0. Need: 0.1.",
        decoded: {
          code: "insufficient_balance",
          shortfallWei: "100000000000000000",
          nativeSymbol: "ETH",
          revertReason: "Insufficient ETH balance. Have: 0.0. Need: 0.1.",
        },
      },
    });
    const out = await routeToolCall({ ...base, ...EVM_TRANSFER, write: "simulate" });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.message).toContain("Insufficient ETH balance");
      expect((out.error.decoded as { code?: string }).code).toBe("insufficient_balance");
    }
    // Dry-run only — never an intent row, never a broadcast.
    expect(writeIntent).not.toHaveBeenCalled();
  });

  it("a Solana transfer resolves no-preview — broadcastable, NOT unavailable, NOT simulated — with no wire call (AC 2, D28)", async () => {
    const out = await routeToolCall({ ...base, ...SOLANA_TRANSFER, write: "simulate" });
    expect(out.ok).toBe(true);
    if (out.ok && "state" in out) {
      expect(out.state).toBe("no-preview");
    } else {
      throw new Error("expected a no-preview coercion for a Solana transfer");
    }
    // Solana never simulates: not even a dry-run wire call.
    expect(callTool).not.toHaveBeenCalled();
  });

  it("a CONFIRMED EVM transfer writes intent BEFORE the broadcast, polls once for the VERIFIED receipt, lands a receipt (AC 3, D29)", async () => {
    mockTransferBroadcast("success");
    const out = await routeToolCall({ ...base, ...EVM_TRANSFER, write: "broadcast" });

    expect(out.ok).toBe(true);
    if (out.ok && out.tool === "execute_transfer" && "state" in out && out.state === "receipt") {
      expect(out.txHash).toBe("0xtxfer");
      expect(out.executionId).toBe("exec-t1");
      expect(out.receipt).toMatchObject({
        receipts: [expect.objectContaining({ verified: true, receiptStatus: "success" })],
      });
    } else {
      throw new Error("expected a receipt terminal");
    }
    // Intent BEFORE the broadcast (AD-2); a transfer's opId is the verb, no fingerprint.
    expect(writeIntent).toHaveBeenCalledTimes(1);
    expect(writeIntent.mock.calls[0][0]).toMatchObject({
      conversationId: "conv-1",
      toolCallId: "call-1",
      opId: "execute_transfer",
      schemaFingerprint: null,
      confirmedInputs: { chain_id: "11155111", to_address: "0xrecipient", amount: "0.1" },
    });
    expect(writeIntent.mock.invocationCallOrder[0]).toBeLessThan(
      callTool.mock.invocationCallOrder[0],
    );
    // Broadcast: simulate:false + the durable idempotency key; a write never retries.
    const broadcast = callsTo("execute_transfer")[0] as [{ args: Record<string, unknown>; idempotent: boolean }];
    expect(broadcast[0].args.simulate).toBe(false);
    expect(broadcast[0].args.idempotency_key).toBe("call-1");
    expect(broadcast[0].idempotent).toBe(false);
    // The verified receipt came from the status poll, not the synchronous return.
    expect(callsTo("get_direct_execution_status")).toHaveLength(1);
    expect(writeTerminal.mock.calls[0][0]).toMatchObject({ state: "receipt", txHash: "0xtxfer", executionId: "exec-t1" });
  });

  it("a CONFIRMED Solana transfer broadcasts (simulate:false) with NO Solana refusal (D28)", async () => {
    callTool.mockImplementation((opts: { name: string }) => {
      if (opts.name === "execute_transfer") {
        return Promise.resolve({ ok: true, data: { executionId: "exec-sol", status: "completed", transactionHash: "solhash" } });
      }
      if (opts.name === "get_direct_execution_status") {
        return Promise.resolve({
          ok: true,
          data: { transactionHash: "solhash", receipts: [{ hash: "solhash", verified: true, receiptStatus: "success", blockNumber: 7 }] },
        });
      }
      return Promise.resolve({ ok: true, data: {} });
    });
    const out = await routeToolCall({ ...base, ...SOLANA_TRANSFER, write: "broadcast" });
    expect(out.ok).toBe(true);
    if (out.ok && "state" in out) expect(out.state).toBe("receipt");
    // The Solana transfer DID reach the wire with simulate:false — it is broadcastable.
    const broadcast = callsTo("execute_transfer")[0] as [{ args: Record<string, unknown> }];
    expect(broadcast[0].args.simulate).toBe(false);
    expect(broadcast[0].args.chain_id).toBe("101");
  });

  it("a reverted transfer receipt lands a FAILURE terminal with the decoded reason, not a receipt (AC 3)", async () => {
    mockTransferBroadcast("reverted");
    const out = await routeToolCall({ ...base, ...EVM_TRANSFER, write: "broadcast" });
    expect(out.ok).toBe(false);
    expect(writeTerminal).toHaveBeenCalledTimes(1);
    expect(writeTerminal.mock.calls[0][0].state).toBe("failure");
  });

  it("an intent-write failure means NO transfer broadcast (durable-intent-before-execute, AD-2)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    writeIntent.mockRejectedValue(new Error("neon down"));
    callTool.mockResolvedValue({ ok: true, data: { executionId: "e" } });
    const out = await routeToolCall({ ...base, ...EVM_TRANSFER, write: "broadcast" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("server_error");
    expect(callTool).not.toHaveBeenCalled();
    expect(writeTerminal).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("a token transfer threads token_address onto the intent row AND the wire (D26)", async () => {
    callTool.mockImplementation((opts: { name: string }) => {
      if (opts.name === "execute_transfer") return Promise.resolve({ ok: true, data: { executionId: "e", status: "completed" } });
      if (opts.name === "get_direct_execution_status") {
        return Promise.resolve({ ok: true, data: { receipts: [{ hash: "0x", verified: true, receiptStatus: "success" }] } });
      }
      return Promise.resolve({ ok: true, data: {} });
    });
    await routeToolCall({
      ...base,
      toolName: "execute_transfer",
      args: { chain_id: "1", to_address: "0xrec", amount: "25", token_address: "0xusdc" },
      write: "broadcast",
    });
    expect(writeIntent.mock.calls[0][0].confirmedInputs).toMatchObject({ token_address: "0xusdc", amount: "25" });
    const broadcast = callsTo("execute_transfer")[0] as [{ args: Record<string, unknown> }];
    expect(broadcast[0].args.token_address).toBe("0xusdc");
    expect(broadcast[0].args.amount).toBe("25");
  });
});

// --- Story 2.4: the durable declined terminal (AD-2 sole writer) -------------

describe("recordWriteDecline — the born-terminal declined row (AC 2, D21)", () => {
  it("records ONE declined row from a protocol-action proposal: opId=actionType, fingerprint stamped, the reviewed input verbatim", async () => {
    recordDecline.mockResolvedValue({ id: "led-decl", state: "declined" });
    await recordWriteDecline({
      session,
      conversationId: "conv-1",
      toolCallId: "tc-decl",
      toolName: "execute_protocol_action",
      input: { actionType: "web3/transfer-token", params: VALID_TRANSFER_PARAMS },
      requestId: "req-1",
    });

    expect(recordDecline).toHaveBeenCalledTimes(1);
    const arg = recordDecline.mock.calls[0][0] as {
      session: unknown;
      conversationId: string;
      toolCallId: string;
      opId: string;
      confirmedInputs: Record<string, unknown>;
      schemaFingerprint: string | null;
    };
    expect(arg.session).toBe(session);
    expect(arg.conversationId).toBe("conv-1");
    expect(arg.toolCallId).toBe("tc-decl");
    // opId = the proposal's actionType (mirrors the intent row); fingerprint stamped.
    expect(arg.opId).toBe("web3/transfer-token");
    expect(arg.schemaFingerprint).toMatch(/^sha256:/);
    // The exact instruction the person reviewed and refused, verbatim.
    expect(arg.confirmedInputs).toEqual({
      actionType: "web3/transfer-token",
      params: VALID_TRANSFER_PARAMS,
    });
  });

  it("a contract-call decline records opId=the verb with a null fingerprint (schema-free)", async () => {
    recordDecline.mockResolvedValue({ id: "led-decl2", state: "declined" });
    await recordWriteDecline({
      session,
      conversationId: "conv-1",
      toolCallId: "tc-decl2",
      toolName: "execute_contract_call",
      input: {
        contract_address: "0xabc",
        chain_id: "1",
        function_name: "transfer",
        stateMutability: "nonpayable",
      },
      requestId: "req-1",
    });
    const arg = recordDecline.mock.calls[0][0] as { opId: string; schemaFingerprint: string | null };
    expect(arg.opId).toBe("execute_contract_call");
    expect(arg.schemaFingerprint).toBeNull();
  });

  it("a double-decline of one tool call is idempotent — the caught unique violation logs benignly, never throws (one row)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    recordDecline
      .mockResolvedValueOnce({ id: "led-decl", state: "declined" })
      .mockRejectedValueOnce(
        new Error(
          "duplicate key value violates unique constraint ledger_entry_org_tool_call_idx",
        ),
      );
    const call = () =>
      recordWriteDecline({
        session,
        conversationId: "conv-1",
        toolCallId: "tc-dup",
        toolName: "execute_protocol_action",
        input: { actionType: "web3/transfer-token", params: VALID_TRANSFER_PARAMS },
        requestId: "req-1",
      });
    await expect(call()).resolves.toBeUndefined();
    await expect(call()).resolves.toBeUndefined(); // the second decline never throws
    expect(recordDecline).toHaveBeenCalledTimes(2);
    // The benign duplicate (the idempotency guard working) is greppable, not an error.
    const dup = logSpy.mock.calls
      .map((c) => String(c[0]))
      .find((l) => l.includes("ledger_decline_duplicate"));
    expect(dup).toBeDefined();
    const hardError = errorSpy.mock.calls
      .map((c) => String(c[0]))
      .find((l) => l.includes("ledger_decline_record_failed"));
    expect(hardError).toBeUndefined();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("a recordDecline DB failure logs loudly and NEVER throws — the decline still resolves (surfaced-decision 3)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    recordDecline.mockRejectedValue(new Error("neon down"));
    await expect(
      recordWriteDecline({
        session,
        conversationId: "conv-1",
        toolCallId: "tc-fail",
        toolName: "execute_protocol_action",
        input: { actionType: "web3/transfer-token", params: VALID_TRANSFER_PARAMS },
        requestId: "req-1",
      }),
    ).resolves.toBeUndefined();
    const logged = errorSpy.mock.calls
      .map((c) => String(c[0]))
      .find((l) => l.includes("ledger_decline_record_failed"));
    expect(logged).toBeDefined();
    expect(JSON.parse(logged!)).toMatchObject({
      event: "ledger_decline_record_failed",
      conversationId: "conv-1",
      toolCallId: "tc-fail",
      orgId: "org-1",
    });
    errorSpy.mockRestore();
  });
});

describe("readSettledReceipt — verified receipt vs decoded failure vs pending", () => {
  it("a success receiptStatus is a receipt with the tx hash", () => {
    const out = readSettledReceipt({
      transactionHash: "0xhash",
      receipts: [{ hash: "0xhash", verified: true, receiptStatus: "success", blockNumber: 9 }],
    });
    expect(out).not.toBeNull();
    expect(out?.ok).toBe(true);
    if (out?.ok) expect(out.txHash).toBe("0xhash");
  });

  it("a reverted receiptStatus is a failure carrying the decoded revert reason", () => {
    const out = readSettledReceipt({
      transactionHash: "0xhash",
      receipts: [{ hash: "0xhash", receiptStatus: "reverted", revertReason: "out of gas" }],
    });
    expect(out?.ok).toBe(false);
    if (out && !out.ok) expect(out.message).toBe("out of gas");
  });

  it("a not-yet-resolved receipt (no receiptStatus, no terminal status) stays pending (null)", () => {
    expect(readSettledReceipt({ status: "pending", receipts: [] })).toBeNull();
    expect(readSettledReceipt({ status: "pending" })).toBeNull();
    expect(readSettledReceipt({ receipts: [{ hash: "0xhash" }] })).toBeNull();
  });
});
