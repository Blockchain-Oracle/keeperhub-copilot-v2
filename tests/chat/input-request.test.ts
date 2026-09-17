import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
  checkInputAnswer,
  fieldSpecFor,
  findOpenForm,
  readInputAnswer,
  readInputRequest,
  requestInputSchema,
  withFormAnswer,
  type InputRequest,
} from "@/lib/chat/input-request";

/* Form cards (decisions 32–33): what the model may ask for, and the only answers that reach it. */

const EVM = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const SOL = "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV";

const SEND: InputRequest = {
  title: "Send ETH",
  fields: [
    { key: "recipient", kind: "address", label: "Recipient address" },
    { key: "amount", kind: "amount", label: "Amount", unit: "ETH" },
    { key: "network", kind: "network", label: "Network" },
    { key: "memo", kind: "text", label: "Note", required: false },
  ],
};

describe("the request_input schema", () => {
  it("takes one to six fields with their own keys, and a choice with options", () => {
    expect(readInputRequest(SEND)).toEqual(SEND);
    expect(readInputRequest({ fields: [] })).toBeNull();
    expect(readInputRequest({ fields: Array.from({ length: 7 }, (_, i) => ({ key: `f${i}`, kind: "text", label: "x" })) })).toBeNull();
    expect(
      readInputRequest({ fields: [{ key: "a", kind: "text", label: "A" }, { key: "a", kind: "amount", label: "B" }] }),
    ).toBeNull();
    expect(readInputRequest({ fields: [{ key: "pick", kind: "choice", label: "Pick" }] })).toBeNull();
    expect(readInputRequest({ fields: [{ key: "bad key", kind: "text", label: "A" }] })).toBeNull();
    expect(readInputRequest({ fields: [{ key: "a", kind: "widget", label: "A" }] })).toBeNull();
  });

  it("maps each kind to a card control, never a raw widget from the model", () => {
    const types = SEND.fields.map((field) => fieldSpecFor(field).type);
    expect(types).toEqual(["protocol-address", "protocol-eth-value", "chain-select", "text"]);
    expect(fieldSpecFor({ key: "c", kind: "choice", label: "C", options: [{ value: "a", label: "A" }] }).type).toBe("select");
    expect(fieldSpecFor({ key: "t", kind: "token", label: "T" }).type).toBe("text");
    expect(fieldSpecFor(SEND.fields[3]).required).toBe(false);
    expect(fieldSpecFor(SEND.fields[0]).required).toBe(true);
  });

  it("projects to JSON schema for voice", () => {
    const schema = JSON.stringify(requestInputSchema.toJSONSchema());
    expect(schema).toContain("address");
  });
});

