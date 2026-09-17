"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { detailInput, detailOutput, integrationLabel, integrationOf, toolTitle } from "@/components/cards/tool-meta";
import { IntegrationMark } from "@/components/data/integration-mark";
import type { Translate } from "@/lib/i18n/translate";
import { useTranslate } from "@/lib/i18n/use-translate";
import { cn } from "@/lib/utils";

import { toolPartSummary } from "./chat-rules";

/*
 * 21st heygaia/tool-calls-section (references/_notes/21st/tool-calls-section.txt):
 * stacked, tilted marks and "Used N tools" behind a chevron; open, each call is
 * a row on a connector line whose title opens to its input and output. While
 * the turn runs, the header takes 21st serafimcloud/tool-group's shimmering
 * label and elapsed time (21st-12423.txt).
 *
 * Changes: zinc greys become Portaldot tokens; the marks are integration logos
 * (decision 14); inputs and outputs are short key/value lines instead of
 * markdown; a call that failed reads in destructive ink (tool-group's isError);
 * elapsed time shows only while running, since durations are not stored.
 */

type Call = {
  integration: string;
  title: string;
  status: string;
  /** The raw part state behind `status`, compared instead of its words. */
  stateKey: string;
  failed: boolean;
  inputs: Array<[string, string]>;
  outputs: Array<[string, string]>;
};

const RUNNING = new Set(["input-streaming", "input-available", "approval-responded"]);
const MAX_ICONS = 10;
const ICON_SIZE = 21;

function toCall(part: unknown, t: Translate): (Call & { running: boolean }) | null {
  const summary = toolPartSummary(part, t);
  if (summary === null) return null;
  const loose = part as { state?: unknown; input?: unknown; output?: unknown; errorText?: unknown };
  const state = typeof loose.state === "string" ? loose.state : "";
  const output = loose.output;
  const failed =
    state === "output-error" ||
    (output !== null && typeof output === "object" && (output as { ok?: unknown }).ok === false);
  return {
    integration: integrationOf(summary.name, loose.input),
    title: toolTitle(summary.name, loose.input, t),
    status: failed ? t("chat.toolStates.failed") : summary.state,
    stateKey: failed ? "output-error" : summary.stateKey,
    failed,
    running: RUNNING.has(state),
    inputs: detailInput(summary.name, loose.input, t),
    outputs: detailOutput(summary.name, output, typeof loose.errorText === "string" ? loose.errorText : undefined, t),
  };
}

export function ToolTimeline({ parts, live }: { parts: readonly unknown[]; live: boolean }) {
  const t = useTranslations("chat.toolTimeline");
  const translate = useTranslate();
  const calls = parts.map((part) => toCall(part, translate)).filter((call): call is Call & { running: boolean } => call !== null);
  const running = live && calls.some((call) => call.running);
  const elapsed = useElapsed(running);
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedCalls, setExpandedCalls] = useState<Set<number>>(new Set());

  if (calls.length === 0) return null;

  const toggleCallExpansion = (index: number) => {
    setExpandedCalls((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const seen = new Set<string>();
  const uniqueIcons = calls.filter((call) => {
    if (seen.has(call.integration)) return false;
    seen.add(call.integration);
    return true;
  });
  const displayIcons = uniqueIcons.slice(0, MAX_ICONS);

  return (
    <div className="w-fit max-w-[35rem]">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="flex cursor-pointer items-center gap-2 py-2 text-fg-muted hover:text-foreground"
      >
        <div className="flex min-h-8 items-center -space-x-2">
          {displayIcons.map((call, index) => (
            <div
              key={call.integration}
              className="relative flex min-w-8 items-center justify-center"
              style={{
                rotate: displayIcons.length > 1 ? (index % 2 === 0 ? "8deg" : "-8deg") : "0deg",
                zIndex: index,
              }}
            >
              <IntegrationMark integration={call.integration} size={ICON_SIZE} />
            </div>
          ))}
          {uniqueIcons.length > MAX_ICONS && (
            <div className="z-0 flex size-7 min-h-7 min-w-7 items-center justify-center rounded-lg bg-surface-2 text-xs text-fg-muted">
              +{uniqueIcons.length - MAX_ICONS}
            </div>
          )}
        </div>
        <span className={cn("text-xs font-medium transition-all duration-200", running && "tool-shimmer")}>
          {running ? t("using", { count: calls.length }) : t("used", { count: calls.length })}
        </span>
        {elapsed !== undefined && <span className="font-mono text-[11px] tabular-nums text-fg-muted">{elapsed}</span>}
        <ChevronDown className={cn("size-[18px] transition-transform duration-200", isExpanded && "rotate-180")} />
      </button>

      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="space-y-0 pt-1">
          {calls.map((call, index) => {
            const hasDetails = call.inputs.length > 0 || call.outputs.length > 0;
            const isCallExpanded = expandedCalls.has(index);
            return (
              <div key={`${call.title}-step-${index}`} className="flex items-stretch gap-2">
                <div className="flex flex-col items-center self-stretch">
                  <div className="flex min-h-8 min-w-8 shrink-0 items-center justify-center">
                    <IntegrationMark integration={call.integration} size={ICON_SIZE} />
                  </div>
                  {index < calls.length - 1 && <div className="min-h-4 w-px flex-1 bg-border-strong" />}
                </div>

                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className={cn("group/parent flex items-center gap-1", hasDetails && "cursor-pointer")}
                    onClick={() => hasDetails && toggleCallExpansion(index)}
                    aria-expanded={hasDetails ? isCallExpanded : undefined}
                  >
                    <p
                      className={cn(
                        "text-left text-xs font-medium",
                        call.failed ? "text-destructive" : "text-fg-secondary",
                        hasDetails && !call.failed && "group-hover/parent:text-foreground",
                      )}
                    >
                      {call.title}
                    </p>
                    {hasDetails && (
                      <ChevronDown
                        className={cn("size-3.5 shrink-0 transition-transform duration-200", isCallExpanded && "rotate-180")}
                      />
                    )}
                  </button>
                  <p className="text-[11px] text-fg-muted">
                    {integrationLabel(call.integration, translate)}
                    {call.stateKey !== "output-available" && ` · ${call.status}`}
                  </p>

                  {isCallExpanded && hasDetails && (
                    <div className="mt-2 mb-3 w-fit max-w-full space-y-2 rounded-xl bg-surface-2/40 p-3 text-[11px]">
                      {call.inputs.length > 0 && (
                        <div className="flex flex-col">
                          <span className="mb-1 font-medium text-fg-muted">{t("input")}</span>
                          <DetailLines lines={call.inputs} />
                        </div>
                      )}
                      {call.outputs.length > 0 && (
                        <div className="flex flex-col">
                          <span className="mb-1 font-medium text-fg-muted">{t("output")}</span>
                          <DetailLines lines={call.outputs} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DetailLines({ lines }: { lines: Array<[string, string]> }) {
  return (
    <dl className="space-y-0.5 font-mono">
      {lines.map(([key, value], index) => (
        <div key={`${key}-${index}`} className="flex gap-2">
          <dt className="shrink-0 text-fg-muted">{key}</dt>
          <dd className="min-w-0 text-fg-secondary [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* tool-group's elapsed label, counted from when the line first appeared. */
function useElapsed(running: boolean): string | undefined {
  const t = useTranslations("chat.toolTimeline");
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  if (!running) return undefined;
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return seconds < 60
    ? t("elapsedSeconds", { seconds })
    : t("elapsedMinutes", { minutes: Math.floor(seconds / 60), seconds: seconds % 60 });
}
