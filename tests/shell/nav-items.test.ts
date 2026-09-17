import { describe, expect, it } from "vitest";

import {
  DESKTOP_NAV,
  isActiveNavItem,
  MOBILE_DRAWER_SECTIONS,
  MOBILE_NAV,
  NAVIGABLE_ROUTE_PATHS,
  NAV_ITEMS,
  type NavItem,
} from "@/components/shell/header/nav-items";

/* Masayume components/shell/header/nav-items.test.ts, against our destinations. */

describe("navigation registry", () => {
  it("keeps the approved desktop and mobile fast paths compact", () => {
    expect(DESKTOP_NAV.map((entry) => (entry.kind === "link" ? entry.item.name : entry.group.name))).toEqual([
      "Chat",
      "History",
      "Activity",
      "Build",
      "Learn",
    ]);
    expect(MOBILE_NAV.map((item) => item.name)).toEqual(["Chat", "History", "Activity", "Automations"]);
  });

  it("gives every drawer destination exactly one home", () => {
    const ids = MOBILE_DRAWER_SECTIONS.flatMap((section) => section.items.map((item) => item.id));
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every accepted user-facing route an explicit navigation home", () => {
    const destinations = [...MOBILE_NAV, ...MOBILE_DRAWER_SECTIONS.flatMap((section) => section.items)].map(
      (item) => item.href.split("?")[0],
    );
    const missing = NAVIGABLE_ROUTE_PATHS.filter((path) => !destinations.includes(path));

    expect(missing).toEqual([]);
  });

  it("lights Chat for the chat and its threads, and for nothing else under /app", () => {
    expect(isActiveNavItem("/app", NAV_ITEMS.chat)).toBe(true);
    expect(isActiveNavItem("/app/c/01JABC", NAV_ITEMS.chat)).toBe(true);
    expect(isActiveNavItem("/app/history", NAV_ITEMS.chat)).toBe(false);
    expect(isActiveNavItem("/app/automations", NAV_ITEMS.chat)).toBe(false);
    expect(isActiveNavItem("/app/history/01JABC", NAV_ITEMS.history)).toBe(true);
  });

  it("keeps Getting started from lighting up on the other docs pages", () => {
    expect(isActiveNavItem("/docs", NAV_ITEMS.gettingStarted)).toBe(true);
    expect(isActiveNavItem("/docs/mcp", NAV_ITEMS.gettingStarted)).toBe(false);
    expect(isActiveNavItem("/docs/mcp", NAV_ITEMS.mcp)).toBe(true);
    expect(isActiveNavItem("/docs/actions", NAV_ITEMS.actions)).toBe(true);
  });

  it("keeps every destination internal and never marks the landing section active", () => {
    const items: NavItem[] = Object.values(NAV_ITEMS);
    expect(items.every((item) => !item.external && item.href.startsWith("/"))).toBe(true);
    expect(isActiveNavItem("/", NAV_ITEMS.howItWorks)).toBe(false);
  });
});
