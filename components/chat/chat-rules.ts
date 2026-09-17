import type { UIMessage } from "ai";

import { englishTranslate, type Translate } from "@/lib/i18n/translate";

/*
 * The chat surface's rules, kept free of React so they run under node tests.
 *
 * Archive: DeepBookie components/chat/Chat.tsx:14-16 turns a chat read-only
 * after 30 minutes idle. Abu (2026-09-13) applied the same clock to reopening:
 * a conversation last touched within 30 minutes opens live, an older one opens
 * read-only.
 */

export const ARCHIVE_AFTER_MS = 30 * 60_000;

export function isArchived(lastActivityAt: number, now: number): boolean {
  return now - lastActivityAt >= ARCHIVE_AFTER_MS;
}

export function msUntilArchive(lastActivityAt: number, now: number): number {
  return Math.max(0, lastActivityAt + ARCHIVE_AFTER_MS - now);
}

/*
 * Mirrors lib/data's NEW_CONVERSATION_TITLE, which is server-only. The stored
 * title stays these English words, the sign that the route has not named the
 * conversation yet; the chat shows it in the person's language (chat.newConversation).
 */
export const NEW_CONVERSATION_TITLE = "New conversation";

/*
 * Whether a rename box holds a title worth saving. Empty, or the title as it was
 * stored or shown, is no change: an unnamed conversation shows its sentinel in the
 * person's language, and saving those words would replace the sentinel and stop
 * the route naming the conversation.
 */
export function renameChanged(storedTitle: string, shownTitle: string, typed: string): boolean {
  const next = typed.trim();
  return next !== "" && next !== storedTitle && next !== shownTitle;
}

type LoosePart = { type?: unknown; state?: unknown; toolName?: unknown };

function isToolPart(part: LoosePart): boolean {
  return typeof part.type === "string" && (part.type.startsWith("tool-") || part.type === "dynamic-tool");
}

// A form card (decision 32): the model asked for details and waits for the person's answer.
const FORM_PART = "tool-request_input";

function isOpenForm(part: LoosePart): boolean {
  return part.type === FORM_PART && part.state === "input-available";
}

/** The parts of a message's last step: everything after its last step marker (a voice message has none). */
function lastStep(parts: readonly unknown[]): readonly unknown[] {
  let start = 0;
  parts.forEach((part, index) => {
    if ((part as LoosePart).type === "step-start") start = index + 1;
  });
  return parts.slice(start);
}

/*
 * DeepBookie Chat.tsx:112-127 blocks sending while a proposed write is
 * unresolved, because a new turn would orphan it. Here a write waits in the AI
 * SDK's approval-requested state until its card is approved or declined, and a
 * form waits open until it is filled in or closed.
 */
export function awaitingApproval(messages: readonly UIMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return false;
  return last.parts.some((part) => {
    const loose = part as LoosePart;
    return isToolPart(loose) && (loose.state === "approval-requested" || isOpenForm(loose));
  });
}

/** The latest assistant turn ends in a form still waiting for its answer. */
export function awaitingForm(messages: readonly UIMessage[]): boolean {
  const last = messages[messages.length - 1];
  return last !== undefined && last.role === "assistant" && last.parts.some((part) => isOpenForm(part as LoosePart));
}

/*
 * An approve or cancel travels as the latest assistant turn with a part in
 * approval-responded; a form's answer as its part in output-available in the
 * turn's last step. If that post fails, the answer never reached the server:
 * the card offers Try again, and the chat must neither Retry the turn (that
 * would drop the answer) nor take a new message on top of it.
 */
export function answerUnsent(messages: readonly UIMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return false;
  const approval = last.parts.some((part) => {
    const loose = part as LoosePart;
    return isToolPart(loose) && loose.state === "approval-responded";
  });
  return approval || formAnswerReady(messages);
}

/*
 * A form answered in the chat is sent on its own, as an approval is (decision
 * 32): the last step of the latest assistant turn holds an answered form and
 * nothing in that step still waits. Once the model carries on, its reply opens
 * a new step, so the same answer is never sent twice.
 */
