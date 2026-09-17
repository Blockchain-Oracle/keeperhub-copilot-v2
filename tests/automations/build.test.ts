import { describe, expect, it } from "vitest";

import { fromWorkflowGraph, toWorkflowGraph, type AutomationDefinition } from "@/lib/automations/build";
import { orderedSteps, triggerTypeOf } from "@/lib/automations/shape";
import { getOperationEntry } from "@/lib/registry";

const A = `0x${"a".repeat(40)}`;
const B = `0x${"b".repeat(40)}`;

const DAILY_BALANCE: AutomationDefinition = {
  name: "Morning balance",
  description: "Checks the org wallet every weekday",
  trigger: { type: "schedule", cron: "0 9 * * 1-5", timezone: "UTC" },
  steps: [
    { action: "web3/check-balance", params: { network: "84532", address: A } },
    { action: "condition", params: { condition: "{{@step-1:Get Native Token Balance.balance}} < 0.1" } },
    { action: "web3/transfer-funds", label: "Top up", params: { network: "84532", amount: "0.01", recipientAddress: A } },
  ],
};

describe("the chat's automation shape becomes KeeperHub's graph", () => {
  it("builds a trigger node, one node per step and a straight line of edges", () => {
    const graph = toWorkflowGraph(DAILY_BALANCE);
    expect(graph.nodes.map((node) => node.id)).toEqual(["trigger", "step-1", "step-2", "step-3"]);
    expect(graph.nodes[0].data.config).toEqual({ triggerType: "Schedule", scheduleCron: "0 9 * * 1-5", scheduleTimezone: "UTC" });
    expect(graph.nodes[1].data.config).toEqual({ actionType: "web3/check-balance", network: "84532", address: A });
    expect(graph.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ["trigger", "step-1"],
      ["step-1", "step-2"],
      ["step-2", "step-3"],
    ]);
  });

  it("gives every node a distinct position so KeeperHub's editor does not stack them", () => {
    const ys = toWorkflowGraph(DAILY_BALANCE).nodes.map((node) => node.position.y);
    expect(new Set(ys).size).toBe(ys.length);
  });

  it("continues after a condition only on its true edge", () => {
    const graph = toWorkflowGraph(DAILY_BALANCE);
    expect(graph.nodes[2].data.config).toEqual({ actionType: "Condition", condition: DAILY_BALANCE.steps[1].params.condition });
    expect(graph.edges[2].sourceHandle).toBe("true");
    expect(graph.edges[0].sourceHandle).toBeUndefined();
  });

  it("labels a step with its own label, else the action's", () => {
    const graph = toWorkflowGraph(DAILY_BALANCE);
    expect(graph.nodes[1].data.label).toBe(getOperationEntry("web3/check-balance")?.label);
    expect(graph.nodes[2].data.label).toBe("Condition");
    expect(graph.nodes[3].data.label).toBe("Top up");
  });

  it("carries a protocol action's hidden routing settings", () => {
    const hidden = getOperationEntry("aave-v3/supply")?.passthroughDefaults ?? {};
    expect(Object.keys(hidden).length).toBeGreaterThan(0);
    const graph = toWorkflowGraph({
      name: "Supply",
      trigger: { type: "manual" },
      steps: [{ action: "aave-v3/supply", params: { network: "8453", asset: A, amount: "1", onBehalfOf: B } }],
    });
    expect(graph.nodes[1].data.config).toMatchObject({ actionType: "aave-v3/supply", ...hidden, amount: "1" });
  });

  it("writes each start in KeeperHub's words", () => {
    const configOf = (trigger: AutomationDefinition["trigger"]) =>
      toWorkflowGraph({ name: "x", trigger, steps: [DAILY_BALANCE.steps[0]] }).nodes[0].data.config;
    expect(configOf({ type: "manual" })).toEqual({ triggerType: "Manual" });
    expect(configOf({ type: "webhook" })).toEqual({ triggerType: "Webhook" });
    expect(configOf({ type: "schedule", cron: "*/5 * * * *" })).toEqual({
      triggerType: "Schedule",
      scheduleCron: "*/5 * * * *",
      scheduleTimezone: "UTC",
    });
    expect(configOf({ type: "block", network: "8453", every: "10" })).toEqual({ triggerType: "Block", network: "8453", blockInterval: "10" });
    expect(configOf({ type: "event", network: "1", contract: A, event: "Transfer", abi: "[]" })).toEqual({
      triggerType: "Event",
      network: "1",
      contractAddress: A,
      eventName: "Transfer",
      contractABI: "[]",
    });
    expect(configOf({ type: "tempo-payment", network: "42431", token: A, recipient: B, memo: "INV-1" })).toEqual({
      triggerType: "Transfer",
      network: "42431",
      contractAddress: A,
      recipientAddress: B,
      memo: "INV-1",
    });
  });

  it("reads back the same way the Automations pages read a workflow", () => {
    const graph = toWorkflowGraph(DAILY_BALANCE);
    expect(triggerTypeOf(graph.nodes)).toBe("Schedule");
    expect(orderedSteps(graph.nodes, graph.edges).map((step) => step.id)).toEqual(["step-1", "step-2", "step-3"]);
  });
});

