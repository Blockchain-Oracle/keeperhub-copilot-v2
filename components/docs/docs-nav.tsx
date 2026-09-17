"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, Plug, Rocket } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * Portaldot components/docs/docs-nav.tsx. Changes: our three pages (the same
 * hrefs the header's Build and Learn menus use), and the sticky offset sits
 * 24px under the app header, as Portaldot's sits under its floating nav.
 */

const NAV = [
  { href: "/docs", label: "Getting started", icon: Rocket },
  { href: "/docs/actions", label: "Actions", icon: Boxes },
  { href: "/docs/mcp", label: "MCP setup", icon: Plug },
];

export function DocsNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-[calc(var(--appstrip)+116px)] space-y-1">
      <p className="px-3 pb-2 font-mono text-[11px] uppercase tracking-widest text-fg-muted">Docs</p>
      {NAV.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "bg-primary/12 font-medium text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
