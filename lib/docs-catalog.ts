import type { CatalogAction, CatalogGroup } from "@/components/docs/catalog-filter";
import { integrations, listOperationEntries, type OperationEntry } from "@/lib/registry";
import { STARTER_PROMPTS } from "@/lib/registry/surface-suggestions";

/*
 * The docs' action catalog from the generated registry, grouped by
 * integration like Portaldot's lib/tools-catalog.ts groups its tools. System
 * primitives and quarantined actions are left out, as search_actions leaves
 * them out. The registry has no example prompts: the launcher's curated
 * starter prompts are used where they exist, and every other action gets one
 * built from its label.
 */

export function catalogPrompt(entry: Pick<OperationEntry, "opId" | "label">): string {
  return STARTER_PROMPTS.find((starter) => starter.opId === entry.opId)?.prompt ?? `Use ${entry.label}.`;
}

export function actionCatalog(entries: readonly OperationEntry[] = listOperationEntries()): CatalogGroup[] {
  const byIntegration = new Map<string, CatalogAction[]>();
  for (const entry of entries) {
    if (entry.kind === "system" || entry.effectClass === "quarantined") continue;
    const actions = byIntegration.get(entry.integration) ?? [];
    actions.push({
      opId: entry.opId,
      label: entry.label,
      description: entry.description,
      integration: entry.integration,
      signs: entry.effectClass !== "read",
      prompt: catalogPrompt(entry),
    });
    byIntegration.set(entry.integration, actions);
  }
  return [...byIntegration]
    .map(([id, actions]) => ({
      id,
      label: integrations[id]?.label ?? id,
      blurb: integrations[id]?.description ?? "",
      actions: actions.sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
