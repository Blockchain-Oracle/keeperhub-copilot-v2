import type { RealtimeItem } from "@openai/agents/realtime";

import { englishTranslate, type Translate } from "@/lib/i18n/translate";

/*
 * Voice's rules, free of React and the browser's audio so they run under node
 * tests (slice 9): which speech is finished and ready to save, what the voice
 * button says in each state, the session clock, and what a microphone refusal
 * means in plain words.
 */

export type VoicePhase = "idle" | "connecting" | "listening" | "speaking" | "waiting" | "error";

/** Decision 29 says ten minutes; a minute before the end voice is told to say goodbye. */
export const WRAP_UP_BEFORE_SECONDS = 60;

/** How long a tool call waits for the person's words to finish transcribing, so they are saved before its card. */
export const SPEECH_WAIT_MS = 2_500;

export type SaidItem = { id: string; role: "user" | "assistant"; text: string };

/*
 * The speech that is finished, in the order it was said, leaving out what was
 * already handed over. The person's words are finished once every audio part
 * has its transcript; a reply once its response completed (a cut-off reply is
 * trimmed to what was heard first).
 */
export function finishedSpeech(history: readonly RealtimeItem[], handled: ReadonlySet<string>): SaidItem[] {
  return history.flatMap((item): SaidItem[] => {
    if (item.type !== "message" || handled.has(item.itemId)) return [];
    if (item.role === "user") {
      if (item.content.some((part) => part.type === "input_audio" && part.transcript === null)) return [];
      const text = item.content.map((part) => (part.type === "input_audio" ? (part.transcript ?? "") : part.text)).join(" ").trim();
      return text === "" ? [] : [{ id: item.itemId, role: "user", text }];
    }
    if (item.role === "assistant") {
      if (item.status !== "completed") return [];
      const text = item.content.map((part) => (part.type === "output_audio" ? (part.transcript ?? "") : part.text)).join(" ").trim();
      return text === "" ? [] : [{ id: item.itemId, role: "assistant", text }];
    }
    return [];
  });
}

/** The person's latest words are still being transcribed. */
export function awaitingUserTranscript(history: readonly RealtimeItem[]): boolean {
  for (let index = history.length - 1; index >= 0; index--) {
    const item = history[index];
    if (item.type === "message" && item.role === "user") {
      return item.content.some((part) => part.type === "input_audio" && part.transcript === null);
    }
  }
  return false;
}

/** How many frequency bars the voice bar draws. */
export const VOICE_BANDS = 5;
export const SILENT_BANDS: readonly number[] = Object.freeze(new Array<number>(VOICE_BANDS).fill(0));

/*
 * An analyser's frequency bins (0–255 each) as a few bars, 0–1. Speech sits in
 * the low part of the spectrum, so only the lower 40% of the bins are split
 * across the bars; the top bin (DC) is skipped.
 */
export function toBands(frequencies: ArrayLike<number>, count = VOICE_BANDS): number[] {
  const usable = Math.max(count, Math.floor(frequencies.length * 0.4));
  const size = Math.max(1, Math.floor(usable / count));
  return Array.from({ length: count }, (_, band) => {
    let sum = 0;
    for (let offset = 0; offset < size; offset++) sum += frequencies[1 + band * size + offset] ?? 0;
    return Math.min(1, sum / size / 200);
  });
}

/** What voice waits on: a card to authorize, or a form of details (decision 33). */
export type VoiceWaitingKind = "card" | "form";

/** The line under the voice status, saying what the person can do now. */
export function voiceHint(
  phase: VoicePhase,
  muted: boolean,
  waitingKind: VoiceWaitingKind | null = "card",
  t: Translate = englishTranslate,
): string {
  switch (phase) {
    case "connecting":
      return t("voice.hint.connecting");
    case "listening":
      return muted ? t("voice.hint.muted") : t("voice.hint.listening");
    case "speaking":
      return t("voice.hint.speaking");
    case "waiting":
      return waitingKind === "form" ? t("voice.hint.waitingForm") : t("voice.hint.waitingCard");
    default:
      return "";
  }
}

export function voiceLabel(
  phase: VoicePhase,
  muted: boolean,
  waitingKind: VoiceWaitingKind | null = "card",
  t: Translate = englishTranslate,
): string {
  switch (phase) {
    case "connecting":
      return t("voice.label.connecting");
    case "listening":
      return muted ? t("voice.label.muted") : t("voice.label.listening");
    case "speaking":
      return t("voice.label.speaking");
    case "waiting":
      return waitingKind === "form" ? t("voice.label.waitingForm") : t("voice.label.waitingCard");
    case "error":
      return t("voice.label.error");
    default:
      return t("voice.label.idle");
  }
}

/** How much of the session is left, 1 at the start and 0 at the end: Masayume's draining ring. */
export function ringFraction(secondsLeft: number, sessionSeconds: number): number {
  if (sessionSeconds <= 0) return 0;
  return Math.max(0, Math.min(1, secondsLeft / sessionSeconds));
}

export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** A microphone that could not be opened, in plain words (MDN getUserMedia exceptions). */
export function micProblem(error: unknown, t: Translate = englishTranslate): string {
  const name = error !== null && typeof error === "object" ? (error as { name?: unknown }).name : undefined;
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return t("voice.micProblem.blocked");
    case "NotFoundError":
    case "OverconstrainedError":
      return t("voice.micProblem.notFound");
    case "NotReadableError":
      return t("voice.micProblem.inUse");
    default:
      return t("voice.micProblem.other");
  }
}
