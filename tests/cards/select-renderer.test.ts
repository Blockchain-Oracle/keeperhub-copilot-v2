import { describe, expect, it } from "vitest";

import { selectRenderer, type ToolPartView } from "@/components/cards/select-renderer";

const READ_INPUT = { actionType: "chronicle/eth-usd-read", params: { network: "1" } };

function part(overrides: Partial<ToolPartView>): ToolPartView {
  return { toolName: "execute_protocol_action", state: "output-available", ...overrides };
}

describe("selectRenderer (deterministic, client-side)", () => {
  it("is deterministic — same part yields the same plan", () => {
    const p = part({
      state: "output-available",
      input: READ_INPUT,
      output: {
        ok: true,
        tool: "execute_protocol_action",
        opId: "chronicle/eth-usd-read",
        fingerprint: "sha256:abc",
        data: { value: "3000" },
      },
    });
    expect(selectRenderer(p)).toEqual(selectRenderer(p));
  });

  it("skeletons while input is streaming, with the op label when actionType parses", () => {
    const plan = selectRenderer(part({ state: "input-streaming", input: { actionType: "chronicle/eth-usd-read" } }));
    expect(plan.kind).toBe("skeleton");
    if (plan.kind === "skeleton") {
      // Label projected from the registry (display only).
      expect(plan.opLabel).toContain("Chronicle");
    }
  });

  it("skeletons on input-available too (captured but not yet returned)", () => {
    expect(selectRenderer(part({ state: "input-available", input: READ_INPUT })).kind).toBe("skeleton");
  });

  it("skeletons with no label when actionType is absent or unknown", () => {
    expect(selectRenderer(part({ state: "input-streaming", input: {} })).kind).toBe("skeleton");
    const unknown = selectRenderer(part({ state: "input-streaming", input: { actionType: "nope/x" } }));
    expect(unknown.kind).toBe("skeleton");
    if (unknown.kind === "skeleton") expect(unknown.opLabel).toBeUndefined();
  });

  it("renders a read card for a successful protocol action, carrying opId + input + data", () => {
    const plan = selectRenderer(
      part({
        input: READ_INPUT,
        output: {
          ok: true,
          tool: "execute_protocol_action",
          opId: "chronicle/eth-usd-read",
          fingerprint: "sha256:abc",
          data: { value: "3000", success: true },
        },
      }),
    );
    expect(plan.kind).toBe("read");
    if (plan.kind === "read") {
      expect(plan.opId).toBe("chronicle/eth-usd-read");
      expect(plan.input).toEqual(READ_INPUT);
      expect(plan.data).toEqual({ value: "3000", success: true });
    }
  });

  it("threads the toolCallId into the read plan (seeding-once + supersede derivation)", () => {
    const plan = selectRenderer(
      part({
        toolCallId: "01JCALL",
        input: READ_INPUT,
        output: {
          ok: true,
          tool: "execute_protocol_action",
          opId: "chronicle/eth-usd-read",
          fingerprint: "sha256:abc",
          data: { value: "3000" },
        },
      }),
    );
    expect(plan.kind).toBe("read");
    if (plan.kind === "read") {
      expect(plan.toolCallId).toBe("01JCALL");
    }
  });

  it("renders a read card without an opId for a contract call / wallet read", () => {
    const contract = selectRenderer(
      part({
        toolName: "execute_contract_call",
        output: { ok: true, tool: "execute_contract_call", data: { result: "42" } },
      }),
    );
    expect(contract.kind).toBe("read");
    if (contract.kind === "read") expect(contract.opId).toBeUndefined();
  });

  it("renders a capability list for search_actions output", () => {
    const plan = selectRenderer(
      part({
        toolName: "search_actions",
        output: { ok: true, tool: "search_actions", result: { matches: [], totalMatched: 0 } },
      }),
    );
    expect(plan.kind).toBe("capabilities");
    if (plan.kind === "capabilities") {
      expect(plan.result).toEqual({ matches: [], totalMatched: 0 });
    }
  });

  it("renders an error card for a structured ok:false output, carrying decoded + scope + retryAfter", () => {
    const plan = selectRenderer(
      part({
        output: {
          ok: false,
          tool: "execute_protocol_action",
          error: {
            code: "insufficient_scope",
            message: "needs write",
            decoded: { error: "insufficient_scope" },
            scope: { requiredScope: "mcp:write", grantedScope: "mcp:read", upgradeUrl: "/re", hint: "h" },
          },
        },
      }),
    );
    expect(plan.kind).toBe("error");
    if (plan.kind === "error") {
      expect(plan.error.code).toBe("insufficient_scope");
      expect(plan.error.scope?.upgradeUrl).toBe("/re");
    }
  });

  it("renders an error card from output-error (an SDK-level throw)", () => {
    const plan = selectRenderer(part({ state: "output-error", errorText: "boom" }));
    expect(plan.kind).toBe("error");
    if (plan.kind === "error") expect(plan.error.message).toBe("boom");
  });

  it("degrades to the stub for an unknown opId (drift safety)", () => {
    const plan = selectRenderer(
      part({
        output: { ok: true, tool: "execute_protocol_action", opId: "ghost/not-real", data: {} },
      }),
    );
    expect(plan.kind).toBe("stub");
  });

  it("degrades to the stub for a malformed (non-ToolOutput) output", () => {
    expect(selectRenderer(part({ output: "just a string" })).kind).toBe("stub");
    expect(selectRenderer(part({ output: null })).kind).toBe("stub");
  });

  it("routes a needs-credential pre-state to its own plan, carrying the integration (D8)", () => {
    const plan = selectRenderer(
      part({
        output: {
          ok: true,
          tool: "execute_protocol_action",
          state: "needs-credential",
          opId: "safe/get-pending-transactions",
          integration: "safe",
          message: "Set up the Safe credential in KeeperHub.",
        },
      }),
    );
    expect(plan.kind).toBe("needs-credential");
    if (plan.kind === "needs-credential") {
      expect(plan.integration).toBe("safe");
      expect(plan.opId).toBe("safe/get-pending-transactions");
      expect(plan.message).toContain("Safe credential");
    }
  });

  it("degrades a malformed needs-credential variant (no integration) to the stub — never confirmable", () => {
    const plan = selectRenderer(
      part({
        output: {
          ok: true,
          tool: "execute_protocol_action",
          state: "needs-credential",
          opId: "safe/get-pending-transactions",
        },
      }),
    );
    expect(plan.kind).toBe("stub");
  });

  it("maps a quarantined error output to the explanatory error path (AC 2)", () => {
    const plan = selectRenderer(
      part({
        output: {
          ok: false,
          tool: "execute_protocol_action",
          error: {
            code: "quarantined",
            message: 'The action "code/run-code" is not available because it cannot be classified as safe to run.',
          },
        },
      }),
    );
    expect(plan.kind).toBe("error");
    if (plan.kind === "error") {
      expect(plan.error.code).toBe("quarantined");
    }
  });
});

