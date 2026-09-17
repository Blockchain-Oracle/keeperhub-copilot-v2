"use client";

import type { UIMessage } from "ai";
import { Mic } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { CardRenderer } from "@/components/cards/card-renderer";
import { splitSignature, supersededSignature } from "@/components/cards/editable.ts";
import type { RerunRequest } from "@/components/cards/read-card";
import type { WriteCeremony } from "@/components/cards/write-card.ts";
import { cn } from "@/lib/utils";

import { groupParts, isVoiceMessage, showsCard } from "./chat-rules";
import { Markdown } from "./markdown";
import { ToolTimeline } from "./tool-timeline";

/*
 * The conversation column. Portaldot components/app/chat-app.tsx:169-293 for the
 * page: a scrolling max-w-3xl column, the user's words in a bubble, the
 * assistant's markdown with none. DeepBookie components/chat/MessageList.tsx for
 * behaviour: follow the stream only within 120px of the bottom, three dots while
 * a turn is submitted, id+index keys (useChat can briefly repeat an id).
 *
 * Tool calls: each run of calls becomes a "Used N tools" line followed by its
 * cards (a lookup gets a card only when it is the answer, decision 12). From v1
 * Conversation: a message re-renders only when it changes, a card retired by a
 * newer one reads replaced (derived from the transcript), and a replacement
 * arriving live takes focus, never one replayed on load.
 *
 * Changes: the bubble keeps line breaks (the composer is multi-line); a textless
 * user message (a card re-run) draws nothing; a read-only chat passes neither the
 * re-run door nor the write card's callbacks, and its cards make no live fetches.
 */

export function MessageList({
  messages,
  status,
  empty,
  readOnly,
  rerun,
  ceremony,
}: {
  messages: UIMessage[];
  status: string;
  /** What an empty conversation shows (the launcher, or why the history could not load). */
  empty: ReactNode;
  readOnly: boolean;
  rerun?: (request: RerunRequest) => Promise<void>;
  ceremony?: WriteCeremony;
}) {
  const t = useTranslations("chat.messageList");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Memoized on a content signature, so the set keeps its identity across stream chunks.
  const signature = useMemo(() => supersededSignature(messages), [messages]);
  const superseded = useMemo<ReadonlySet<string>>(() => new Set(splitSignature(signature)), [signature]);
  // Messages present at first render are history; focus never jumps to one of them.
  const [historicalIds] = useState<ReadonlySet<string>>(() => new Set(messages.map((message) => message.id)));

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    // Only the list moves: scrollIntoView would also scroll the window (9.9).
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 120) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, status]);

  if (messages.length === 0) {
    return <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{empty}</div>;
  }

  const busy = status === "submitted" || status === "streaming";

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        {messages.map((message, index) => (
          <MessageView
            key={`${message.id}-${index}`}
            message={message}
            turnDone={!(busy && index === messages.length - 1)}
            live={!readOnly}
            rerun={readOnly ? undefined : rerun}
            ceremony={readOnly ? undefined : ceremony}
            resumeErrored={status === "error"}
            superseded={superseded}
            historical={historicalIds.has(message.id)}
          />
        ))}
        {status === "submitted" && (
          <div aria-label={t("thinking")} className="flex items-center gap-1.5 text-fg-muted">
            <span className="size-1.5 animate-bounce rounded-full bg-fg-muted [animation-delay:-0.2s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-fg-muted [animation-delay:-0.1s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-fg-muted" />
          </div>
        )}
      </div>
    </div>
  );
}

const MessageView = memo(function MessageView({
  message,
  turnDone,
  live,
  rerun,
  ceremony,
  resumeErrored,
  superseded,
  historical,
}: {
  message: UIMessage;
  turnDone: boolean;
  live: boolean;
  rerun?: (request: RerunRequest) => Promise<void>;
  ceremony?: WriteCeremony;
  resumeErrored: boolean;
  superseded: ReadonlySet<string>;
  historical: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const supersedes = messageSupersedes(message);

  useEffect(() => {
    if (supersedes !== undefined && !historical) containerRef.current?.focus({ preventScroll: true });
  }, [supersedes, historical]);

  if (message.role === "user") {
    const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
    if (text.trim() === "") return null;
    return (
      <div className="ml-auto w-fit max-w-[85%]">
        {isVoiceMessage(message) && <SaidMark className="mb-1 justify-end" />}
        <div className="rounded-2xl bg-secondary px-3.5 py-2 text-sm whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
          {text}
        </div>
      </div>
    );
  }

  const parts = message.parts;
  const spoken = isVoiceMessage(message) && parts.some((part) => part.type === "text" && part.text.trim() !== "");
  return (
    <div
      ref={containerRef}
      tabIndex={supersedes !== undefined ? -1 : undefined}
      className="scroll-mt-24 space-y-3 outline-none"
    >
      {spoken && <SaidMark />}
      {groupParts(parts).map((run) => {
        if (run.kind === "part") {
          const part = parts[run.index];
          return part.type === "text" && part.text ? <Markdown key={run.index}>{part.text}</Markdown> : null;
        }
        return (
          <div key={`tools-${run.indices[0]}`} className="space-y-3">
            <ToolTimeline parts={run.indices.map((index) => parts[index])} live={!turnDone} />
            {run.indices
              .filter((index) => showsCard(parts, index, turnDone))
              .map((index) => (
                <CardRenderer
                  key={`${message.id}-${index}`}
                  part={parts[index]}
                  superseded={superseded}
                  rerun={rerun}
                  ceremony={ceremony}
                  resumeErrored={resumeErrored}
                  live={live}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
});

/** Words that were spoken in a voice session rather than typed. */
function SaidMark({ className }: { className?: string }) {
  const t = useTranslations("chat.messageList");
  return (
    <span className={cn("flex items-center gap-1 font-mono text-[10px] tracking-[0.18em] text-fg-muted uppercase", className)}>
      <Mic aria-hidden className="size-3" />
      {t("said")}
    </span>
  );
}

/** The tool call this message retires, when it is a fresh card from an operation switch. */
function messageSupersedes(message: UIMessage): string | undefined {
  const metadata = message.metadata;
  if (metadata === null || typeof metadata !== "object") return undefined;
  const supersedes = (metadata as { supersedes?: unknown }).supersedes;
  return typeof supersedes === "string" && supersedes !== "" ? supersedes : undefined;
}
