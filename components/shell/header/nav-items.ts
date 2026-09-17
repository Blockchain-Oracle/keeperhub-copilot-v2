import {
  Activity, Blocks, BookOpen, CircleHelp, History, MessageSquare, Plug, Workflow, type LucideIcon,
} from "lucide-react";

import { englishTranslate, type Translate } from "@/lib/i18n/translate";

/*
 * Masayume components/shell/header/nav-items.ts — the one registry the header,
 * the desktop menus, the phone pill and the More drawer all read, so every
 * destination has exactly one home. Same types, same active rules. Two changes:
 * the destinations are ours (Chat · History · Activity · Build▾ · Learn▾), and
 * `match.nested` lets Chat own /app exactly plus its /app/c/… threads without
 * also lighting up on /app/history.
 *
 * Text: messages/en/shell.json (decision 41). Each entry carries its `textKey`;
 * `name` and `description` hold the English, and the screens read the person's
 * language through navName / navDescription.
 */

type NavText = { textKey: string; name: string; description: string };

export type NavItem = NavText & {
  id: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
  beta?: boolean;
  match?: { paths: readonly string[]; exact?: boolean; nested?: readonly string[] };
};

export type NavSection = NavText & {
  id: string;
  items: readonly NavItem[];
};

export type NavGroup = NavText & {
  id: "build" | "learn";
  sections: readonly NavSection[];
};

function text(textKey: string): NavText {
  return { textKey, name: englishTranslate(`${textKey}.name`), description: englishTranslate(`${textKey}.description`) };
}

export function navName(entry: { textKey: string }, t: Translate = englishTranslate): string {
  return t(`${entry.textKey}.name`);
}

export function navDescription(entry: { textKey: string }, t: Translate = englishTranslate): string {
  return t(`${entry.textKey}.description`);
}

export const NAV_ITEMS = {
  chat: {
    id: "chat",
    ...text("shell.nav.items.chat"),
    href: "/app",
    icon: MessageSquare,
    match: { paths: ["/app"], exact: true, nested: ["/app/c"] },
  },
  history: {
    id: "history",
    ...text("shell.nav.items.history"),
    href: "/app/history",
    icon: History,
  },
  activity: {
    id: "activity",
    ...text("shell.nav.items.activity"),
    href: "/app/activity",
    icon: Activity,
  },
  automations: {
    id: "automations",
    ...text("shell.nav.items.automations"),
    href: "/app/automations",
    icon: Workflow,
  },
  actions: {
    id: "actions",
    ...text("shell.nav.items.actions"),
    href: "/docs/actions",
    icon: Blocks,
  },
  gettingStarted: {
    id: "getting-started",
    ...text("shell.nav.items.gettingStarted"),
    href: "/docs",
    icon: BookOpen,
    match: { paths: ["/docs"], exact: true },
  },
  mcp: {
    id: "mcp",
    ...text("shell.nav.items.mcp"),
    href: "/docs/mcp",
    icon: Plug,
  },
  howItWorks: {
    id: "how-it-works",
    ...text("shell.nav.items.howItWorks"),
    href: "/#how",
    icon: CircleHelp,
    match: { paths: [] },
  },
} as const satisfies Record<string, NavItem>;

export const BUILD_GROUP: NavGroup = {
  id: "build",
  ...text("shell.nav.groups.build"),
  sections: [
    {
      id: "automate",
      ...text("shell.nav.sections.automate"),
      items: [NAV_ITEMS.automations, NAV_ITEMS.actions],
    },
  ],
};

export const LEARN_GROUP: NavGroup = {
  id: "learn",
  ...text("shell.nav.groups.learn"),
  sections: [
    {
      id: "guides",
      ...text("shell.nav.sections.guides"),
      items: [NAV_ITEMS.gettingStarted, NAV_ITEMS.mcp, NAV_ITEMS.howItWorks],
    },
  ],
};

export type DesktopNavEntry = { kind: "link"; item: NavItem } | { kind: "group"; group: NavGroup };

export const DESKTOP_NAV: readonly DesktopNavEntry[] = [
  { kind: "link", item: NAV_ITEMS.chat },
  { kind: "link", item: NAV_ITEMS.history },
  { kind: "link", item: NAV_ITEMS.activity },
  { kind: "group", group: BUILD_GROUP },
  { kind: "group", group: LEARN_GROUP },
];

export const MOBILE_NAV: readonly NavItem[] = [NAV_ITEMS.chat, NAV_ITEMS.history, NAV_ITEMS.activity, NAV_ITEMS.automations];
export const MOBILE_DRAWER_SECTIONS: readonly NavSection[] = [...BUILD_GROUP.sections, ...LEARN_GROUP.sections];
export const MOBILE_OVERFLOW: readonly NavItem[] = MOBILE_DRAWER_SECTIONS.flatMap((section) => section.items);

/** Every real, user-facing page that must retain an explicit navigation home. */
export const NAVIGABLE_ROUTE_PATHS = [
  "/app", "/app/activity", "/app/automations", "/app/history", "/docs", "/docs/actions", "/docs/mcp",
] as const;

export function isActiveNavItem(pathname: string | null, item: NavItem): boolean {
  if (!pathname || item.external) return false;
  const fallbackPath = item.href.split("?")[0] ?? item.href;
  const match = item.match ?? { paths: [fallbackPath] };
  return (
    match.paths.some((path) => pathname === path || (!match.exact && pathname.startsWith(`${path}/`))) ||
    (match.nested ?? []).some((path) => pathname.startsWith(`${path}/`))
  );
}

export function isActiveNavGroup(pathname: string | null, group: NavGroup): boolean {
  return group.sections.some((section) => section.items.some((item) => isActiveNavItem(pathname, item)));
}