describe("selectRenderer — the confirm-ceremony states (Story 2.3, Task 5)", () => {
  const WRITE_INPUT = {
    contract_address: "0xabc",
    chain_id: "1",
    function_name: "transfer",
    stateMutability: "nonpayable",
  };

  it("maps an approval-requested write part to write-proposed, carrying the approval id + input", () => {
    const plan = selectRenderer(
      part({
        toolName: "execute_contract_call",
        state: "approval-requested",
        toolCallId: "tc-1",
        input: WRITE_INPUT,
        approval: { id: "appr-1", signature: "sig" },
      }),
    );
    expect(plan.kind).toBe("write-proposed");
    if (plan.kind === "write-proposed") {
      expect(plan.approvalId).toBe("appr-1");
      expect(plan.toolCallId).toBe("tc-1");
      expect(plan.input).toEqual(WRITE_INPUT);
    }
  });

  it("carries the opId (actionType) for a protocol-action write proposal", () => {
    const plan = selectRenderer(
      part({
        toolName: "execute_protocol_action",
        state: "approval-requested",
        input: { actionType: "web3/transfer-token", params: { amount: "1000" } },
        approval: { id: "appr-2" },
      }),
    );
    expect(plan.kind).toBe("write-proposed");
    if (plan.kind === "write-proposed") {
      expect(plan.opId).toBe("web3/transfer-token");
    }
  });

  it("maps an approval-responded part to write-executing (confirmed, in flight)", () => {
    const plan = selectRenderer(
      part({
        toolName: "execute_contract_call",
        state: "approval-responded",
        input: WRITE_INPUT,
        approval: { id: "appr-1", approved: true, signature: "sig" },
      }),
    );
    expect(plan.kind).toBe("write-executing");
  });

  it("maps an output-denied part to write-declined (the SDK-native decline terminal)", () => {
    const plan = selectRenderer(
      part({
        toolName: "execute_contract_call",
        state: "output-denied",
        input: WRITE_INPUT,
        approval: { id: "appr-1", approved: false },
      }),
    );
    expect(plan.kind).toBe("write-declined");
  });

  it("maps an output-available receipt state to the receipt plan, carrying txHash + receipt", () => {
    const plan = selectRenderer(
      part({
        toolName: "execute_contract_call",
        state: "output-available",
        input: WRITE_INPUT,
        output: {
          ok: true,
          tool: "execute_contract_call",
          state: "receipt",
          txHash: "0xhash",
          receipt: { receipts: [{ verified: true }] },
        },
      }),
    );
    expect(plan.kind).toBe("receipt");
    if (plan.kind === "receipt") {
      expect(plan.txHash).toBe("0xhash");
      expect(plan.receipt).toEqual({ receipts: [{ verified: true }] });
    }
  });

  it("routes a write FAILURE (ok:false) to the error plan → ErrorCard, never a receipt", () => {
    const plan = selectRenderer(
      part({
        toolName: "execute_contract_call",
        state: "output-available",
        input: WRITE_INPUT,
        output: {
          ok: false,
          tool: "execute_contract_call",
          error: { code: "tool_error", message: "The transaction reverted on chain." },
        },
      }),
    );
    expect(plan.kind).toBe("error");
    if (plan.kind === "error") {
      expect(plan.error.message).toContain("reverted");
    }
  });
});