describe("checkInputAnswer", () => {
  it("accepts a filled form, trimmed, leaving out an empty optional field", () => {
    const checked = checkInputAnswer(SEND, { values: { recipient: ` ${EVM} `, amount: "0.01", network: "84532", memo: "" } });
    expect(checked).toEqual({ ok: true, answer: { values: { recipient: EVM, amount: "0.01", network: "84532" } } });
  });

  it("names every missing required field", () => {
    const checked = checkInputAnswer(SEND, { values: { recipient: EVM } });
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.issues.map((issue) => issue.path)).toEqual(["amount", "network"]);
  });

  it("refuses a detail that wasn't asked for, a non-string, and an unreadable answer", () => {
    expect(checkInputAnswer(SEND, { values: { recipient: EVM, amount: "1", network: "1", extra: "x" } }).ok).toBe(false);
    expect(checkInputAnswer(SEND, { values: { recipient: EVM, amount: 1, network: "1" } }).ok).toBe(false);
    expect(checkInputAnswer(SEND, { values: { recipient: EVM, amount: "1", network: "1" }, sneaky: true }).ok).toBe(false);
    expect(checkInputAnswer(SEND, "yes").ok).toBe(false);
    expect(checkInputAnswer(SEND, null).ok).toBe(false);
  });

  it("checks amounts as plain decimals", () => {
    for (const amount of ["1", "0.5", "12.000001"]) {
      expect(checkInputAnswer(SEND, { values: { recipient: EVM, amount, network: "1" } }).ok, amount).toBe(true);
    }
    for (const amount of ["-1", "1e3", "0x10", "1,000", ".5", "abc"]) {
      expect(checkInputAnswer(SEND, { values: { recipient: EVM, amount, network: "1" } }).ok, amount).toBe(false);
    }
  });

  it("checks an address for the network the form names", () => {
    expect(checkInputAnswer(SEND, { values: { recipient: SOL, amount: "1", network: "84532" } }).ok).toBe(false);
    expect(checkInputAnswer(SEND, { values: { recipient: "0x123", amount: "1", network: "84532" } }).ok).toBe(false);
    const solana: InputRequest = { fields: [{ key: "to", kind: "address", label: "To", network: "solana-devnet" }] };
    expect(checkInputAnswer(solana, { values: { to: SOL } }).ok).toBe(true);
    expect(checkInputAnswer(solana, { values: { to: EVM } }).ok).toBe(false);
    const anyNetwork: InputRequest = { fields: [{ key: "to", kind: "address", label: "To" }] };
    expect(checkInputAnswer(anyNetwork, { values: { to: EVM } }).ok).toBe(true);
    expect(checkInputAnswer(anyNetwork, { values: { to: SOL } }).ok).toBe(true);
  });

  it("keeps a choice or listed token within its options, and a free token to a symbol or address", () => {
    const form: InputRequest = {
      fields: [
        { key: "speed", kind: "choice", label: "Speed", options: [{ value: "fast", label: "Fast" }] },
        { key: "token", kind: "token", label: "Token" },
      ],
    };
    expect(checkInputAnswer(form, { values: { speed: "fast", token: "USDC" } }).ok).toBe(true);
    expect(checkInputAnswer(form, { values: { speed: "fast", token: EVM } }).ok).toBe(true);
    expect(checkInputAnswer(form, { values: { speed: "slow", token: "USDC" } }).ok).toBe(false);
    expect(checkInputAnswer(form, { values: { speed: "fast", token: "not a token!" } }).ok).toBe(false);
  });

  it("takes a closed form only as exactly that", () => {
    expect(checkInputAnswer(SEND, { cancelled: true })).toEqual({ ok: true, answer: { cancelled: true } });
    expect(checkInputAnswer(SEND, { cancelled: true, values: { recipient: EVM } }).ok).toBe(false);
  });

  it("caps free text", () => {
    const form: InputRequest = { fields: [{ key: "note", kind: "text", label: "Note" }] };
    expect(checkInputAnswer(form, { values: { note: "x".repeat(501) } }).ok).toBe(false);
  });
});

describe("the stored form", () => {
  const transcript = [
    { id: "u1", role: "user", parts: [{ type: "text", text: "send some eth" }] },
    {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        { type: "tool-request_input", toolCallId: "form-1", state: "input-available", input: SEND },
      ],
    },
  ] as unknown as UIMessage[];

  it("finds the open form by its call id, and nothing once answered or unknown", () => {
    expect(findOpenForm(transcript, "form-1")).toEqual({ message: transcript[1], input: SEND });
    expect(findOpenForm(transcript, "nope")).toBeNull();
    const answered = withFormAnswer(transcript, "form-1", { cancelled: true })!;
    expect(findOpenForm(answered, "form-1")).toBeNull();
  });

  it("answers only that form's part, leaving the rest untouched", () => {
    const answered = withFormAnswer(transcript, "form-1", { values: { recipient: EVM } })!;
    expect(answered[0]).toBe(transcript[0]);
    expect(answered[1].parts[0]).toBe(transcript[1].parts[0]);
    expect(answered[1].parts[1]).toMatchObject({ state: "output-available", output: { values: { recipient: EVM } }, input: SEND });
    expect(withFormAnswer(answered, "form-1", { cancelled: true })).toBeNull();
  });

  it("reads an answer back", () => {
    expect(readInputAnswer({ values: { a: "1", b: 2 } })).toEqual({ values: { a: "1" } });
    expect(readInputAnswer({ cancelled: true })).toEqual({ cancelled: true });
    expect(readInputAnswer(undefined)).toBeNull();
  });
});
