"use client";

import { useTranslations } from "next-intl";

import { useTranslate } from "@/lib/i18n/use-translate";

import type { VoiceEngine, VoiceSnapshot } from "./voice-engine";
import { VoiceGlowOrb } from "./voice-glow";
import { voiceHint, voiceLabel } from "./voice-rules";

/*
 * An empty chat in voice (decision 31): ChatGPT's voice screen, a large glowing
 * orb in the middle with what is happening under it, while the composer below
 * has become the voice bar. As soon as anything is said or a card appears, the
 * conversation takes this space and the orb lives on in the bar.
 */
export function VoiceHero({ voice, engine }: { voice: VoiceSnapshot; engine: VoiceEngine }) {
  const failed = voice.phase === "error";
  const t = useTranslations("voice.hero");
  const translate = useTranslate();
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-7 px-6 py-16 text-center">
      <VoiceGlowOrb engine={engine} phase={voice.phase} size={148} className="voice-orb-hero" />
      <div aria-live="polite">
        <p className="text-[21px] font-semibold tracking-[-0.02em] text-foreground">{voiceLabel(voice.phase, voice.muted, undefined, translate)}</p>
        <p className={failed ? "mt-1.5 text-[13.5px] text-destructive" : "mt-1.5 text-[13.5px] text-fg-secondary"}>
          {failed ? voice.problem : voiceHint(voice.phase, voice.muted, undefined, translate)}
        </p>
      </div>
      {!failed && <p className="max-w-sm text-[12.5px] text-fg-muted">{t("examples")}</p>}
    </div>
  );
}
