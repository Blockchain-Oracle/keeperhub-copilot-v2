import { describe, expect, it } from "vitest";

import type { AutomationDefinition } from "@/lib/automations/build";
import { abiEventNames, checkAutomationDefinition } from "@/lib/automations/proposal";
import { listOperationEntries } from "@/lib/registry";

const A = `0x${"a".repeat(40)}`;
const TRANSFER_ABI = JSON.stringify([
  { type: "event", name: "Transfer", inputs: [] },
  { type: "function", name: "balanceOf", inputs: [] },
]);

const VALID: AutomationDefinition = {
  name: "Morning balance",
  trigger: { type: "schedule", cron: "0 9 * * 1-5" },
  steps: [{ action: "web3/check-balance", params: { network: "84532", address: A } }],
};

function withStep(step: AutomationDefinition["steps"][number]): AutomationDefinition {
  return { ...VALID, steps: [step] };
}

function issuePaths(input: unknown, options?: { requireAbi?: boolean }): string[] {
  const result = checkAutomationDefinition(input, options);
  return result.ok ? [] : result.issues.map((issue) => issue.path);
}

describe("an automation proposal before it is saved", () => {
  it("passes a well-formed schedule with a real step", () => {
    expect(checkAutomationDefinition(VALID)).toMatchObject({ ok: true, warnings: [] });
  });

  it("refuses a proposal without a name or steps", () => {
    expect(issuePaths({ ...VALID, name: "" })).toContain("name");
    expect(issuePaths({ ...VALID, steps: [] })).toContain("steps");
  });

  it("refuses an action KeeperHub does not have, and system steps other than a condition", () => {
    expect(issuePaths(withStep({ action: "web3/teleport", params: {} }))).toEqual(["steps.0.action"]);
    expect(issuePaths(withStep({ action: "For Each", params: {} }))).toEqual(["steps.0.action"]);
  });

  it("refuses an action the chat cannot run", () => {
    const quarantined = listOperationEntries().find((entry) => entry.kind === "plugin" && entry.effectClass === "quarantined");
    if (quarantined === undefined) return;
    expect(issuePaths(withStep({ action: quarantined.opId, params: {} }))).toContain("steps.0.action");
  });

  it("names a field the action does not have, and a missing required one", () => {
    expect(issuePaths(withStep({ action: "web3/check-balance", params: { network: "84532", address: A, colour: "red" } }))).toEqual([
      "steps.0.params.colour",
    ]);
    const missing = checkAutomationDefinition(withStep({ action: "web3/check-balance", params: { network: "84532" } }));
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.issues[0].path).toBe("steps.0.params.address");
      expect(missing.issues[0].message).toMatch(/required/);
    }
  });

  it("refuses a malformed address but accepts an earlier step's output", () => {
    const transfer = (recipientAddress: string) =>
      ({
        ...VALID,
        steps: [VALID.steps[0], { action: "web3/transfer-funds", params: { network: "84532", amount: "0.01", recipientAddress } }],
      }) satisfies AutomationDefinition;
    expect(issuePaths(transfer("0x123"))).toEqual(["steps.1.params.recipientAddress"]);
    expect(issuePaths(transfer("{{@step-1:Get Native Token Balance.address}}"))).toEqual([]);
  });

  it("refuses a step reading itself or a later step", () => {
    const definition: AutomationDefinition = {
      ...VALID,
      steps: [{ action: "condition", params: { condition: "{{@step-2:Check.balance}} > 0" } }, VALID.steps[0]],
    };
    expect(issuePaths(definition)).toEqual(["steps.0.params"]);
  });

  it("refuses a network the action does not run on", () => {
    const supply = (network: string) =>
      withStep({ action: "aave-v3/supply", params: { network, asset: A, amount: "1", onBehalfOf: A } });
    expect(issuePaths(supply("8453"))).toEqual([]);
    expect(issuePaths(supply("84532"))).toEqual(["steps.0.params.network"]);
  });

  it("needs a condition's check and nothing else", () => {
    expect(issuePaths(withStep({ action: "condition", params: {} }))).toEqual(["steps.0.params.condition"]);
    expect(issuePaths(withStep({ action: "condition", params: { condition: "1 == 1", extra: true } }))).toEqual(["steps.0.params.extra"]);
  });

  it("checks each kind of start", () => {
    const start = (trigger: unknown) => issuePaths({ ...VALID, trigger });
    expect(start({ type: "schedule", cron: "0 9 *" })).toEqual(["trigger.cron"]);
    expect(start({ type: "schedule", cron: "0 9 * * *", timezone: "Mars/Olympus" })).toEqual(["trigger.timezone"]);
    expect(start({ type: "schedule", cron: "0 9 * * *", timezone: "Europe/London" })).toEqual([]);
    expect(start({ type: "block", network: "8453", every: "0" })).toEqual(["trigger.every"]);
    expect(start({ type: "event", network: "1", contract: "0xabc", event: "Transfer" })).toEqual(["trigger.contract"]);
    expect(start({ type: "event", network: "1", contract: A, event: "Approval", abi: TRANSFER_ABI })).toEqual(["trigger.event"]);
    expect(start({ type: "event", network: "1", contract: A, event: "Transfer", abi: TRANSFER_ABI })).toEqual([]);
    expect(start({ type: "tempo-payment", network: "1", token: A, recipient: A })).toEqual(["trigger.network"]);
    expect(start({ type: "tempo-payment", network: "42431", token: A, recipient: A })).toEqual([]);
    expect(start({ type: "telepathy" })).toEqual(["trigger.type"]);
  });

  it("asks for an event's ABI only once the server has tried to fetch it", () => {
    const event = { ...VALID, trigger: { type: "event", network: "1", contract: A, event: "Transfer" } };
    expect(issuePaths(event)).toEqual([]);
    expect(issuePaths(event, { requireAbi: true })).toEqual(["trigger.abi"]);
  });

  it("warns, without blocking, about a webhook key and a missing connection", () => {
    expect(checkAutomationDefinition({ ...VALID, trigger: { type: "webhook" } })).toMatchObject({
      ok: true,
      warnings: [{ path: "trigger" }],
    });
    const needsConnection = listOperationEntries().find(
      (entry) =>
        entry.kind === "plugin" &&
        entry.needsCredential &&
        entry.credentialIntegrationType !== undefined &&
        entry.credentialIntegrationType !== "web3" &&
        entry.effectClass !== "quarantined",
    );
    expect(needsConnection).toBeDefined();
    const result = checkAutomationDefinition(withStep({ action: needsConnection?.opId ?? "", params: {} }));
    expect(result.warnings.map((warning) => warning.path)).toContain("steps.0");
  });
});

describe("reading a contract ABI's events", () => {
  it("lists event names, or null when it is not a JSON list", () => {
    expect(abiEventNames(TRANSFER_ABI)).toEqual(["Transfer"]);
    expect(abiEventNames("{}")).toBeNull();
    expect(abiEventNames("not json")).toBeNull();
  });
});
