"use client";

import type { UIMessage } from "ai";
import { useEffect, useState, useSyncExternalStore } from "react";

import { useTranslate } from "@/lib/i18n/use-translate";

import { IDLE_VOICE, VoiceEngine, type VoiceSnapshot } from "./voice-engine";

/*
 * One chat's voice session: the engine lives as long as the chat, its state is
 * read with useSyncExternalStore, and the chat hands it the function that merges
 * what voice stored into the conversation on screen. Leaving the chat ends voice.
 */
export function useVoiceSession(applyMessages: (messages: UIMessage[]) => void): { voice: VoiceSnapshot; engine: VoiceEngine } {
  const [engine] = useState(() => new VoiceEngine());
  const voice = useSyncExternalStore(engine.subscribe, engine.getSnapshot, getIdle);
  const t = useTranslate();

  useEffect(() => {
    engine.setTranslate(t);
  }, [engine, t]);

  useEffect(() => {
    engine.setMessageSink(applyMessages);
  }, [engine, applyMessages]);

  useEffect(() => () => engine.end("closed"), [engine]);

  return { voice, engine };
}

function getIdle(): VoiceSnapshot {
  return IDLE_VOICE;
}
