import { describe, expect, it } from "vitest";

import {
  confirmAllowed,
  NO_PREVIEW_STATEMENT,
  proposedChip,
  receiptVerified,
  requestRows,
  requiresRevertAck,
  toPreviewState,
  verbMeta,
  verbTitle,
  type SimulateResult,
} from "@/components/cards/write-card";

describe("toPreviewState (the simulate result → card state)", () => {
  it("maps a simulated result and reads the wouldRevert + revertReason (AC 1/5)", () => {
    const result: SimulateResult = {
      ok: true,
      kind: "simulated",
      preview: { gasEstimate: "21000", wouldRevert: true, revertReason: "insufficient balance" },
    };
    const state = toPreviewState(result);
    expect(state.status).toBe("simulated");
    if (state.status === "simulated") {
      expect(state.wouldRevert).toBe(true);
      expect(state.revertReason).toBe("insufficient balance");
      expect(state.preview).toEqual(result.ok && "preview" in result ? result.preview : undefined);
    }
  });

  it("maps no-preview and needs-credential and error verdicts", () => {
    expect(toPreviewState({ ok: true, kind: "no-preview" }).status).toBe("no-preview");
    const nc = toPreviewState({ ok: true, kind: "needs-credential", integration: "web3", message: "needs web3" });
    expect(nc.status).toBe("needs-credential");
    if (nc.status === "needs-credential") expect(nc.message).toBe("needs web3");
    const err = toPreviewState({ ok: false, error: { message: "boom" } });
    expect(err.status).toBe("error");
    if (err.status === "error") expect(err.message).toBe("boom");
  });

  it("a simulated result with a non-object preview never throws (wouldRevert false)", () => {
    const state = toPreviewState({ ok: true, kind: "simulated", preview: "opaque" });
    expect(state.status).toBe("simulated");
    if (state.status === "simulated") expect(state.wouldRevert).toBe(false);
  });

  it("an unaffordable transfer (error with a decoded revertReason) maps to a PREDICTED revert, not a dead error (D29, AC3)", () => {
    const state = toPreviewState({
      ok: false,
      error: {
        code: "tool_error",
        message: "Insufficient ETH balance. Have: 0.0. Need: 0.1.",
        decoded: {
          code: "insufficient_balance",
          revertReason: "Insufficient ETH balance. Have: 0.0. Need: 0.1.",
        },
      },
    });
    // Surfaced as wouldRevert so the card shows the reason + revert-ack and can confirm through.
    expect(state.status).toBe("simulated");
    if (state.status === "simulated") {
      expect(state.wouldRevert).toBe(true);
      expect(state.revertReason).toContain("Insufficient ETH balance");
    }
  });

  it("a transport/throttle error (no decoded revertReason) stays a plain error, Confirm disabled", () => {
    const state = toPreviewState({
      ok: false,
      error: { code: "rate_limited", message: "The preview could not be prepared." },
    });
    expect(state.status).toBe("error");
  });
});

describe("confirmAllowed (AC 1 gate — Confirm only after a landed preview)", () => {
  it("allows Confirm only for a simulated or no-preview verdict", () => {
    expect(confirmAllowed({ status: "loading" })).toBe(false);
    expect(confirmAllowed({ status: "simulated", preview: {}, wouldRevert: false })).toBe(true);
    expect(confirmAllowed({ status: "no-preview" })).toBe(true);
    // needs-credential and error keep Confirm disabled — nobody confirms what
    // could not be previewed or set up.
    expect(confirmAllowed({ status: "needs-credential", message: "x" })).toBe(false);
    expect(confirmAllowed({ status: "error", message: "x" })).toBe(false);
  });
});

