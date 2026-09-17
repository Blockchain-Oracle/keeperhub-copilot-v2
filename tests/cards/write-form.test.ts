import { describe, expect, it } from "vitest";

import { canonicalJSON } from "@/lib/canonical-json";
import { authorizeLabel, docNumber, dryRunFacts, requestRows, writeView } from "@/components/cards/write-card";
import { buildEditedWrite, fieldErrorsFrom, writeFormFor } from "@/components/cards/write-form";

const RECIPIENT = `0x${"a".repeat(40)}`;
const SPENDER = `0x${"c".repeat(40)}`;

describe("document number", () => {
  const transfer = { chain_id: "84532", to_address: RECIPIENT, amount: "0.1" };

  it("reads KH·XXXX·XXXX and is the same for the same instruction in any key order", () => {
    const doc = docNumber("execute_transfer", transfer);
    expect(doc).toMatch(/^KH·[0-9A-F]{4}·[0-9A-F]{4}$/);
    expect(docNumber("execute_transfer", { amount: "0.1", to_address: RECIPIENT, chain_id: "84532" })).toBe(doc);
  });

  it("changes with any edit and with the tool", () => {
    const doc = docNumber("execute_transfer", transfer);
    expect(docNumber("execute_transfer", { ...transfer, amount: "0.2" })).not.toBe(doc);
    expect(docNumber("execute_contract_call", transfer)).not.toBe(doc);
  });
});

describe("transfer form", () => {
  const input = { chain_id: "84532", to_address: RECIPIENT, amount: "0.1" };
  const form = writeFormFor("execute_transfer", input);

  it("offers amount, recipient, network and token, seeded from the proposal", () => {
    expect(form?.fields.map((field) => field.key)).toEqual(["amount", "to_address", "chain_id", "token_address"]);
    expect(form?.seed).toEqual({ amount: "0.1", to_address: RECIPIENT, chain_id: "84532", token_address: "" });
  });

  it("builds the edited transfer, trimming values and dropping an empty token", () => {
    const next = buildEditedWrite("execute_transfer", input, form!, {
      amount: " 2 ",
      to_address: RECIPIENT,
      chain_id: "1",
      token_address: "",
    });
    expect(next).toEqual({ chain_id: "1", to_address: RECIPIENT, amount: "2" });
  });
});

describe("contract call forms", () => {
  const approve = {
    chain_id: "1",
    contract_address: `0x${"d".repeat(40)}`,
    function_name: "approve",
    function_args: JSON.stringify([SPENDER, "1000"]),
    stateMutability: "nonpayable",
  };

  it("edits an approve's spender and allowance and keeps the rest of the call", () => {
    const form = writeFormFor("execute_contract_call", approve)!;
    expect(form.seed).toEqual({ spender: SPENDER, allowance: "1000" });
    const next = buildEditedWrite("execute_contract_call", approve, form, { spender: SPENDER, allowance: "5" });
    expect(next).toEqual({ ...approve, function_args: JSON.stringify([SPENDER, "5"]) });
  });

  it("puts an argument-list problem on the spender row of an approve", () => {
    const form = writeFormFor("execute_contract_call", approve)!;
    const mapped = fieldErrorsFrom([{ path: "function_args", message: "bad" }, { path: "abi", message: "fixed" }], form);
    expect(mapped.byField).toEqual({ spender: { message: "bad" } });
    expect(mapped.other).toEqual(["fixed"]);
  });

  it("offers the value only on a payable call and removes a cleared one", () => {
    const call = { ...approve, function_name: "deposit", function_args: "[]", stateMutability: "payable", value: "1" };
    const form = writeFormFor("execute_contract_call", call)!;
    expect(form.fields.map((field) => field.key)).toEqual(["function_args", "value"]);
    expect(writeFormFor("execute_contract_call", { ...call, stateMutability: "nonpayable" })!.fields).toHaveLength(1);
    const next = buildEditedWrite("execute_contract_call", call, form, { function_args: "[]", value: "" });
    expect(next).not.toHaveProperty("value");
    expect(next.contract_address).toBe(call.contract_address);
  });

  it("has nothing to edit for an unknown verb or a malformed proposal", () => {
    expect(writeFormFor("search_actions", {})).toBeNull();
    expect(writeFormFor("execute_transfer", null)).toBeNull();
  });
});

