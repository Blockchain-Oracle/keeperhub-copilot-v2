import type { RealtimeItem, RealtimeSession } from "@openai/agents/realtime";
import type { UIMessage } from "ai";

import type { VoiceAnswerResponse } from "@/app/api/voice/answer/route";
import type { VoiceSessionResponse } from "@/app/api/voice/session/route";
import type { VoiceToolResponse } from "@/app/api/voice/tool/route";
import type { VoiceTranscriptResponse } from "@/app/api/voice/transcript/route";
import type { AnswerProblem } from "@/components/cards/input-request-form";
import { toast } from "@/components/ui/toast";
import type { InputAnswer, InputIssue } from "@/lib/chat/input-request";
import { englishTranslate, type Translate } from "@/lib/i18n/translate";

import {
  awaitingUserTranscript,
  finishedSpeech,
  micProblem,
  SILENT_BANDS,
  SPEECH_WAIT_MS,
  toBands,
  WRAP_UP_BEFORE_SECONDS,
  type VoicePhase,
  type VoiceWaitingKind,
} from "./voice-rules";

/*
 * One voice session in the browser (slice 9), kept outside React so the chat
 * reads it through useSyncExternalStore.
 *
 * The flow, from the research (FINDINGS "Voice"): open the mic from the click,
 * ask our server for a short-lived key, then run the Agents SDK RealtimeSession
 * over WebRTC with our own mic stream and audio element (so the button can show
 * levels). Every tool the model calls only posts to /api/voice/tool; the server
 * decides. A change comes back as a card waiting for its click: the mic mutes
 * (decision 30) and voice waits. The SDK's own approvals are never used. The
 * chat tells the engine how the card ended, and the engine adds that as a system
 * message and asks voice to speak (decision 26). Finished speech is saved into
 * the conversation; speech while a card waits is not (nothing may follow it).
 * The session ends after its length (decision 29), on End, or when the
 * connection drops.
 */

export type VoiceSnapshot = {
  phase: VoicePhase;
  muted: boolean;
  problem: string | null;
  /** When the session ends (ms), while one runs. */
  endsAt: number | null;
  sessionSeconds: number;
  /** The voice card or form waiting for the person, by tool call id. */
  waitingCard: string | null;
  /** Whether that is a card to authorize or a form of details (decision 33). */
  waitingKind: VoiceWaitingKind | null;
};

export type VoiceEndReason = "user" | "time" | "dropped" | "closed";

export const IDLE_VOICE: VoiceSnapshot = {
  phase: "idle",
  muted: false,
  problem: null,
  endsAt: null,
  sessionSeconds: 600,
  waitingCard: null,
  waitingKind: null,
};

type Json = Record<string, unknown>;

export class VoiceEngine {
  #snapshot: VoiceSnapshot = IDLE_VOICE;
  #listeners = new Set<() => void>();
  #levelListeners = new Set<(level: number, bands: readonly number[]) => void>();
  #applyMessages: (messages: UIMessage[]) => void = () => {};
  #t: Translate = englishTranslate;
  #session: RealtimeSession | null = null;
  #stream: MediaStream | null = null;
  #audio: HTMLAudioElement | null = null;
  #context: AudioContext | null = null;
  #frame = 0;
  #timers: Array<ReturnType<typeof setTimeout>> = [];
  #flushTimer: ReturnType<typeof setTimeout> | null = null;
  #conversationId: string | null = null;
  #history: RealtimeItem[] = [];
  #handled = new Set<string>();
  #userMuted = false;
  #starting = false;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getSnapshot = (): VoiceSnapshot => this.#snapshot;

  /** Live loudness and frequency bars, 0–1: the mic while listening, the voice while speaking. */
  subscribeLevel = (listener: (level: number, bands: readonly number[]) => void): (() => void) => {
    this.#levelListeners.add(listener);
    return () => this.#levelListeners.delete(listener);
  };

  setMessageSink(apply: (messages: UIMessage[]) => void): void {
    this.#applyMessages = apply;
  }

