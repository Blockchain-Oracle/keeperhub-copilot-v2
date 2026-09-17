import { describe, expect, it } from "vitest";

import type { UIMessage } from "ai";

import {
  buildParams,
  deriveSupersededSet,
  filterAlternatives,
  isDirty,
  isFieldVisible,
  mapIssuesToFieldErrors,
  seedFormState,
  splitSignature,
  suggestFix,
  supersededSignature,
} from "@/components/cards/editable";
import type { FieldSpec, FieldType, ShowWhen } from "@/lib/registry";

function spec(
  key: string,
  type: FieldType,
  overrides: Partial<FieldSpec> = {},
): FieldSpec {
  return { key, label: key, type, required: false, ...overrides };
}

describe("seedFormState (seed once from settled input)", () => {
  const fields = [
    spec("amount", "protocol-uint"),
    spec("count", "number"),
    spec("failOnError", "protocol-bool"),
    spec("network", "chain-select", { options: [{ value: "1", label: "Eth" }] }),
    spec("shape", "schema-builder"),
  ];

  it("encodes each widget kind from the settled params", () => {
    const seed = seedFormState(fields, {
      amount: "1000",
      count: 3,
      failOnError: true,
      network: "1",
      shape: { a: 1 },
    });
    expect(seed).toEqual({
      amount: "1000", // string stays string
      count: "3", // number → display string
      failOnError: true, // boolean coerced
      network: "1", // option value
      shape: { a: 1 }, // fallback verbatim (read-only)
    });
  });

  it("seeds absent values as empty controls / false", () => {
    const seed = seedFormState(fields, {});
    expect(seed.amount).toBe("");
    expect(seed.count).toBe("");
    expect(seed.failOnError).toBe(false);
    expect(seed.network).toBe("");
  });
});

describe("isDirty (compare live values to the seed)", () => {
  const fields = [spec("amount", "protocol-uint"), spec("shape", "schema-builder")];
  const seed = seedFormState(fields, { amount: "1000", shape: { a: 1 } });

  it("is clean when nothing changed", () => {
    expect(isDirty(fields, seed, { ...seed })).toBe(false);
  });

  it("flips dirty when an editable field changes", () => {
    expect(isDirty(fields, seed, { ...seed, amount: "2000" })).toBe(true);
  });

  it("a read-only fallback field never makes the card dirty", () => {
    expect(isDirty(fields, seed, { ...seed, shape: { a: 999 } })).toBe(false);
  });
});

describe("buildParams (decode to schema params; omit hidden/empty)", () => {
  it("decodes numbers, keeps amount strings, drops empty optionals", () => {
    const fields = [
      spec("amount", "protocol-uint"),
      spec("count", "number"),
      spec("blank", "text"),
      spec("flag", "protocol-bool"),
    ];
    const form = { amount: "1000", count: "3", blank: "", flag: false };
    expect(buildParams(fields, form)).toEqual({
      amount: "1000",
      count: 3,
      flag: false, // booleans always carry
    });
  });

  it("omits a field hidden by showWhen so an unseen value never drives the op", () => {
    const fields = [
      spec("mode", "select", { options: [{ value: "a", label: "A" }] }),
      spec("extra", "text", { showWhen: { field: "mode", equals: "b" } }),
    ];
    const form = { mode: "a", extra: "leftover" };
    expect(buildParams(fields, form)).toEqual({ mode: "a" });
  });
});

describe("isFieldVisible (showWhen: equals / oneOf / computed)", () => {
  it("equals", () => {
    const s = spec("x", "text", { showWhen: { field: "mode", equals: "adv" } });
    expect(isFieldVisible(s, { mode: "adv" })).toBe(true);
    expect(isFieldVisible(s, { mode: "basic" })).toBe(false);
  });

  it("oneOf", () => {
    const s = spec("x", "text", { showWhen: { field: "mode", oneOf: ["a", "b"] } });
    expect(isFieldVisible(s, { mode: "b" })).toBe(true);
    expect(isFieldVisible(s, { mode: "z" })).toBe(false);
  });

  it("computed guard fails open (shows the field) — never hides editable data", () => {
    const showWhen: ShowWhen = {
      computed: "abiFunctionMutability",
      abiField: "abi",
      functionField: "fn",
      equals: "payable",
    };
    expect(isFieldVisible(spec("x", "text", { showWhen }), {})).toBe(true);
  });

  it("a field with no showWhen is always visible", () => {
    expect(isFieldVisible(spec("x", "text"), {})).toBe(true);
  });
});

