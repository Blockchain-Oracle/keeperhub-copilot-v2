import { describe, expect, it } from "vitest";
import { z } from "zod";

import { listOperationEntries } from "@/lib/registry";
import {
  INPUT_SCHEMAS,
  SEARCH_ACTIONS_RESULT_CAP,
  SURFACE_TOOL_NAMES,
  searchActions,
  surfaceChatTools,
  surfaceRealtimeTools,
  type SearchActionMatch,
} from "@/lib/registry/surface-tools";

// The five workflow-node primitives (kind:"system") — never chat-executable.
const SYSTEM_IDS = new Set([
  "Collect",
  "Condition",
  "Database Query",
  "For Each",
  "HTTP Request",
]);

describe("surface tool projections (AD-3 single source)", () => {
  it("exposes exactly the named tools in both projections", () => {
    expect(surfaceChatTools.map((t) => t.name)).toEqual([...SURFACE_TOOL_NAMES]);
    expect(surfaceRealtimeTools.map((t) => t.name)).toEqual([...SURFACE_TOOL_NAMES]);
    expect(SURFACE_TOOL_NAMES).toHaveLength(14);
    // execute_transfer is the fifth tool (2.5 D25).
    expect(SURFACE_TOOL_NAMES).toContain("execute_transfer");
    // Automations from chat (decisions 19–21).
    expect(SURFACE_TOOL_NAMES).toEqual(
      expect.arrayContaining([
        "list_automations",
        "get_automation",
        "create_automation",
        "set_automation_enabled",
        "update_automation",
        "run_automation",
        "delete_automation",
      ]),
    );
  });

  it("hands voice the schema body alone, without the $schema keyword", () => {
    for (const realtimeTool of surfaceRealtimeTools) {
      expect(Object.hasOwn(realtimeTool.parameters, "$schema")).toBe(false);
      expect(realtimeTool.parameters.type).toBe("object");
    }
  });

  it("takes a change as the whole automation plus which one it changes", () => {
    const parameters = surfaceRealtimeTools.find((t) => t.name === "update_automation")?.parameters as { required?: string[] };
    expect(parameters.required).toEqual(expect.arrayContaining(["workflowId", "name", "trigger", "steps"]));
    expect(INPUT_SCHEMAS.run_automation.safeParse({ workflowId: "wf-1" }).success).toBe(true);
    expect(INPUT_SCHEMAS.delete_automation.safeParse({}).success).toBe(false);
  });

  it("projects the automation proposal shape for voice too", () => {
    const parameters = surfaceRealtimeTools.find((t) => t.name === "create_automation")?.parameters as {
      required?: string[];
    };
    expect(parameters.required).toEqual(expect.arrayContaining(["name", "trigger", "steps"]));
  });

  it("execute_transfer mirrors the live transfer params: chain_id/to_address/amount required, token_address optional (D25)", () => {
    const schema = INPUT_SCHEMAS.execute_transfer;
    // Native transfer: no token_address.
    expect(
      schema.safeParse({ chain_id: "11155111", to_address: "0xabc", amount: "0.1" }).success,
    ).toBe(true);
    // ERC-20 transfer: token_address present.
    expect(
      schema.safeParse({
        chain_id: "1",
        to_address: "0xabc",
        amount: "25",
        token_address: "0xtoken",
      }).success,
    ).toBe(true);
    // Each of the three core fields is required.
    for (const missing of ["chain_id", "to_address", "amount"]) {
      const full: Record<string, string> = { chain_id: "1", to_address: "0xabc", amount: "1" };
      delete full[missing];
      expect(schema.safeParse(full).success).toBe(false);
    }
    // The Realtime projection carries the same params from the one Zod source.
    const realtime = surfaceRealtimeTools.find((t) => t.name === "execute_transfer");
    const properties = (realtime?.parameters as { properties?: Record<string, unknown> })
      .properties;
    expect(properties).toHaveProperty("amount");
    expect(properties).toHaveProperty("to_address");
  });

  it("derives BOTH projections from the SAME Zod source object, not two identical copies (AD-3)", () => {
    for (const chat of surfaceChatTools) {
      const source = INPUT_SCHEMAS[chat.name];
      const realtime = surfaceRealtimeTools.find((t) => t.name === chat.name);
      expect(realtime).toBeDefined();
      expect(realtime?.type).toBe("function");
      // Reference identity: chat's inputSchema IS the shared source object — a
      // separately-authored but structurally-identical second schema (the exact
      // AD-3 violation) would fail this, where a deep-equal round-trip would not.
      expect(chat.inputSchema).toBe(source);
      // Realtime's parameters are that same source's JSON projection, less the $schema keyword.
      const projected = { ...(z.toJSONSchema(source) as Record<string, unknown>) };
      delete projected.$schema;
      expect(realtime?.parameters).toEqual(projected);
      expect((realtime?.parameters as { type?: string }).type).toBe("object");
    }
  });

  it("execute_protocol_action carries the optional alternatives field, one source → both surfaces (Story 1.6)", () => {
    const schema = INPUT_SCHEMAS.execute_protocol_action;

    // Optional: a plain read (no ambiguity) still parses.
    expect(
      schema.safeParse({ actionType: "chronicle/eth-usd-read", params: { network: "1" } })
        .success,
    ).toBe(true);
    // Present: a declared alternative parses with its shape.
    const withAlts = schema.safeParse({
      actionType: "chronicle/eth-usd-read",
      params: {},
      alternatives: [{ actionType: "chronicle/btc-usd-read", label: "BTC", params: {} }],
    });
    expect(withAlts.success).toBe(true);

    // The Realtime projection is the SAME source's JSON — alternatives rides
    // along automatically (single source, chat + voice can never diverge).
    const realtime = surfaceRealtimeTools.find(
      (t) => t.name === "execute_protocol_action",
    );
    const properties = (realtime?.parameters as { properties?: Record<string, unknown> })
      .properties;
    expect(properties).toHaveProperty("alternatives");
  });

  it("carries the same description across both projections", () => {
    for (const chat of surfaceChatTools) {
      const realtime = surfaceRealtimeTools.find((t) => t.name === chat.name);
      expect(realtime?.description).toBe(chat.description);
      expect(chat.description.length).toBeGreaterThan(0);
    }
  });

  it("uses names that collide with NONE of the encoded registry toolNames", () => {
    const toolNames = new Set(listOperationEntries().map((e) => e.toolName));
    for (const name of SURFACE_TOOL_NAMES) {
      expect(toolNames.has(name)).toBe(false);
    }
  });
});