describe("requiresRevertAck (D1 review resolution — a predicted revert needs an explicit override)", () => {
  it("requires an acknowledgement only for a simulated preview that would revert", () => {
    expect(requiresRevertAck({ status: "simulated", preview: {}, wouldRevert: true })).toBe(true);
    // A clean simulation, a no-preview write, and non-settled states need none.
    expect(requiresRevertAck({ status: "simulated", preview: {}, wouldRevert: false })).toBe(false);
    expect(requiresRevertAck({ status: "no-preview" })).toBe(false);
    expect(requiresRevertAck({ status: "loading" })).toBe(false);
    expect(requiresRevertAck({ status: "needs-credential", message: "x" })).toBe(false);
    expect(requiresRevertAck({ status: "error", message: "x" })).toBe(false);
  });
});

describe("proposedChip", () => {
  it("labels the chip from the verdict", () => {
    expect(proposedChip({ status: "loading" })).toBe("Proposed");
    expect(proposedChip({ status: "simulated", preview: {}, wouldRevert: false })).toBe("Simulated");
    expect(proposedChip({ status: "no-preview" })).toBe("No preview");
    expect(proposedChip({ status: "needs-credential", message: "x" })).toBe("Needs credential");
  });
});

describe("the verbatim no-preview statement (copy law — AC 2)", () => {
  it("is exactly the EXPERIENCE.md line, no em-dash, no exclamation", () => {
    expect(NO_PREVIEW_STATEMENT).toBe(
      "No preview is possible for this action. You confirm the exact instruction shown below.",
    );
    expect(NO_PREVIEW_STATEMENT).not.toContain("—");
    expect(NO_PREVIEW_STATEMENT).not.toContain("!");
  });
});

describe("requestRows (the exact confirmed instruction, never internal hints)", () => {
  it("shows a protocol action's params, dropping hidden _ passthroughs", () => {
    const rows = requestRows("execute_protocol_action", {
      actionType: "web3/transfer-token",
      params: { amount: "1000", recipientAddress: "0xr", _protocolMeta: "hidden" },
    });
    const keys = rows.map((r) => r.key);
    expect(keys).toContain("amount");
    expect(keys).toContain("recipientAddress");
    expect(keys).not.toContain("_protocolMeta");
  });

  it("shows a contract call's tx-path fields, never stateMutability (a model hint)", () => {
    const rows = requestRows("execute_contract_call", {
      contract_address: "0xabc",
      chain_id: "1",
      function_name: "transfer",
      value: "1000000000000000000",
      stateMutability: "payable",
    });
    const keys = rows.map((r) => r.key);
    expect(keys).toEqual(["chain_id", "contract_address", "function_name", "value"]);
    expect(keys).not.toContain("stateMutability");
  });

  it("is empty for a malformed input (never throws)", () => {
    expect(requestRows("execute_protocol_action", null)).toEqual([]);
    expect(requestRows("execute_contract_call", "nope")).toEqual([]);
  });
});

describe("receiptVerified (independent verification marker — NFR1)", () => {
  it("reads the verified flag off the first receipt", () => {
    expect(receiptVerified({ receipts: [{ verified: true, receiptStatus: "success" }] })).toBe(true);
    expect(receiptVerified({ receipts: [{ verified: false }] })).toBe(false);
  });
  it("is undefined for a shape without a verified flag (never fabricates)", () => {
    expect(receiptVerified({ receipts: [] })).toBeUndefined();
    expect(receiptVerified({})).toBeUndefined();
    expect(receiptVerified(null)).toBeUndefined();
  });
});

describe("verbTitle / verbMeta", () => {
  it("titles the two write verbs and reads the meta line", () => {
    expect(verbTitle("execute_contract_call")).toBe("Contract write");
    expect(verbTitle("execute_protocol_action")).toBe("Write");
    expect(
      verbMeta("execute_contract_call", { chain_id: "1", function_name: "transfer" }),
    ).toBe("1 · transfer");
    expect(verbMeta("execute_protocol_action", { actionType: "web3/transfer-token" })).toBe(
      "web3/transfer-token",
    );
  });
});
