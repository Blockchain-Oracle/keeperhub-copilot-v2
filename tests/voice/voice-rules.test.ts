import type { RealtimeItem } from "@openai/agents/realtime";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import { isVoiceMessage, mergeMessages, toolPartById } from "@/components/chat/chat-rules";
import {
  awaitingUserTranscript,
  finishedSpeech,
  formatClock,
  micProblem,
  ringFraction,
  toBands,
  VOICE_BANDS,
  voiceHint,
  voiceLabel,
} from "@/components/voice/voice-rules";

const user = (itemId: string, transcript: string | null) =>
  ({ itemId, type: "message", role: "user", status: "completed", content: [{ type: "input_audio", transcript }] }) as RealtimeItem;
const reply = (itemId: string, transcript: string, status = "completed") =>
  ({ itemId, type: "message", role: "assistant", status, content: [{ type: "output_audio", transcript }] }) as RealtimeItem;
const system = { itemId: "sys", type: "message", role: "system", content: [{ type: "input_text", text: "Outcome" }] } as RealtimeItem;

describe("which speech is ready to save", () => {
  it("takes finished words and replies in order, skipping system notes and what was handed over", () => {
    const history = [user("u1", "What's the ETH price?"), reply("a1", "Checking that now."), system, user("u2", null), reply("a2", "It is", "in_progress")];
    expect(finishedSpeech(history, new Set())).toEqual([
      { id: "u1", role: "user", text: "What's the ETH price?" },
      { id: "a1", role: "assistant", text: "Checking that now." },
    ]);
    expect(finishedSpeech(history, new Set(["u1"]))).toEqual([{ id: "a1", role: "assistant", text: "Checking that now." }]);
    expect(finishedSpeech([user("u3", "   ")], new Set())).toEqual([]);
  });

  it("knows when the person's latest words are still being transcribed", () => {
    expect(awaitingUserTranscript([user("u1", "hi"), reply("a1", "Hello."), user("u2", null)])).toBe(true);
    expect(awaitingUserTranscript([user("u1", "hi"), reply("a1", "Hello.")])).toBe(false);
    expect(awaitingUserTranscript([])).toBe(false);
  });
});

describe("the voice button", () => {
  it("names each state", () => {
    expect(voiceLabel("listening", false)).toBe("Listening");
    expect(voiceLabel("listening", true)).toBe("Muted");
    expect(voiceLabel("waiting", true)).toBe("Waiting for your card");
    expect(voiceLabel("connecting", false)).toBe("Connecting…");
  });

  it("drains its ring over the session and shows the time left", () => {
    expect(ringFraction(600, 600)).toBe(1);
    expect(ringFraction(150, 600)).toBe(0.25);
    expect(ringFraction(-5, 600)).toBe(0);
    expect(formatClock(599)).toBe("9:59");
    expect(formatClock(61)).toBe("1:01");
  });

  it("says what the person can do in each state", () => {
    expect(voiceHint("waiting", true)).toBe("Authorize or cancel the card above to carry on.");
    expect(voiceHint("listening", true)).toContain("Unmute");
    expect(voiceHint("error", false)).toBe("");
  });

  it("turns the analyser's spectrum into a few bars from the speech range", () => {
    expect(toBands(new Uint8Array(128))).toEqual(new Array(VOICE_BANDS).fill(0));
    const loud = toBands(new Uint8Array(128).fill(255));
    expect(loud).toHaveLength(VOICE_BANDS);
    expect(loud.every((band) => band === 1)).toBe(true);
    const lowOnly = new Uint8Array(128);
    lowOnly.fill(200, 1, 11);
    const bands = toBands(lowOnly);
    expect(bands[0]).toBeCloseTo(1);
    expect(bands[4]).toBe(0);
  });

  it("explains a microphone that could not be opened", () => {
    expect(micProblem({ name: "NotAllowedError" })).toContain("blocked");
    expect(micProblem({ name: "NotFoundError" })).toContain("No microphone");
    expect(micProblem(new Error("x"))).toContain("could not be opened");
  });
});

describe("voice messages in the chat", () => {
  const text = (id: string, words: string, metadata?: unknown) =>
    ({ id, role: "user", ...(metadata !== undefined ? { metadata } : {}), parts: [{ type: "text", text: words }] }) as UIMessage;

  it("merges what voice stored: a known id in place, a new one at the end", () => {
    const merged = mergeMessages([text("a", "one"), text("b", "two")], [text("b", "two, edited"), text("c", "three")]);
    expect(merged.map((message) => message.id)).toEqual(["a", "b", "c"]);
    expect(merged[1].parts[0]).toMatchObject({ text: "two, edited" });
  });

  it("finds a card by its tool call id and tells voice messages apart", () => {
    const card = { type: "tool-execute_transfer", toolCallId: "t1", state: "output-denied", input: {} };
    const messages = [text("a", "hi", { source: "voice" }), { id: "m", role: "assistant", parts: [card] } as UIMessage];
    expect(toolPartById(messages, "t1")).toBe(card);
    expect(toolPartById(messages, "t2")).toBeUndefined();
    expect(isVoiceMessage(messages[0])).toBe(true);
    expect(isVoiceMessage(messages[1])).toBe(false);
  });
});
