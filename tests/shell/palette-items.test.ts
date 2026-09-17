import { describe, expect, it } from "vitest";

import type { PlatformChain } from "@/app/api/platform/chains/route";
import {
  actionItems,
  languageItems,
  networkItems,
  pageItems,
  rank,
  searchPalette,
} from "@/components/shell/command/palette-items";
import { NAV_ITEMS } from "@/components/shell/header/nav-items";
import { catalogEntries } from "@/lib/palette-catalog";

/* The ⌘K palette's search (decision 36). */

function chain(chainId: string, name: string, isTestnet = false): PlatformChain {
  return { chainId, name, symbol: "ETH", chainType: "evm", isTestnet, explorerUrl: null, explorerAddressPath: null };
}

const CHAINS = [
  chain("1", "Ethereum"),
  chain("8453", "Base"),
  chain("42161", "Arbitrum One"),
  chain("10", "Optimism"),
  chain("137", "Polygon"),
  chain("56", "BNB Chain"),
  chain("11155111", "Ethereum Sepolia", true),
  chain("84532", "Base Sepolia", true),
];

const pages = pageItems();
const networks = networkItems(CHAINS, "84532");
const actions = actionItems(catalogEntries());
const all = { pages, networks, actions };

describe("the palette's items", () => {
  it("lists every page from the one nav registry", () => {
    expect(pages.map((page) => page.href)).toEqual(Object.values(NAV_ITEMS).map((item) => item.href));
  });

  it("puts the selected network first and marks it", () => {
    expect(networks[0]).toMatchObject({ chainId: "84532", current: true, title: "Base Sepolia" });
    expect(networks.filter((network) => network.current)).toHaveLength(1);
    expect(networks[0].subtitle).toBe("Testnet · ETH · chain 84532");
  });

  it("carries each action's chat prompt", () => {
    const supply = actions.find((action) => action.id === "action:aave-v3/supply");
    expect(supply).toMatchObject({ title: expect.any(String), signs: true });
    expect(supply?.prompt.length).toBeGreaterThan(0);
  });
});

describe("searchPalette", () => {
  it("with nothing typed shows the pages, five networks and only the starter actions", () => {
    const result = searchPalette("", all);
    const [pageSection, networkSection, actionSection] = result.sections;
    expect(pageSection.items).toHaveLength(pages.length);
    expect(networkSection.items).toHaveLength(5);
    expect(networkSection.items[0]).toMatchObject({ chainId: "84532" });
    expect(actionSection.items.length).toBeGreaterThan(0);
    expect(actionSection.items.every((item) => item.kind === "action" && item.starter)).toBe(true);
    expect(result.sections.every((section) => section.more === 0)).toBe(true);
  });

  it("ranks a title that starts with the query above one that only contains it", () => {
    const result = searchPalette("sepolia", all);
    const found = result.sections.find((section) => section.kind === "network")?.items.map((item) => item.title);
    // Both only have a word starting with it; on a tie the selected network (first in the list) stays first.
    expect(found).toEqual(["Base Sepolia", "Ethereum Sepolia"]);
    expect(rank(networks.find((n) => n.title === "Base")!, "base")).toBe(0);
    expect(rank(networks.find((n) => n.title === "Base Sepolia")!, "sepolia")).toBe(1);
    expect(rank(networks.find((n) => n.title === "Arbitrum One")!, "bitrum")).toBe(2);
    expect(rank(networks.find((n) => n.title === "Base")!, "8453")).toBe(3);
    expect(rank(networks.find((n) => n.title === "Base")!, "solana")).toBeNull();
  });

  it("finds a page by name and an action by protocol, capping actions with an honest count", () => {
    expect(searchPalette("activity", all).sections[0].items[0]).toMatchObject({ kind: "page", href: "/app/activity" });
    const aave = searchPalette("aave", all).sections.find((section) => section.kind === "action");
    expect(aave?.items).toHaveLength(8);
    expect(aave?.more).toBeGreaterThan(0);
    const total = actions.filter((action) => rank(action, "aave") !== null).length;
    expect((aave?.items.length ?? 0) + (aave?.more ?? 0)).toBe(total);
  });

  it("matches every word of a multi-word query", () => {
    const found = searchPalette("aave supply", all).sections.find((section) => section.kind === "action");
    expect(found?.items.some((item) => item.id === "action:aave-v3/supply")).toBe(true);
  });

  it("finds a language by its own name, its English name or the word, only once something is typed (decisions 38–40)", () => {
    const languages = languageItems("ja");
    expect(languages[0]).toMatchObject({ code: "ja", current: true, title: "日本語" });
    const withLanguages = { ...all, languages };
    const languageSection = (query: string) => searchPalette(query, withLanguages).sections.find((s) => s.kind === "language");
    expect(languageSection("español")?.items[0]).toMatchObject({ code: "es" });
    expect(languageSection("japanese")?.items[0]).toMatchObject({ code: "ja" });
    expect(languageSection("language")?.items).toHaveLength(5);
    expect(languageSection("language")?.more).toBe(8);
    expect(searchPalette("", withLanguages).sections.some((s) => s.kind === "language")).toBe(false);
  });

  it("returns nothing for nonsense, and counts what it returns", () => {
    const result = searchPalette("zzzqqq", all);
    expect(result.sections).toEqual([]);
    expect(result.count).toBe(0);
    const some = searchPalette("base", all);
    expect(some.count).toBe(some.sections.reduce((sum, section) => sum + section.items.length + section.more, 0));
  });
});