  /** The person's language for what voice shows on screen (decision 41); what voice hears stays English. */
  setTranslate(t: Translate): void {
    this.#t = t;
  }

  async start(conversationId: string): Promise<void> {
    if (this.#session !== null || this.#starting) return;
    this.#starting = true;
    this.#conversationId = conversationId;
    this.#handled = new Set();
    this.#history = [];
    this.#userMuted = false;
    this.#set({ phase: "connecting", problem: null, muted: false, waitingCard: null, waitingKind: null, endsAt: null });

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (error) {
        this.#fail(micProblem(error, this.#t));
        return;
      }
      this.#stream = stream;

      let config: VoiceSessionResponse;
      try {
        const response = await fetch("/api/voice/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ conversationId }),
        });
        const body = (await response.json().catch(() => ({}))) as Partial<VoiceSessionResponse> & { error?: { message?: string } };
        if (!response.ok || typeof body.value !== "string") {
          this.#fail(body.error?.message ?? this.#t("voice.engine.startFailed"));
          return;
        }
        config = body as VoiceSessionResponse;
      } catch {
        this.#fail(this.#t("voice.engine.startOffline"));
        return;
      }

      const { OpenAIRealtimeWebRTC, RealtimeAgent, RealtimeSession, tool } = await import("@openai/agents/realtime");
      const audio = document.createElement("audio");
      audio.autoplay = true;
      this.#audio = audio;

      const agent = new RealtimeAgent({
        name: "KeeperHub copilot",
        instructions: config.instructions,
        ...(config.voice !== null ? { voice: config.voice } : {}),
        tools: config.tools.map((surface) =>
          tool({
            name: surface.name,
            description: surface.description,
            parameters: surface.parameters as never,
            strict: false,
            execute: (args: unknown) => this.#runTool(surface.name, args),
          }),
        ),
      });
      const session = new RealtimeSession(agent, {
        transport: new OpenAIRealtimeWebRTC({ mediaStream: stream, audioElement: audio }),
        model: config.model,
        config: {
          audio: {
            input: {
              // The picked language (decisions 38–40) shapes the on-screen transcript; the voice's own language is in its instructions.
              transcription: { model: "gpt-4o-mini-transcribe", language: config.transcriptionLanguage },
              turnDetection: { type: "semantic_vad" },
            },
          },
        },
      });
      this.#session = session;

      session.on("history_updated", (history) => {
        this.#history = history;
        this.#scheduleFlush();
      });
      session.on("audio_start", () => {
        if (this.#snapshot.waitingCard === null && this.#session === session) this.#set({ phase: "speaking" });
      });
      const quiet = () => {
        if (this.#snapshot.phase === "speaking" && this.#session === session) this.#set({ phase: "listening" });
      };
      session.on("audio_stopped", quiet);
      session.on("audio_interrupted", quiet);
      session.on("error", (event) => console.warn("[voice] session error", event));
      session.transport.on("connection_change", (status) => {
        if (status === "disconnected" && this.#session === session) this.end("dropped");
      });

      try {
        await session.connect({ apiKey: config.value });
      } catch (error) {
        console.warn("[voice] connect failed", error);
        this.#fail(this.#t("voice.engine.connectFailed"));
        return;
      }

      const seconds = config.sessionSeconds;
      this.#timers.push(
        setTimeout(
          () =>
            this.#tellVoice(
              "The voice session ends in one minute. If no card is waiting, say a short goodbye; otherwise say the session is ending soon.",
            ),
          Math.max(0, (seconds - WRAP_UP_BEFORE_SECONDS) * 1000),
        ),
        setTimeout(() => this.end("time"), seconds * 1000),
      );
      this.#watchLevels(stream, session);
      this.#set({ phase: "listening", sessionSeconds: seconds, endsAt: Date.now() + seconds * 1000 });
    } finally {
      this.#starting = false;
    }
  }