describe("mapIssuesToFieldErrors (Zod issue → field row + fix)", () => {
  it("keys by the first path segment, first issue per field, with a fix", () => {
    const fields = {
      amount: spec("amount", "protocol-uint"),
      addr: spec("addr", "protocol-address"),
    };
    const errors = mapIssuesToFieldErrors(
      [
        { path: "amount", message: "Invalid" },
        { path: "amount", message: "second — ignored" },
        { path: "addr", message: "Invalid address" },
      ],
      fields,
    );
    expect(errors.amount.message).toBe("Invalid");
    expect(errors.amount.fix).toBe(suggestFix(fields.amount));
    expect(errors.addr.fix).toContain("0x");
  });

  it("nested paths (tuple.0.name) anchor to the top-level field key", () => {
    const errors = mapIssuesToFieldErrors(
      [{ path: "calls.0.target", message: "bad" }],
      { calls: spec("calls", "call-list-builder") },
    );
    expect(errors.calls).toBeDefined();
  });
});

describe("filterAlternatives (system disposes unknown ops)", () => {
  const isKnown = (a: string) => a === "aave-v3/supply" || a === "chronicle/eth-usd-read";

  it("keeps known actionTypes, drops absent ones (NFR6)", () => {
    const kept = filterAlternatives(
      [
        { actionType: "aave-v3/supply", label: "Supply on Aave" },
        { actionType: "ghost/not-real", label: "Nope" },
        { actionType: "chronicle/eth-usd-read", params: { network: "1" } },
        { actionType: "" },
        "garbage",
        null,
      ],
      isKnown,
    );
    expect(kept.map((k) => k.actionType)).toEqual([
      "aave-v3/supply",
      "chronicle/eth-usd-read",
    ]);
    expect(kept[1].params).toEqual({ network: "1" });
  });

  it("returns [] for a non-array (absent alternatives)", () => {
    expect(filterAlternatives(undefined, isKnown)).toEqual([]);
  });
});

describe("deriveSupersededSet + supersededSignature (retirement, stable identity)", () => {
  function msg(id: string, supersedes?: string): UIMessage {
    return {
      id,
      role: "assistant",
      parts: [],
      ...(supersedes !== undefined ? { metadata: { supersedes } } : {}),
    } as UIMessage;
  }

  it("collects every supersedes stamp across the transcript", () => {
    const set = deriveSupersededSet([
      msg("a"),
      msg("b", "old-1"),
      msg("c"),
      msg("d", "old-2"),
    ]);
    expect([...set].sort()).toEqual(["old-1", "old-2"]);
  });

  it("ignores non-string / empty stamps", () => {
    const messages = [
      { id: "x", role: "assistant", parts: [], metadata: { supersedes: "" } },
      { id: "y", role: "assistant", parts: [], metadata: { supersedes: 42 } },
      { id: "z", role: "assistant", parts: [] },
    ] as unknown as UIMessage[];
    expect(deriveSupersededSet(messages).size).toBe(0);
  });

  it("supersededSignature is order-independent and stable for equal contents", () => {
    // Same ids, different message order → identical signature (stable identity:
    // the Set memo keyed on this string keeps its instance across stream chunks).
    expect(supersededSignature([msg("a", "1"), msg("b", "2")])).toBe(
      supersededSignature([msg("c", "2"), msg("d", "1")]),
    );
    // Different contents → different signature (the memo recomputes, cards retire).
    expect(supersededSignature([msg("a", "1")])).not.toBe(
      supersededSignature([msg("a", "1"), msg("b", "2")]),
    );
  });

  it("splitSignature round-trips the signature back to the id list", () => {
    const messages = [msg("a", "1"), msg("b", "2")];
    expect(new Set(splitSignature(supersededSignature(messages)))).toEqual(
      deriveSupersededSet(messages),
    );
    expect(splitSignature("")).toEqual([]);
  });
});