export function formAnswerReady(messages: readonly UIMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return false;
  const tools = lastStep(last.parts).filter((part) => isToolPart(part as LoosePart)) as LoosePart[];
  return (
    tools.some((part) => part.type === FORM_PART && part.state === "output-available") &&
    tools.every((part) => part.state === "output-available" || part.state === "output-error" || part.state === "output-denied")
  );
}

/*
 * Voice writes into the same conversation (slice 9) and hands the chat what it
 * stored: a known id is replaced where it stands, a new one appended, the rule
 * lib/transcript's mergeTranscript keeps on the server.
 */
export function mergeMessages(current: readonly UIMessage[], incoming: readonly UIMessage[]): UIMessage[] {
  const merged = [...current];
  const indexById = new Map(merged.map((message, index) => [message.id, index]));
  for (const message of incoming) {
    const existing = indexById.get(message.id);
    if (existing !== undefined) {
      merged[existing] = message;
    } else {
      indexById.set(message.id, merged.length);
      merged.push(message);
    }
  }
  return merged;
}

/** The tool part with this call id, wherever it sits: how the chat follows a voice card to its end. */
export function toolPartById(messages: readonly UIMessage[], toolCallId: string): unknown {
  for (let index = messages.length - 1; index >= 0; index--) {
    for (const part of messages[index].parts) {
      const loose = part as LoosePart & { toolCallId?: unknown };
      if (isToolPart(loose) && loose.toolCallId === toolCallId) return part;
    }
  }
  return undefined;
}

/** A message voice wrote: what was said, or a card voice asked for. */
export function isVoiceMessage(message: UIMessage): boolean {
  const metadata = message.metadata;
  return metadata !== null && typeof metadata === "object" && (metadata as { source?: unknown }).source === "voice";
}

/*
 * v1 components/chat/Conversation.tsx:130-150: an edited proposal replaces the
 * input on the part waiting under this approval, so the automatic post carries
 * it. The route re-checks and re-signs it; nothing else on the message changes.
 */
export function withEditedInput(message: UIMessage, approvalId: string, input: unknown): UIMessage {
  let changed = false;
  const parts = message.parts.map((part) => {
    const loose = part as LoosePart & { approval?: { id?: unknown } };
    if (isToolPart(loose) && loose.state === "approval-requested" && loose.approval?.id === approvalId) {
      changed = true;
      return { ...part, input } as typeof part;
    }
    return part;
  });
  return changed ? { ...message, parts } : message;
}

/*
 * One question on arrival, first found wins: the draft carried through sign-in
 * (components/shell/sign-in/pending-draft.ts), then DeepBookie's `?q=` deep
 * link, then the landing's `?prompt=` (Portaldot hero.tsx:24-31).
 */
export const ARRIVAL_PARAMS = ["q", "prompt"] as const;

export function arrivalDraft(stored: string | null, search: string): string | null {
  if (stored?.trim()) return stored.trim();
  const params = new URLSearchParams(search);
  for (const name of ARRIVAL_PARAMS) {
    const value = params.get(name)?.trim();
    if (value) return value;
  }
  return null;
}

/** The query string with the arrival parameters removed, so a reload never sends twice. */
export function withoutArrivalParams(search: string): string {
  const params = new URLSearchParams(search);
  for (const name of ARRIVAL_PARAMS) params.delete(name);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/*
 * v1 components/chat/Conversation.tsx:357-379: a failed turn whose reason reads
 * like an ended session offers Connect KeeperHub instead of a dead end.
 */
export function isSessionLapse(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes("connect keeperhub") ||
    text.includes("unauthorized") ||
    text.includes("session") ||
    text.includes("401")
  );
}

// Each part state's words under chat.toolStates.
const TOOL_STATE_KEYS: Record<string, string> = {
  "input-streaming": "preparing",
  "input-available": "running",
  "approval-requested": "waitingForApproval",
  "approval-responded": "sendingAnswer",
  "output-available": "done",
  "output-error": "failed",
  "output-denied": "declined",
};

/*
 * A tool part's name and plain state, for the one-line stand-in until its card
 * exists. `stateKey` is the raw part state ("waitingForYou" for an open form),
 * so a caller compares it rather than the words, which follow the language.
 */