describe("searchActions executor", () => {
  it("is deterministic — same input, same output", () => {
    const input = { query: "eth", integration: "chronicle" };
    expect(searchActions(input)).toEqual(searchActions(input));
  });

  it("finds a known read action and marks it executable with no note", () => {
    const result = searchActions({ query: "eth usd", integration: "chronicle" });
    const match = result.matches.find((m) => m.opId === "chronicle/eth-usd-read");
    expect(match).toBeDefined();
    expect(match?.executable).toBe(true);
    expect(match?.effectClass).toBe("read");
    expect(match?.note).toBeUndefined();
    // Rich field spec projected from the registry FieldSpecs.
    expect(Array.isArray(match?.requiredFields)).toBe(true);
  });

  it("marks writes executable — they run through the confirm ceremony (Story 2.3)", () => {
    const result = searchActions({ effect: "value-moving-write" });
    expect(result.totalMatched).toBeGreaterThan(0);
    for (const match of result.matches) {
      expect(match.effectClass).toBe("value-moving-write");
      // A write is executable now: the model proposes it, and the person confirms
      // it on screen before anything runs. No "not available" note.
      expect(match.executable).toBe(true);
      expect(match.note).toBeUndefined();
    }
  });

  it("never surfaces a system primitive or a quarantined op", () => {
    const searches = [
      searchActions({}),
      searchActions({ query: "http request" }),
      searchActions({ query: "database query" }),
      searchActions({ query: "for each" }),
      searchActions({ query: "condition" }),
      searchActions({ effect: "quarantined" }),
    ];
    for (const result of searches) {
      for (const match of result.matches) {
        expect(SYSTEM_IDS.has(match.opId)).toBe(false);
        expect(match.effectClass).not.toBe("quarantined");
      }
    }
    // The quarantined-effect filter matches nothing (they are excluded).
    expect(searchActions({ effect: "quarantined" }).totalMatched).toBe(0);
  });

  it("caps results at the cap and reports an honest 'N more'", () => {
    const result = searchActions({ effect: "read" });
    expect(result.returned).toBeLessThanOrEqual(SEARCH_ACTIONS_RESULT_CAP);
    expect(result.matches).toHaveLength(result.returned);
    if (result.totalMatched > SEARCH_ACTIONS_RESULT_CAP) {
      expect(result.returned).toBe(SEARCH_ACTIONS_RESULT_CAP);
      expect(result.more).toBe(result.totalMatched - SEARCH_ACTIONS_RESULT_CAP);
    } else {
      expect(result.more).toBeUndefined();
    }
  });

  it("caps enum option lists at 8 in every field summary", () => {
    const summaries: SearchActionMatch[] = [
      ...searchActions({ effect: "read" }).matches,
      ...searchActions({ query: "swap" }).matches,
      ...searchActions({ query: "supply" }).matches,
    ];
    for (const match of summaries) {
      for (const field of [...match.requiredFields, ...match.optionalFields]) {
        if (field.options !== undefined) {
          expect(field.options.length).toBeLessThanOrEqual(8);
        }
        expect(typeof field.key).toBe("string");
        expect(typeof field.type).toBe("string");
      }
    }
  });

  it("filters by integration key case-insensitively", () => {
    const result = searchActions({ integration: "CHRONICLE" });
    expect(result.totalMatched).toBeGreaterThan(0);
    // Every match belongs to the Chronicle integration (label carries the name).
    for (const match of result.matches) {
      expect(match.integration.toLowerCase()).toContain("chronicle");
    }
  });

  it("returns an empty match set (not an error) for a no-hit query", () => {
    const result = searchActions({ query: "zzzzz-nonexistent-xyzzy" });
    expect(result.matches).toEqual([]);
    expect(result.totalMatched).toBe(0);
    expect(result.more).toBeUndefined();
  });
});
