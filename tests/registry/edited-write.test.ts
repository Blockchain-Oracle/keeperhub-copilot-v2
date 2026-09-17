import { describe, expect, it } from "vitest";

import { checkEditedWrite } from "@/lib/registry/edited-write";

const A = `0x${"a".repeat(40)}`;
const B = `0x${"b".repeat(40)}`;

function paths(result: ReturnType<typeof checkEditedWrite>): string[] {
  return result.ok ? [] : result.issues.map((issue) => issue.path);
}

describe("decision 11: a transfer edits everything but the verb", () => {
  const original = { chain_id: "11155111", to_address: A, amount: "0.1" };

  it("accepts a new amount, recipient, network and token", () => {
    expect(checkEditedWrite("execute_transfer", original, { ...original, amount: "45" }).ok).toBe(true);
    expect(checkEditedWrite("execute_transfer", original, { chain_id: "84532", to_address: B, amount: "0" }).ok).toBe(true);
    expect(checkEditedWrite("execute_transfer", original, { ...original, token_address: B }).ok).toBe(true);
  });

  it("refuses an amount that is not a plain decimal", () => {
    for (const amount of ["", "-1", "1e3", "0x10", "1.2.3"]) {
      expect(paths(checkEditedWrite("execute_transfer", original, { ...original, amount }))).toContain("amount");
    }
  });

  it("refuses an address that does not fit the network", () => {
    expect(paths(checkEditedWrite("execute_transfer", original, { ...original, to_address: "0xEVIL" }))).toEqual(["to_address"]);
    expect(paths(checkEditedWrite("execute_transfer", original, { ...original, chain_id: "101" }))).toEqual(["to_address"]);
    expect(
      checkEditedWrite("execute_transfer", original, {
        chain_id: "101",
        to_address: "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV",
        amount: "1",
      }).ok,
    ).toBe(true);
  });

  it("refuses a missing field through the tool's own schema", () => {
    expect(paths(checkEditedWrite("execute_transfer", original, { chain_id: "1", amount: "1" }))).toContain("to_address");
  });
});

describe("a contract call keeps its contract, network, function and mutability", () => {
  const original = {
    chain_id: "1",
    contract_address: A,
    function_name: "deposit",
    function_args: "[]",
    stateMutability: "payable",
    value: "0.1",
  };

  it("accepts new arguments and value", () => {
    expect(checkEditedWrite("execute_contract_call", original, { ...original, function_args: '["1"]', value: "2" }).ok).toBe(true);
  });

  it("refuses a change to what is being called", () => {
    for (const change of [{ contract_address: B }, { chain_id: "8453" }, { function_name: "withdraw" }, { stateMutability: "view" }]) {
      expect(checkEditedWrite("execute_contract_call", original, { ...original, ...change }).ok).toBe(false);
    }
  });

  it("refuses arguments that are not a JSON list", () => {
    expect(paths(checkEditedWrite("execute_contract_call", original, { ...original, function_args: "{}" }))).toEqual(["function_args"]);
  });

  it("checks an approve's spender and allowance", () => {
    const approve = { ...original, function_name: "approve", stateMutability: "nonpayable", function_args: JSON.stringify([A, "1000"]) };
    expect(checkEditedWrite("execute_contract_call", approve, { ...approve, function_args: JSON.stringify([B, "5"]) }).ok).toBe(true);
    expect(paths(checkEditedWrite("execute_contract_call", approve, { ...approve, function_args: JSON.stringify(["0xEVIL", "5"]) }))).toEqual([
      "spender",
    ]);
    expect(paths(checkEditedWrite("execute_contract_call", approve, { ...approve, function_args: JSON.stringify([A, "1.5"]) }))).toEqual([
      "allowance",
    ]);
  });
});

describe("a protocol action keeps its action and hidden settings", () => {
  const original = {
    actionType: "lido/wrap",
    params: { network: "1", _stETHAmount: "1000", _protocolMeta: "{}" },
  };

  it("accepts edits to its fields, an underscore-named field included", () => {
    const edited = { ...original, params: { ...original.params, network: "8453", _stETHAmount: "2000" } };
    expect(checkEditedWrite("execute_protocol_action", original, edited).ok).toBe(true);
  });

  it("refuses a different action, a changed hidden setting, or a field its schema rejects", () => {
    expect(checkEditedWrite("execute_protocol_action", original, { ...original, actionType: "lido/unwrap" }).ok).toBe(false);
    expect(
      paths(checkEditedWrite("execute_protocol_action", original, { ...original, params: { ...original.params, _protocolMeta: "x" } })),
    ).toEqual(["params._protocolMeta"]);
    expect(
      checkEditedWrite("execute_protocol_action", original, { ...original, params: { ...original.params, _stETHAmount: "1.5" } }).ok,
    ).toBe(false);
  });

  it("refuses any other tool and anything that is not a proposal", () => {
    expect(checkEditedWrite("search_actions", {}, {}).ok).toBe(false);
    expect(checkEditedWrite("execute_transfer", null, {}).ok).toBe(false);
  });
});

describe("an automation proposal keeps its kind of start and its steps", () => {
  const original = {
    name: "Morning balance",
    trigger: { type: "schedule", cron: "0 9 * * 1-5" },
    steps: [{ action: "web3/check-balance", params: { network: "84532", address: A } }],
  };

  it("accepts a new name, schedule and step fields", () => {
    const edited = {
      ...original,
      name: "Evening balance",
      trigger: { type: "schedule", cron: "0 18 * * *", timezone: "Europe/London" },
      steps: [{ action: "web3/check-balance", params: { network: "8453", address: B } }],
    };
    expect(checkEditedWrite("create_automation", original, edited).ok).toBe(true);
  });

  it("refuses a different kind of start, different steps, or an edit the proposal check rejects", () => {
    expect(paths(checkEditedWrite("create_automation", original, { ...original, trigger: { type: "manual" } }))).toEqual(["trigger.type"]);
    expect(
      paths(
        checkEditedWrite("create_automation", original, {
          ...original,
          steps: [{ action: "condition", params: { condition: "1 == 1" } }],
        }),
      ),
    ).toContain("steps");
    expect(
      paths(checkEditedWrite("create_automation", original, { ...original, steps: [{ ...original.steps[0], params: { network: "84532", address: "0x1" } }] })),
    ).toEqual(["steps.0.params.address"]);
  });

  it("keeps which automation a change is for", () => {
    const change = { workflowId: "wf-1", ...original };
    expect(checkEditedWrite("update_automation", change, { ...change, name: "Evening balance" }).ok).toBe(true);
    expect(paths(checkEditedWrite("update_automation", change, { ...change, workflowId: "wf-2" }))).toEqual(["workflowId"]);
    expect(paths(checkEditedWrite("update_automation", change, original))).toEqual(["workflowId"]);
    expect(paths(checkEditedWrite("update_automation", change, { ...change, trigger: { type: "manual" } }))).toEqual(["trigger.type"]);
  });
});
