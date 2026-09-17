import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/catalog/route";
import { catalogSize } from "@/components/docs/catalog-filter";
import { actionCatalog } from "@/lib/docs-catalog";
import { catalogEntries } from "@/lib/palette-catalog";
import { listOperationEntries } from "@/lib/registry";
import { STARTER_PROMPTS } from "@/lib/registry/surface-suggestions";

/* The palette's action list (decision 36): the docs catalog, flattened and trimmed. */

describe("the palette catalog", () => {
  const entries = catalogEntries();

  it("has exactly the docs catalog's actions, never system or quarantined ones", () => {
    expect(entries).toHaveLength(catalogSize(actionCatalog()));
    const hidden = new Set(
      listOperationEntries()
        .filter((entry) => entry.kind === "system" || entry.effectClass === "quarantined")
        .map((entry) => entry.opId),
    );
    expect(entries.some((entry) => hidden.has(entry.opId))).toBe(false);
  });

  it("caps descriptions and marks the starter actions", () => {
    expect(entries.every((entry) => entry.description.length <= 140)).toBe(true);
    const starters = entries.filter((entry) => entry.starter).map((entry) => entry.opId).sort();
    expect(starters).toEqual(
      STARTER_PROMPTS.map((starter) => starter.opId)
        .filter((opId) => entries.some((entry) => entry.opId === opId))
        .sort(),
    );
  });

  it("is served as JSON from /api/catalog, small enough to load on first open", async () => {
    const response = GET();
    const text = await response.text();
    expect(JSON.parse(text).actions).toHaveLength(entries.length);
    expect(text.length).toBeLessThan(250_000);
  });
});
