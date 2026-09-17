import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UIMessage } from "ai";

// Mock the transcript write accessor seam — never the DB driver.
const { readTranscriptForWrite, casWriteTranscript } = vi.hoisted(() => ({
  readTranscriptForWrite: vi.fn(),
  casWriteTranscript: vi.fn(),
}));
vi.mock("@/lib/data/transcript", () => ({
  readTranscriptForWrite,
  casWriteTranscript,
}));

import {
  persistMessages,
  TranscriptCasExhaustedError,
  TranscriptConversationMissingError,
} from "@/lib/transcript";

function msg(id: string, role: UIMessage["role"], text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

const SCOPE = { orgId: "org-1" };
const ARGS = {
  session: SCOPE,
  conversationId: "conv-1",
  requestId: "req-1",
};

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  readTranscriptForWrite.mockReset();
  casWriteTranscript.mockReset();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("persistMessages", () => {
  it("happy path: writes the merged transcript with the read revision", async () => {
    const stored = [msg("u1", "user", "hello")];
    readTranscriptForWrite.mockResolvedValue({ transcript: stored, revision: 3 });
    casWriteTranscript.mockResolvedValue({ revision: 4 });

    const incoming = [msg("u1", "user", "hello"), msg("a1", "assistant", "hi")];
    await persistMessages({ ...ARGS, messages: incoming });

    expect(readTranscriptForWrite).toHaveBeenCalledTimes(1);
    expect(casWriteTranscript).toHaveBeenCalledTimes(1);
    const [scope, conversationId, written, expected] =
      casWriteTranscript.mock.calls[0];
    expect(scope).toBe(SCOPE);
    expect(conversationId).toBe("conv-1");
    expect(written.map((m: UIMessage) => m.id)).toEqual(["u1", "a1"]);
    expect(expected).toBe(3);
  });

  it("CAS miss: exactly one re-read + re-merge, and the concurrent tab's messages survive", async () => {
    readTranscriptForWrite
      .mockResolvedValueOnce({ transcript: [msg("u1", "user", "hello")], revision: 3 })
      .mockResolvedValueOnce({
        transcript: [msg("u1", "user", "hello"), msg("x", "user", "other tab")],
        revision: 4,
      });
    casWriteTranscript
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ revision: 5 });

    await persistMessages({
      ...ARGS,
      messages: [msg("u1", "user", "hello"), msg("a1", "assistant", "hi")],
    });

    expect(readTranscriptForWrite).toHaveBeenCalledTimes(2);
    expect(casWriteTranscript).toHaveBeenCalledTimes(2);
    const [, , secondWrite, secondExpected] = casWriteTranscript.mock.calls[1];
    expect(secondWrite.map((m: UIMessage) => m.id)).toEqual(["u1", "x", "a1"]);
    expect(secondExpected).toBe(4);
  });

  it("double CAS miss: named error + structured log, never silent", async () => {
    readTranscriptForWrite.mockResolvedValue({ transcript: [], revision: 1 });
    casWriteTranscript.mockResolvedValue(null);

    await expect(
      persistMessages({ ...ARGS, messages: [msg("u1", "user", "hello")] }),
    ).rejects.toBeInstanceOf(TranscriptCasExhaustedError);

    // Retry once, not forever: initial read + exactly one re-read.
    expect(readTranscriptForWrite).toHaveBeenCalledTimes(2);
    expect(casWriteTranscript).toHaveBeenCalledTimes(2);

    const logged = errorSpy.mock.calls
      .map((call) => String(call[0]))
      .find((line) => line.includes("transcript_cas_exhausted"));
    expect(logged).toBeDefined();
    const parsed = JSON.parse(logged!);
    expect(parsed).toMatchObject({
      event: "transcript_cas_exhausted",
      conversationId: "conv-1",
      requestId: "req-1",
      orgId: "org-1",
    });
  });

  it("missing conversation on read: named error, structured log", async () => {
    readTranscriptForWrite.mockResolvedValue(null);

    await expect(
      persistMessages({ ...ARGS, messages: [msg("u1", "user", "hello")] }),
    ).rejects.toBeInstanceOf(TranscriptConversationMissingError);
    expect(casWriteTranscript).not.toHaveBeenCalled();
  });
});
