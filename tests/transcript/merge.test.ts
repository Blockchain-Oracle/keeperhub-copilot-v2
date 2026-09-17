import { describe, expect, it } from "vitest";

import type { UIMessage } from "ai";

import { mergeTranscript, sanitizeUserMessage } from "@/lib/transcript";

function msg(id: string, role: UIMessage["role"], text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

describe("mergeTranscript", () => {
  it("replaces a matching id in place, preserving stored order", () => {
    const stored = [msg("a", "user", "one"), msg("b", "assistant", "two")];
    const incoming = [msg("a", "user", "one edited")];
    const merged = mergeTranscript(stored, incoming);
    expect(merged.map((m) => m.id)).toEqual(["a", "b"]);
    expect(merged[0].parts).toEqual([{ type: "text", text: "one edited" }]);
    expect(merged[1]).toBe(stored[1]);
  });

  it("appends unknown ids in incoming order", () => {
    const stored = [msg("a", "user", "one")];
    const incoming = [msg("c", "assistant", "three"), msg("b", "user", "two")];
    const merged = mergeTranscript(stored, incoming);
    expect(merged.map((m) => m.id)).toEqual(["a", "c", "b"]);
  });

  it("keeps a concurrent tab's stored messages (union merge)", () => {
    // The re-merge after a CAS miss: the other tab wrote "x" while we
    // streamed; our incoming set does not contain it. It must survive.
    const stored = [msg("a", "user", "one"), msg("x", "user", "other tab")];
    const incoming = [msg("a", "user", "one"), msg("r", "assistant", "reply")];
    const merged = mergeTranscript(stored, incoming);
    expect(merged.map((m) => m.id)).toEqual(["a", "x", "r"]);
  });

  it("returns stored untouched shape when incoming is empty", () => {
    const stored = [msg("a", "user", "one")];
    expect(mergeTranscript(stored, [])).toEqual(stored);
  });

  it("does not mutate its inputs", () => {
    const stored = [msg("a", "user", "one")];
    const incoming = [msg("a", "user", "changed"), msg("b", "assistant", "b")];
    const storedCopy = structuredClone(stored);
    const incomingCopy = structuredClone(incoming);
    mergeTranscript(stored, incoming);
    expect(stored).toEqual(storedCopy);
    expect(incoming).toEqual(incomingCopy);
  });
});

describe("sanitizeUserMessage (the message-id law)", () => {
  const mint = () => "MINTED";

  it("accepts a valid client id verbatim", () => {
    const out = sanitizeUserMessage(msg("client-id-1", "user", "hi"), [], mint);
    expect(out.id).toBe("client-id-1");
  });

  it("mints when the id is absent", () => {
    const raw = { role: "user", parts: [{ type: "text", text: "hi" }] };
    const out = sanitizeUserMessage(raw as UIMessage, [], mint);
    expect(out.id).toBe("MINTED");
  });

  it("mints when the id is not a string", () => {
    const raw = {
      id: 42,
      role: "user",
      parts: [{ type: "text", text: "hi" }],
    };
    const out = sanitizeUserMessage(raw as unknown as UIMessage, [], mint);
    expect(out.id).toBe("MINTED");
  });

  it("mints when the id is empty", () => {
    const out = sanitizeUserMessage(msg("", "user", "hi"), [], mint);
    expect(out.id).toBe("MINTED");
  });

  it("mints when the id exceeds 64 characters", () => {
    const long = "x".repeat(65);
    const out = sanitizeUserMessage(msg(long, "user", "hi"), [], mint);
    expect(out.id).toBe("MINTED");
  });

  it("accepts an id of exactly 64 characters", () => {
    const exact = "x".repeat(64);
    const out = sanitizeUserMessage(msg(exact, "user", "hi"), [], mint);
    expect(out.id).toBe(exact);
  });

  it("mints when the id collides with a stored message of a DIFFERENT role", () => {
    const stored = [msg("taken", "assistant", "an answer")];
    const out = sanitizeUserMessage(msg("taken", "user", "hi"), stored, mint);
    expect(out.id).toBe("MINTED");
  });

  it("keeps the id when it matches a stored message of the SAME role (legitimate replace)", () => {
    const stored = [msg("mine", "user", "original")];
    const out = sanitizeUserMessage(msg("mine", "user", "edited"), stored, mint);
    expect(out.id).toBe("mine");
  });

  it("never mutates the incoming message", () => {
    const raw = msg("", "user", "hi");
    sanitizeUserMessage(raw, [], mint);
    expect(raw.id).toBe("");
  });
});
