import type { ReactNode } from "react";

import { DocsNav } from "@/components/docs/docs-nav";

/*
 * Portaldot app/docs/layout.tsx. Changes (decision 15): the docs sit inside
 * the app shell, so there is no FloatingNav or its pt-28 clearance, and the
 * shell's <main> is the landmark, so the column is a div.
 */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-6xl gap-10 px-4 pt-8 pb-12">
      <aside className="hidden w-52 shrink-0 lg:block">
        <DocsNav />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
