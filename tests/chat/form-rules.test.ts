import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import { selectRenderer } from "@/components/cards/select-renderer";
import { integrationLabel, integrationOf, toolTitle } from "@/components/cards/tool-meta";
import { answerUnsent, awaitingApproval, awaitingForm, formAnswerReady, toolPartSummary } from "@/components/chat/chat-rules";

/* Form cards in the chat (decision 32): what locks the composer, and when an answer sends on its own. */

const FORM = { fields: [{ key: "recipient", kind: "address", label: "Recipient address" }] };

function assistant(parts: unknown[]): UIMessage {
  return { id: "a", role: "assistant", parts } as unknown as UIMessage;
}

const open = { type: "tool-request_input", toolCallId: "f1", state: "input-available", input: FORM };
const answered = { ...open, state: "output-available", output: { values: { recipient: "0x1" } } };

describe("an open form", () => {
  it("locks the chat like a card waiting for approval", () => {
    expect(awaitingApproval([assistant([{ type: "step-start" }, open])])).toBe(true);
    expect(awaitingForm([assistant([open])])).toBe(true);
    expect(awaitingForm([assistant([{ type: "tool-execute_transfer", state: "approval-requested" }])])).toBe(false);
    expect(awaitingApproval([assistant([answered])])).toBe(false);
  });

  it("reads as waiting for you in the tools line", () => {
    expect(toolPartSummary(open)).toEqual({ name: "request_input", state: "waiting for you", stateKey: "waitingForYou" });
    expect(toolPartSummary(answered)).toEqual({ name: "request_input", state: "done", stateKey: "output-available" });
    expect(integrationOf("request_input", FORM)).toBe("form");
    expect(integrationLabel("form")).toBe("Your details");
    expect(toolTitle("request_input", { title: "Send ETH" })).toBe("Asked you for details: Send ETH");
  });

  it("draws the form card while open and the record once answered", () => {
    expect(selectRenderer({ toolName: "request_input", state: "input-streaming" }).kind).toBe("skeleton");
    expect(selectRenderer({ toolName: "request_input", state: "input-available", toolCallId: "f1", input: FORM })).toEqual({
      kind: "input-request",
      toolCallId: "f1",
      input: FORM,
      output: undefined,
    });
    expect(
      selectRenderer({ toolName: "request_input", state: "output-available", toolCallId: "f1", input: FORM, output: answered.output }),
    ).toMatchObject({ kind: "input-request", output: answered.output });
    expect(selectRenderer({ toolName: "request_input", state: "output-error", errorText: "x" }).kind).toBe("error");
  });
});

describe("sending a form's answer", () => {
  it("sends once the last step's form is answered and nothing else in it waits", () => {
    expect(formAnswerReady([assistant([{ type: "step-start" }, answered])])).toBe(true);
    expect(formAnswerReady([assistant([{ type: "step-start" }, open])])).toBe(false);
    expect(
      formAnswerReady([assistant([{ type: "step-start" }, answered, { type: "tool-execute_transfer", state: "approval-requested" }])]),
    ).toBe(false);
  });

  it("never sends the same answer again once the model has carried on in a new step", () => {
    const carriedOn = assistant([
      { type: "step-start" },
      answered,
      { type: "step-start" },
      { type: "tool-search_actions", state: "output-available", output: { ok: true } },
      { type: "text", text: "Here is the transfer." },
    ]);
    expect(formAnswerReady([carriedOn])).toBe(false);
    expect(formAnswerReady([assistant([{ type: "step-start" }, answered]), { id: "u", role: "user", parts: [] } as UIMessage])).toBe(false);
  });

  it("counts an answer whose post failed as unsent, so the card offers Try again", () => {
    expect(answerUnsent([assistant([{ type: "step-start" }, answered])])).toBe(true);
    expect(answerUnsent([assistant([{ type: "step-start" }, open])])).toBe(false);
  });
});
