import { describe, expect, it } from "vitest";

import {
  activityIntegration,
  activityLabel,
  activityNetwork,
  historySubtitle,
  outcomeOf,
  parseLedgerKind,
} from "@/lib/activity";

describe("activity filter (decision 17)", () => {
  it("reads actions, reads or all, defaulting to all and refusing anything else", () => {
    expect(parseLedgerKind("actions")).toBe("actions");
    expect(parseLedgerKind("reads")).toBe("reads");
    expect(parseLedgerKind(null)).toBe("all");
    expect(parseLedgerKind("writes")).toBeUndefined();
  });
});

describe("a ledger row's name, mark and network", () => {
  it("names the chain verbs plainly and registry actions by their label", () => {
    expect(activityLabel("execute_transfer")).toBe("Send");
    expect(activityLabel("workflow/run")).toBe("Automation run");
    expect(activityLabel("lido/wrap")).toBe("Lido: Wrap stETH to wstETH");
    expect(activityLabel("gone/action")).toBe("gone/action");
  });

  it("wears the registry integration's mark, else the web3 one", () => {
    expect(activityIntegration("lido/wrap")).toBe("lido");
    expect(activityIntegration("execute_contract_call")).toBe("web3");
    expect(activityIntegration("workflow/update")).toBe("workflow");
  });

  it("names automation changes plainly", () => {
    expect(activityLabel("workflow/create")).toBe("New automation");
    expect(activityLabel("workflow/update")).toBe("Automation changed");
    expect(activityLabel("workflow/enable")).toBe("Automation turned on");
    expect(activityLabel("workflow/disable")).toBe("Automation turned off");
    expect(activityLabel("workflow/delete")).toBe("Automation deleted");
  });

  it("finds the network in a verb's chain_id or a protocol action's network", () => {
    expect(activityNetwork({ chain_id: "84532", amount: "0" })).toBe("84532");
    expect(activityNetwork({ network: "1", _stETHAmount: "1" })).toBe("1");
    expect(activityNetwork({ actionType: "lido/wrap", params: { network: "8453" } })).toBe("8453");
    expect(activityNetwork({ amount: "1" })).toBeNull();
    expect(activityNetwork(null)).toBeNull();
  });
});

describe("outcomes in the card's words", () => {
  it("maps each ledger state", () => {
    expect(outcomeOf("receipt")).toEqual({ label: "Executed", tone: "success" });
    expect(outcomeOf("failure").tone).toBe("destructive");
    expect(outcomeOf("declined").label).toBe("Cancelled");
    expect(outcomeOf("intent")).toEqual({ label: "Sending", tone: "pending" });
    expect(outcomeOf("read").label).toBe("Read");
  });

  it("says how an automation change ended in its own words", () => {
    expect(outcomeOf("receipt", "workflow/create")).toEqual({ label: "Saved", tone: "success" });
    expect(outcomeOf("receipt", "workflow/disable").label).toBe("Off");
    expect(outcomeOf("receipt", "workflow/delete").label).toBe("Deleted");
    expect(outcomeOf("intent", "workflow/run")).toEqual({ label: "Running", tone: "pending" });
    expect(outcomeOf("failure", "workflow/update").label).toBe("Failed");
    expect(outcomeOf("receipt", "execute_transfer").label).toBe("Executed");
  });
});

describe("History subtitle", () => {
  it("counts conversations and their executed actions", () => {
    expect(historySubtitle([{ executed: 2 }, { executed: 0 }])).toBe("2 conversations · 2 executed actions");
    expect(historySubtitle([{ executed: 1 }])).toBe("1 conversation · 1 executed action");
    expect(historySubtitle([])).toBe("Your conversations, and what each one executed.");
  });
});
