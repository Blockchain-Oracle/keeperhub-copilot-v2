import { describe, expect, it, vi } from "vitest";

import {
  getOperationEntry,
  integrations,
  listOperationEntries,
  resolveOperation,
} from "@/lib/registry";
import {
  STARTER_PROMPTS,
  STARTER_SUGGESTIONS,
  starterSuggestions,
} from "@/lib/registry/surface-suggestions";

/*
 * The drift guard (Task 4). This is the "chips name real actions" guarantee made
 * structural — the same discipline as registry:check, but for the hand-curated
 * starter set. A registry regen that removes, quarantines, re-classes, or
 * credential-gates a curated op fails these tests loudly in CI, so a chip can
 * never silently become fiction. The React layer (StarterSuggestions.tsx /
 * EmptyState) is node-untestable presentational glue; ALL derive/validate logic
 * lives in the pure module and is exhausted here.
 */
describe("STARTER_PROMPTS drift guard (every curated op is a real credential-free read)", () => {
  it("has at least one curated prompt", () => {
    expect(STARTER_PROMPTS.length).toBeGreaterThan(0);
  });

  it.each([...STARTER_PROMPTS])(
    "$opId resolves ok, is a read, is credential-free, and is not a system primitive",
    ({ opId, prompt }) => {
      const resolved = resolveOperation(opId);
      expect(resolved.status).toBe("ok");

      const entry = getOperationEntry(opId);
      expect(entry).toBeDefined();
      expect(entry?.effectClass).toBe("read");
      expect(entry?.needsCredential).toBe(false);
      expect(entry?.kind).not.toBe("system");

      // The prompt is real text that names something — not empty filler.
      expect(prompt.trim().length).toBeGreaterThan(0);
    },
  );

  it("pairs every prompt with a distinct op (no accidental duplicate anchor)", () => {
    const opIds = STARTER_PROMPTS.map((p) => p.opId);
    expect(new Set(opIds).size).toBe(opIds.length);
  });

  it("uses distinct prompt text for every chip (no duplicate rendered chip, stable keys)", () => {
    // The chip React key derives from position within a category, but a
    // repeated prompt string would still surface the same chip twice to the
    // user — enforce prompt-text uniqueness so curation cannot introduce one.
    const prompts = STARTER_PROMPTS.map((p) => p.prompt);
    expect(new Set(prompts).size).toBe(prompts.length);
  });
});

describe("starterSuggestions() — pure derive + validate", () => {
  it("drops NOTHING: the flattened chip count equals STARTER_PROMPTS.length", () => {
    const flattened = starterSuggestions().flatMap((c) => c.chips);
    expect(flattened).toHaveLength(STARTER_PROMPTS.length);
  });

  it("returns at least one category, and every category has at least one chip", () => {
    const categories = starterSuggestions();
    expect(categories.length).toBeGreaterThan(0);
    for (const category of categories) {
      expect(category.chips.length).toBeGreaterThan(0);
    }
  });

  it("derives each category label from the registry's integration groupings (AC 1)", () => {
    for (const category of starterSuggestions()) {
      // The label is the registry-sourced integration label, never a hardcoded
      // category string — this is what makes categories "derive from the
      // registry's integration groupings" literally.
      expect(category.label).toBe(integrations[category.integration]?.label);
      expect(category.label.length).toBeGreaterThan(0);
    }
  });

  it("groups chips under the integration their curated op actually belongs to", () => {
    // Reconstruct the expected grouping straight from the curated ops' own
    // entry.integration and assert the module produced exactly that.
    const expected = new Map<string, number>();
    for (const { opId } of STARTER_PROMPTS) {
      const key = getOperationEntry(opId)?.integration;
      expect(key).toBeDefined();
      expected.set(key!, (expected.get(key!) ?? 0) + 1);
    }
    const actual = new Map(
      starterSuggestions().map((c) => [c.integration, c.chips.length] as const),
    );
    expect(actual).toEqual(expected);
  });

  it("is deterministic — stable category and chip order across calls", () => {
    const a = starterSuggestions();
    const b = starterSuggestions();
    expect(a).toEqual(b);
    // Category order is first-appearance order in STARTER_PROMPTS.
    const firstAppearance: string[] = [];
    for (const { opId } of STARTER_PROMPTS) {
      const key = getOperationEntry(opId)!.integration;
      if (!firstAppearance.includes(key)) firstAppearance.push(key);
    }
    expect(a.map((c) => c.integration)).toEqual(firstAppearance);
  });

  it("preserves curated chip order within a category", () => {
    const categories = starterSuggestions();
    for (const category of categories) {
      const curatedForCategory = STARTER_PROMPTS.filter(
        (p) => getOperationEntry(p.opId)!.integration === category.integration,
      ).map((p) => p.prompt);
      expect(category.chips.map((chip) => chip.prompt)).toEqual(curatedForCategory);
    }
  });

  it("returns a serializable payload with no functions, no undefined, no opId leak", () => {
    const categories = starterSuggestions();
    // JSON round-trips cleanly (structural proof there are no functions /
    // undefined / non-serializable values crossing the server→client boundary).
    expect(JSON.parse(JSON.stringify(categories))).toEqual(categories);
    for (const category of categories) {
      expect(Object.keys(category).sort()).toEqual(["chips", "integration", "label"]);
      for (const chip of category.chips) {
        // The client payload carries the prompt and the networks the action runs
        // on — the opId (the model's re-discovery anchor) never crosses the
        // boundary.
        expect(Object.keys(chip).sort()).toEqual(
          chip.chains === undefined ? ["prompt"] : ["chains", "prompt"],
        );
        expect(chip).not.toHaveProperty("opId");
        for (const id of chip.chains ?? []) expect(id).toMatch(/^\d+$/);
      }
    }
  });

  it("STARTER_SUGGESTIONS is the memoized result of starterSuggestions()", () => {
    expect(STARTER_SUGGESTIONS).toEqual(starterSuggestions());
  });
});

