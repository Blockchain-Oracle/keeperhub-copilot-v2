"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/*
 * The docs sidebar.
 *
 * Ordered the way someone arrives rather than the way the app is built: what
 * this is, then how to do the first thing, then each part of it, and only then
 * how it works underneath. Anything to do with keys, MCP clients or running the
 * app yourself lives under Builders, at the bottom — it used to be the first
 * thing on the first page, which told a new person the product was a config
 * file.
 */

export const DOCS_SECTIONS = [
  {
    label: "Start here",
    items: [
      { href: "/docs", label: "What this is", exact: true },
      { href: "/docs/start/connect", label: "Connect KeeperHub" },
      { href: "/docs/start/first-answer", label: "Ask your first question" },
      { href: "/docs/start/first-action", label: "Your first action" },
    ],
  },
  {
    label: "Using it",
    items: [
      { href: "/docs/use/cards", label: "The cards" },
      { href: "/docs/use/voice", label: "Talking to it" },
      { href: "/docs/use/automations", label: "Automations" },
      { href: "/docs/use/record", label: "History and Activity" },
      { href: "/docs/use/language", label: "Your language" },
      { href: "/docs/use/getting-around", label: "Getting around" },
    ],
  },
  {
    label: "Under the hood",
    items: [
      { href: "/docs/how/architecture", label: "How it connects" },
      { href: "/docs/actions", label: "Every action" },
    ],
  },
  {
    label: "Builders",
    items: [
      { href: "/docs/builders/mcp", label: "MCP setup" },
      { href: "/docs/builders/self-host", label: "Run it yourself" },
    ],
  },
  {
    label: "Need a hand?",
    items: [
      { href: "/docs/help/glossary", label: "Glossary" },
      { href: "/docs/help/troubleshooting", label: "When it looks wrong" },
    ],
  },
] as const;

export function DocsNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-[calc(var(--appstrip)+116px)] max-h-[calc(100vh-var(--appstrip)-160px)] space-y-5 overflow-y-auto pr-1">
      {DOCS_SECTIONS.map((section) => (
        <div key={section.label}>
          <p className="px-3 pb-1.5 font-mono text-[10px] text-fg-muted uppercase tracking-[0.18em]">
            {section.label}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const active =
                "exact" in item && item.exact ? pathname === item.href : pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block rounded-lg px-3 py-[7px] text-[13.5px] transition-colors",
                    active
                      ? "bg-primary/12 font-medium text-primary"
                      : "text-fg-secondary hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
