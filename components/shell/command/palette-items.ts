import type { LucideIcon } from "lucide-react";

import type { PlatformChain } from "@/app/api/platform/chains/route";
import { englishTranslate, type Translate } from "@/lib/i18n/translate";
import { LOCALES, type LocaleCode } from "@/lib/locale";
import type { CatalogEntry } from "@/lib/palette-catalog";

import { NAV_ITEMS, navDescription, navName } from "../header/nav-items";

/*
 * The ⌘K palette's items and search (decision 36), free of React so it runs
 * under node tests. DeepBookie's docs SearchModal shows up to eight results for
 * a query; here there are three kinds, each capped, with an honest count of the
 * rest. A title that starts with the query ranks first, then one with a word
 * that starts with it, then any match.
 *
 * Text: messages/en/shell.json (decision 41), through the `t` each builder
 * takes last, English by default.
 */

export type PageItem = { kind: "page"; id: string; title: string; subtitle: string; href: string; icon: LucideIcon };
export type NetworkItem = {
  kind: "network";
  id: string;
  title: string;
  subtitle: string;
  chainId: string;
  current: boolean;
};
export type ActionItem = {
  kind: "action";
  id: string;
  title: string;
  subtitle: string;
  integration: string;
  signs: boolean;
  prompt: string;
  description: string;
  starter: boolean;
};
/** A language the copilot answers in (decisions 38–40). */
export type LanguageItem = {
  kind: "language";
  id: string;
  title: string;
  subtitle: string;
  code: LocaleCode;
  current: boolean;
  /** Words that find every language ("language languages"), in the screens' language. */
  keywords: string;
};
export type PaletteItem = PageItem | NetworkItem | LanguageItem | ActionItem;

export type PaletteSection = {
  kind: PaletteItem["kind"];
  label: string;
  items: PaletteItem[];
  /** How many more matched than are shown. */
  more: number;
};

export type PaletteResult = { sections: PaletteSection[]; count: number };

const CAPS = { page: 5, network: 5, language: 5, action: 8 } as const;
const EMPTY_CAPS = { page: 8, network: 5, language: 0, action: 8 } as const;

export function pageItems(t: Translate = englishTranslate): PageItem[] {
  return Object.values(NAV_ITEMS).map((item) => ({
    kind: "page",
    id: `page:${item.id}`,
    title: navName(item, t),
    subtitle: navDescription(item, t),
    href: item.href,
    icon: item.icon,
  }));
}

/** KeeperHub's live networks, the selected one first. */
export function networkItems(
  chains: readonly PlatformChain[],
  currentChainId: string,
  t: Translate = englishTranslate,
): NetworkItem[] {
  const items = chains.map(
    (chain): NetworkItem => ({
      kind: "network",
      id: `network:${chain.chainId}`,
      title: chain.name,
      subtitle: [
        t(chain.isTestnet ? "shell.palette.testnet" : "shell.palette.mainnet"),
        chain.symbol,
        t("shell.palette.chain", { id: chain.chainId }),
      ]
        .filter(Boolean)
        .join(" · "),
      chainId: chain.chainId,
      current: chain.chainId === currentChainId,
    }),
  );
  return [...items.filter((item) => item.current), ...items.filter((item) => !item.current)];
}

/** Every language, the picked one first; each in its own script with its English name. */
export function languageItems(currentLocale: string, t: Translate = englishTranslate): LanguageItem[] {
  const keywords = t("shell.palette.languageKeywords");
  const items = LOCALES.map(
    (locale): LanguageItem => ({
      kind: "language",
      id: `language:${locale.code}`,
      title: locale.native,
      subtitle:
        locale.english === locale.native
          ? t("shell.palette.languageSubtitle", { code: locale.code })
          : `${locale.english} · ${locale.code}`,
      code: locale.code,
      current: locale.code === currentLocale,
      keywords,
    }),
  );
  return [...items.filter((item) => item.current), ...items.filter((item) => !item.current)];
}

export function actionItems(catalog: readonly CatalogEntry[]): ActionItem[] {
  return catalog.map((entry) => ({
    kind: "action",
    id: `action:${entry.opId}`,
    title: entry.label,
    subtitle: entry.integrationLabel,
    integration: entry.integration,
    signs: entry.signs,
    prompt: entry.prompt,
    description: entry.description,
    starter: entry.starter,
  }));
}

function haystack(item: PaletteItem): string {
  switch (item.kind) {
    case "page":
      return `${item.title} ${item.subtitle} ${item.href}`;
    case "network":
      return `${item.title} ${item.subtitle}`;
    case "language":
      return `${item.title} ${item.subtitle} ${item.keywords}`;
    case "action":
      return `${item.title} ${item.subtitle} ${item.id.slice("action:".length)} ${item.integration} ${item.description}`;
  }
}

/** Lower is better; null when the item doesn't match. */
export function rank(item: PaletteItem, query: string): number | null {
  const q = query.trim().toLowerCase();
  if (q === "") return 0;
  const title = item.title.toLowerCase();
  if (title.startsWith(q)) return 0;
  if (title.split(/[\s/()-]+/).some((word) => word.startsWith(q))) return 1;
  if (title.includes(q)) return 2;
  const rest = haystack(item).toLowerCase();
  if (rest.includes(q)) return 3;
  return q.split(/\s+/).every((token) => rest.includes(token)) ? 4 : null;
}

function section(kind: PaletteItem["kind"], matched: PaletteItem[], cap: number, t: Translate): PaletteSection | null {
  if (matched.length === 0) return null;
  const label = t(`shell.palette.sections.${kind}`);
  return { kind, label, items: matched.slice(0, cap), more: Math.max(0, matched.length - cap) };
}

export function searchPalette(
  query: string,
  items: {
    pages: readonly PaletteItem[];
    networks: readonly PaletteItem[];
    languages?: readonly PaletteItem[];
    actions: readonly ActionItem[];
  },
  t: Translate = englishTranslate,
): PaletteResult {
  const empty = query.trim() === "";
  const caps = empty ? EMPTY_CAPS : CAPS;
  const match = (list: readonly PaletteItem[]) =>
    list
      .map((item, index) => ({ item, index, score: rank(item, query) }))
      .filter((entry): entry is { item: PaletteItem; index: number; score: number } => entry.score !== null)
      .sort((a, b) => a.score - b.score || a.index - b.index)
      .map((entry) => entry.item);

  const actions = empty ? items.actions.filter((action) => action.starter) : match(items.actions);
  const sections = [
    section("page", empty ? [...items.pages] : match(items.pages), caps.page, t),
    section("network", empty ? [...items.networks] : match(items.networks), caps.network, t),
    // Languages only once something is typed ("español", "japanese", "language").
    empty ? null : section("language", match(items.languages ?? []), caps.language, t),
    section("action", actions, caps.action, t),
  ].filter((entry): entry is PaletteSection => entry !== null);
  // Empty, the counts are what is on screen; the actions' starters are a sample, not a match.
  const count = sections.reduce((sum, entry) => sum + entry.items.length + (empty ? 0 : entry.more), 0);
  return { sections: empty ? sections.map((entry) => ({ ...entry, more: 0 })) : sections, count };
}
