import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { catalogSize, filterCatalog } from "@/components/docs/catalog-filter";
import { NAVIGABLE_ROUTE_PATHS } from "@/components/shell/header/nav-items";
import { actionCatalog, catalogPrompt } from "@/lib/docs-catalog";
import { listOperationEntries } from "@/lib/registry";
import { STARTER_PROMPTS } from "@/lib/registry/surface-suggestions";

describe("the docs action catalog", () => {
  const groups = actionCatalog();

  it("lists every action but system primitives and quarantined ones, once each", () => {
    const expected = listOperationEntries().filter((entry) => entry.kind !== "system" && entry.effectClass !== "quarantined");
    expect(catalogSize(groups)).toBe(expected.length);
    const ids = groups.flatMap((group) => group.actions.map((action) => action.opId));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("groups by integration, each action in its own integration's group", () => {
    for (const group of groups) {
      for (const action of group.actions) expect(action.integration).toBe(group.id);
    }
  });

  it("marks anything but a read as signing", () => {
    const wrap = groups.flatMap((group) => group.actions).find((action) => action.opId === "lido/wrap");
    const price = groups.flatMap((group) => group.actions).find((action) => action.opId === "lido/steth-per-token");
    expect(wrap?.signs).toBe(true);
    expect(price?.signs).toBe(false);
  });

  it("uses the curated starter prompts verbatim and builds the rest from the label", () => {
    const starter = STARTER_PROMPTS[0]!;
    expect(catalogPrompt({ opId: starter.opId, label: "whatever" })).toBe(starter.prompt);
    expect(catalogPrompt({ opId: "lido/wrap", label: "Lido: Wrap stETH to wstETH" })).toBe("Use Lido: Wrap stETH to wstETH.");
  });

  it("filters by integration and by label, id or description, dropping empty groups", () => {
    const lido = filterCatalog(groups, "", "lido");
    expect(lido.map((group) => group.id)).toEqual(["lido"]);
    expect(filterCatalog(groups, "WRAP STETH", "all").flatMap((group) => group.actions.map((a) => a.opId))).toContain("lido/wrap");
    expect(filterCatalog(groups, "lido/wrap", "aave-v3")).toEqual([]);
    expect(filterCatalog(groups, "no action is called this", "all")).toEqual([]);
  });
});

describe("every page the navigation links to exists", () => {
  it("has a page file under app/(app) for each navigable route", () => {
    for (const route of NAVIGABLE_ROUTE_PATHS) {
      const file = path.join(process.cwd(), "app", "(app)", ...route.split("/").filter(Boolean), "page.tsx");
      expect(existsSync(file), `${route} → ${file}`).toBe(true);
    }
  });
});
