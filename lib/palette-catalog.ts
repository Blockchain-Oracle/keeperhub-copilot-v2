import { actionCatalog } from "@/lib/docs-catalog";
import { STARTER_PROMPTS } from "@/lib/registry/surface-suggestions";

/*
 * The ⌘K palette's action list (decision 36): the docs catalog flattened, with
 * short descriptions, served once from /api/catalog so the generated registry
 * never enters the browser bundle. Starter actions come first when nothing is
 * typed.
 */

export type CatalogEntry = {
  opId: string;
  label: string;
  integration: string;
  integrationLabel: string;
  /** Anything but a read: it stops as a card to authorize. */
  signs: boolean;
  prompt: string;
  description: string;
  starter: boolean;
};

const DESCRIPTION_MAX = 140;

export function catalogEntries(): CatalogEntry[] {
  const starters = new Set(STARTER_PROMPTS.map((starter) => starter.opId));
  return actionCatalog().flatMap((group) =>
    group.actions.map((action) => ({
      opId: action.opId,
      label: action.label,
      integration: action.integration,
      integrationLabel: group.label,
      signs: action.signs,
      prompt: action.prompt,
      description:
        action.description.length > DESCRIPTION_MAX
          ? `${action.description.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`
          : action.description,
      starter: starters.has(action.opId),
    })),
  );
}
