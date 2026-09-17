import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the ledger DB accessor seam — never the driver (repo convention: no test
// DB). The writer LOGIC is what's under test.
const { insertLedgerRow, casWriteTerminal, readLedgerRowById } = vi.hoisted(
  () => ({
    insertLedgerRow: vi.fn(),
    casWriteTerminal: vi.fn(),
    readLedgerRowById: vi.fn(),
  }),
);
vi.mock("@/lib/data/ledger", async (importOriginal) => ({
  // Keep the real TERMINAL_STATES (isTerminalState reads it) — override only the
  // three DB-touching accessor fns with mocks.
  ...(await importOriginal<typeof import("@/lib/data/ledger")>()),
  insertLedgerRow,
  casWriteTerminal,
  readLedgerRowById,
}));

import {
  extractExecutionId,
  extractTxHash,
  parseReceipt,
  recordDecline,
  recordRead,
  writeIntent,
  writeTerminal,
} from "@/lib/ledger";
import { registryMeta } from "@/lib/registry";

const SESSION = { orgId: "org-1" };
const READ_INPUT = {
  session: SESSION,
  conversationId: "conv-1",
  toolCallId: "call-1",
  opId: "chronicle/eth-usd-read",
  confirmedInputs: { network: "1", _protocolMeta: "x" },
  schemaFingerprint: "sha256:fingerprint",
};

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  insertLedgerRow.mockReset();
  casWriteTerminal.mockReset();
  readLedgerRowById.mockReset();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("recordRead (AC 5, D12)", () => {
  it("inserts a read row: state read, no receipt, no idempotency key, snapshot stamped", async () => {
    const created = { id: "led-1", state: "read" };
    insertLedgerRow.mockResolvedValue(created);

    const row = await recordRead(READ_INPUT);

    expect(row).toBe(created);
    expect(insertLedgerRow).toHaveBeenCalledTimes(1);
    const [scope, values] = insertLedgerRow.mock.calls[0];
    expect(scope).toBe(SESSION);
    expect(values).toEqual({
      toolCallId: "call-1",
      keeperhubExecutionId: null,
      workflowId: null,
      conversationId: "conv-1",
      opId: "chronicle/eth-usd-read",
      state: "read",
      confirmedInputs: { network: "1", _protocolMeta: "x" },
      txHash: null,
      receipt: null,
      idempotencyKey: null,
      schemaFingerprint: "sha256:fingerprint",
      registrySnapshotId: registryMeta.snapshotId,
    });
  });
});

describe("recordDecline (AC 2, D21 — the born-terminal declined row)", () => {
  it("inserts a fresh declined terminal keyed by tool call id: no receipt/txHash/idempotency key, snapshot stamped", async () => {
    const created = { id: "led-decl", state: "declined" };
    insertLedgerRow.mockResolvedValue(created);

    const row = await recordDecline({
      session: SESSION,
      conversationId: "conv-1",
      toolCallId: "call-decl",
      opId: "web3/transfer-token",
      // The exact instruction the user reviewed and refused (AD-11: any amount
      // rides verbatim as its base-unit string).
      confirmedInputs: { actionType: "web3/transfer-token", params: { amount: "1000000" } },
      schemaFingerprint: "sha256:decl-fp",
    });

    expect(row).toBe(created);
    expect(insertLedgerRow).toHaveBeenCalledTimes(1);
    const [scope, values] = insertLedgerRow.mock.calls[0];
    expect(scope).toBe(SESSION);
    // Mirrors recordRead (a receiptless fact) but born TERMINAL — never a CAS from
    // an intent row (a declined card never executed, so there is no intent row).
    expect(values).toEqual({
      toolCallId: "call-decl",
      keeperhubExecutionId: null,
      workflowId: null,
      conversationId: "conv-1",
      opId: "web3/transfer-token",
      state: "declined",
      confirmedInputs: { actionType: "web3/transfer-token", params: { amount: "1000000" } },
      txHash: null,
      receipt: null,
      idempotencyKey: null,
      schemaFingerprint: "sha256:decl-fp",
      registrySnapshotId: registryMeta.snapshotId,
    });
  });

  it("accepts a null schema fingerprint (a schema-free contract-call decline)", async () => {
    insertLedgerRow.mockResolvedValue({ id: "led-decl2", state: "declined" });
    await recordDecline({
      session: SESSION,
      conversationId: "conv-1",
      toolCallId: "call-decl2",
      opId: "execute_contract_call",
      confirmedInputs: { chain_id: "1", function_name: "transfer" },
      schemaFingerprint: null,
    });
    const [, values] = insertLedgerRow.mock.calls[0];
    expect(values.state).toBe("declined");
    expect(values.opId).toBe("execute_contract_call");
    expect(values.schemaFingerprint).toBeNull();
    expect(values.idempotencyKey).toBeNull();
    expect(values.receipt).toBeNull();
    expect(values.txHash).toBeNull();
  });
});

describe("writeIntent (AC 2)", () => {
  it("inserts a pre-execution intent row keyed by tool call id with the durable idempotency key", async () => {
    insertLedgerRow.mockResolvedValue({ id: "led-2", state: "intent" });

    await writeIntent({
      session: SESSION,
      conversationId: "conv-1",
      toolCallId: "call-2",
      opId: "web3/transfer-token",
      confirmedInputs: { amount: "1000000" },
      schemaFingerprint: "sha256:write-fp",
    });

    const [, values] = insertLedgerRow.mock.calls[0];
    expect(values).toEqual({
      toolCallId: "call-2",
      keeperhubExecutionId: null,
      workflowId: null,
      conversationId: "conv-1",
      opId: "web3/transfer-token",
      state: "intent",
      confirmedInputs: { amount: "1000000" },
      txHash: null,
      receipt: null,
      // Derived from the tool call id (AD-5).
      idempotencyKey: "call-2",
      schemaFingerprint: "sha256:write-fp",
      registrySnapshotId: registryMeta.snapshotId,
    });
  });
});

describe("writeTerminal (AC 3, D11)", () => {
  it("CAS success: the terminal is written and the row returned", async () => {
    const terminalRow = { id: "led-3", state: "receipt", txHash: "0xabc" };
    casWriteTerminal.mockResolvedValue(terminalRow);

    const result = await writeTerminal({
      session: SESSION,
      id: "led-3",
      state: "receipt",
      txHash: "0xabc",
      receipt: { verified: true, blockNumber: 42 },
      requestId: "req-1",
    });

    expect(result).toEqual({ landed: true, row: terminalRow });
    expect(casWriteTerminal).toHaveBeenCalledTimes(1);
    const [scope, id, terminal, expectedStates] = casWriteTerminal.mock.calls[0];
    expect(scope).toBe(SESSION);
    expect(id).toBe("led-3");
    expect(terminal).toEqual({
      state: "receipt",
      txHash: "0xabc",
      receipt: { verified: true, blockNumber: 42 },
    });
    // Default non-terminal precursor is the intent row.
    expect(expectedStates).toEqual(["intent"]);
    expect(readLedgerRowById).not.toHaveBeenCalled();
    expect(insertLedgerRow).not.toHaveBeenCalled();
  });

  it("lost race: returns the existing terminal, logs cas_lost, never overwrites or throws", async () => {
    casWriteTerminal.mockResolvedValue(null); // a second writer already won
    const existing = { id: "led-4", state: "failure" };
    readLedgerRowById.mockResolvedValue(existing);

    const result = await writeTerminal({
      session: SESSION,
      id: "led-4",
      state: "receipt",
      requestId: "req-2",
      conversationId: "conv-9",
      toolCallId: "call-9",
      executionId: "exec-9",
    });

    expect(result).toEqual({ landed: false, reason: "lost-race", existing });
    // Never re-inserts, never re-CASes to overwrite the winner.
    expect(insertLedgerRow).not.toHaveBeenCalled();
    expect(casWriteTerminal).toHaveBeenCalledTimes(1);

    const logged = errorSpy.mock.calls
      .map((call) => String(call[0]))
      .find((line) => line.includes("ledger_terminal_cas_lost"));
    expect(logged).toBeDefined();
    expect(JSON.parse(logged!)).toMatchObject({
      event: "ledger_terminal_cas_lost",
      ledgerId: "led-4",
      attemptedState: "receipt",
      existingState: "failure",
      conversationId: "conv-9",
      toolCallId: "call-9",
      executionId: "exec-9",
      orgId: "org-1",
    });
  });

  it("null CAS with a read-back blip: returns readback-failed without throwing (no silent catch)", async () => {
    casWriteTerminal.mockResolvedValue(null);
    readLedgerRowById.mockRejectedValue(new Error("neon blip"));

    const result = await writeTerminal({
      session: SESSION,
      id: "led-5",
      state: "declined",
      requestId: "req-3",
    });

    expect(result).toEqual({
      landed: false,
      reason: "readback-failed",
      existing: null,
    });
    const events = errorSpy.mock.calls.map((call) => String(call[0]));
    expect(events.some((line) => line.includes("ledger_terminal_readback_failed"))).toBe(
      true,
    );
    // Indeterminate — we do NOT claim a lost race when the read-back failed.
    expect(events.some((line) => line.includes("ledger_terminal_cas_lost"))).toBe(false);
  });

  it("null CAS, no existing row: returns not-found and logs target_missing (review Decision 2)", async () => {
    casWriteTerminal.mockResolvedValue(null);
    readLedgerRowById.mockResolvedValue(null);

    const result = await writeTerminal({
      session: SESSION,
      id: "led-missing",
      state: "receipt",
      requestId: "req-nf",
    });

    expect(result).toEqual({ landed: false, reason: "not-found", existing: null });
    const events = errorSpy.mock.calls.map((call) => String(call[0]));
    expect(events.some((line) => line.includes("ledger_terminal_target_missing"))).toBe(
      true,
    );
    expect(events.some((line) => line.includes("ledger_terminal_cas_lost"))).toBe(false);
  });

  it("null CAS, existing row still NON-terminal: returns unexpected-state, never reports it as the winner (review Decision 2)", async () => {
    casWriteTerminal.mockResolvedValue(null);
    const existing = { id: "led-open", state: "read" };
    readLedgerRowById.mockResolvedValue(existing);

    const result = await writeTerminal({
      session: SESSION,
      id: "led-open",
      state: "receipt",
      requestId: "req-us",
    });

    expect(result).toEqual({
      landed: false,
      reason: "unexpected-state",
      existing,
    });
    const events = errorSpy.mock.calls.map((call) => String(call[0]));
    expect(events.some((line) => line.includes("ledger_terminal_unexpected_state"))).toBe(
      true,
    );
    expect(events.some((line) => line.includes("ledger_terminal_cas_lost"))).toBe(false);
  });

  it("CAS write itself throws: returns write-failed, logs, never throws out (review P5)", async () => {
    // A DB/transport error on the CAS UPDATE (not a lost race) must not propagate:
    // a write may already have broadcast, so the route must never crash on it.
    casWriteTerminal.mockRejectedValue(new Error("neon write blip"));

    const result = await writeTerminal({
      session: SESSION,
      id: "led-wf",
      state: "receipt",
      txHash: "0xabc",
      requestId: "req-wf",
    });

    expect(result).toEqual({ landed: false, reason: "write-failed", existing: null });
    // The read-back is never reached — the CAS threw, this is not a lost race.
    expect(readLedgerRowById).not.toHaveBeenCalled();
    const events = errorSpy.mock.calls.map((call) => String(call[0]));
    expect(events.some((line) => line.includes("ledger_terminal_write_failed"))).toBe(true);
    expect(events.some((line) => line.includes("ledger_terminal_cas_lost"))).toBe(false);
  });

  it("persists the keeperhub execution id on the terminal when supplied (review P9)", async () => {
    casWriteTerminal.mockResolvedValue({ id: "led-x", state: "receipt" });

    await writeTerminal({
      session: SESSION,
      id: "led-x",
      state: "receipt",
      txHash: "0xhash",
      receipt: { verified: true },
      executionId: "exec-77",
      requestId: "req-x",
    });

    const [, , terminal] = casWriteTerminal.mock.calls[0];
    expect(terminal).toMatchObject({
      state: "receipt",
      txHash: "0xhash",
      keeperhubExecutionId: "exec-77",
    });
  });

  it("omits keeperhubExecutionId when no execution id is supplied (never nulls an existing value)", async () => {
    casWriteTerminal.mockResolvedValue({ id: "led-y", state: "receipt" });
    await writeTerminal({ session: SESSION, id: "led-y", state: "receipt", requestId: "req-y" });
    const [, , terminal] = casWriteTerminal.mock.calls[0];
    expect(terminal).not.toHaveProperty("keeperhubExecutionId");
  });

  it("accepts every AC-3 terminal state", async () => {
    casWriteTerminal.mockResolvedValue({ id: "led-6", state: "x" });
    for (const state of [
      "receipt",
      "failure",
      "declined",
      "paid-but-failed",
      "expired",
    ] as const) {
      const result = await writeTerminal({
        session: SESSION,
        id: "led-6",
        state,
        requestId: "req-4",
      });
      expect(result.landed).toBe(true);
    }
  });
});

describe("defensive payload parsing (posture of extractBoundIntegrationTypes)", () => {
  it("parseReceipt keeps a bare object, rejects non-objects and arrays", () => {
    expect(parseReceipt({ verified: true })).toEqual({ verified: true });
    expect(parseReceipt(null)).toBeNull();
    expect(parseReceipt(42)).toBeNull();
    expect(parseReceipt("0xabc")).toBeNull();
    expect(parseReceipt([{ verified: true }])).toBeNull();
  });

  it("extractExecutionId reads bare and enveloped payloads, else null", () => {
    expect(extractExecutionId({ executionId: "exec-1" })).toBe("exec-1");
    expect(extractExecutionId({ data: { executionId: "exec-2" } })).toBe("exec-2");
    expect(extractExecutionId({ result: { executionId: "exec-3" } })).toBe("exec-3");
    // A top-level id wins over an unrelated nested envelope sibling (review Patch).
    expect(extractExecutionId({ executionId: "exec-1", data: { foo: 1 } })).toBe(
      "exec-1",
    );
    expect(extractExecutionId({ executionId: "" })).toBeNull();
    expect(extractExecutionId({ status: "pending" })).toBeNull();
    expect(extractExecutionId(null)).toBeNull();
    expect(extractExecutionId("nope")).toBeNull();
  });

  it("extractTxHash reads direct hashes and a transactionHashes list, else null", () => {
    expect(extractTxHash({ txHash: "0xaaa" })).toBe("0xaaa");
    expect(extractTxHash({ transactionHash: "0xbbb" })).toBe("0xbbb");
    expect(extractTxHash({ transactionHashes: [{ hash: "0xccc" }] })).toBe("0xccc");
    expect(extractTxHash({ data: { txHash: "0xddd" } })).toBe("0xddd");
    // Empty-string txHash never shadows a valid transactionHash (review Patch).
    expect(extractTxHash({ txHash: "", transactionHash: "0xREAL" })).toBe("0xREAL");
    // A top-level hash wins over an unrelated nested envelope sibling (review Patch).
    expect(extractTxHash({ txHash: "0xaaa", result: { foo: 1 } })).toBe("0xaaa");
    expect(extractTxHash({ transactionHashes: [] })).toBeNull();
    expect(extractTxHash({})).toBeNull();
    expect(extractTxHash(undefined)).toBeNull();
  });
});