describe("a KeeperHub graph back in the chat's shape", () => {
  it("round-trips an automation made here", () => {
    const graph = toWorkflowGraph(DAILY_BALANCE);
    expect(fromWorkflowGraph({ name: DAILY_BALANCE.name, description: DAILY_BALANCE.description, ...graph })).toEqual({
      ok: true,
      definition: DAILY_BALANCE,
    });
  });

  it("drops hidden routing settings so a rebuild adds them fresh", () => {
    const definition: AutomationDefinition = {
      name: "Supply",
      trigger: { type: "manual" },
      steps: [{ action: "aave-v3/supply", params: { network: "8453", asset: A, amount: "1", onBehalfOf: B } }],
    };
    expect(fromWorkflowGraph(toWorkflowGraph(definition))).toMatchObject({ ok: true, definition: { steps: definition.steps } });
  });

  it("renumbers an editor-made automation's steps, and the references between them", () => {
    const graph = toWorkflowGraph(DAILY_BALANCE);
    const ids: Record<string, string> = { trigger: "trg_x", "step-1": "node_a", "step-2": "node_b", "step-3": "node_c" };
    const nodes = graph.nodes.map((node) => ({ ...node, id: ids[node.id] }));
    const edges = graph.edges.map((edge) => ({ ...edge, source: ids[edge.source], target: ids[edge.target] }));
    nodes[2] = {
      ...nodes[2],
      data: { ...nodes[2].data, config: { actionType: "Condition", condition: "{{@node_a:Get Native Token Balance.balance}} < 0.1" } },
    };
    expect(fromWorkflowGraph({ name: DAILY_BALANCE.name, description: DAILY_BALANCE.description, nodes, edges })).toEqual({
      ok: true,
      definition: DAILY_BALANCE,
    });
  });

  it("reads KeeperHub's legacy Scheduled spelling", () => {
    const graph = toWorkflowGraph(DAILY_BALANCE);
    graph.nodes[0].data.config.triggerType = "Scheduled";
    expect(fromWorkflowGraph(graph)).toMatchObject({ ok: true, definition: { trigger: { type: "schedule" } } });
  });

  it("refuses what the chat's shape cannot say", () => {
    const base = () => toWorkflowGraph(DAILY_BALANCE);

    const branching = base();
    branching.edges.push({ id: "x", source: "step-1", target: "step-3" });
    expect(fromWorkflowGraph(branching).ok).toBe(false);

    const falseEdge = base();
    falseEdge.edges.push({ id: "x", source: "step-2", target: "step-1", sourceHandle: "false" });
    expect(fromWorkflowGraph(falseEdge).ok).toBe(false);

    const loop = base();
    loop.edges.push({ id: "x", source: "step-3", target: "step-1" });
    expect(fromWorkflowGraph(loop).ok).toBe(false);

    const switchedOff = base();
    (switchedOff.nodes[1].data as Record<string, unknown>).enabled = false;
    expect(fromWorkflowGraph(switchedOff).ok).toBe(false);

    const unreached = base();
    unreached.edges.pop();
    expect(fromWorkflowGraph(unreached).ok).toBe(false);

    const forEach = base();
    forEach.nodes[1].data.config = { actionType: "For Each" };
    expect(fromWorkflowGraph(forEach).ok).toBe(false);

    const unknownStart = base();
    unknownStart.nodes[0].data.config = { triggerType: "Telepathy" };
    expect(fromWorkflowGraph(unknownStart).ok).toBe(false);
  });
});
