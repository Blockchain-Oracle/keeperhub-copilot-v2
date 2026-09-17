/*
 * The action catalog's shapes and its filter, free of the registry so the
 * client grid ships only what the page hands it. Portaldot
 * components/docs/tool-grid.tsx:21-34: a category pill and a search that match
 * the label, id or description, dropping empty categories.
 */

export type CatalogAction = {
  opId: string;
  label: string;
  description: string;
  integration: string;
  /** Anything but a read: it stops as a card to authorize. */
  signs: boolean;
  prompt: string;
};

export type CatalogGroup = { id: string; label: string; blurb: string; actions: CatalogAction[] };

export const ALL_INTEGRATIONS = "all";

export function filterCatalog(groups: readonly CatalogGroup[], query: string, integration: string): CatalogGroup[] {
  const q = query.trim().toLowerCase();
  return groups
    .filter((group) => integration === ALL_INTEGRATIONS || group.id === integration)
    .map((group) => ({
      ...group,
      actions: group.actions.filter(
        (action) =>
          !q ||
          action.label.toLowerCase().includes(q) ||
          action.opId.toLowerCase().includes(q) ||
          action.description.toLowerCase().includes(q),
      ),
    }))
    .filter((group) => group.actions.length > 0);
}

export function catalogSize(groups: readonly CatalogGroup[]): number {
  return groups.reduce((sum, group) => sum + group.actions.length, 0);
}