describe("selectRenderer — the write path degrades a drifted op to the stub (Story 2.4, D23, AC3)", () => {
  it("a protocol-action write proposal whose opId no longer resolves → stub, never write-proposed", () => {
    const plan = selectRenderer(
      part({
        toolName: "execute_protocol_action",
        state: "approval-requested",
        input: { actionType: "ghost/not-real", params: { amount: "1" } },
        approval: { id: "appr-x" },
      }),
    );
    // A drifted/quarantined write is never a confirmable card (AD-6, NFR8).
    expect(plan.kind).toBe("stub");
  });

  it("a drifted protocol-action write in approval-responded (executing) also degrades to the stub", () => {
    const plan = selectRenderer(
      part({
        toolName: "execute_protocol_action",
        state: "approval-responded",
        input: { actionType: "ghost/not-real", params: {} },
        approval: { id: "appr-x", approved: true },
      }),
    );
    expect(plan.kind).toBe("stub");
  });

  it("a real protocol-action write proposal still renders write-proposed (no false drift)", () => {
    const plan = selectRenderer(
      part({
        toolName: "execute_protocol_action",
        state: "approval-requested",
        input: { actionType: "web3/transfer-token", params: { amount: "1000" } },
        approval: { id: "appr-y" },
      }),
    );
    expect(plan.kind).toBe("write-proposed");
    if (plan.kind === "write-proposed") {
      expect(plan.opId).toBe("web3/transfer-token");
    }
  });

  it("a contract-call write proposal (no opId) is unaffected — renders write-proposed", () => {
    const plan = selectRenderer(
      part({
        toolName: "execute_contract_call",
        state: "approval-requested",
        input: {
          contract_address: "0xabc",
          chain_id: "1",
          function_name: "transfer",
          stateMutability: "nonpayable",
        },
        approval: { id: "appr-z" },
      }),
    );
    expect(plan.kind).toBe("write-proposed");
  });
});

