import { describe, expect, it } from "vitest";

import { detailInput, detailOutput, integrationOf, toolTitle } from "@/components/cards/tool-meta";

describe("integrationOf", () => {
  it("names the catalog, a protocol's integration, or web3 for the chain verbs", () => {
    expect(integrationOf("search_actions", { query: "aave" })).toBe("search");
    expect(integrationOf("execute_protocol_action", { actionType: "chainlink/eth-usd-latest-round-data" })).toBe(
      "chainlink",
    );
    expect(integrationOf("execute_transfer", { chain_id: "84532" })).toBe("web3");
  });
});

describe("toolTitle", () => {
  it("uses the registry label for a protocol action", () => {
    expect(toolTitle("execute_protocol_action", { actionType: "chainlink/eth-usd-latest-round-data" })).toBe(
      "Chainlink: Get ETH/USD Latest Round Data",
    );
  });

  it("describes a lookup by its query", () => {
    expect(toolTitle("search_actions", { query: " aave " })).toBe('Looked up actions for "aave"');
    expect(toolTitle("search_actions", {})).toBe("Looked up actions");
  });
});

describe("detailInput", () => {
  it("shows a protocol action's parameters but not its alternatives", () => {
    expect(
      detailInput("execute_protocol_action", {
        actionType: "chainlink/eth-usd-latest-round-data",
        params: { network: "1" },
        alternatives: [{ actionType: "chainlink/btc-usd-latest-round-data" }],
      }),
    ).toEqual([
      ["action", "chainlink/eth-usd-latest-round-data"],
      ["network", "1"],
    ]);
  });
});

describe("detailOutput", () => {
  it("lists a lookup's matches", () => {
    expect(
      detailOutput("search_actions", {
        ok: true,
        tool: "search_actions",
        result: { matches: [{ opId: "aave-v3/supply", label: "Supply" }] },
      }),
    ).toEqual([["aave-v3/supply", "Supply"]]);
  });

  it("gives the reason for a failure", () => {
    expect(detailOutput("execute_protocol_action", { ok: false, error: { message: "Reverted." } })).toEqual([
      ["error", "Reverted."],
    ]);
    expect(detailOutput("execute_protocol_action", undefined, "Stream failed.")).toEqual([["error", "Stream failed."]]);
  });

  it("shows a read's named outputs", () => {
    expect(
      detailOutput("execute_protocol_action", { ok: true, data: { success: true, result: { answer: "1" } } }),
    ).toEqual([["answer", "1"]]);
  });
});
