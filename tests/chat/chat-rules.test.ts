import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
  answerUnsent,
  ARCHIVE_AFTER_MS,
  arrivalDraft,
  awaitingApproval,
  isArchived,
  isSessionLapse,
  msUntilArchive,
  NEW_CONVERSATION_TITLE,
  renameChanged,
  toolPartSummary,
  withEditedInput,
  withoutArrivalParams,
} from "@/components/chat/chat-rules";

function assistant(parts: unknown[]): UIMessage {
  return { id: "a1", role: "assistant", parts: parts as UIMessage["parts"] };
}

describe("archive clock", () => {
  const now = 1_000_000_000;

  it("keeps a conversation live until 30 minutes have passed", () => {
    expect(isArchived(now - ARCHIVE_AFTER_MS + 1, now)).toBe(false);
    expect(isArchived(now - ARCHIVE_AFTER_MS, now)).toBe(true);
  });

  it("counts down only the time that is left", () => {
    expect(msUntilArchive(now - 25 * 60_000, now)).toBe(5 * 60_000);
    expect(msUntilArchive(now - 2 * ARCHIVE_AFTER_MS, now)).toBe(0);
  });
});

describe("composer lock while a write waits", () => {
  it("locks when the last assistant turn has a write awaiting approval", () => {
    const messages = [assistant([{ type: "tool-execute_protocol_action", state: "approval-requested" }])];
    expect(awaitingApproval(messages)).toBe(true);
  });

  it("does not lock for finished, declined or in-flight parts", () => {
    for (const state of ["output-available", "output-error", "output-denied", "approval-responded"]) {
      expect(awaitingApproval([assistant([{ type: "tool-search_actions", state }])])).toBe(false);
    }
  });

  it("only looks at the latest turn", () => {
    const earlier = assistant([{ type: "tool-x", state: "approval-requested" }]);
    const user: UIMessage = { id: "u2", role: "user", parts: [{ type: "text", text: "next" }] };
    expect(awaitingApproval([earlier, user])).toBe(false);
    expect(awaitingApproval([])).toBe(false);
  });
});

describe("an answer that did not send", () => {
  it("is the latest turn holding an answered but unsent approval", () => {
    expect(answerUnsent([assistant([{ type: "tool-execute_transfer", state: "approval-responded" }])])).toBe(true);
    expect(answerUnsent([assistant([{ type: "tool-execute_transfer", state: "approval-requested" }])])).toBe(false);
    expect(answerUnsent([assistant([{ type: "tool-execute_transfer", state: "output-available" }])])).toBe(false);
    expect(answerUnsent([])).toBe(false);
  });
});

describe("an edited proposal", () => {
  const waiting = {
    type: "tool-execute_transfer",
    state: "approval-requested",
    input: { amount: "0.1" },
    approval: { id: "ap-1" },
  };

  it("replaces the input on the part waiting under that approval only", () => {
    const other = { ...waiting, approval: { id: "ap-2" } };
    const message = assistant([waiting, other]);
    const next = withEditedInput(message, "ap-1", { amount: "2" });
    expect((next.parts[0] as unknown as { input: unknown }).input).toEqual({ amount: "2" });
    expect(next.parts[1]).toBe(message.parts[1]);
  });

  it("leaves a message without that approval untouched", () => {
    const message = assistant([{ ...waiting, state: "approval-responded" }]);
    expect(withEditedInput(message, "ap-1", { amount: "2" })).toBe(message);
  });
});

describe("question on arrival", () => {
  it("prefers the draft carried through sign-in", () => {
    expect(arrivalDraft("  from sign-in ", "?q=deep&prompt=landing")).toBe("from sign-in");
  });

  it("then ?q=, then ?prompt=", () => {
    expect(arrivalDraft(null, "?q=deep&prompt=landing")).toBe("deep");
    expect(arrivalDraft(null, "?prompt=landing")).toBe("landing");
    expect(arrivalDraft("", "?q=%20%20")).toBeNull();
  });

  it("strips only the arrival parameters", () => {
    expect(withoutArrivalParams("?q=a&prompt=b&connect=denied")).toBe("?connect=denied");
    expect(withoutArrivalParams("?prompt=b")).toBe("");
  });
});

describe("failure reasons", () => {
  it("reads an ended session as a reconnect, anything else as a retry", () => {
    expect(isSessionLapse('{"error":{"code":"unauthorized","message":"Connect KeeperHub to start a conversation."}}')).toBe(true);
    expect(isSessionLapse("Failed to fetch")).toBe(false);
  });
});

describe("tool part stand-in", () => {
  it("names the tool and its state in plain words", () => {
    expect(toolPartSummary({ type: "tool-search_actions", state: "output-available" })).toEqual({
      name: "search_actions",
      state: "done",
      stateKey: "output-available",
    });
    expect(toolPartSummary({ type: "dynamic-tool", toolName: "x", state: "approval-requested" })).toEqual({
      name: "x",
      state: "waiting for approval",
      stateKey: "approval-requested",
    });
    expect(toolPartSummary({ type: "text", text: "hi" })).toBeNull();
  });

  it("keeps the state key when the words follow another language", () => {
    const summary = toolPartSummary({ type: "tool-search_actions", state: "output-available" }, (key) => `[${key}]`);
    expect(summary).toEqual({ name: "search_actions", state: "[chat.toolStates.done]", stateKey: "output-available" });
  });
});

describe("rename", () => {
  it("saves only a title that differs from what was stored and shown", () => {
    expect(renameChanged("Price check", "Price check", "  Weekly report ")).toBe(true);
    expect(renameChanged("Price check", "Price check", " Price check ")).toBe(false);
    expect(renameChanged("Price check", "Price check", "   ")).toBe(false);
  });

  it("leaves an unnamed conversation's sentinel alone when its shown words are saved", () => {
    expect(renameChanged(NEW_CONVERSATION_TITLE, "Nueva conversación", "Nueva conversación")).toBe(false);
    expect(renameChanged(NEW_CONVERSATION_TITLE, "Nueva conversación", NEW_CONVERSATION_TITLE)).toBe(false);
    expect(renameChanged(NEW_CONVERSATION_TITLE, "Nueva conversación", "Compra semanal")).toBe(true);
  });
});
