import { describe, expect, it } from "vitest";

import { getOperationEntry, listOperationEntries, runsDirectly } from "@/lib/registry";
import { AUTOMATION_ONLY_NOTE, searchActions } from "@/lib/registry/surface-tools";

/*
 * Decision 35: KeeperHub's execute route runs an action on its own only when it
 * is a registered protocol's contract action (fork
 * app/api/execute/[...slug]/route.ts:432-458). Every other step answers 501
 * "Direct execution not supported" and runs only inside an automation.
 */
describe("runsDirectly", () => {
  it("is exactly the protocol contract actions: 394 of 442", () => {
    const all = listOperationEntries();
    expect(all).toHaveLength(442);
    expect(all.filter(runsDirectly)).toHaveLength(394);
    for (const entry of all.filter(runsDirectly)) expect(entry.protocolType).toBeDefined();
  });

  it("rules out the web3 steps, off-chain sends and system nodes", () => {
    for (const opId of ["web3/check-balance", "web3/transfer-token", "slack/send-message", "safe/get-pending-transactions"]) {
      const entry = getOperationEntry(opId);
      expect(entry, opId).toBeDefined();
      expect(runsDirectly(entry!), opId).toBe(false);
    }
    expect(runsDirectly(getOperationEntry("aave-v3/supply")!)).toBe(true);
    expect(runsDirectly(getOperationEntry("chronicle/eth-usd-read")!)).toBe(true);
  });
});

describe("search_actions marks automation-only actions", () => {
  it("lists web3/check-balance as not executable, with the routes that do work", () => {
    const match = searchActions({ query: "check balance", integration: "web3" }).matches.find(
      (m) => m.opId === "web3/check-balance",
    );
    expect(match).toBeDefined();
    expect(match?.executable).toBe(false);
    expect(match?.note).toBe(AUTOMATION_ONLY_NOTE);
    expect(match?.note).toContain("get_org_wallet_balances");
  });

  it("keeps protocol actions executable with no note", () => {
    const match = searchActions({ query: "eth usd", integration: "chronicle" }).matches[0];
    expect(match?.executable).toBe(true);
    expect(match?.note).toBeUndefined();
  });
});
