import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  validateUIMessages,
  type UIMessage,
} from "ai";
import { after } from "next/server";
import { ulid } from "ulid";
import { z } from "zod";

import type { ConversationRow } from "@/lib/data";
import { routeToolCall } from "@/lib/execution";
import type { AuthenticatedSession } from "@/lib/session";
import { persistMessages, sanitizeUserMessage } from "@/lib/transcript";

/*
 * The chat-route re-run branch (Story 1.6, D3). A card's "Run again." posts the
 * ONE chat route with a data-only user message carrying `{ tool, args,
 * supersedesToolCallId? }` in a `data-rerun` part. The route detects it and
 * branches HERE: no model, no streamText. The edited args route through
 * lib/execution.routeToolCall — the same one door the model path uses, with the
 * same read gate (registry Zod, write/quarantine refusal, forced simulate,
 * Solana refusal) — and the result streams as a server-authored assistant
 * message carrying the tool part, persisted through the lib/transcript sole
 * writer. Determinism is the point: "the edited values drive it" (AC 3) with no
 * paraphrasing model round-trip.
 *
 * An op-id switch (D5) stamps `supersedes` (the old part's toolCallId, verified
 * to exist in the stored transcript) on the new message via the `start` chunk's
 * messageMetadata — folded into the response message's metadata live AND on
 * reload, so retirement derives identically both ways with no mutation of the
 * already-persisted part (AD-13).
 */

const RERUNNABLE_TOOLS = [
  "execute_protocol_action",
  "execute_contract_call",
  "get_wallet_integration",
] as const;

// search_actions is deliberately absent — it is a discovery capability list,
// not a re-runnable proposal card, so a re-run naming it is refused (malformed).
const rerunPayloadSchema = z.object({
  tool: z.enum(RERUNNABLE_TOOLS),
  args: z.record(z.string(), z.unknown()),
  supersedesToolCallId: z.string().optional(),
  // Story 2.1 D9: the persisted card fingerprint, present on a same-op re-run so
  // the gate can quarantine a drifted op. The gate treats it as expectedFingerprint.
  fingerprint: z.string().optional(),
});

export type RerunPayload = z.infer<typeof rerunPayloadSchema>;

export type RerunDetection =
  | { kind: "none" }
  | { kind: "malformed" }
  | { kind: "ok"; payload: RerunPayload };

/**
 * Detect and validate the re-run payload in a `data-rerun` message part. A
 * message with no such part is not a re-run (the caller runs the normal path);
 * a present-but-invalid payload is malformed (the caller returns a 400 — the
 * client already validated, so this is client/server drift).
 */
export function detectRerun(message: UIMessage): RerunDetection {
  // Runs before validateUIMessages, so guard a malformed parts field: a
  // non-array is not a re-run — it falls through to the normal path, where
  // validation rejects it with a 400.
  if (!Array.isArray(message.parts)) {
    return { kind: "none" };
  }
  const part = message.parts.find(
    (candidate) =>
      typeof (candidate as { type?: unknown }).type === "string" &&
      (candidate as { type: string }).type === "data-rerun",
  );
  if (part === undefined) {
    return { kind: "none" };
  }
  const parsed = rerunPayloadSchema.safeParse((part as { data?: unknown }).data);
  return parsed.success
    ? { kind: "ok", payload: parsed.data }
    : { kind: "malformed" };
}

/** True when a tool part with this toolCallId exists in the stored transcript.
 *  A supersede naming an absent id is dropped — a client can never retire an
 *  arbitrary or foreign card. */
export function supersedesInTranscript(
  transcript: UIMessage[],
  toolCallId: string,
): boolean {
  for (const message of transcript) {
    for (const part of message.parts) {
      const type = (part as { type?: unknown }).type;
      const id = (part as { toolCallId?: unknown }).toolCallId;
      if (typeof type === "string" && type.startsWith("tool-") && id === toolCallId) {
        return true;
      }
    }
  }
  return false;
}

