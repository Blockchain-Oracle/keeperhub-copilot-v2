import { describe, expect, it } from "vitest";

import {
  automationActionLabel,
  automationAuthorizeAllowed,
  automationFieldErrors,
  automationFormFor,
  automationFrame,
  automationKicker,
  automationTitle,
  buildEditedAutomation,
  isAutomationChangeTool,
  proposalSteps,
  readPreview,
  readSwitch,
  readTarget,
  toAutomationPreviewState,
  triggerSummary,
} from "@/components/cards/automation-view";
import { selectRenderer } from "@/components/cards/select-renderer";
import { integrationOf, toolTitle } from "@/components/cards/tool-meta";
import { showsCard } from "@/components/chat/chat-rules";
import type { AutomationDefinition } from "@/lib/automations/build";
import { checkAutomationDefinition } from "@/lib/automations/proposal";
import { getOperationEntry } from "@/lib/registry";

const A = `0x${"a".repeat(40)}`;

const DEFINITION: AutomationDefinition = {
  name: "Morning balance",
  trigger: { type: "schedule", cron: "0 9 * * 1-5" },
  steps: [
    { action: "web3/check-balance", params: { network: "84532", address: A } },
    { action: "condition", params: { condition: "{{@step-1:Get Native Token Balance.balance}} < 0.1" } },
    { action: "web3/transfer-funds", label: "Top up", params: { network: "84532", amount: "0.01", recipientAddress: A } },
  ],
};

const READY = { facts: [{ label: "Schedule", value: "At 09:00" }], warnings: [], blockers: [] };

describe("the start and the steps in words", () => {
  it("says how each kind of start begins", () => {
    expect(triggerSummary({ type: "manual" }).title).toMatch(/Run now/);
    expect(triggerSummary(DEFINITION.trigger)).toEqual({
      title: "On a schedule",
      network: null,
      rows: [
        { key: "cron", label: "Cron", value: "0 9 * * 1-5" },
        { key: "timezone", label: "Timezone", value: "UTC" },
      ],
    });
    expect(triggerSummary({ type: "block", network: "8453", every: "10" })).toMatchObject({ title: "Every 10 blocks", network: "8453" });
    expect(triggerSummary({ type: "event", network: "1", contract: A, event: "Transfer" }).title).toBe("When Transfer is emitted");
  });

  it("lists each step with its label, network and values, and marks the ones that move value", () => {
    const steps = proposalSteps(DEFINITION);
    expect(steps.map((step) => step.id)).toEqual(["step-1", "step-2", "step-3"]);
    expect(steps[0]).toMatchObject({ label: getOperationEntry("web3/check-balance")?.label, network: "84532", movesValue: false });
    expect(steps[0].rows.map((row) => row.key)).toEqual(["address"]);
    expect(steps[1]).toMatchObject({ actionType: "Condition", rows: [{ label: "Continues when" }] });
    expect(steps[2]).toMatchObject({ label: "Top up", movesValue: true });
  });
});

describe("KeeperHub's reading before Authorize", () => {
  it("reads the simulate answer, and treats anything else as a check that did not run", () => {
    expect(toAutomationPreviewState({ ok: true, kind: "simulated", preview: READY })).toEqual({ status: "ready", preview: READY });
    expect(toAutomationPreviewState({ ok: false, error: { message: "slow down" } })).toEqual({ status: "error", message: "slow down" });
    expect(toAutomationPreviewState({ ok: true, kind: "simulated", preview: { facts: "no" } }).status).toBe("error");
    expect(toAutomationPreviewState({ ok: true, kind: "no-preview" }).status).toBe("error");
  });

  it("allows Authorize only with no blockers, and warnings only once ticked", () => {
    const ready = { status: "ready" as const, preview: READY };
    const warned = { status: "ready" as const, preview: { ...READY, warnings: ["Gas may be high"] } };
    const blocked = { status: "ready" as const, preview: { ...READY, blockers: ["It's already on."] } };
    expect(automationAuthorizeAllowed(ready, false)).toBe(true);
    expect(automationAuthorizeAllowed(warned, false)).toBe(false);
    expect(automationAuthorizeAllowed(warned, true)).toBe(true);
    expect(automationAuthorizeAllowed(blocked, true)).toBe(false);
    expect(automationAuthorizeAllowed({ status: "loading" }, true)).toBe(false);
  });

  it("names what the button is waiting for, ending on the action", () => {
    const label = (state: Parameters<typeof automationActionLabel>[0]["state"], acknowledged = false, submitted = false) =>
      automationActionLabel({ submitted, state, acknowledged, action: "Turn on", busyLabel: "Turning on…" });
    expect(label({ status: "loading" })).toBe("Checking…");
    expect(label({ status: "error", message: "x" })).toBe("Check failed");
    expect(label({ status: "ready", preview: { ...READY, blockers: ["no"] } })).toBe("Can't go ahead");
    expect(label({ status: "ready", preview: { ...READY, warnings: ["hm"] } })).toBe("Acknowledge the warnings");
    expect(label({ status: "ready", preview: READY })).toBe("Turn on");
    expect(label({ status: "ready", preview: READY }, false, true)).toBe("Turning on…");
  });
});

