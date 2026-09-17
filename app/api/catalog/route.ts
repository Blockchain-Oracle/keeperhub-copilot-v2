import { catalogEntries, type CatalogEntry } from "@/lib/palette-catalog";

/*
 * Every action the copilot can ask about, for the ⌘K palette (decision 36).
 * Built from the generated registry at build time and credential-free, like
 * /api/platform/chains: the palette fetches it the first time it opens.
 */
export const dynamic = "force-static";

export type CatalogResponse = { actions: CatalogEntry[] };

export function GET(): Response {
  const body: CatalogResponse = { actions: catalogEntries() };
  return Response.json(body);
}
