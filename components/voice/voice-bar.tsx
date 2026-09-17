"use client";

import { Mic, MicOff, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { useTranslate } from "@/lib/i18n/use-translate";
import { cn } from "@/lib/utils";

import type { VoiceEngine, VoiceSnapshot } from "./voice-engine";
import { VoiceGlowOrb } from "./voice-glow";
import { formatClock, VOICE_BANDS, voiceHint, voiceLabel } from "./voice-rules";

/*
 * Voice in the composer's place (decision 31). 21st jahed/ai-prompt-box turns
 * its own box into the recorder (timer and bars inside the plate); here the
 * composer becomes a glowing capsule: the voice orb, what is happening and what
 * to do, live frequency bars (jahed/ai-chat-input's five-bar visualiser, fed by
 * the real mic or voice), the time left, Mute and End. A light ring turns around
 * the capsule's edge and its glow swells with the level; both turn pending amber
 * while a card waits for its click, destructive when voice could not start.
 * Cards and the conversation stay visible above it.
 */

const BANDS = Array.from({ length: VOICE_BANDS }, (_, index) => index);

export function VoiceBar({ voice, engine, onRetry }: { voice: VoiceSnapshot; engine: VoiceEngine; onRetry: () => void }) {
  const barRef = useRef<HTMLDivElement>(null);
  const bandRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [now, setNow] = useState(0);
  const t = useTranslations("voice.bar");
  const common = useTranslations("common");
  const translate = useTranslate();

  useEffect(() => {
    if (voice.endsAt === null) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [voice.endsAt]);

  useEffect(
    () =>
      engine.subscribeLevel((level, bands) => {
        barRef.current?.style.setProperty("--voice-level", level.toFixed(3));
        bands.forEach((band, index) => bandRefs.current[index]?.style.setProperty("--band", band.toFixed(3)));
      }),
    [engine],
  );

  const phase = voice.phase;
  const failed = phase === "error";
  const waiting = phase === "waiting";
  const connecting = phase === "connecting";
  const muteLabel = waiting ? t("mutedWhileAnswering") : voice.muted ? t("unmute") : t("mute");
  const secondsLeft =
    voice.endsAt === null || now === 0 ? voice.sessionSeconds : Math.max(0, Math.ceil((voice.endsAt - now) / 1000));

  return (
    <div
      ref={barRef}
      role="group"
      aria-label={t("group")}
      data-phase={phase}
      className="voice-bar flex w-full items-center gap-3 rounded-full bg-card/85 py-2 pr-2 pl-2 backdrop-blur-xl"
    >
      <VoiceGlowOrb engine={engine} phase={phase} size={40} />

      <div className="min-w-0 flex-1" aria-live="polite">
        <p className="truncate text-[13.5px] font-semibold text-foreground">{voiceLabel(phase, voice.muted, voice.waitingKind, translate)}</p>
        <p className={cn("truncate text-[12px]", failed ? "text-destructive" : "text-fg-muted")}>
          {failed ? voice.problem : voiceHint(phase, voice.muted, voice.waitingKind, translate)}
        </p>
      </div>

      {!failed && (
        <div aria-hidden className="hidden h-7 items-center gap-[3px] sm:flex">
          {BANDS.map((index) => (
            <span
              key={index}
              ref={(element) => {
                bandRefs.current[index] = element;
              }}
              className="voice-band w-[3px] rounded-full"
            />
          ))}
        </div>
      )}

      {voice.endsAt !== null && (
        <span className="hidden w-9 text-right font-mono text-[11.5px] tabular-nums text-fg-muted sm:block">{formatClock(secondsLeft)}</span>
      )}

      {failed ? (
        <>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-9 items-center rounded-full bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ring"
          >
            {common("tryAgain")}
          </button>
          <button
            type="button"
            onClick={() => engine.dismiss()}
            aria-label={t("close")}
            className="grid size-9 place-items-center rounded-full text-fg-secondary transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="size-4" />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => engine.toggleMute()}
            disabled={waiting || connecting}
            aria-pressed={voice.muted}
            aria-label={muteLabel}
            title={muteLabel}
            className={cn(
              "grid size-9 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed",
              voice.muted ? "bg-surface-2 text-fg-secondary" : "bg-surface-2 text-foreground hover:bg-border",
            )}
          >
            {voice.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => engine.end("user")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[12.5px] font-semibold text-background transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="size-3.5" />
            {t("end")}
          </button>
        </>
      )}
    </div>
  );
}
