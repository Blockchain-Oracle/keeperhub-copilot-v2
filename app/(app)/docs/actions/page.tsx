import type { Metadata } from "next";

import { catalogSize } from "@/components/docs/catalog-filter";
import { ActionGrid } from "@/components/docs/action-grid";
import { actionCatalog } from "@/lib/docs-catalog";

export const metadata: Metadata = { title: "Actions" };

/* Portaldot app/docs/tools/page.tsx over KeeperHub's registry. */

const GROUPS = actionCatalog();

export default function ActionsPage() {
  return (
    <div className="max-w-3xl">
      <span className="font-mono text-xs tracking-widest text-primary uppercase">Under the hood</span>
      <h1
        className="mt-3 text-[34px] leading-tight tracking-[-0.02em] text-foreground"
        style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
      >
        Every action
      </h1>
      <p className="mt-3 text-base leading-relaxed text-fg-secondary">
        {catalogSize(GROUPS)} actions KeeperHub can run, across {GROUPS.length} integrations. Tap any example to copy
        the prompt, then paste it into chat. Actions marked <span className="text-pending">signs</span> change
        something, so they stop as a card for you to authorize.
      </p>
      <div className="mt-8">
        <ActionGrid groups={GROUPS} />
      </div>
    </div>
  );
}
