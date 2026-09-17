"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import type { VoiceEngine } from "./voice-engine";
import type { VoicePhase } from "./voice-rules";

/*
 * The glowing voice orb (decision 31). ChatGPT-style: a living gradient sphere
 * whose colours slowly turn, with a soft halo that breathes with the voice. The
 * glow and pulse come from 21st botsnew354/ia-siri-chat; the colours are
 * Portaldot's (telemetry cyan into violet), turning pending amber while a card
 * waits and destructive on an error. The halo and the sphere scale with the
 * live level the engine reports, written straight to a CSS variable so the
 * page never re-renders for audio. Styles in app/(app)/shell.css.
 */
export function VoiceGlowOrb({
  engine,
  phase,
  size,
  className,
}: {
  engine: VoiceEngine;
  phase: VoicePhase;
  size: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      engine.subscribeLevel((level) => {
        ref.current?.style.setProperty("--voice-level", level.toFixed(3));
      }),
    [engine],
  );

  return (
    <div
      ref={ref}
      aria-hidden
      data-phase={phase}
      className={cn("voice-orb relative shrink-0 rounded-full", className)}
      style={{ width: size, height: size }}
    >
      <span className="voice-orb-halo" />
      <span className="voice-orb-core" />
      <span className="voice-orb-sheen" />
    </div>
  );
}
