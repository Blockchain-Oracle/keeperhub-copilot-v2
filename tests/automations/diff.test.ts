import { describe, expect, it } from "vitest";

import type { AutomationDefinition } from "@/lib/automations/build";
import { describeChanges } from "@/lib/automations/diff";
import { getOperationEntry } from "@/lib/registry";

const A = `0x${"a".repeat(40)}`;

const BALANCE: AutomationDefinition = {
  name: "Morning balance",
  trigger: { type: "schedule", cron: "0 9 * * 1-5" },
  steps: [
    { action: "web3/check-balance", params: { network: "84532", address: A } },
    { action: "condition", params: { condition: "{{@step-1:Get Native Token Balance.balance}} < 0.1" } },
    { action: "web3/transfer-funds", label: "Top up", params: { network: "84532", amount: "0.01", recipientAddress: A } },
  ],
};

describe("what changing an automation would change", () => {
  it("says nothing when nothing changes, reading an unset timezone as UTC", () => {
    expect(describeChanges(BALANCE, { ...BALANCE, trigger: { type: "schedule", cron: "0 9 * * 1-5", timezone: "UTC" } })).toEqual([]);
  });

  it("names each change, old value to new", () => {
    const after: AutomationDefinition = {
      ...BALANCE,
      name: "Weekday balance",
      trigger: { type: "schedule", cron: "0 10 * * 1-5", timezone: "Europe/London" },
      steps: [
        BALANCE.steps[0],
        { action: "condition", label: "Low", params: { condition: "{{@step-1:Get Native Token Balance.balance}} < 0.2" } },
        { ...BALANCE.steps[2], params: { ...BALANCE.steps[2].params, amount: "0.02" } },
      ],
    };
    const amount = getOperationEntry("web3/transfer-funds")?.fields.find((field) => field.key === "amount")?.label;
    expect(describeChanges(BALANCE, after)).toEqual([
      "Name: Morning balance → Weekday balance",
      "Schedule: 0 9 * * 1-5 → 0 10 * * 1-5",
      "Timezone: UTC → Europe/London",
      "Step 2 renamed: Condition → Low",
      "Step 2 · Continues when: {{@step-1:Get Native Token Balance.balance}} < 0.1 → {{@step-1:Get Native Token Balance.balance}} < 0.2",
      `Step 3 · ${amount}: 0.01 → 0.02`,
    ]);
  });

  it("reports a different start, and steps added, removed or replaced, as a whole", () => {
    expect(describeChanges(BALANCE, { ...BALANCE, trigger: { type: "manual" } })).toEqual(["Starts: On a schedule → On demand"]);
    expect(describeChanges(BALANCE, { ...BALANCE, steps: BALANCE.steps.slice(0, 2) })).toEqual(["Step 3 removed: Top up"]);
    expect(describeChanges({ ...BALANCE, steps: BALANCE.steps.slice(0, 2) }, BALANCE)).toEqual(["Step 3 added: Top up"]);
    expect(describeChanges(BALANCE, { ...BALANCE, steps: [BALANCE.steps[0], BALANCE.steps[2], BALANCE.steps[1]] })).toEqual([
      "Step 2 replaced: Condition → Top up",
      "Step 3 replaced: Top up → Condition",
    ]);
  });

  it("shortens long values and says when one was empty", () => {
    const [line] = describeChanges(BALANCE, { ...BALANCE, description: "x".repeat(80) });
    expect(line).toMatch(/^Description: empty → x+…$/);
    expect(line.length).toBeLessThan(80);
  });
});