export function toolPartSummary(
  part: unknown,
  t: Translate = englishTranslate,
): { name: string; state: string; stateKey: string } | null {
  const loose = (part ?? {}) as LoosePart;
  if (!isToolPart(loose)) return null;
  const name =
    loose.type === "dynamic-tool"
      ? typeof loose.toolName === "string"
        ? loose.toolName
        : "tool"
      : String(loose.type).slice("tool-".length);
  const stateKey = isOpenForm(loose) ? "waitingForYou" : typeof loose.state === "string" ? loose.state : "unknown";
  const labelKey = stateKey === "waitingForYou" || stateKey === "unknown" ? stateKey : TOOL_STATE_KEYS[stateKey];
  const state = labelKey === undefined ? stateKey : t(`chat.toolStates.${labelKey}`);
  return { name, state, stateKey };
}

export type PartRun = { kind: "part"; index: number } | { kind: "tools"; indices: number[] };

/*
 * The tools line (21st heygaia tool-calls-section): consecutive tool calls in a
 * message collapse into one "Used N tools" line, and that run's cards follow
 * it. Step markers and blank text between calls do not break a run.
 */
export function groupParts(parts: readonly unknown[]): PartRun[] {
  const runs: PartRun[] = [];
  let current: number[] | null = null;
  for (let index = 0; index < parts.length; index++) {
    const loose = (parts[index] ?? {}) as LoosePart & { text?: unknown };
    if (loose.type === "step-start") continue;
    if (loose.type === "text" && (typeof loose.text !== "string" || loose.text.trim() === "")) continue;
    if (isToolPart(loose)) {
      if (current === null) {
        current = [];
        runs.push({ kind: "tools", indices: current });
      }
      current.push(index);
      continue;
    }
    current = null;
    runs.push({ kind: "part", index });
  }
  return runs;
}

/*
 * Decision 12: an action lookup gets its own card only when the list is the
 * answer. It is when no tool call follows it in the message and either the
 * assistant has written after it or the turn is over; until then it lives
 * inside the tools line, so it never flashes while the next call streams in.
 */
export function lookupIsAnswer(parts: readonly unknown[], index: number, turnDone: boolean): boolean {
  const part = (parts[index] ?? {}) as LoosePart;
  if (part.type !== "tool-search_actions") return false;
  let wroteAfter = false;
  for (let later = index + 1; later < parts.length; later++) {
    const loose = (parts[later] ?? {}) as LoosePart & { text?: unknown };
    if (isToolPart(loose)) return false;
    if (loose.type === "text" && typeof loose.text === "string" && loose.text.trim() !== "") wroteAfter = true;
  }
  return wroteAfter || turnDone;
}

/** Whether a tool part draws a card under the tools line. */
export function showsCard(parts: readonly unknown[], index: number, turnDone: boolean): boolean {
  const part = (parts[index] ?? {}) as LoosePart;
  if (isReturnedProposal(parts[index])) return false;
  return part.type !== "tool-search_actions" || lookupIsAnswer(parts, index, turnDone);
}

/*
 * An automation proposal the check sent straight back to the model to fix
 * never reached the person, so it stays inside the tools line; the fixed
 * proposal draws the card.
 */
const AUTOMATION_CHANGE_PARTS: ReadonlySet<unknown> = new Set([
  "tool-create_automation",
  "tool-update_automation",
  "tool-set_automation_enabled",
  "tool-run_automation",
  "tool-delete_automation",
]);

function isReturnedProposal(part: unknown): boolean {
  const loose = (part ?? {}) as { type?: unknown; state?: unknown; output?: unknown };
  if (loose.state !== "output-available") return false;
  const output = loose.output as { ok?: unknown; error?: { code?: unknown } } | undefined;
  if (output?.ok !== false) return false;
  // An action KeeperHub runs only inside automations is rerouted by the model (decision 35).
  if (output.error?.code === "automation_only") return true;
  return AUTOMATION_CHANGE_PARTS.has(loose.type) && output.error?.code === "validation_failed";
}
