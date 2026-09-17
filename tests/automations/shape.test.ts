import { describe, expect, it } from "vitest";

import {
  automationStatus,
  filterAutomations,
  orderedSteps,
  readSettledRun,
  runLabel,
  runOutcome,
  sortAutomations,
  toAutomationDetail,
  toAutomationRun,
  toAutomationSummary,
  triggerTypeOf,
} from "@/lib/automations/shape";

const NODES = [
  { id: "t", data: { type: "trigger", label: "Every hour", config: { triggerType: "Scheduled" } } },
  { id: "b", data: { type: "action", label: "Send", config: { actionType: "web3/transfer-funds", network: "84532" } } },
  { id: "a", data: { type: "action", label: "Check balance", config: { actionType: "web3/check-balance", network: "84532" } } },
  { id: "c", data: { type: "action", label: "Notify", enabled: false, config: { actionType: "discord/send-message" } } },
  { id: "add", data: { type: "add" } },
];
const EDGES = [
  { source: "t", target: "a" },
  { source: "a", target: "b" },
];

describe("reading a KeeperHub workflow", () => {
  it("normalises the legacy Scheduled trigger", () => {
    expect(triggerTypeOf(NODES)).toBe("Schedule");
    expect(triggerTypeOf([])).toBeNull();
  });

  it("orders steps by the edges from the trigger, unreached steps last, editor placeholders dropped", () => {
    const steps = orderedSteps(NODES, EDGES);
    expect(steps.map((step) => step.id)).toEqual(["a", "b", "c"]);
    expect(steps[0]).toEqual({ id: "a", label: "Check balance", actionType: "web3/check-balance", network: "84532", enabled: true });
    expect(steps[2]?.enabled).toBe(false);
  });

  it("summarises a row: name, trigger, step count, distinct networks, deactivation", () => {
    const row = { id: "wf-1", name: "Top up", nodes: NODES, edges: EDGES, enabled: true, deactivatedAt: null, updatedAt: "2026-09-13T10:00:00.000Z" };
    expect(toAutomationSummary(row)).toMatchObject({
      id: "wf-1",
      name: "Top up",
      triggerType: "Schedule",
      stepCount: 3,
      networks: ["84532"],
      deactivated: false,
      enabled: true,
    });
    expect(toAutomationSummary(row)).not.toHaveProperty("steps");
    expect(toAutomationDetail({ ...row, deactivatedAt: "2026-09-01T00:00:00Z" })?.deactivated).toBe(true);
    expect(toAutomationSummary({ name: "no id" })).toBeNull();
  });
});

describe("automation status and the board's filters", () => {
  const base = { name: "x", description: null, stepCount: 0, networks: [], createdAt: null };
  const live = { ...base, id: "1", enabled: true, deactivated: false, triggerType: "Schedule", updatedAt: "2026-09-02" };
  const off = { ...base, id: "2", enabled: false, deactivated: false, triggerType: "Event", updatedAt: "2026-09-03", name: "a" };
  const manual = { ...base, id: "3", enabled: false, deactivated: false, triggerType: "Manual", updatedAt: "2026-09-01", name: "b" };
  const dead = { ...base, id: "4", enabled: true, deactivated: true, triggerType: "Schedule", updatedAt: "2026-09-04" };

  it("reads a manual trigger as on demand whatever its switch, and deactivation over everything", () => {
    expect(automationStatus(live)).toBe("live");
    expect(automationStatus(off)).toBe("off");
    expect(automationStatus(manual)).toBe("manual");
    expect(automationStatus(dead)).toBe("deactivated");
  });

  it("filters live, on demand and off (off includes deactivated) and sorts by update or name", () => {
    const all = [live, off, manual, dead];
    expect(filterAutomations(all, "live").map((a) => a.id)).toEqual(["1"]);
    expect(filterAutomations(all, "manual").map((a) => a.id)).toEqual(["3"]);
    expect(filterAutomations(all, "off").map((a) => a.id)).toEqual(["2", "4"]);
    expect(sortAutomations(all, "updated").map((a) => a.id)).toEqual(["4", "2", "1", "3"]);
    expect(sortAutomations([manual, off], "name").map((a) => a.id)).toEqual(["2", "3"]);
  });
});

describe("runs", () => {
  it("reads an execution row with its hashes and duration", () => {
    const run = toAutomationRun({
      id: "ex-1",
      status: "success",
      triggerSource: "manual",
      startedAt: "2026-09-13T10:00:00.000Z",
      duration: "1520",
      transactionHashes: [{ hash: "0xabc", chainId: 84532, nodeName: "Send" }, { nope: true }],
    });
    expect(run).toMatchObject({ id: "ex-1", durationMs: 1520, transactionHashes: [{ hash: "0xabc", network: "84532", nodeName: "Send" }] });
  });

  it("maps execution status to the ledger: success lands, any other terminal fails, the rest waits", () => {
    expect(runOutcome("success")).toBe("receipt");
    for (const status of ["error", "system_error", "cancelled", "skipped"]) expect(runOutcome(status)).toBe("failure");
    for (const status of ["pending", "running", "unconfirmed"]) expect(runOutcome(status)).toBe("pending");
    expect(runLabel("success")).toEqual({ label: "Executed", tone: "success" });
    expect(runLabel("running").tone).toBe("pending");
  });

  it("reads get_execution's answer, first hash included", () => {
    expect(readSettledRun({ status: { status: "success", transactionHashes: [{ hash: "0xrun" }] }, logs: null })).toEqual({
      outcome: "receipt",
      status: "success",
      txHash: "0xrun",
    });
    expect(readSettledRun({ status: { status: "running" } })).toEqual({ outcome: "pending", status: "running", txHash: null });
    expect(readSettledRun(null)).toEqual({ outcome: "pending", status: null, txHash: null });
  });
});