describe("protocol action form", () => {
  const input = { actionType: "lido/wrap", params: { network: "1", _stETHAmount: "1000", _protocolMeta: "{}" } };

  it("takes the action's own fields and keeps the parameters it has no field for", () => {
    const form = writeFormFor("execute_protocol_action", input)!;
    expect(form.fields.map((field) => field.key)).toEqual(["network", "_stETHAmount", "gasLimitMultiplier"]);
    const next = buildEditedWrite("execute_protocol_action", input, form, { ...form.seed, _stETHAmount: "7" });
    expect(next).toEqual({ actionType: "lido/wrap", params: { _protocolMeta: "{}", network: "1", _stETHAmount: "7" } });
  });

  it("shows an underscore-named field as a row but never a hidden setting", () => {
    const rows = requestRows("execute_protocol_action", input, new Set(["network", "_stETHAmount", "gasLimitMultiplier"]));
    expect(rows.map((row) => row.key)).toEqual(["network", "_stETHAmount"]);
    expect(requestRows("execute_protocol_action", input).map((row) => row.key)).toEqual(["network"]);
  });

  it("puts a parameter issue on its field", () => {
    const form = writeFormFor("execute_protocol_action", input)!;
    expect(fieldErrorsFrom([{ path: "params._stETHAmount", message: "whole number" }], form).byField).toEqual({
      _stETHAmount: { message: "whole number" },
    });
  });
});

describe("dry run facts", () => {
  it("shows KeeperHub's gas estimate grouped, and a return value when there is one", () => {
    expect(dryRunFacts({ gasEstimate: "21000", simulatedReturnValue: null })).toEqual([
      { label: "Gas estimate", value: "21,000 units" },
    ]);
    expect(dryRunFacts({ gasEstimate: "46000", simulatedReturnValue: "0x01" })).toHaveLength(2);
  });

  it("shows nothing for a shape it does not know", () => {
    expect(dryRunFacts(null)).toEqual([]);
    expect(dryRunFacts({ gasEstimate: 21000 })).toEqual([]);
  });
});

describe("card stages", () => {
  const base = { live: true, resumeErrored: false, unavailable: false, needsCredential: false, submitted: false, edited: false };

  it("names each stage in the meta slot", () => {
    expect(writeView({ ...base, phase: "proposed" }).meta).toBe("AWAITING AUTHORIZATION");
    expect(writeView({ ...base, phase: "proposed", edited: true }).meta).toBe("EDITED");
    expect(writeView({ ...base, phase: "executing" }).meta).toBe("SENDING");
    expect(writeView({ ...base, phase: "executing", resumeErrored: true }).meta).toBe("NOT SENT");
    expect(writeView({ ...base, phase: "receipt" })).toMatchObject({ tone: "success", meta: "EXECUTED" });
    expect(writeView({ ...base, phase: "declined" }).meta).toBe("CANCELLED");
  });

  it("reads a cancel on its way through as cancelling, never sending", () => {
    expect(writeView({ ...base, phase: "executing", approved: false })).toMatchObject({ meta: "CANCELLING" });
    expect(writeView({ ...base, phase: "executing", approved: true }).meta).toBe("SENDING");
  });

  it("never claims a read-only card is waiting or sending", () => {
    expect(writeView({ ...base, live: false, phase: "proposed" }).meta).toBe("NEVER AUTHORIZED");
    expect(writeView({ ...base, live: false, phase: "executing" }).meta).toBe("NO RECEIPT");
  });
});

describe("authorize button", () => {
  const ready = {
    submitted: false,
    unavailable: false,
    needsCredential: false,
    simulatable: true,
    preview: "simulated" as const,
    needsAck: false,
    acknowledged: false,
  };

  it("names what it waits for, ending on Authorize", () => {
    expect(authorizeLabel({ ...ready, preview: "loading" })).toBe("Running dry run…");
    expect(authorizeLabel({ ...ready, preview: "error" })).toBe("Dry run failed");
    expect(authorizeLabel({ ...ready, needsAck: true })).toBe("Acknowledge the warning");
    expect(authorizeLabel({ ...ready, needsAck: true, acknowledged: true })).toBe("Authorize");
    expect(authorizeLabel({ ...ready, simulatable: false, preview: "loading" })).toBe("Authorize");
    expect(authorizeLabel({ ...ready, submitted: true })).toBe("Authorizing…");
  });
});

describe("canonical JSON", () => {
  it("sorts keys at every depth", () => {
    expect(canonicalJSON({ b: 1, a: { d: [2, { f: 1, e: 0 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"e":0,"f":1}]},"b":1}');
  });
});