  end(reason: VoiceEndReason): void {
    if (this.#snapshot.phase === "idle" && this.#session === null) return;
    const session = this.#session;
    if (session !== null) void this.#flush();
    this.#session = null;
    try {
      session?.close();
    } catch (error) {
      console.warn("[voice] close failed", error);
    }
    this.#release();
    this.#set({ ...IDLE_VOICE, sessionSeconds: this.#snapshot.sessionSeconds });
    if (reason === "time") {
      toast.add({ title: this.#t("voice.engine.ended.title"), description: this.#t("voice.engine.ended.description") });
    } else if (reason === "dropped") {
      toast.add({ type: "warning", title: this.#t("voice.engine.dropped.title"), description: this.#t("voice.engine.dropped.description") });
    }
  }

  /** Close the error state without starting again. */
  dismiss(): void {
    if (this.#snapshot.phase === "error") this.#set({ ...IDLE_VOICE, sessionSeconds: this.#snapshot.sessionSeconds });
  }

  toggleMute(): void {
    const session = this.#session;
    if (session === null || this.#snapshot.waitingCard !== null) return;
    this.#userMuted = !this.#userMuted;
    session.mute(this.#userMuted);
    this.#set({ muted: this.#userMuted });
  }

  /** The chat saw the waiting card end: voice hears how, and the mic comes back (decisions 26, 30). */
  reportOutcome(toolCallId: string, text: string): void {
    if (this.#snapshot.waitingCard !== toolCallId || this.#session === null) return;
    this.#session.mute(this.#userMuted);
    this.#set({ waitingCard: null, waitingKind: null, muted: this.#userMuted, phase: "listening" });
    this.#tellVoice(text);
  }

  /*
   * The person filled in or closed the form above the voice bar (decision 33).
   * The answer is stored and handed to the chat; the chat's watcher then tells
   * voice what was entered, as it does when a card ends.
   */
  async answerForm(toolCallId: string, answer: InputAnswer): Promise<void | AnswerProblem> {
    const conversationId = this.#conversationId;
    if (conversationId === null || this.#snapshot.waitingCard !== toolCallId) {
      return { message: this.#t("voice.engine.formGone") };
    }
    try {
      const response = await fetch("/api/voice/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, toolCallId, answer }),
      });
      const body = (await response.json().catch(() => ({}))) as Partial<VoiceAnswerResponse> & {
        error?: { message?: string; issues?: InputIssue[] };
      };
      if (!response.ok || !Array.isArray(body.messages)) {
        return { message: body.error?.message ?? this.#t("voice.engine.detailsFailed"), issues: body.error?.issues };
      }
      this.#applyMessages(body.messages);
    } catch {
      return { message: this.#t("voice.engine.detailsOffline") };
    }
  }

  // --- tools and speech ---------------------------------------------------------------

  async #runTool(name: string, args: unknown): Promise<string> {
    const conversationId = this.#conversationId;
    if (conversationId === null) return "Not run. The conversation is not available.";
    // The person's words go in before the card, so wait briefly for them to finish transcribing.
    const started = Date.now();
    while (awaitingUserTranscript(this.#history) && Date.now() - started < SPEECH_WAIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const said = finishedSpeech(this.#history, this.#handled);
    try {
      const response = await fetch("/api/voice/tool", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, toolName: name, args, said }),
      });
      const body = (await response.json().catch(() => ({}))) as Partial<VoiceToolResponse> & { error?: { message?: string } };
      if (!response.ok) return `Not run. ${body.error?.message ?? "The copilot could not run it."}`;
      for (const item of said) this.#handled.add(item.id);
      if (Array.isArray(body.messages) && body.messages.length > 0) this.#applyMessages(body.messages);
      if (body.pending === true && typeof body.cardToolCallId === "string" && this.#session !== null) {
        this.#session.mute(true);
        this.#set({
          waitingCard: body.cardToolCallId,
          waitingKind: body.waitingKind === "form" ? "form" : "card",
          muted: true,
          phase: "waiting",
        });
      }
      return body.forModel ?? "Done.";
    } catch {
      return "Not run. The copilot could not be reached.";
    }
  }

  #scheduleFlush(): void {
    if (this.#flushTimer !== null) return;
    this.#flushTimer = setTimeout(() => {
      this.#flushTimer = null;
      void this.#flush();
    }, 500);
  }

  async #flush(): Promise<void> {
    const conversationId = this.#conversationId;
    if (conversationId === null) return;
    const said = finishedSpeech(this.#history, this.#handled);
    if (said.length === 0) return;
    for (const item of said) this.#handled.add(item.id);
    // Speech while a card waits is not saved: nothing may follow the card, and the card is the record.
    if (this.#snapshot.waitingCard !== null) return;
    try {
      const response = await fetch("/api/voice/transcript", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, items: said }),
      });
      if (!response.ok) {
        for (const item of said) this.#handled.delete(item.id);
        return;
      }
      const body = (await response.json()) as VoiceTranscriptResponse;
      if (body.messages.length > 0) this.#applyMessages(body.messages);
    } catch {
      for (const item of said) this.#handled.delete(item.id);
    }
  }

  #tellVoice(text: string): void {
    const session = this.#session;
    if (session === null) return;
    const event: Json = {
      type: "conversation.item.create",
      item: { type: "message", role: "system", content: [{ type: "input_text", text }] },
    };
    session.transport.sendEvent(event as never);
    session.transport.requestResponse?.();
  }

  // --- levels, state, cleanup ---------------------------------------------------------------

  #watchLevels(stream: MediaStream, session: RealtimeSession): void {
    try {
      const context = new AudioContext();
      this.#context = context;
      void context.resume();
      const mic = context.createAnalyser();
      mic.fftSize = 256;
      context.createMediaStreamSource(stream).connect(mic);
      let voice: AnalyserNode | null = null;
      const peer = (session.transport as { connectionState?: { peerConnection?: RTCPeerConnection } }).connectionState?.peerConnection;
      const track = peer?.getReceivers().find((receiver) => receiver.track?.kind === "audio")?.track;
      if (track !== undefined) {
        voice = context.createAnalyser();
        voice.fftSize = 256;
        context.createMediaStreamSource(new MediaStream([track])).connect(voice);
      }
      const wave = new Uint8Array(mic.fftSize);
      const spectrum = new Uint8Array(mic.frequencyBinCount);
      const loop = () => {
        const analyser = this.#snapshot.phase === "speaking" && voice !== null ? voice : mic;
        const silent = this.#snapshot.muted && analyser === mic;
        analyser.getByteTimeDomainData(wave);
        analyser.getByteFrequencyData(spectrum);
        let peak = 0;
        for (const value of wave) peak = Math.max(peak, Math.abs(value - 128));
        const level = silent ? 0 : Math.min(1, peak / 64);
        const bands = silent ? SILENT_BANDS : toBands(spectrum);
        for (const listener of this.#levelListeners) listener(level, bands);
        this.#frame = requestAnimationFrame(loop);
      };
      this.#frame = requestAnimationFrame(loop);
    } catch (error) {
      console.warn("[voice] level meter unavailable", error);
    }
  }

  #fail(problem: string): void {
    const session = this.#session;
    this.#session = null;
    try {
      session?.close();
    } catch {
      // already closed
    }
    this.#release();
    this.#set({ ...IDLE_VOICE, sessionSeconds: this.#snapshot.sessionSeconds, phase: "error", problem });
  }

  #release(): void {
    cancelAnimationFrame(this.#frame);
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers = [];
    if (this.#flushTimer !== null) clearTimeout(this.#flushTimer);
    this.#flushTimer = null;
    for (const track of this.#stream?.getTracks() ?? []) track.stop();
    this.#stream = null;
    if (this.#audio !== null) this.#audio.srcObject = null;
    this.#audio = null;
    void this.#context?.close().catch(() => {});
    this.#context = null;
    for (const listener of this.#levelListeners) listener(0, SILENT_BANDS);
  }

  #set(patch: Partial<VoiceSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    for (const listener of this.#listeners) listener();
  }
}