describe("copy law over curated prompts (EXPERIENCE.md:64-66)", () => {
  it("uses no em-dashes and no exclamation marks", () => {
    for (const { prompt } of STARTER_PROMPTS) {
      expect(prompt).not.toContain("—");
      expect(prompt).not.toContain("!");
    }
  });
});

describe("honest drops (NFR2) — a failing curated entry is logged, never silently swallowed", () => {
  it("would drop-with-structured-console.error an op that fails validation", () => {
    // We cannot mutate the immutable registry, so we exercise the drop path
    // through the exported pure function with an entry that cannot validate:
    // an absent opId resolves to quarantined and must be dropped loudly.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const categories = starterSuggestions([
        ...STARTER_PROMPTS,
        { prompt: "This op does not exist.", opId: "does-not/exist" },
      ]);
      // The bogus entry is dropped — the survivor count is unchanged.
      const flattened = categories.flatMap((c) => c.chips);
      expect(flattened).toHaveLength(STARTER_PROMPTS.length);
      // ...and the drop is honest (structured event, opId + reason).
      expect(spy).toHaveBeenCalledTimes(1);
      const [payload] = spy.mock.calls[0]!;
      const logged = JSON.parse(String(payload));
      expect(logged.event).toBe("starter_suggestion_dropped");
      expect(logged.opId).toBe("does-not/exist");
      expect(typeof logged.reason).toBe("string");
    } finally {
      spy.mockRestore();
    }
  });

  // The three POST-resolution drop branches — an op that resolves ok but fails
  // the read / credential / system predicate. Each op is DISCOVERED from the
  // live registry by the same precedence validationFailure applies, so the
  // tests stay correct across a registry regen (no hardcoded opIds).
  function firstOp(predicate: (entry: ReturnType<typeof listOperationEntries>[number]) => boolean) {
    return listOperationEntries().find(
      (entry) => resolveOperation(entry.opId).status === "ok" && predicate(entry),
    );
  }

  function assertDropped(opId: string, expectedReason: string | RegExp) {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const categories = starterSuggestions([{ prompt: "curated but invalid", opId }]);
      // The only entry failed validation → nothing survives to render.
      expect(categories).toHaveLength(0);
      expect(spy).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(String(spy.mock.calls[0]![0]));
      expect(logged.event).toBe("starter_suggestion_dropped");
      expect(logged.opId).toBe(opId);
      if (expectedReason instanceof RegExp) {
        expect(logged.reason).toMatch(expectedReason);
      } else {
        expect(logged.reason).toBe(expectedReason);
      }
    } finally {
      spy.mockRestore();
    }
  }

  it("drops a resolvable NON-READ op (a write) with a non-read reason", () => {
    const op = firstOp((e) => e.effectClass !== "read");
    expect(op, "registry should contain a resolvable non-read op").toBeDefined();
    assertDropped(op!.opId, /^non-read:/);
  });

  it("drops a credential-gated READ with reason needs-credential", () => {
    const op = firstOp((e) => e.effectClass === "read" && e.needsCredential);
    expect(op, "registry should contain a credential-gated read").toBeDefined();
    assertDropped(op!.opId, "needs-credential");
  });

  it("drops a system primitive (credential-free read, kind=system) with reason system-primitive", () => {
    const op = firstOp(
      (e) => e.effectClass === "read" && !e.needsCredential && e.kind === "system",
    );
    expect(op, "registry should contain a system primitive").toBeDefined();
    assertDropped(op!.opId, "system-primitive");
  });
});