describe("selectRenderer — a decline is inert on reload, never resurrects (Story 2.4, D22, AC2)", () => {
  it("a stored output-denied part renders write-declined on reload — never write-proposed", () => {
    const plan = selectRenderer(
      part({
        toolName: "execute_protocol_action",
        state: "output-denied",
        input: { actionType: "web3/transfer-token", params: {} },
        approval: { id: "appr-1", approved: false },
      }),
    );
    expect(plan.kind).toBe("write-declined");
    expect(plan.kind).not.toBe("write-proposed");
  });

  it("a declined op that drifted still renders write-declined — a terminal decline is inert, NOT drift-gated (D22/D23 boundary)", () => {
    const plan = selectRenderer(
      part({
        toolName: "execute_protocol_action",
        state: "output-denied",
        input: { actionType: "ghost/not-real", params: {} },
        approval: { id: "appr-1", approved: false },
      }),
    );
    // The decline is terminal evidence regardless of registry drift; the drift→stub
    // gate applies ONLY to the confirmable write path (approval-requested/responded).
    expect(plan.kind).toBe("write-declined");
  });
});

describe("selectRenderer — execute_transfer flows the ceremony plans (Story 2.5, D27)", () => {
  const TRANSFER_INPUT = { chain_id: "11155111", to_address: "0xrecipient", amount: "0.1" };

  it("maps an approval-requested transfer to write-proposed (no opId → never the drift stub)", () => {
    const plan = selectRenderer(
      part({
        toolName: "execute_transfer",
        state: "approval-requested",
        toolCallId: "tc-t",
        input: TRANSFER_INPUT,
        approval: { id: "appr-t", signature: "sig" },
      }),
    );
    // A transfer carries no registry slug (opIdFromInput → undefined), so the D23
    // drift gate never fires: it renders its bespoke write card, not the stub.
    expect(plan.kind).toBe("write-proposed");
    if (plan.kind === "write-proposed") {
      expect(plan.toolName).toBe("execute_transfer");
      expect(plan.opId).toBeUndefined();
      expect(plan.input).toEqual(TRANSFER_INPUT);
    }
  });

  it("maps an approval-responded transfer to write-executing, and output-denied to write-declined", () => {
    expect(
      selectRenderer(
        part({ toolName: "execute_transfer", state: "approval-responded", input: TRANSFER_INPUT, approval: { id: "a", approved: true } }),
      ).kind,
    ).toBe("write-executing");
    expect(
      selectRenderer(
        part({ toolName: "execute_transfer", state: "output-denied", input: TRANSFER_INPUT, approval: { id: "a", approved: false } }),
      ).kind,
    ).toBe("write-declined");
  });

  it("maps a transfer receipt output to the receipt plan, carrying txHash + verified receipt", () => {
    const plan = selectRenderer(
      part({
        toolName: "execute_transfer",
        state: "output-available",
        input: TRANSFER_INPUT,
        output: {
          ok: true,
          tool: "execute_transfer",
          state: "receipt",
          txHash: "0xtxfer",
          receipt: { receipts: [{ verified: true, receiptStatus: "success" }] },
        },
      }),
    );
    expect(plan.kind).toBe("receipt");
    if (plan.kind === "receipt") {
      expect(plan.txHash).toBe("0xtxfer");
    }
  });
});
