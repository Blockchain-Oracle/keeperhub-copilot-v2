"use client";

import { Check, Copy, Search, Wallet } from "lucide-react";
import { useMemo, useState } from "react";

import { IntegrationMark } from "@/components/data/integration-mark";
import { cn } from "@/lib/utils";

import { ALL_INTEGRATIONS, catalogSize, filterCatalog, type CatalogAction, type CatalogGroup } from "./catalog-filter";

/*
 * Portaldot components/docs/tool-grid.tsx over KeeperHub's registry: the
 * sticky search and pills, a section per category, two-column cards with the
 * "signs" badge and a copyable example prompt.
 *
 * Changes: categories are integrations (34) with their registry descriptions;
 * each card and section wears the integration's mark; "signs" marks anything
 * that is not a read (the lookup card's rule); the sticky bar sits under the
 * app header.
 */

export function ActionGrid({ groups }: { groups: CatalogGroup[] }) {
  const [query, setQuery] = useState("");
  const [integration, setIntegration] = useState(ALL_INTEGRATIONS);

  const total = catalogSize(groups);
  const shownGroups = useMemo(() => filterCatalog(groups, query, integration), [groups, query, integration]);
  const shown = catalogSize(shownGroups);

  return (
    <div>
      <div className="sticky top-[calc(var(--appstrip)+92px)] z-10 -mx-1 mb-6 bg-background/80 px-1 py-3 backdrop-blur max-[720px]:top-[calc(var(--appstrip)+66px)]">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${total} actions…`}
            aria-label="Search actions"
            className="w-full rounded-xl border border-border bg-card py-2.5 pr-3 pl-9 text-sm text-foreground outline-none transition-colors placeholder:text-fg-muted focus:border-border-hover"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Pill active={integration === ALL_INTEGRATIONS} onClick={() => setIntegration(ALL_INTEGRATIONS)}>
            All
          </Pill>
          {groups.map((group) => (
            <Pill key={group.id} active={integration === group.id} onClick={() => setIntegration(group.id)}>
              {group.label}
            </Pill>
          ))}
        </div>
      </div>

      {shown === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No actions match “{query}”.</p>
      ) : (
        <div className="space-y-10">
          {shownGroups.map((group) => (
            <section key={group.id} id={group.id} className="scroll-mt-48">
              <div className="mb-3 flex items-start gap-2.5">
                <IntegrationMark integration={group.id} size={22} />
                <div className="min-w-0">
                  <h2 className="font-semibold tracking-tight text-foreground">{group.label}</h2>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{group.blurb}</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.actions.map((action) => (
                  <ActionCard key={action.opId} action={action} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary/40 bg-primary/12 text-primary"
          : "border-border bg-card text-muted-foreground hover:border-border-hover hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ActionCard({ action }: { action: CatalogAction }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(action.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  return (
    <div className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-border-hover">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium text-foreground">{action.label}</h3>
            {action.signs && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-pending/40 bg-pending/10 px-1.5 py-0.5 text-[10px] font-medium text-pending">
                <Wallet className="size-3" /> signs
              </span>
            )}
          </div>
          <code className="font-mono text-[11px] text-fg-muted">{action.opId}</code>
        </div>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{action.description}</p>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy the example prompt for ${action.label}`}
        className="mt-3 inline-flex items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-border-hover hover:text-foreground"
      >
        <span className="truncate font-mono">“{action.prompt}”</span>
        {copied ? (
          <Check className="size-3.5 shrink-0 text-success" />
        ) : (
          <Copy className="size-3.5 shrink-0 opacity-60 group-hover:opacity-100" />
        )}
      </button>
    </div>
  );
}
