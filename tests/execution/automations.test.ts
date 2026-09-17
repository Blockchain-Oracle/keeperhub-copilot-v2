import { beforeEach, describe, expect, it, vi } from "vitest";

// Automations from chat through the one door. The wire client and the ledger
// writers are mocked, and so are the three KeeperHub reads that are plain REST
// (run history, dry run, ABI lookup); the proposal check and the graph builder
// run for real.
const { callTool } = vi.hoisted(() => ({ callTool: vi.fn() }));
vi.mock("@/lib/mcp", () => ({ callTool }));

const { writeIntent, writeTerminal, recordExecutionId } = vi.hoisted(() => ({
  writeIntent: vi.fn(),
  writeTerminal: vi.fn(),
  recordExecutionId: vi.fn(),
}));
vi.mock("@/lib/ledger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ledger")>()),
  writeIntent,
  writeTerminal,
  recordExecutionId,
}));

const { listAutomationRuns, simulateAutomation, fetchContractAbi, deleteAutomationRecord } = vi.hoisted(() => ({
  listAutomationRuns: vi.fn(),
  simulateAutomation: vi.fn(),
  fetchContractAbi: vi.fn(),
  deleteAutomationRecord: vi.fn(),
}));
vi.mock("@/lib/automations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/automations")>()),
  listAutomationRuns,
  simulateAutomation,
  fetchContractAbi,
  deleteAutomationRecord,
}));

import { toWorkflowGraph, type AutomationDefinition } from "@/lib/automations/build";
import { requiresConfirmation, routeToolCall } from "@/lib/execution";

const A = `0x${"a".repeat(40)}`;
const session = { id: "s1", userId: "u1", orgId: "org-1", scope: "mcp:read mcp:write", accessToken: "tok" };
const base = { session, requestId: "req-1", conversationId: "conv-1", toolCallId: "call-1" } as const;
const TRANSFER_ABI = JSON.stringify([{ type: "event", name: "Transfer", inputs: [] }]);

const PROPOSAL: AutomationDefinition = {
  name: "Morning balance",
  trigger: { type: "schedule", cron: "0 9 * * 1-5" },
  steps: [{ action: "web3/check-balance", params: { network: "84532", address: A } }],
};
const MOVING: AutomationDefinition = {
  ...PROPOSAL,
  steps: [
    ...PROPOSAL.steps,
    { action: "web3/transfer-funds", label: "Top up", params: { network: "84532", amount: "0.01", recipientAddress: A } },
  ],
};

function workflowRow(definition: AutomationDefinition, overrides: Record<string, unknown> = {}) {
  return { id: "wf-1", name: definition.name, enabled: false, deactivatedAt: null, ...toWorkflowGraph(definition), ...overrides };
}

/** KeeperHub's answer per MCP tool name; anything unexpected fails loudly. */
function wire(answers: Record<string, unknown>): void {
  callTool.mockImplementation((options: { name: string }) =>
    Promise.resolve(answers[options.name] ?? { ok: false, error: { code: "tool_error", message: `unexpected ${options.name}` } }),
  );
}

function callNamed(name: string) {
  return callTool.mock.calls.find(([options]) => options.name === name)?.[0];
}

