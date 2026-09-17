import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Recovery on return: the wire client and the ledger writers are mocked, so the
// test drives KeeperHub's answer and asserts what gets recorded (and that
// nothing is ever re-sent).
const { callTool } = vi.hoisted(() => ({ callTool: vi.fn() }));
vi.mock("@/lib/mcp", () => ({ callTool }));

const { listStaleIntents, writeTerminal } = vi.hoisted(() => ({
  listStaleIntents: vi.fn(),
  writeTerminal: vi.fn(),
}));
vi.mock("@/lib/ledger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ledger")>()),
  listStaleIntents,
  writeTerminal,
}));

import { toWorkflowGraph, type AutomationDefinition } from "@/lib/automations/build";
import { recoverOpenWrites, RECOVERY_EXPIRY_MS, RECOVERY_MIN_AGE_MS } from "@/lib/execution";

const NOW = Date.parse("2026-09-12T12:00:00Z");
const session = { id: "s1", userId: "u1", orgId: "org-1", scope: "mcp:read mcp:write", accessToken: "tok" };

function intent(overrides: Record<string, unknown> = {}) {
  return {
    id: "led-1",
    opId: "execute_transfer",
    state: "intent",
    keeperhubExecutionId: "exec-1",
    conversationId: "conv-1",
    toolCallId: "call-1",
    txHash: null,
    createdAt: new Date(NOW - 5 * 60_000),
    ...overrides,
  };
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  callTool.mockReset();
  listStaleIntents.mockReset();
  writeTerminal.mockReset();
  writeTerminal.mockResolvedValue({ landed: true, row: {} });
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("recoverOpenWrites", () => {
  it("only asks about intents old enough that no live request still owns them", async () => {
    listStaleIntents.mockResolvedValue([]);

    await expect(recoverOpenWrites({ session, requestId: "req-1", now: NOW })).resolves.toEqual([]);
    expect(listStaleIntents).toHaveBeenCalledWith(session, {
      createdBefore: new Date(NOW - RECOVERY_MIN_AGE_MS),
      limit: 10,
    });
  });

  it("records a receipt when KeeperHub confirms the execution landed", async () => {
    listStaleIntents.mockResolvedValue([intent()]);
    const payload = { status: "completed", transactionHash: "0xabc", receipts: [{ receiptStatus: "success" }] };
    callTool.mockResolvedValue({ ok: true, data: payload });

    const [result] = await recoverOpenWrites({ session, requestId: "req-1", now: NOW });

    expect(result).toEqual({ ledgerId: "led-1", opId: "execute_transfer", outcome: "landed", txHash: "0xabc" });
    expect(writeTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ id: "led-1", state: "receipt", txHash: "0xabc", executionId: "exec-1", receipt: payload }),
    );
  });

  it("records a failure when the execution reverted", async () => {
    listStaleIntents.mockResolvedValue([intent()]);
    callTool.mockResolvedValue({ ok: true, data: { receipts: [{ receiptStatus: "reverted" }] } });

    const [result] = await recoverOpenWrites({ session, requestId: "req-1", now: NOW });

    expect(result?.outcome).toBe("failed");
    expect(writeTerminal).toHaveBeenCalledWith(expect.objectContaining({ state: "failure" }));
  });

  it("leaves a still-running execution open and writes nothing", async () => {
    listStaleIntents.mockResolvedValue([intent()]);
    callTool.mockResolvedValue({ ok: true, data: { status: "running", receipts: [] } });

    const [result] = await recoverOpenWrites({ session, requestId: "req-1", now: NOW });

    expect(result?.outcome).toBe("pending");
    expect(writeTerminal).not.toHaveBeenCalled();
  });

  it("treats a failed status read as unknown, never as a failure", async () => {
    listStaleIntents.mockResolvedValue([intent()]);
    callTool.mockResolvedValue({ ok: false, error: { code: "rate_limited", message: "slow down" } });

    const [result] = await recoverOpenWrites({ session, requestId: "req-1", now: NOW });

    expect(result?.outcome).toBe("pending");
    expect(writeTerminal).not.toHaveBeenCalled();
  });

  it("never re-sends: the only call it makes is the status read", async () => {
    listStaleIntents.mockResolvedValue([intent(), intent({ id: "led-2", keeperhubExecutionId: "exec-2" })]);
    callTool.mockResolvedValue({ ok: true, data: { status: "running" } });

    await recoverOpenWrites({ session, requestId: "req-1", now: NOW });

    expect(callTool).toHaveBeenCalledTimes(2);
    for (const [options] of callTool.mock.calls) {
      expect(options).toMatchObject({
        name: "get_direct_execution_status",
        idempotent: true,
        args: { execution_id: expect.stringMatching(/^exec-/) },
      });
    }
  });

  it("closes an automation run from KeeperHub's workflow execution status", async () => {
    listStaleIntents.mockResolvedValue([
      intent({ opId: "workflow/run", workflowId: "wf-1", conversationId: null, toolCallId: null }),
    ]);
    callTool.mockResolvedValue({
      ok: true,
      data: { status: { status: "success", transactionHashes: [{ hash: "0xrun" }] }, logs: null },
    });

    const [result] = await recoverOpenWrites({ session, requestId: "req-1", now: NOW });

    expect(callTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "get_execution", args: { executionId: "exec-1", includeData: false } }),
    );
    expect(writeTerminal).toHaveBeenCalledWith(expect.objectContaining({ id: "led-1", state: "receipt", txHash: "0xrun" }));
    expect(result).toEqual({ ledgerId: "led-1", opId: "workflow/run", outcome: "landed", txHash: "0xrun" });
  });

  it("leaves an automation run open while KeeperHub is still running it", async () => {
    listStaleIntents.mockResolvedValue([intent({ opId: "workflow/run", workflowId: "wf-1" })]);
    callTool.mockResolvedValue({ ok: true, data: { status: { status: "running" } } });

    const [result] = await recoverOpenWrites({ session, requestId: "req-1", now: NOW });

    expect(result?.outcome).toBe("pending");
    expect(writeTerminal).not.toHaveBeenCalled();
  });

  it("waits on an intent with no execution id until KeeperHub's idempotency window has passed", async () => {
    listStaleIntents.mockResolvedValue([intent({ keeperhubExecutionId: null })]);

    const [result] = await recoverOpenWrites({ session, requestId: "req-1", now: NOW });

    expect(result?.outcome).toBe("pending");
    expect(callTool).not.toHaveBeenCalled();
    expect(writeTerminal).not.toHaveBeenCalled();
  });

  it("closes an intent with no execution id as expired once a day has passed", async () => {
    listStaleIntents.mockResolvedValue([
      intent({ keeperhubExecutionId: null, createdAt: new Date(NOW - RECOVERY_EXPIRY_MS - 1) }),
    ]);

    const [result] = await recoverOpenWrites({ session, requestId: "req-1", now: NOW });

    expect(result?.outcome).toBe("expired");
    expect(writeTerminal).toHaveBeenCalledWith(expect.objectContaining({ id: "led-1", state: "expired" }));
  });

  it("closes an automation switch that took effect, from the automation as KeeperHub has it now", async () => {
    listStaleIntents.mockResolvedValue([intent({ opId: "workflow/enable", workflowId: "wf-1", keeperhubExecutionId: null })]);
    callTool.mockResolvedValue({ ok: true, data: { id: "wf-1", enabled: true } });

    const [result] = await recoverOpenWrites({ session, requestId: "req-1", now: NOW });

    expect(callTool).toHaveBeenCalledWith(expect.objectContaining({ name: "get_workflow", args: { workflowId: "wf-1" } }));
    expect(writeTerminal).toHaveBeenCalledWith(expect.objectContaining({ id: "led-1", state: "receipt" }));
    expect(result).toEqual({ ledgerId: "led-1", opId: "workflow/enable", outcome: "landed", txHash: null });
  });

  it("leaves an unconfirmed automation change open, then expires it after a day", async () => {
    const change = { opId: "workflow/disable", workflowId: "wf-1", keeperhubExecutionId: null };
    callTool.mockResolvedValue({ ok: true, data: { id: "wf-1", enabled: true } });

    listStaleIntents.mockResolvedValue([intent(change)]);
    const [open] = await recoverOpenWrites({ session, requestId: "req-1", now: NOW });
    expect(open?.outcome).toBe("pending");
    expect(writeTerminal).not.toHaveBeenCalled();

    listStaleIntents.mockResolvedValue([intent({ ...change, createdAt: new Date(NOW - RECOVERY_EXPIRY_MS - 1) })]);
    const [old] = await recoverOpenWrites({ session, requestId: "req-1", now: NOW });
    expect(old?.outcome).toBe("expired");
  });

  it("closes a delete once KeeperHub no longer has the automation", async () => {
    listStaleIntents.mockResolvedValue([intent({ opId: "workflow/delete", workflowId: "wf-1", keeperhubExecutionId: null })]);
    callTool.mockResolvedValue({ ok: false, error: { code: "tool_error", message: "API call failed: 404 Not Found" } });

    const [result] = await recoverOpenWrites({ session, requestId: "req-1", now: NOW });

    expect(result).toEqual({ ledgerId: "led-1", opId: "workflow/delete", outcome: "landed", txHash: null });
    expect(writeTerminal).toHaveBeenCalledWith(expect.objectContaining({ id: "led-1", state: "receipt" }));
  });

  it("closes a change only when KeeperHub holds exactly the version it confirmed", async () => {
    const version: AutomationDefinition = {
      name: "Weekday balance",
      trigger: { type: "schedule", cron: "0 10 * * 1-5" },
      steps: [{ action: "web3/check-balance", params: { network: "84532", address: `0x${"a".repeat(40)}` } }],
    };
    const change = {
      opId: "workflow/update",
      workflowId: "wf-1",
      keeperhubExecutionId: null,
      confirmedInputs: { workflowId: "wf-1", ...version },
    };

    listStaleIntents.mockResolvedValue([intent(change)]);
    callTool.mockResolvedValue({ ok: true, data: { id: "wf-1", name: "Morning balance", ...toWorkflowGraph(version) } });
    const [older] = await recoverOpenWrites({ session, requestId: "req-1", now: NOW });
    expect(older?.outcome).toBe("pending");
    expect(writeTerminal).not.toHaveBeenCalled();

    callTool.mockResolvedValue({ ok: true, data: { id: "wf-1", name: "Weekday balance", ...toWorkflowGraph(version) } });
    const [landed] = await recoverOpenWrites({ session, requestId: "req-1", now: NOW });
    expect(landed).toEqual({ ledgerId: "led-1", opId: "workflow/update", outcome: "landed", txHash: null });
  });

  it("cannot match a save that never answered, so it asks nothing and waits out expiry", async () => {
    listStaleIntents.mockResolvedValue([intent({ opId: "workflow/create", workflowId: null, keeperhubExecutionId: null })]);

    const [result] = await recoverOpenWrites({ session, requestId: "req-1", now: NOW });

    expect(result?.outcome).toBe("pending");
    expect(callTool).not.toHaveBeenCalled();
  });

  it("reports what another writer already recorded when it got there first", async () => {
    listStaleIntents.mockResolvedValue([intent()]);
    callTool.mockResolvedValue({ ok: true, data: { receipts: [{ receiptStatus: "success" }] } });
    writeTerminal.mockResolvedValue({
      landed: false,
      reason: "lost-race",
      existing: { state: "receipt", txHash: "0xdef" },
    });

    const [result] = await recoverOpenWrites({ session, requestId: "req-1", now: NOW });

    expect(result).toMatchObject({ outcome: "landed", txHash: "0xdef" });
  });

  it("stays pending when the terminal could not be written", async () => {
    listStaleIntents.mockResolvedValue([intent()]);
    callTool.mockResolvedValue({ ok: true, data: { receipts: [{ receiptStatus: "success" }] } });
    writeTerminal.mockResolvedValue({ landed: false, reason: "write-failed", existing: null });

    const [result] = await recoverOpenWrites({ session, requestId: "req-1", now: NOW });

    expect(result?.outcome).toBe("pending");
  });
});
