"use client";

import { Wallet } from "lucide-react";
import { useTranslations } from "next-intl";

import { IntegrationMark } from "@/components/data/integration-mark";
import { getOperationEntry } from "@/lib/registry";

import { EmptyLine } from "./parts";
import { ReceiptCard } from "./receipt-card";

/*
 * The action lookup's card, shown only when the list is the answer (decision
 * 12). v1 components/cards/CapabilityList.tsx's data in Portaldot's list
 * grammar: the count in the meta slot, divided rows, the "—— none ——" line and
 * "+ N more" (tools.tsx TaskListCard / ValidatorsCard). Each row carries the
 * catalog card's name, mono id and pending "signs" pill for an action that
 * changes something (components/docs/tool-grid.tsx:102-120).
 */

type Match = { opId: string; label: string; description: string; executable: boolean; note?: string };

export function CapabilityCard({ result }: { result: unknown }) {
  const t = useTranslations("cards");
  const parsed = normalize(result);
  const matches = parsed?.matches ?? [];
  const total = parsed?.totalMatched ?? 0;
  return (
    <ReceiptCard toolName="search_actions" metaRight={t("capability.matches", { count: total })}>
      {matches.length === 0 ? (
        <EmptyLine>{t("capability.none")}</EmptyLine>
      ) : (
        <>
          <ul className="divide-y divide-border/70">
            {matches.map((match, index) => {
              const entry = getOperationEntry(match.opId);
              const signs = entry !== undefined && entry.effectClass !== "read";
              return (
                <li key={match.opId || index} className="flex items-start gap-3 py-2">
                  <span className="mt-0.5">
                    <IntegrationMark integration={entry?.integration ?? match.opId.split("/")[0]} size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{match.label}</span>
                      {signs && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-pending/40 bg-pending/10 px-1.5 py-0.5 text-[10px] font-medium text-pending">
                          <Wallet className="size-3" /> {t("capability.signs")}
                        </span>
                      )}
                    </div>
                    <code className="font-mono text-[11px] text-fg-muted">{match.opId}</code>
                    {match.description !== "" && (
                      <p className="mt-0.5 line-clamp-2 text-[13px] text-fg-secondary">{match.description}</p>
                    )}
                    {!match.executable && match.note !== undefined && (
                      <p className="mt-1 text-[12px] text-fg-muted">{match.note}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {parsed?.more !== undefined && parsed.more > 0 && (
            <p className="mt-2 font-mono text-[10px] tracking-[0.18em] text-fg-muted uppercase">{t("capability.more", { count: parsed.more })}</p>
          )}
        </>
      )}
    </ReceiptCard>
  );
}

function normalize(result: unknown): { matches: Match[]; totalMatched: number; more?: number } | null {
  if (result === null || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  if (!Array.isArray(record.matches)) return null;
  const matches = record.matches
    .filter((m): m is Record<string, unknown> => m !== null && typeof m === "object")
    .map((m) => ({
      opId: str(m.opId),
      label: str(m.label) || str(m.opId),
      description: str(m.description),
      executable: m.executable === true,
      note: typeof m.note === "string" ? m.note : undefined,
    }));
  return {
    matches,
    totalMatched: typeof record.totalMatched === "number" ? record.totalMatched : matches.length,
    more: typeof record.more === "number" ? record.more : undefined,
  };
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