describe("the card's frame through an automation's life", () => {
  const base = { live: true, resumeErrored: false, submitted: false, edited: false };

  it("saves switched off, then reads LIVE once turned on from the card", () => {
    const create = { ...base, toolName: "create_automation" };
    expect(automationFrame({ ...create, phase: "proposed" }).meta).toBe("AWAITING AUTHORIZATION");
    expect(automationFrame({ ...create, phase: "proposed", edited: true }).meta).toBe("EDITED");
    expect(automationFrame({ ...create, phase: "executing", approved: true }).meta).toBe("SAVING");
    expect(automationFrame({ ...create, phase: "receipt" })).toMatchObject({ meta: "SAVED · OFF", tone: "success" });
    expect(automationFrame({ ...create, phase: "receipt", turnedOn: true }).meta).toBe("LIVE");
    expect(automationFrame({ ...create, phase: "proposed", live: false }).meta).toBe("NEVER AUTHORIZED");
  });

  it("says which way a switch turns", () => {
    const toggle = { ...base, toolName: "set_automation_enabled" };
    expect(automationFrame({ ...toggle, phase: "executing", approved: true, enabled: false }).meta).toBe("TURNING OFF");
    expect(automationFrame({ ...toggle, phase: "receipt", enabled: true }).meta).toBe("TURNED ON");
    expect(readSwitch({ workflowId: "wf-1", enabled: false })).toEqual({ workflowId: "wf-1", enabled: false });
    expect(readSwitch({ workflowId: "wf-1" })).toBeNull();
  });
});

describe("editing everything but the kind of start and the steps", () => {
  it("seeds from the proposal and rebuilds the same proposal", () => {
    const form = automationFormFor(DEFINITION);
    expect(form.fields.map((field) => field.key)).toEqual(
      expect.arrayContaining(["name", "trigger.cron", "trigger.timezone", "steps.0.address", "steps.1.condition", "steps.2.amount"]),
    );
    const rebuilt = buildEditedAutomation(DEFINITION, form.seed);
    expect(checkAutomationDefinition(rebuilt).ok).toBe(true);
    expect(rebuilt).toEqual(DEFINITION);
  });

  it("applies a new schedule and a step's value, keeping labels and unlisted settings", () => {
    const withConnection: AutomationDefinition = {
      ...DEFINITION,
      steps: [{ ...DEFINITION.steps[0], params: { ...DEFINITION.steps[0].params, integrationId: "int-1" } }, ...DEFINITION.steps.slice(1)],
    };
    const form = automationFormFor(withConnection);
    const rebuilt = buildEditedAutomation(withConnection, {
      ...form.seed,
      "trigger.cron": "0 18 * * *",
      "trigger.timezone": "Europe/London",
      "steps.2.amount": "0.02",
    });
    expect(rebuilt.trigger).toEqual({ type: "schedule", cron: "0 18 * * *", timezone: "Europe/London" });
    expect(rebuilt.steps[0].params.integrationId).toBe("int-1");
    expect(rebuilt.steps[2]).toMatchObject({ label: "Top up", params: { amount: "0.02" } });
  });

  it("puts the check's issues on the fields they belong to", () => {
    const form = automationFormFor(DEFINITION);
    const mapped = automationFieldErrors(
      [
        { path: "steps.0.params.address", message: "bad address" },
        { path: "trigger.cron", message: "bad cron" },
        { path: "steps", message: "different steps" },
      ],
      form,
    );
    expect(mapped.byField["steps.0.address"]?.message).toBe("bad address");
    expect(mapped.byField["trigger.cron"]?.message).toBe("bad cron");
    expect(mapped.other).toEqual(["different steps"]);
  });
});