beforeEach(() => {
  callTool.mockReset();
  writeIntent.mockReset();
  writeTerminal.mockReset();
  listAutomationRuns.mockReset();
  simulateAutomation.mockReset();
  fetchContractAbi.mockReset();
  deleteAutomationRecord.mockReset();
  recordExecutionId.mockReset();
  writeIntent.mockResolvedValue({ id: "led-1" });
  writeTerminal.mockResolvedValue({ landed: true, row: {} });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("which automation calls stop for the person", () => {
  it("holds a proposal that can be acted on, and lets a broken one go back to the model", () => {
    expect(requiresConfirmation("create_automation", PROPOSAL)).toBe(true);
    expect(requiresConfirmation("create_automation", { ...PROPOSAL, steps: [] })).toBe(false);
    expect(requiresConfirmation("set_automation_enabled", { workflowId: "wf-1", enabled: true })).toBe(true);
    expect(requiresConfirmation("set_automation_enabled", { workflowId: "wf-1" })).toBe(false);
    expect(requiresConfirmation("list_automations", {})).toBe(false);
    expect(requiresConfirmation("get_automation", { workflowId: "wf-1" })).toBe(false);
  });

  it("holds a change, a run and a delete once they name an automation", () => {
    expect(requiresConfirmation("update_automation", { workflowId: "wf-1", ...PROPOSAL })).toBe(true);
    expect(requiresConfirmation("update_automation", PROPOSAL)).toBe(false);
    expect(requiresConfirmation("update_automation", { workflowId: "wf-1", ...PROPOSAL, steps: [] })).toBe(false);
    expect(requiresConfirmation("run_automation", { workflowId: "wf-1" })).toBe(true);
    expect(requiresConfirmation("run_automation", {})).toBe(false);
    expect(requiresConfirmation("delete_automation", { workflowId: "wf-1" })).toBe(true);
    expect(requiresConfirmation("delete_automation", { workflowId: " " })).toBe(false);
  });
});

describe("proposing a new automation", () => {
  it("sends a broken proposal back with its issues and calls nothing", async () => {
    const out = await routeToolCall({
      ...base,
      toolName: "create_automation",
      args: { ...PROPOSAL, steps: [{ action: "web3/teleport", params: {} }] },
      write: "broadcast",
    });
    expect(out).toMatchObject({ ok: false, error: { code: "validation_failed", issues: [{ path: "steps.0.action" }] } });
    expect(callTool).not.toHaveBeenCalled();
    expect(writeIntent).not.toHaveBeenCalled();
  });

  it("shows KeeperHub's reading of the schedule before Authorize and records nothing", async () => {
    wire({ validate_cron: { ok: true, data: { valid: true, description: "At 09:00, Monday through Friday" } } });
    const out = await routeToolCall({ ...base, toolName: "create_automation", args: PROPOSAL, write: "simulate" });
    expect(out).toMatchObject({ ok: true, state: "simulated", preview: { blockers: [], warnings: [] } });
    if (out.ok && "preview" in out && out.tool === "create_automation") {
      expect(out.preview.facts).toContainEqual({ label: "Schedule", value: "At 09:00, Monday through Friday (UTC)" });
      expect(out.preview.facts).toContainEqual({ label: "Moves value", value: "No step moves value" });
    }
    expect(writeIntent).not.toHaveBeenCalled();
  });

  it("keeps Authorize off when KeeperHub can't read the schedule, and names the steps that move value", async () => {
    wire({ validate_cron: { ok: true, data: { valid: false, error: "minute out of range" } } });
    const out = await routeToolCall({ ...base, toolName: "create_automation", args: MOVING, write: "simulate" });
    expect(out).toMatchObject({ ok: true, preview: { blockers: [expect.stringContaining("minute out of range")] } });
    if (out.ok && "preview" in out && out.tool === "create_automation") {
      expect(out.preview.facts).toContainEqual({ label: "Moves value", value: "Top up" });
    }
  });

  it("looks up a contract event start's ABI and keeps Authorize off when there is none", async () => {
    fetchContractAbi.mockResolvedValue(null);
    const event = { ...PROPOSAL, trigger: { type: "event", network: "1", contract: A, event: "Transfer" } };
    const out = await routeToolCall({ ...base, toolName: "create_automation", args: event, write: "simulate" });
    expect(fetchContractAbi).toHaveBeenCalledWith("1", A);
    expect(out).toMatchObject({ ok: true, preview: { blockers: [expect.stringContaining("ABI")] } });
  });

  it("saves switched off, recording the intent before KeeperHub is called", async () => {
    wire({ create_workflow: { ok: true, data: { id: "wf-1", name: "Morning balance", enabled: false } } });
    const out = await routeToolCall({ ...base, toolName: "create_automation", args: PROPOSAL, write: "broadcast" });

    expect(out).toEqual({
      ok: true,
      tool: "create_automation",
      state: "receipt",
      txHash: null,
      receipt: { workflowId: "wf-1", name: "Morning balance", enabled: false, triggerType: "Schedule" },
      opId: "workflow/create",
    });
    expect(writeIntent).toHaveBeenCalledWith(
      expect.objectContaining({ opId: "workflow/create", conversationId: "conv-1", toolCallId: "call-1", workflowId: null }),
    );
    const create = callNamed("create_workflow");
    expect(create).toMatchObject({ idempotent: false, args: { name: "Morning balance", enabled: false, idempotency_key: "call-1" } });
    expect(create.args.nodes.map((node: { id: string }) => node.id)).toEqual(["trigger", "step-1"]);
    expect(writeIntent.mock.invocationCallOrder[0]).toBeLessThan(callTool.mock.invocationCallOrder[0]);
    expect(writeTerminal).toHaveBeenCalledWith(expect.objectContaining({ id: "led-1", state: "receipt", workflowId: "wf-1" }));
  });

  it("records a failure when KeeperHub refuses the save", async () => {
    wire({ create_workflow: { ok: false, error: { code: "tool_error", message: "422 INVALID_ACTION_CONFIG" } } });
    const out = await routeToolCall({ ...base, toolName: "create_automation", args: PROPOSAL, write: "broadcast" });
    expect(out).toMatchObject({ ok: false, error: { code: "tool_error" } });
    expect(writeTerminal).toHaveBeenCalledWith(expect.objectContaining({ id: "led-1", state: "failure" }));
  });

  it("sends nothing when the intent cannot be recorded", async () => {
    writeIntent.mockRejectedValue(new Error("db down"));
    const out = await routeToolCall({ ...base, toolName: "create_automation", args: PROPOSAL, write: "broadcast" });
    expect(out).toMatchObject({ ok: false, error: { code: "server_error" } });
    expect(callTool).not.toHaveBeenCalled();
  });

  it("leaves the intent open when KeeperHub answers without an id", async () => {
    wire({ create_workflow: { ok: true, data: {} } });
    const out = await routeToolCall({ ...base, toolName: "create_automation", args: PROPOSAL, write: "broadcast" });
    expect(out).toMatchObject({ ok: false, error: { code: "server_error" } });
    expect(writeTerminal).not.toHaveBeenCalled();
  });

  it("saves an event start with the fetched ABI but keeps the ABI out of the ledger", async () => {
    fetchContractAbi.mockResolvedValue(TRANSFER_ABI);
    wire({ create_workflow: { ok: true, data: { id: "wf-2" } } });
    const event = { ...PROPOSAL, trigger: { type: "event", network: "1", contract: A, event: "Transfer" } };
    await routeToolCall({ ...base, toolName: "create_automation", args: event, write: "broadcast" });
    expect(callNamed("create_workflow").args.nodes[0].data.config.contractABI).toBe(TRANSFER_ABI);
    expect(writeIntent.mock.calls[0][0].confirmedInputs.trigger).toEqual({ type: "event", network: "1", contract: A, event: "Transfer" });
  });

  it("never saves without a phase: only the authorized execute may", async () => {
    const out = await routeToolCall({ ...base, toolName: "create_automation", args: PROPOSAL });
    expect(out).toMatchObject({ ok: false, error: { code: "write_not_available" } });
    expect(callTool).not.toHaveBeenCalled();
  });
});

describe("turning an automation on or off", () => {
  it("has nothing to switch for an on-demand automation, or one already in that state", async () => {
    wire({ get_workflow: { ok: true, data: workflowRow({ ...PROPOSAL, trigger: { type: "manual" } }) } });
    const manual = await routeToolCall({ ...base, toolName: "set_automation_enabled", args: { workflowId: "wf-1", enabled: true }, write: "simulate" });
    expect(manual).toMatchObject({ ok: true, preview: { blockers: [expect.stringContaining("on demand")] } });

    wire({ get_workflow: { ok: true, data: workflowRow(PROPOSAL, { enabled: true }) } });
    const already = await routeToolCall({ ...base, toolName: "set_automation_enabled", args: { workflowId: "wf-1", enabled: true }, write: "simulate" });
    expect(already).toMatchObject({ ok: true, preview: { blockers: ["It's already on."] } });
  });

  it("shows KeeperHub's check and dry run, and asks for a tick before value-moving steps go live", async () => {
    wire({
      get_workflow: { ok: true, data: workflowRow(MOVING) },
      validate_workflow: { ok: true, data: { ok: true, result: { valid: true, nodeCount: 3, warnings: [{ code: "gas", message: "Gas may be high" }] } } },
    });
    simulateAutomation.mockResolvedValue({ ok: true, simulated: 2, skipped: 0, warnings: [] });
    const out = await routeToolCall({ ...base, toolName: "set_automation_enabled", args: { workflowId: "wf-1", enabled: true }, write: "simulate" });

    expect(out).toMatchObject({ ok: true, state: "simulated", preview: { blockers: [] } });
    if (out.ok && "preview" in out && out.tool === "set_automation_enabled") {
      expect(out.preview.facts).toContainEqual({ label: "KeeperHub check", value: "Passed" });
      expect(out.preview.facts).toContainEqual({ label: "Dry run", value: "2 checked, 0 skipped" });
      expect(out.preview.warnings).toContain("Gas may be high");
      expect(out.preview.warnings.some((warning) => /Top up will run with the org wallet/.test(warning))).toBe(true);
    }
    expect(writeIntent).not.toHaveBeenCalled();
  });

  it("keeps Authorize off when KeeperHub's check finds errors", async () => {
    wire({
      get_workflow: { ok: true, data: workflowRow(MOVING) },
      validate_workflow: { ok: true, data: { ok: true, result: { valid: false, nodeCount: 3, errors: [{ code: "x", message: "Step 2 has no recipient" }] } } },
    });
    simulateAutomation.mockResolvedValue({ ok: false, reason: "KeeperHub could not dry-run this automation." });
    const out = await routeToolCall({ ...base, toolName: "set_automation_enabled", args: { workflowId: "wf-1", enabled: true }, write: "simulate" });
    expect(out).toMatchObject({ ok: true, preview: { blockers: ["Step 2 has no recipient"] } });
  });

  it("switches it through update_workflow after recording the intent", async () => {
    wire({ update_workflow: { ok: true, data: { id: "wf-1", name: "Morning balance", enabled: true, ...toWorkflowGraph(PROPOSAL) } } });
    const on = await routeToolCall({ ...base, toolName: "set_automation_enabled", args: { workflowId: "wf-1", enabled: true }, write: "broadcast" });
    expect(on).toMatchObject({ ok: true, state: "receipt", opId: "workflow/enable", receipt: { workflowId: "wf-1", enabled: true } });
    expect(writeIntent).toHaveBeenCalledWith(expect.objectContaining({ opId: "workflow/enable", workflowId: "wf-1" }));
    expect(callNamed("update_workflow")).toMatchObject({ idempotent: false, args: { workflowId: "wf-1", enabled: true } });

    wire({ update_workflow: { ok: true, data: { success: true } } });
    const off = await routeToolCall({ ...base, toolName: "set_automation_enabled", args: { workflowId: "wf-1", enabled: false }, write: "broadcast" });
    expect(off).toMatchObject({ ok: true, opId: "workflow/disable", receipt: { enabled: false } });
  });
});

describe("listing and describing automations", () => {
  it("lists the org's automations", async () => {
    wire({ list_workflows: { ok: true, data: [workflowRow(PROPOSAL)] } });
    const out = await routeToolCall({ ...base, toolName: "list_automations", args: {} });
    expect(out).toMatchObject({ ok: true, tool: "list_automations", automations: [{ id: "wf-1", name: "Morning balance" }] });
    expect(writeIntent).not.toHaveBeenCalled();
  });

  it("describes one in the chat's shape when it is a straight line, and says why not otherwise", async () => {
    listAutomationRuns.mockResolvedValue([]);
    wire({ get_workflow: { ok: true, data: workflowRow(MOVING) } });
    const line = await routeToolCall({ ...base, toolName: "get_automation", args: { workflowId: "wf-1" } });
    expect(line).toMatchObject({ ok: true, tool: "get_automation", runs: [], definition: { steps: MOVING.steps } });

    const branching = workflowRow(MOVING);
    branching.edges.push({ id: "x", source: "trigger", target: "step-2" });
    wire({ get_workflow: { ok: true, data: branching } });
    const tree = await routeToolCall({ ...base, toolName: "get_automation", args: { workflowId: "wf-1" } });
    expect(tree).toMatchObject({ ok: true, definition: null, notEditable: expect.stringContaining("KeeperHub") });
  });

  it("says plainly when the id is not one of the org's automations", async () => {
    wire({ get_workflow: { ok: false, error: { code: "tool_error", message: "API call failed: 404 Not Found" } } });
    const out = await routeToolCall({ ...base, toolName: "get_automation", args: { workflowId: "nope" } });
    expect(out).toMatchObject({ ok: false, error: { code: "validation_failed" } });
  });
});

function orderOf(name: string): number {
  const index = callTool.mock.calls.findIndex(([options]) => options.name === name);
  return callTool.mock.invocationCallOrder[index];
}

describe("changing an automation", () => {
  it("lists what would change against KeeperHub's version, and warns when it is live", async () => {
    wire({
      get_workflow: { ok: true, data: workflowRow(MOVING, { enabled: true }) },
      validate_cron: { ok: true, data: { valid: true, description: "At 10:00, Monday through Friday" } },
    });
    const proposal = { workflowId: "wf-1", ...MOVING, trigger: { type: "schedule", cron: "0 10 * * 1-5" } };
    const out = await routeToolCall({ ...base, toolName: "update_automation", args: proposal, write: "simulate" });

    expect(out).toMatchObject({
      ok: true,
      state: "simulated",
      preview: { blockers: [], changes: ["Schedule: 0 9 * * 1-5 → 0 10 * * 1-5"], subject: { id: "wf-1", status: "live" } },
    });
    if (out.ok && "preview" in out && out.tool === "update_automation") {
      expect(out.preview.warnings.some((warning) => /Top up will run with the org wallet from its next start/.test(warning))).toBe(true);
    }
    expect(writeIntent).not.toHaveBeenCalled();
  });

  it("blocks a proposal that changes nothing, and one whose automation is not a straight line", async () => {
    wire({ get_workflow: { ok: true, data: workflowRow(MOVING) } });
    const same = await routeToolCall({ ...base, toolName: "update_automation", args: { workflowId: "wf-1", ...MOVING }, write: "simulate" });
    expect(same).toMatchObject({ ok: true, preview: { changes: [], blockers: [expect.stringContaining("Nothing would change")] } });

    const branching = workflowRow(MOVING);
    branching.edges.push({ id: "x", source: "trigger", target: "step-2" });
    wire({ get_workflow: { ok: true, data: branching } });
    const tree = await routeToolCall({ ...base, toolName: "update_automation", args: { workflowId: "wf-1", ...MOVING }, write: "simulate" });
    expect(tree).toMatchObject({ ok: true, preview: { blockers: [expect.stringContaining("KeeperHub")] } });
  });

  it("saves the whole new version through update_workflow, keeping it on, after recording the intent", async () => {
    wire({
      get_workflow: { ok: true, data: workflowRow(MOVING, { enabled: true }) },
      update_workflow: { ok: true, data: { id: "wf-1", name: "Weekday balance", enabled: true } },
    });
    const out = await routeToolCall({
      ...base,
      toolName: "update_automation",
      args: { workflowId: "wf-1", ...MOVING, name: "Weekday balance" },
      write: "broadcast",
    });

    expect(out).toEqual({
      ok: true,
      tool: "update_automation",
      state: "receipt",
      txHash: null,
      receipt: { workflowId: "wf-1", name: "Weekday balance", enabled: true, triggerType: "Schedule" },
      opId: "workflow/update",
    });
    expect(writeIntent).toHaveBeenCalledWith(
      expect.objectContaining({ opId: "workflow/update", workflowId: "wf-1", confirmedInputs: expect.objectContaining({ workflowId: "wf-1", name: "Weekday balance" }) }),
    );
    const update = callNamed("update_workflow");
    expect(update).toMatchObject({ idempotent: false, args: { workflowId: "wf-1", name: "Weekday balance" } });
    expect("enabled" in update.args).toBe(false);
    expect(update.args.nodes.map((node: { id: string }) => node.id)).toEqual(["trigger", "step-1", "step-2"]);
    expect(writeIntent.mock.invocationCallOrder[0]).toBeLessThan(orderOf("update_workflow"));
    expect(writeTerminal).toHaveBeenCalledWith(expect.objectContaining({ id: "led-1", state: "receipt" }));
  });

  it("keeps a pasted contract ABI while the change still watches the same contract", async () => {
    const watching: AutomationDefinition = { ...PROPOSAL, trigger: { type: "event", network: "1", contract: A, event: "Transfer", abi: TRANSFER_ABI } };
    wire({ get_workflow: { ok: true, data: workflowRow(watching) }, update_workflow: { ok: true, data: { id: "wf-1" } } });
    await routeToolCall({
      ...base,
      toolName: "update_automation",
      args: { workflowId: "wf-1", ...PROPOSAL, name: "Transfers", trigger: { type: "event", network: "1", contract: A, event: "Transfer" } },
      write: "broadcast",
    });
    expect(fetchContractAbi).not.toHaveBeenCalled();
    expect(callNamed("update_workflow").args.nodes[0].data.config.contractABI).toBe(TRANSFER_ABI);
  });
});

describe("running an automation from the chat", () => {
  it("shows KeeperHub's dry run and the steps that move value, and blocks a deactivated one", async () => {
    wire({ get_workflow: { ok: true, data: workflowRow(MOVING) } });
    simulateAutomation.mockResolvedValue({ ok: true, simulated: 2, skipped: 0, warnings: [{ nodeId: "step-2", message: "Gas may be high" }] });
    const out = await routeToolCall({ ...base, toolName: "run_automation", args: { workflowId: "wf-1" }, write: "simulate" });
    expect(out).toMatchObject({ ok: true, state: "simulated", preview: { blockers: [], warnings: ["Gas may be high"], subject: { name: "Morning balance" } } });
    if (out.ok && "preview" in out && out.tool === "run_automation") {
      expect(out.preview.facts).toContainEqual({ label: "Dry run", value: "2 checked, 0 skipped" });
      expect(out.preview.facts).toContainEqual({ label: "Moves value", value: "Top up" });
    }

    simulateAutomation.mockClear();
    wire({ get_workflow: { ok: true, data: workflowRow(MOVING, { deactivatedAt: "2026-09-01T00:00:00.000Z" }) } });
    const off = await routeToolCall({ ...base, toolName: "run_automation", args: { workflowId: "wf-1" }, write: "simulate" });
    expect(off).toMatchObject({ ok: true, preview: { blockers: [expect.stringContaining("deactivated")] } });
    expect(simulateAutomation).not.toHaveBeenCalled();
  });

  it("starts the run under the chat's tool call and hands the card the row to follow", async () => {
    wire({
      get_workflow: { ok: true, data: workflowRow(MOVING) },
      execute_workflow: { ok: true, data: { executionId: "exec-9", status: "running" } },
    });
    const out = await routeToolCall({ ...base, toolName: "run_automation", args: { workflowId: "wf-1" }, write: "broadcast" });

    expect(out).toMatchObject({
      ok: true,
      state: "receipt",
      opId: "workflow/run",
      receipt: { workflowId: "wf-1", name: "Morning balance", ledgerId: "led-1", executionId: "exec-9" },
    });
    expect(writeIntent).toHaveBeenCalledWith(
      expect.objectContaining({ opId: "workflow/run", workflowId: "wf-1", conversationId: "conv-1", toolCallId: "call-1" }),
    );
    expect(callNamed("execute_workflow")).toMatchObject({ args: { workflowId: "wf-1", idempotency_key: "call-1" } });
    expect(writeIntent.mock.invocationCallOrder[0]).toBeLessThan(orderOf("execute_workflow"));
    expect(writeTerminal).not.toHaveBeenCalled();
  });
});

describe("deleting an automation", () => {
  it("says before Authorize what it is and that its run history goes with it", async () => {
    wire({ get_workflow: { ok: true, data: workflowRow(MOVING, { enabled: true, updatedAt: "2026-09-13T09:30:00.000Z" }) } });
    listAutomationRuns.mockResolvedValue([{ id: "r1" }, { id: "r2" }]);
    const out = await routeToolCall({ ...base, toolName: "delete_automation", args: { workflowId: "wf-1" }, write: "simulate" });
    expect(out).toMatchObject({ ok: true, state: "simulated", preview: { blockers: [], subject: { id: "wf-1" } } });
    if (out.ok && "preview" in out && out.tool === "delete_automation") {
      expect(out.preview.facts).toEqual([
        { label: "Now", value: "Live" },
        { label: "Last updated", value: "2026-09-13 09:30 UTC" },
        { label: "Run history", value: "2 runs, deleted with it" },
        { label: "Once authorized", value: "It stops and is deleted from KeeperHub. This can't be undone." },
      ]);
    }

    listAutomationRuns.mockResolvedValue(Array.from({ length: 20 }, (_, index) => ({ id: `r${index}` })));
    const busy = await routeToolCall({ ...base, toolName: "delete_automation", args: { workflowId: "wf-1" }, write: "simulate" });
    if (busy.ok && "preview" in busy && busy.tool === "delete_automation") expect(busy.preview.facts).toContainEqual({ label: "Run history", value: "20+ runs, deleted with it" });
  });

  it("deletes it after recording the intent", async () => {
    wire({ get_workflow: { ok: true, data: workflowRow(MOVING) } });
    deleteAutomationRecord.mockResolvedValue({ ok: true, alreadyGone: false });
    const out = await routeToolCall({ ...base, toolName: "delete_automation", args: { workflowId: "wf-1" }, write: "broadcast" });

    expect(out).toMatchObject({ ok: true, state: "receipt", opId: "workflow/delete", receipt: { workflowId: "wf-1", name: "Morning balance", deleted: true } });
    expect(writeIntent).toHaveBeenCalledWith(expect.objectContaining({ opId: "workflow/delete", workflowId: "wf-1" }));
    expect(writeIntent.mock.invocationCallOrder[0]).toBeLessThan(deleteAutomationRecord.mock.invocationCallOrder[0]);
    expect(writeTerminal).toHaveBeenCalledWith(expect.objectContaining({ id: "led-1", state: "receipt" }));
  });

  it("records a refusal, but leaves the intent open when KeeperHub never answered", async () => {
    wire({ get_workflow: { ok: true, data: workflowRow(MOVING) } });
    deleteAutomationRecord.mockResolvedValue({ ok: false, answered: false, error: { code: "transport", message: "no answer" } });
    const silent = await routeToolCall({ ...base, toolName: "delete_automation", args: { workflowId: "wf-1" }, write: "broadcast" });
    expect(silent).toMatchObject({ ok: false, error: { code: "transport" } });
    expect(writeTerminal).not.toHaveBeenCalled();

    deleteAutomationRecord.mockResolvedValue({ ok: false, answered: true, error: { code: "tool_error", message: "Failed to delete workflow" } });
    const refused = await routeToolCall({ ...base, toolName: "delete_automation", args: { workflowId: "wf-1" }, write: "broadcast" });
    expect(refused).toMatchObject({ ok: false, error: { code: "tool_error" } });
    expect(writeTerminal).toHaveBeenCalledWith(expect.objectContaining({ state: "failure" }));
  });
});