export async function handleRerun({
  session,
  conversation,
  message,
  payload,
  requestId,
  signal,
}: {
  session: AuthenticatedSession;
  conversation: ConversationRow;
  message: UIMessage;
  payload: RerunPayload;
  requestId: string;
  signal: AbortSignal;
}): Promise<Response> {
  const conversationId = conversation.id;
  const orgId = session.orgId;

  // The message-id law (lib/transcript): server-minted unless the client id is
  // well-formed and role-consistent with the stored document.
  const incoming = sanitizeUserMessage(message, conversation.transcript);
  try {
    await validateUIMessages({ messages: [incoming] });
  } catch {
    return badRequest("The request could not be read.");
  }

  let validatedMessages: UIMessage[];
  try {
    validatedMessages = await validateUIMessages({
      messages: [...conversation.transcript, incoming],
    });
  } catch (error) {
    // The incoming message already validated — this is the server's stored side.
    console.error(
      logLine("chat_history_invalid", { conversationId, requestId, orgId, error }),
    );
    return serverError(
      "This conversation's history could not be read. Your request was not saved.",
    );
  }

  // Verify the supersede id exists in the stored transcript, else drop it (log,
  // never fail the run).
  let supersedes: string | undefined;
  if (payload.supersedesToolCallId !== undefined) {
    if (supersedesInTranscript(conversation.transcript, payload.supersedesToolCallId)) {
      supersedes = payload.supersedesToolCallId;
    } else {
      console.error(
        logLine("chat_rerun_supersede_dropped", {
          conversationId,
          requestId,
          orgId,
          toolCallId: payload.supersedesToolCallId,
        }),
      );
    }
  }

  // Persist the user re-run message BEFORE streaming: a dead execution never
  // loses the user's act (the 1.5 law).
  try {
    await persistMessages({ session, conversationId, messages: [incoming], requestId });
  } catch (error) {
    console.error(
      logLine("chat_persist_failed", {
        phase: "rerun_user_message",
        conversationId,
        requestId,
        orgId,
        error,
      }),
    );
    return serverError("Your request could not be saved. Try again in a moment.");
  }

  const toolCallId = ulid();
  const actionType =
    typeof payload.args.actionType === "string" ? payload.args.actionType : undefined;

  const stream = createUIMessageStream<UIMessage>({
    originalMessages: validatedMessages,
    generateId: () => ulid(),
    onError: (error) => {
      // routeToolCall never throws expected outcomes; this is an unexpected
      // fault. Surface a plain reason, log the detail, never leak internals.
      console.error(
        logLine("chat_rerun_stream_error", { conversationId, requestId, orgId, error }),
      );
      return "The read could not complete.";
    },
    execute: async ({ writer }) => {
      // Start: the server ULID is injected here (client + server agree on the
      // message id). Stamp supersedes so the client retires the old card and
      // moves focus LIVE, and it persists for an identical derivation on reload.
      writer.write({
        type: "start",
        ...(supersedes !== undefined ? { messageMetadata: { supersedes } } : {}),
      });
      // input = the exact edited args (AC 3 — the edited values drive it). The
      // gate re-validates them; passthroughDefaults merge server-side only.
      writer.write({
        type: "tool-input-available",
        toolCallId,
        toolName: payload.tool,
        input: payload.args,
      });
      // The one door. Its existing read gate is the security boundary; the
      // re-run adds no second gate and bypasses none. ok:false envelopes stream
      // too and render as the existing ErrorCard — no silent catch.
      const output = await routeToolCall({
        session,
        toolName: payload.tool,
        args: payload.args,
        requestId,
        signal,
        // Story 2.2 (AC 5, D12): the ids the ledger keys/correlates its row by.
        conversationId,
        toolCallId,
        // D9: a same-op re-run threads the persisted fingerprint; a mismatch
        // against the registry's current one quarantines the op as drifted.
        expectedFingerprint: payload.fingerprint,
        // Best-effort read-record runs AFTER the response (Story 2.2 Patch): a
        // slow or hung ledger insert must not delay or fail the read.
        deferBackground: afterResponse,
      });
      writer.write({ type: "tool-output-available", toolCallId, output });
      writer.write({ type: "finish" });
      // The gate records the read itself (Story 2.2, D12): a protocol-action read
      // lands a `read` ledger row (no receipt) inside routeToolCall, best-effort.
      // The WRITE intent row (state "intent", pre-execution) slots at the
      // confirm → execute seam in Story 2.3.
      console.log(
        logLine("chat_rerun", {
          conversationId,
          requestId,
          orgId,
          toolCallId,
          tool: payload.tool,
          ...(actionType !== undefined ? { actionType } : {}),
          ...(supersedes !== undefined ? { supersedes } : {}),
          ok: output.ok,
        }),
      );
    },
    onEnd: async ({ messages, isAborted }) => {
      // The same sole-writer door and log-never-throw posture as the normal
      // path. NO title generation — a re-run is never a first turn.
      try {
        await persistMessages({ session, conversationId, messages, requestId });
      } catch (error) {
        console.error(
          logLine("chat_persist_failed", {
            phase: "rerun_on_end",
            conversationId,
            isAborted,
            requestId,
            orgId,
            error,
          }),
        );
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}

// --- envelopes + logging (mirror the route's posture) ------------------------

/** Schedule best-effort work to run AFTER the response finishes (Next's `after`),
 *  so a slow/hung ledger insert never blocks the re-run's read. Falls back to
 *  running it inline when there is no request scope (a unit test invoking the
 *  handler directly); the task swallows its own errors, so this never rejects. */
function afterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

function badRequest(message: string): Response {
  return Response.json({ error: { code: "bad_request", message } }, { status: 400 });
}

function serverError(message: string): Response {
  return Response.json({ error: { code: "server_error", message } }, { status: 500 });
}

function logLine(
  event: string,
  fields: Record<string, unknown> & { error?: unknown },
): string {
  const { error, ...rest } = fields;
  return JSON.stringify({
    event,
    ...rest,
    ...(error !== undefined
      ? { message: error instanceof Error ? error.message : String(error) }
      : {}),
  });
}