describe("automation tool parts in the chat", () => {
  it("picks the list and describe cards, and the change card's stages", () => {
    expect(
      selectRenderer({ toolName: "list_automations", state: "output-available", output: { ok: true, tool: "list_automations", automations: [] } }).kind,
    ).toBe("automations");
    expect(
      selectRenderer({
        toolName: "get_automation",
        state: "output-available",
        output: { ok: true, tool: "get_automation", automation: { id: "wf-1" }, runs: [], definition: null, notEditable: "branches" },
      }),
    ).toMatchObject({ kind: "automation", notEditable: "branches" });
    expect(
      selectRenderer({ toolName: "create_automation", state: "approval-requested", input: DEFINITION, approval: { id: "ap-1" } }),
    ).toMatchObject({ kind: "write-proposed", toolName: "create_automation", approvalId: "ap-1" });
  });

  it("keeps a proposal the check sent back inside the tools line", () => {
    const returned = {
      type: "tool-create_automation",
      state: "output-available",
      output: { ok: false, tool: "create_automation", error: { code: "validation_failed", message: "fix it" } },
    };
    const refused = { ...returned, output: { ok: false, tool: "create_automation", error: { code: "tool_error", message: "422" } } };
    const waiting = { type: "tool-create_automation", state: "approval-requested", input: DEFINITION };
    expect(showsCard([returned], 0, true)).toBe(false);
    expect(showsCard([refused], 0, true)).toBe(true);
    expect(showsCard([waiting], 0, false)).toBe(true);
  });

  it("titles automation calls in the tools line", () => {
    expect(toolTitle("create_automation", DEFINITION)).toBe('Proposed the automation "Morning balance"');
    expect(toolTitle("set_automation_enabled", { workflowId: "wf-1", enabled: false })).toBe("Proposed turning an automation off");
    expect(toolTitle("list_automations", {})).toBe("Listed automations");
    expect(integrationOf("create_automation", DEFINITION)).toBe("workflow");
    expect(toolTitle("update_automation", { workflowId: "wf-1", ...DEFINITION })).toBe('Proposed changes to "Morning balance"');
    expect(toolTitle("run_automation", { workflowId: "wf-1" })).toBe("Proposed running an automation");
    expect(toolTitle("delete_automation", { workflowId: "wf-1" })).toBe("Proposed deleting an automation");
    expect(integrationOf("run_automation", {})).toBe("workflow");
  });

  it("keeps a change the check sent back inside the tools line too", () => {
    const returned = {
      type: "tool-update_automation",
      state: "output-available",
      output: { ok: false, tool: "update_automation", error: { code: "validation_failed", message: "fix it" } },
    };
    expect(showsCard([returned], 0, true)).toBe(false);
  });
});

describe("changing, running and deleting an existing automation", () => {
  const base = { live: true, resumeErrored: false, submitted: false, edited: false };

  it("frames a change, a run followed to its result, and a delete", () => {
    expect(automationFrame({ ...base, toolName: "update_automation", phase: "executing", approved: true }).meta).toBe("SAVING");
    expect(automationFrame({ ...base, toolName: "update_automation", phase: "receipt" })).toMatchObject({ meta: "SAVED", stamp: { label: "SAVED" } });

    const run = { ...base, toolName: "run_automation", phase: "receipt" as const };
    expect(automationFrame({ ...base, toolName: "run_automation", phase: "executing", approved: true }).meta).toBe("STARTING");
    expect(automationFrame({ ...run, run: "pending" })).toMatchObject({ meta: "RUNNING", tone: "pending" });
    expect(automationFrame({ ...run, run: "receipt" })).toMatchObject({ meta: "EXECUTED", tone: "success", stamp: { label: "EXECUTED" } });
    expect(automationFrame({ ...run, run: "failure" })).toMatchObject({ meta: "FAILED", tone: "destructive", stamp: { label: "VOID", tone: "destructive" } });
    expect(automationFrame({ ...run, run: "stale" }).meta).toBe("STILL RUNNING");
    expect(automationFrame({ ...run, live: false })).toMatchObject({ meta: "STARTED" });
    expect(automationFrame({ ...run, live: false }).stamp).toBeUndefined();

    expect(automationFrame({ ...base, toolName: "delete_automation", phase: "executing", approved: true }).meta).toBe("DELETING");
    expect(automationFrame({ ...base, toolName: "delete_automation", phase: "receipt" })).toMatchObject({ meta: "DELETED", stamp: { label: "DELETED" } });
    expect(automationFrame({ ...base, toolName: "delete_automation", phase: "proposed" }).meta).toBe("AWAITING AUTHORIZATION");
  });

  it("names the card by what happens to the automation", () => {
    expect(automationKicker("update_automation", {})).toBe("Change automation");
    expect(automationKicker("run_automation", {})).toBe("Automation run");
    expect(automationKicker("delete_automation", {})).toBe("Delete automation");
    expect(automationTitle("run_automation", { workflowId: "wf-1" }, "Morning balance")).toBe("Run Morning balance");
    expect(automationTitle("run_automation", { workflowId: "wf-1" }, undefined)).toBe("Run an automation");
    expect(automationTitle("delete_automation", { workflowId: "wf-1" }, "Morning balance")).toBe("Delete Morning balance");
    expect(automationTitle("set_automation_enabled", { workflowId: "wf-1", enabled: false }, "Morning balance")).toBe("Turn off Morning balance");
    expect(automationTitle("update_automation", { workflowId: "wf-1", ...DEFINITION }, "Old name")).toBe("Morning balance");
    expect(["update_automation", "run_automation", "delete_automation"].every(isAutomationChangeTool)).toBe(true);
  });

  it("reads the automation a change acts on, and what would change, from KeeperHub's reading", () => {
    const subject = {
      id: "wf-1",
      name: "Morning balance",
      triggerType: "Schedule",
      status: "live",
      steps: [{ id: "step-1", label: "Check", actionType: "web3/check-balance", network: "84532", enabled: true }],
    };
    expect(readPreview({ ...READY, subject, changes: ["Name: a → b"] })).toEqual({ ...READY, subject, changes: ["Name: a → b"] });
    expect(readPreview({ ...READY, subject: { id: 1 } })).toEqual(READY);
    expect(readTarget({ workflowId: "wf-1" })).toEqual({ workflowId: "wf-1" });
    expect(readTarget({})).toBeNull();
  });
});
