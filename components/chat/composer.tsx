"use client";

import { ArrowUp, AudioLines, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
} from "react";

import type { AnswerProblem } from "@/components/cards/input-request-form";
import { ChainMark } from "@/components/data/marks";
import { useCommandPalette } from "@/components/shell/command/command-palette";
import { NetworkMenuGroups, useSelectedNetwork } from "@/components/shell/header/network-pill";
import { Menu, MenuContent, MenuGroup, MenuItem, MenuLinkItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { VoiceBar } from "@/components/voice/voice-bar";
import type { VoiceEngine, VoiceSnapshot } from "@/components/voice/voice-engine";
import { VoiceFormSheet } from "@/components/voice/voice-form-sheet";
import type { InputAnswer, InputRequest } from "@/lib/chat/input-request";
import { registryMeta } from "@/lib/registry/generated/meta";
import { cn } from "@/lib/utils";

/*
 * The composer (decision 31). 21st jahed/ai-chat-input for behaviour: at rest a
 * slim pill with one button; tap it or start typing and it springs open (a
 * slight overshoot), widening and revealing its tool row; empty and unfocused,
 * it settles back. Its one action button morphs between states (scale, turn and
 * blur): talk while empty, send once there is text. Soft fades show when the
 * text scrolls. 21st jahed/ai-prompt-box for voice: pressing talk turns the box
 * itself into the voice bar (components/voice/voice-bar.tsx).
 *
 * Ours: Portaldot paint (card glass, violet send and a violet glow when open),
 * the tool row carries the plus menu (the network list and the action catalog)
 * and the selected network, Enter sends and Shift+Enter breaks a line, a failed
 * send puts the text back (v1 components/chat/Composer.tsx). The talk button is
 * a sound-wave mark, not a microphone: voice here is a live conversation with
 * the copilot, not dictation.
 */

const MAX_TEXTAREA_HEIGHT = 200;
// jahed/ai-chat-input's spring.
const SPRING = "cubic-bezier(0.175, 0.885, 0.32, 1.275)";

export type ComposerVoice = {
  snapshot: VoiceSnapshot;
  engine: VoiceEngine;
  /** Voice can be started right now (nothing sending, no card waiting). */
  available: boolean;
  onStart: () => void;
  onRetry: () => void;
  /** The form voice asked for, shown above the voice bar until it is answered (decision 33). */
  form?: {
    toolCallId: string;
    request: InputRequest;
    onAnswer: (answer: InputAnswer) => Promise<void | AnswerProblem>;
  } | null;
};

export function Composer({
  value,
  onChange,
  onSend,
  disabled,
  hint,
  voice,
}: {
  value: string;
  onChange: Dispatch<SetStateAction<string>>;
  /** Resolves false when the message was not sent, so the text comes back. */
  onSend: (text: string) => boolean | Promise<boolean>;
  disabled: boolean;
  /** Why sending is blocked (connect first, or an action awaits approval). */
  hint?: string;
  voice?: ComposerVoice;
}) {
  const t = useTranslations("chat.composer");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const topFadeRef = useRef<HTMLDivElement>(null);
  const bottomFadeRef = useRef<HTMLDivElement>(null);
  const network = useSelectedNetwork();
  const palette = useCommandPalette();
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const voiceShown = voice !== undefined && voice.snapshot.phase !== "idle";
  const hasValue = value.trim().length > 0;
  const expanded = focused || menuOpen || value.length > 0;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
    updateFades();
  }, [value, voiceShown]);

  function updateFades() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const below = textarea.scrollHeight - textarea.clientHeight - textarea.scrollTop;
    topFadeRef.current?.style.setProperty("opacity", String(Math.min(textarea.scrollTop / 20, 1)));
    bottomFadeRef.current?.style.setProperty("opacity", String(Math.min(Math.max(below - 4, 0) / 16, 1)));
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = value.trim();
    if (text === "" || disabled) return;
    onChange("");
    void Promise.resolve(onSend(text)).then((sent) => {
      if (sent === false) onChange((current) => (current === "" ? text : current));
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
    if (event.key === "Escape" && value === "") textareaRef.current?.blur();
  }

  function onBlur(event: FocusEvent<HTMLFormElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setFocused(false);
  }

  if (voiceShown && voice !== undefined) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        {voice.form != null && (
          <VoiceFormSheet key={voice.form.toolCallId} request={voice.form.request} onAnswer={voice.form.onAnswer} />
        )}
        <VoiceBar voice={voice.snapshot} engine={voice.engine} onRetry={voice.onRetry} />
      </div>
    );
  }

  const action: "send" | "talk" | "talk-unavailable" = hasValue ? "send" : voice?.available === true ? "talk" : "talk-unavailable";
  const actionLabel =
    action === "send" ? t("send") : action === "talk" ? t("talk") : t("talkUnavailable");

  function onAction() {
    if (action === "send") submit();
    else if (action === "talk") voice?.onStart();
  }

  return (
    <div className="mx-auto w-full" style={{ maxWidth: expanded ? "48rem" : "36rem", transition: `max-width 0.4s ${SPRING}` }}>
      {hint && <div className="mb-1.5 px-1 text-[11.5px] text-fg-muted">{hint}</div>}
      <form
        onSubmit={submit}
        onFocus={() => setFocused(true)}
        onBlur={onBlur}
        aria-label={t("form")}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            textareaRef.current?.focus();
          }
        }}
        className={cn(
          "relative cursor-text rounded-[26px] border bg-card/75 backdrop-blur-xl transition-[border-color,box-shadow] duration-300",
          expanded
            ? "border-primary/45 shadow-[0_18px_50px_-24px_oklch(0.66_0.22_288_/_55%)]"
            : "border-border-strong shadow-[0_10px_30px_-20px_oklch(0_0_0_/_60%)]",
        )}
      >
        <label htmlFor="composer-input" className="sr-only">
          {t("label")}
        </label>
        <div className="relative">
          <textarea
            id="composer-input"
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            onScroll={updateFades}
            placeholder={t("placeholder")}
            className={cn(
              "block w-full resize-none border-0 bg-transparent py-3.5 pl-4 text-[16px] leading-6 text-foreground placeholder:text-fg-muted focus:ring-0 focus-visible:outline-none",
              expanded ? "pr-4" : "pr-14",
            )}
            style={{ transition: `padding 0.3s ${SPRING}` }}
          />
          <div
            ref={topFadeRef}
            aria-hidden
            className="pointer-events-none absolute inset-x-4 top-0 h-6 bg-gradient-to-b from-card to-transparent opacity-0"
          />
          <div
            ref={bottomFadeRef}
            aria-hidden
            className="pointer-events-none absolute inset-x-4 bottom-0 h-6 bg-gradient-to-t from-card to-transparent opacity-0"
          />
        </div>

        <div className="grid" style={{ gridTemplateRows: expanded ? "1fr" : "0fr", transition: `grid-template-rows 0.4s ${SPRING}` }}>
          <div className="min-h-0 overflow-hidden">
            <div
              className={cn(
                "flex h-11 items-center gap-1.5 pr-14 pb-2 pl-2 transition-[opacity,filter,transform] duration-300",
                expanded ? "translate-y-0 opacity-100 blur-0" : "pointer-events-none translate-y-2 opacity-0 blur-sm",
              )}
            >
              <Menu modal={false} onOpenChange={setMenuOpen}>
                <MenuTrigger
                  aria-label={t("menu")}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-popup-open:bg-surface-2 data-popup-open:text-foreground"
                >
                  <Plus className="size-[18px]" />
                </MenuTrigger>
                <MenuContent side="top" align="start" sideOffset={10} className="w-64">
                  <NetworkMenuGroups />
                  <MenuSeparator />
                  <MenuGroup>
                    {palette !== null && (
                      <MenuItem onClick={palette.open} className="py-2 text-[13px]">
                        <Search aria-hidden className="size-3.5" />
                        <span className="flex-1">{t("searchActions")}</span>
                        <kbd className="font-mono text-[10px] text-fg-muted">⌘K</kbd>
                      </MenuItem>
                    )}
                    <MenuLinkItem render={<Link href="/docs/actions" />} closeOnClick className="py-2 text-[13px]">
                      {t("browseActions", { count: registryMeta.actionCount })}
                    </MenuLinkItem>
                  </MenuGroup>
                </MenuContent>
              </Menu>
              <div aria-hidden className="h-4 w-px shrink-0 bg-border" />
              <span className="flex h-8 min-w-0 items-center gap-2 rounded-full px-2 text-[13px] text-telemetry">
                <ChainMark chainId={network.chainId} name={network.name} size={15} />
                <span className="max-w-[10rem] truncate">{network.name}</span>
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onAction}
          onMouseDown={(event) => event.preventDefault()}
          disabled={action === "send" && disabled}
          aria-disabled={action === "talk-unavailable" || undefined}
          aria-label={actionLabel}
          title={actionLabel}
          className={cn(
            "absolute right-2 bottom-2 grid size-9 place-items-center rounded-full transition-[background-color,color,transform,filter] duration-300 focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40",
            action === "talk-unavailable"
              ? "cursor-not-allowed bg-surface-2 text-fg-muted"
              : "bg-primary text-primary-foreground hover:-translate-y-px hover:brightness-110",
            action === "talk" && "composer-talk",
          )}
        >
          <MorphIcon shown={action === "send"}>
            <ArrowUp className="size-[18px]" />
          </MorphIcon>
          <MorphIcon shown={action !== "send"}>
            <AudioLines className="size-[18px]" />
          </MorphIcon>
        </button>
      </form>
    </div>
  );
}

/* jahed/ai-chat-input's icon swap: the leaving icon shrinks, turns and blurs out as the arriving one settles in. */
function MorphIcon({ shown, children }: { shown: boolean; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute inset-0 grid place-items-center transition-[opacity,transform,filter] duration-300",
        shown ? "scale-100 rotate-0 opacity-100 blur-0" : "pointer-events-none scale-50 rotate-45 opacity-0 blur-[1px]",
      )}
      style={{ transitionTimingFunction: SPRING }}
    >
      {children}
    </span>
  );
}
