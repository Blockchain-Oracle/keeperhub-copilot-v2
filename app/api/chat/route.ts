import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  generateText,
  stepCountIs,
  streamText,
  tool,
  validateUIMessages,
  type ToolSet,
  type UIMessage,
} from "ai";
import { after } from "next/server";
import { ulid } from "ulid";

import { awaitingApproval } from "@/components/chat/chat-rules";
import { getChain } from "@/lib/chains";
import { checkInputAnswer, findOpenForm, readInputRequest, REQUEST_INPUT_TOOL, withFormAnswer } from "@/lib/chat/input-request";
import { getAiConfig } from "@/lib/config";
import {
  autoTitleConversation,
  getConversation,
  NEW_CONVERSATION_TITLE,
  type ConversationRow,
} from "@/lib/data";
import { recordWriteDecline, requiresConfirmation, routeToolCall } from "@/lib/execution";
import { DEFAULT_LOCALE, getLocale, languageRules, readLocaleCookieValue, resolveLocale, type LocaleCode } from "@/lib/locale";
import { readNetworkFromCookieHeader } from "@/lib/network";
import { checkEditedWrite } from "@/lib/registry/edited-write";
import { surfaceChatTools } from "@/lib/registry/surface-tools";
import { getSession, type AuthenticatedSession } from "@/lib/session";
import { orgWallet } from "@/lib/session/org-wallet";
import { walletPromptLine, type OrgWallet } from "@/lib/session/org-wallet-prompt";
import { persistMessages, sanitizeUserMessage } from "@/lib/transcript";

import { canonicalJSON, signToolApproval } from "./approval-signature.ts";
import { detectRerun, handleRerun } from "./rerun.ts";

/*
 * The streaming chat route (Story 1.4, persistence 1.5). The client sends
 * ONLY `{ conversationId, message }` — the server's stored transcript is the
 * authoritative history; a client-supplied history is never trusted again.
 * streamText runs the model with the four surface tools; every tool.execute
 * delegates to lib/execution.routeToolCall — the AI SDK never talks to
 * KeeperHub itself (AD-4). The whole path is server code (AD-1).
 *
 * Persistence floor (1.5): the sanitized user message lands via
 * lib/transcript BEFORE the stream starts (a dead model call never loses the
 * user's words), and onEnd persists the full updated set — isAborted
 * included. Multi-point interruption-proofing is Story 3.4, not here.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cap the search → execute → answer loop so one turn cannot run away. Reads are
// synchronous, so a handful of steps covers discovery + execution + the answer.
const MAX_STEPS = 8;

// Title trim/cap mirrors the PATCH rename validation; the fallback truncates
// the first user message near this width at a word boundary.
const TITLE_MAX_LENGTH = 120;
const FALLBACK_TITLE_MAX_LENGTH = 48;

const INSTRUCTIONS = [
  "You are the copilot for KeeperHub, helping people read their on-chain and DeFi world through chat.",
  "",
  "How to work:",
  "- Discovery first. Call search_actions to find the exact action id and its parameters before executing anything. Never guess an action id.",
  "- To read data, call execute_protocol_action with the exact actionType from search_actions and parameters that match its field spec. Use execute_contract_call for contract functions, declaring the function's stateMutability, and get_wallet_integration to read a wallet integration.",
  "- A read runs immediately. A write such as a transfer, a swap, or an approval is shown to the person as a card they confirm on screen before anything happens, so propose the write by calling the tool with the exact parameters and let the confirm step handle it. Never say a write has happened, and never claim it will happen without the person confirming.",
  "- When a request is genuinely ambiguous between real alternatives, such as which token, which chain, or which route, run the best interpretation and also list the alternatives you considered in the alternatives field. Never silently pick one without declaring the others.",
  "- Cards on screen are editable and can be run again. A re-run appears in the history as a tool execution; treat those values as the person's latest intent.",
  "- The person's org wallet is named below; for its balances or holdings call get_org_wallet_balances. Some actions in search_actions are marked not executable because KeeperHub runs them only inside automations; follow the note on the match (execute_transfer for a transfer, execute_contract_call for a token balance or contract read) instead of calling them.",
  "- When you need a detail you don't have, such as a recipient address, an amount, a network or a token, call request_input with every missing detail in one form instead of asking in words. Never ask for an address in words, and never ask for the org wallet's address. The result is the person's answer: carry on with exactly those values, or stop and ask what they want if they closed the form.",
  "- Automations run steps for the person later, on a schedule or when something happens. Use list_automations and get_automation to see existing ones. To make one, look up each step's action with search_actions, then call create_automation with how it starts and the steps in order. It is saved switched off, and its card offers to turn it on after KeeperHub checks it.",
  "- To change an automation, read it with get_automation, then call update_automation with its workflowId and the whole automation as it should be. Use set_automation_enabled to turn one on or off, run_automation to run one now, and delete_automation to delete one. Each of these is a card the person authorizes. A run is started, not finished: its card shows how it ends.",
  "",
  "How to answer:",
  "- Every result renders as a card on screen. Do not paste raw JSON and do not repeat the full result in prose. Refer to amounts, addresses, and hashes by name; their exact values live on the card.",
  "- If a call returns an error, explain the reason plainly, and when it is a parameter problem, fix the parameters and try again.",
  "- Write in sentence case with periods. Do not use exclamation marks. Keep it calm and precise.",
].join("\n");

export const VOICE_RESUME_LINE =
  "This action was proposed in a voice conversation, and the voice tells the person the result out loud. Reply in one short sentence.";

/*
 * The header's network pill writes a cookie; the model hears the same choice,
 * so a request that names no network lands on the one the person is looking at.
 */
export function instructionsFor(chainId: string, wallet: OrgWallet | null = null, locale: LocaleCode = DEFAULT_LOCALE): string {
  const chain = getChain(chainId);
  return [
    INSTRUCTIONS,
    "",
    `The network selected in the app header is ${chain.name} (chain id ${chain.id}). When a request does not name a network, use this one.`,
    // Decision 34: the assistant knows the org wallet and never asks for it.
    walletPromptLine(wallet),
    "",
    // Decisions 38–40: the person picked the language; it is pinned, never guessed.
    "Language:",
    ...languageRules(locale).map((rule) => `- ${rule}`),
  ].join("\n");
}

export async function POST(req: Request): Promise<Response> {
  // A server ULID per POST correlates this turn's logs; conversationId joins
  // it after the body parse (NFR2 — cross-turn correlation is the id itself).
  const requestId = ulid();

  let session: AuthenticatedSession | null;
  try {
    session = await getSession();
  } catch (error) {
    // getSession re-throws only on a transient refresh failure (429/5xx/network);
    // surface it as a structured, correlated error, never an opaque framework 500.
    console.error(
      JSON.stringify({
        event: "chat_session_error",
        requestId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return Response.json(
      {
        error: {
          code: "server_error",
          message:
            "We could not reach KeeperHub just now. Try again in a moment.",
        },
      },
      { status: 503 },
    );
  }
  if (session === null) {
    // Guest chat is Epic 7; here the UI invites Connect KeeperHub in place.
    return Response.json(
      {
        error: {
          code: "unauthorized",
          message: "Connect KeeperHub to start a conversation.",
        },
      },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("The request body could not be read.");
  }

  const parsed = extractChatBody(body);
  if (parsed === null) {
    return badRequest(
      "A conversation id and one user message are required.",
    );
  }
  const { conversationId } = parsed;
  // The org wallet for the instructions, read alongside the conversation (kept per org, never throws).
  const walletRead = orgWallet(session).catch(() => null);

  // The stored transcript is authoritative. Absent and another org's row are
  // the same null, structurally (AD-9) — the same honest 404.
  let conversation: ConversationRow | null;
  try {
    conversation = await getConversation(session, conversationId);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "chat_data_error",
        conversationId,
        requestId,
        orgId: session.orgId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return Response.json(
      {
        error: {
          code: "server_error",
          message: "The conversation could not be loaded. Try again in a moment.",
        },
      },
      { status: 500 },
    );
  }
  if (conversation === null) {
    return Response.json(
      {
        error: {
          code: "not_found",
          message: "This conversation is not available.",
        },
      },
      { status: 404 },
    );
  }

  // Confirm-ceremony resume (Story 2.3, AD-5): a card's Confirm/Decline arrives
  // as an assistant message whose write tool part is `approval-responded`. Handle
  // it from the STORED transcript (client history is never trusted) — the decision
  // is the only thing taken from the client; the AI SDK re-verifies the signature
  // over the stored input and fails closed on any tamper.
  // Decision 42: the person's pick, else their browser's language, the same resolver the screens use.
  const locale = resolveLocale(readLocaleCookieValue(req.headers.get("cookie")), req.headers.get("accept-language"));
  const instructions = instructionsFor(readNetworkFromCookieHeader(req.headers.get("cookie")), await walletRead, locale);

  const decision = detectApprovalResume(parsed.message);
  if (decision !== null) {
    return handleApprovalResume({
      session,
      conversation,
      decision,
      requestId,
      signal: req.signal,
      instructions,
    });
  }
  // A form answered on screen (decision 32) resumes the turn, checked against the stored form.
  const formAnswers = detectInputAnswers(parsed.message);
  if (formAnswers.length > 0) {
    return handleInputAnswer({
      session,
      conversation,
      answers: formAnswers,
      requestId,
      signal: req.signal,
      instructions,
    });
  }
  // The client only ever sends a user turn, an approval decision or a form's
  // answer; any other assistant message is forged.
  if (parsed.message.role !== "user") {
    return badRequest("This message could not be processed.");
  }

  // Nothing may follow a card or form still waiting on screen: the model could
  // not read past a call with no answer (decision 32).
  if (awaitingApproval(conversation.transcript)) {
    return Response.json(
      {
        error: {
          code: "waiting",
          message: "Answer the card or form above before sending anything else.",
        },
      },
      { status: 409 },
    );
  }

  // Re-run branch (Story 1.6, D3): a card's "Run again." carries a data-rerun
  // part. Detect it AFTER the conversation loads (a re-run verifies supersede
  // ids against the stored transcript) and BEFORE the normal model path. The
  // read gate inside routeToolCall is the security boundary — no second gate.
  const rerun = detectRerun(parsed.message);
  if (rerun.kind === "malformed") {
    // The client validated before sending, so a malformed payload is drift.
    console.error(
      JSON.stringify({
        event: "chat_rerun_malformed",
        conversationId,
        requestId,
        orgId: session.orgId,
      }),
    );
    return badRequest("The re-run request could not be read.");
  }
  if (rerun.kind === "ok") {
    return handleRerun({
      session,
      conversation,
      message: parsed.message,
      payload: rerun.payload,
      requestId,
      signal: req.signal,
    });
  }

  // The message-id law (lib/transcript): server-minted unless the client id
  // is well-formed and role-consistent with the stored document.
  const incoming = sanitizeUserMessage(parsed.message, conversation.transcript);

  // The incoming message validates ALONE first, so a 400 can only ever mean
  // the client's payload was bad. A failure of the combined document below is
  // then the server's stored side — a server fault, never a bad_request.
  try {
    await validateUIMessages({ messages: [incoming] });
  } catch {
    return badRequest("The message could not be read.");
  }

  let validatedMessages: UIMessage[];
  let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
  try {
    // AC 2's validator guards the write path too: stored + incoming validate
    // before anything persists or reaches the model.
    validatedMessages = await validateUIMessages({
      messages: [...conversation.transcript, incoming],
    });
    // A persisted data-only re-run user message (Story 1.6) carries a data-rerun
    // part and no text; it must NOT reach the model as an empty user turn (the
    // provider rejects empty content, breaking the next normal turn). Drop
    // textless user messages by INTENT before conversion — robust to how
    // convertToModelMessages happens to shape empty content. A re-run then
    // contributes only its assistant tool-call/result to the model's view.
    modelMessages = await convertToModelMessages(
      validatedMessages.filter(isModelVisibleMessage),
    );
  } catch (error) {
    // The incoming message already validated, so this is stored-transcript
    // corruption: label it honestly as ours, never as the client's error.
    console.error(
      JSON.stringify({
        event: "chat_history_invalid",
        conversationId,
        requestId,
        orgId: session.orgId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return Response.json(
      {
        error: {
          code: "server_error",
          message:
            "This conversation's history could not be read. Your message was not saved.",
        },
      },
      { status: 500 },
    );
  }

  // Persist the user message BEFORE streaming starts: if the model call dies,
  // the user's words survive. Full interruption-proofing is Story 3.4.
  try {
    await persistMessages({
      session,
      conversationId,
      messages: [incoming],
      requestId,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "chat_persist_failed",
        phase: "user_message",
        conversationId,
        requestId,
        orgId: session.orgId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return Response.json(
      {
        error: {
          code: "server_error",
          message: "Your message could not be saved. Try again in a moment.",
        },
      },
      { status: 500 },
    );
  }

  let aiConfig;
  try {
    aiConfig = getAiConfig();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "chat_config_error",
        conversationId,
        requestId,
        orgId: session.orgId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return Response.json(
      { error: { code: "server_error", message: "The assistant is not configured yet." } },
      { status: 500 },
    );
  }

  const openai = createOpenAI({ apiKey: aiConfig.openaiApiKey });

  const result = streamText({
    model: openai.responses(aiConfig.chatModel),
    instructions,
    messages: modelMessages,
    tools: buildTools(session, requestId, req.signal, conversationId),
    // The confirm ceremony IS the AI SDK approval flow (AD-5, Story 2.3): a WRITE
    // tool call is held as `approval-requested` until the person confirms on
    // screen; a read runs immediately. requiresConfirmation resolves read-vs-write
    // server-side (never the model). The secret HMAC-signs each approval so a
    // forged or replayed client boolean approves nothing (verified fail-closed).
    toolApproval: buildToolApproval(),
    experimental_toolApprovalSecret: aiConfig.toolApprovalSecret,
    stopWhen: stepCountIs(MAX_STEPS),
    abortSignal: req.signal,
    onError: ({ error }) => {
      console.error(
        JSON.stringify({
          event: "chat_stream_error",
          conversationId,
          requestId,
          orgId: session.orgId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    },
  });

  // originalMessages switches the stream into persistence mode: the response
  // message carries a server-minted id (generateMessageId). v7's callback is
  // onEnd (onFinish is a deprecated alias — ai@7.0.59 index.d.ts:2510).
  return result.toUIMessageStreamResponse({
    originalMessages: validatedMessages,
    generateMessageId: () => ulid(),
    onEnd: async ({ messages, isAborted }) => {
      try {
        // Persist even when aborted: committed content is never thrown away.
        await persistMessages({
          session,
          conversationId,
          messages,
          requestId,
        });
      } catch (error) {
        // The stream already reached the user — rethrow-into-log only, never
        // silent, never a crash after delivery.
        console.error(
          JSON.stringify({
            event: "chat_persist_failed",
            phase: "on_end",
            conversationId,
            isAborted,
            requestId,
            orgId: session.orgId,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
        return;
      }
      await maybeGenerateTitle({
        session,
        conversation,
        messages,
        requestId,
        locale,
        model: openai.responses(aiConfig.chatModel),
      });
    },
  });
}

/*
 * Auto-title (Story 1.5, AC 3): once, only while the stored title is still
 * exactly the placeholder — never after a user rename (a rename is
 * permanent, so the title is RE-READ here: a mid-stream rename wins over
 * generation). Awaited inside onEnd deliberately: it delays only stream
 * teardown, after every visible token (next/server's after() is the
 * sanctioned alternative if the delay ever proves noticeable). A title
 * problem must never fail the turn or the persist.
 */
async function maybeGenerateTitle({
  session,
  conversation,
  messages,
  requestId,
  locale,
  model,
}: {
  session: AuthenticatedSession;
  conversation: ConversationRow;
  messages: UIMessage[];
  requestId: string;
  locale: LocaleCode;
  model: Parameters<typeof generateText>[0]["model"];
}): Promise<void> {
  if (conversation.title !== NEW_CONVERSATION_TITLE) {
    return;
  }
  // Cheap pre-check so a rename that already landed skips the generateText
  // call entirely; the WRITE below is independently guarded either way.
  let fresh: ConversationRow | null;
  try {
    fresh = await getConversation(session, conversation.id);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "title_recheck_failed",
        conversationId: conversation.id,
        requestId,
        orgId: session.orgId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return;
  }
  if (fresh === null || fresh.title !== NEW_CONVERSATION_TITLE) {
    return;
  }

  const firstUserText = firstTextForRole(messages, "user");
  const firstAssistantText = firstTextForRole(messages, "assistant");

  let title: string | null = null;
  try {
    const generated = await generateText({
      model,
      prompt: [
        "Generate a title for this conversation.",
        // Decisions 38–40: in the language the person picked.
        `Write the title in ${getLocale(locale).english}.`,
        "At most six words. Sentence case. No quotes, no trailing period, no em-dashes.",
        "Reply with the title only.",
        "",
        `User: ${firstUserText}`,
        `Assistant: ${firstAssistantText}`,
      ].join("\n"),
    });
    const cleaned = normalizeTitle(generated.text);
    title = cleaned.length > 0 ? cleaned : null;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "title_fallback",
        conversationId: conversation.id,
        requestId,
        orgId: session.orgId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  if (title === null) {
    const fallback = truncateAtWordBoundary(
      firstUserText,
      FALLBACK_TITLE_MAX_LENGTH,
    );
    if (fallback.length === 0) {
      return;
    }
    title = fallback;
  }

  try {
    // Single-statement conditional write: lands only while the title is still
    // the placeholder, so a rename racing generateText always wins. A null
    // return IS that desired outcome — no log, nothing to repair.
    await autoTitleConversation(session, conversation.id, title);
  } catch (error) {
    // Never fatal: the turn and the persist already succeeded.
    console.error(
      JSON.stringify({
        event: "title_write_failed",
        conversationId: conversation.id,
        requestId,
        orgId: session.orgId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

/*
 * Enforce the copy law on model output (the prompt asks, this guarantees):
 * one line, no wrapping quotes, no exclamation marks, no em-dashes, no
 * trailing period — then the same trim/cap as the PATCH rename validation.
 */
function normalizeTitle(raw: string): string {
  let title = raw
    .replaceAll(/\s+/g, " ")
    .replaceAll("—", "-")
    .replaceAll("!", "")
    .trim();
  while (title.length > 1 && /^["'«»„“”‘’].*["'«»„“”‘’]$/.test(title)) {
    title = title.slice(1, -1).trim();
  }
  title = title.replace(/\.+$/, "").trim();
  return title.slice(0, TITLE_MAX_LENGTH).trim();
}

function firstTextForRole(messages: UIMessage[], role: UIMessage["role"]): string {
  for (const message of messages) {
    if (message.role !== role) {
      continue;
    }
    const text = message.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("")
      .trim();
    if (text.length > 0) {
      return text;
    }
  }
  return "";
}

function truncateAtWordBoundary(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const slice = text.slice(0, max + 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : text.slice(0, max);
  return cut.trimEnd();
}

/**
 * A user message reaches the MODEL view only when it carries visible text. A
 * data-only re-run user message (Story 1.6) has a `data-rerun` part and no text;
 * it — and any textless user turn — is dropped before the model so the provider
 * never receives an empty user turn (which it rejects, breaking the next normal
 * turn of a conversation that has a re-run in its history). Intent-based, so it
 * does not depend on convertToModelMessages' empty-content shape. Non-user
 * messages always pass. Exported for the route regression test.
 */
export function isModelVisibleMessage(message: UIMessage): boolean {
  if (message.role !== "user") {
    return true;
  }
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts.some(
    (part) =>
      part.type === "text" &&
      typeof (part as { text?: unknown }).text === "string" &&
      (part as { text: string }).text.trim() !== "",
  );
}

/** Schedule best-effort work to run AFTER the response finishes (Next's `after`),
 *  so a slow/hung ledger insert never blocks the read. Falls back to running it
 *  inline when there is no request scope (a unit test invoking the handler
 *  directly); the task swallows its own errors, so this never rejects. */
function afterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

/** Build the four surface tools; each execute delegates to the one door.
 *  Exported so a test can bind the route surface to the gate (a refactor that
 *  skipped routeToolCall must not ship green). conversationId + the AI SDK's
 *  per-call toolCallId thread through so the ledger can key its rows (Story 2.2). */
export function buildTools(
  session: AuthenticatedSession,
  requestId: string,
  signal: AbortSignal,
  conversationId: string,
): ToolSet {
  const tools: ToolSet = {};
  for (const surface of surfaceChatTools) {
    // Decision 32: a form has no execute. The turn stops on it, and the person's answer resumes it.
    if (surface.name === REQUEST_INPUT_TOOL) {
      const form: ToolSet[string] = { description: surface.description, inputSchema: surface.inputSchema };
      tools[surface.name] = form;
      continue;
    }
    tools[surface.name] = tool({
      description: surface.description,
      inputSchema: surface.inputSchema,
      // The AI SDK passes ToolCallOptions as the 2nd arg; its toolCallId is the
      // provider's per-call tool-call id (unique per call, NOT a server ULID) —
      // the key the read's ledger row is keyed by (Story 2.2; see Decision 3).
      execute: (args: unknown, { toolCallId }: { toolCallId: string }) =>
        routeToolCall({
          session,
          toolName: surface.name,
          args,
          requestId,
          signal,
          conversationId,
          toolCallId,
          // Story 2.3: the SDK calls execute for a WRITE tool ONLY after it has
          // verified the confirm (AD-5), so reaching here authorizes the broadcast.
          // `write` is a server-only phase — a client can never set it. Reads
          // ignore it. This is the ONLY caller that passes "broadcast".
          write: "broadcast",
          // Run the best-effort read-record AFTER the response (Story 2.2 Patch):
          // a slow or hung ledger insert must not delay or fail the read.
          deferBackground: afterResponse,
        }),
    });
  }
  return tools;
}

// --- the confirm ceremony (Story 2.3, AD-5) ----------------------------------

/** The AI SDK toolApproval config: a WRITE tool call is held for on-screen
 *  confirmation; a read runs immediately. requiresConfirmation resolves
 *  read-vs-write server-side from the effect class — the model never decides. */
function buildToolApproval() {
  const gate =
    (toolName: string) =>
    (input: unknown): "user-approval" | "not-applicable" =>
      requiresConfirmation(toolName, input) ? "user-approval" : "not-applicable";
  return {
    execute_protocol_action: gate("execute_protocol_action"),
    execute_contract_call: gate("execute_contract_call"),
    // Every transfer is a value-moving write — always held for on-screen confirm
    // (2.5 D25). Omitting it would let a transfer broadcast with no ceremony.
    execute_transfer: gate("execute_transfer"),
    // Automation changes (decisions 19–21): held for the card once the proposal can be acted on.
    create_automation: gate("create_automation"),
    set_automation_enabled: gate("set_automation_enabled"),
    update_automation: gate("update_automation"),
    run_automation: gate("run_automation"),
    delete_automation: gate("delete_automation"),
  };
}

/** Read a confirm-ceremony decision from an incoming assistant message: a write
 *  tool part in `approval-responded` state carrying `approval.approved`. Returns
 *  null for any other message (the normal user path). The signature/input are
 *  NOT read from the client — only the toolCallId + the boolean decision. */
export function detectApprovalResume(
  message: UIMessage,
): { toolCallId: string; approved: boolean; postedInput?: unknown } | null {
  if (message.role !== "assistant" || !Array.isArray(message.parts)) {
    return null;
  }
  for (const part of message.parts) {
    const p = part as {
      type?: unknown;
      state?: unknown;
      toolCallId?: unknown;
      input?: unknown;
      approval?: unknown;
    };
    if (
      typeof p.type === "string" &&
      p.type.startsWith("tool-") &&
      p.state === "approval-responded" &&
      typeof p.toolCallId === "string"
    ) {
      const approval = p.approval as { approved?: unknown } | null | undefined;
      if (approval != null && typeof approval.approved === "boolean") {
        // Story 2.5 (Task 4): the client posts the confirmed input on this part.
        // For a plain confirm it equals the stored proposal; for an in-card AMOUNT
        // edit it differs, and handleApprovalResume validates + re-signs it. Carried
        // here but NEVER trusted directly — the server re-checks it against the
        // trusted stored proposal before it can execute.
        return {
          toolCallId: p.toolCallId,
          approved: approval.approved,
          ...(p.input !== undefined ? { postedInput: p.input } : {}),
        };
      }
    }
  }
  return null;
}

/**
 * Rebuild the stored transcript with ONE approval decision applied: the
 * approval-requested write part (matched by toolCallId) transitions to
 * approval-responded, keeping the server's input + approval id + signature and
 * flipping only `approved`. Returns null when no such pending part exists (the
 * card already resolved, or an unknown id) — the resume is then a no-op stop.
 * A client can never alter the signed input this way; it only says yes or no.
 */
export function applyApprovalDecision(
  transcript: UIMessage[],
  decision: { toolCallId: string; approved: boolean },
  /** Story 2.5 (Task 4): a validated in-card amount edit — the confirmed input and
   *  a FRESH approval signature over it (route.ts re-signs). When present, the
   *  responded part carries the EDITED input + signature so the SDK verifies and
   *  executes exactly the confirmed quote, not the model's original. */
  edit?: { input: unknown; signature: string },
): UIMessage[] | null {
  let found = false;
  const next = transcript.map((message) => {
    if (message.role !== "assistant" || !Array.isArray(message.parts)) {
      return message;
    }
    let changed = false;
    const parts = message.parts.map((part) => {
      const p = part as { type?: unknown; state?: unknown; toolCallId?: unknown; approval?: unknown };
      if (
        typeof p.type === "string" &&
        p.type.startsWith("tool-") &&
        p.toolCallId === decision.toolCallId &&
        p.state === "approval-requested"
      ) {
        const approval = (p.approval ?? {}) as Record<string, unknown>;
        found = true;
        changed = true;
        return {
          ...(part as object),
          state: "approval-responded",
          ...(edit !== undefined ? { input: edit.input } : {}),
          approval: {
            ...approval,
            approved: decision.approved,
            ...(edit !== undefined ? { signature: edit.signature } : {}),
          },
        };
      }
      return part;
    });
    return changed ? { ...message, parts } : message;
  });
  return found ? (next as UIMessage[]) : null;
}

/**
 * The stored pending proposal for a toolCallId: the `approval-requested` write
 * part in the TRUSTED transcript — its toolName, the exact reviewed input, and the
 * SDK approval id. It is the evidence a decline records (Story 2.4) AND the trusted
 * baseline an in-card amount edit is validated + re-signed against (Story 2.5, Task
 * 4). Returns null when no such pending part exists (a stale/absent id → the 409).
 */
function findPendingProposal(
  transcript: UIMessage[],
  toolCallId: string,
): { toolName: string; input: unknown; approvalId?: string; fromVoice: boolean } | null {
  for (const message of transcript) {
    const fromVoice = (message.metadata as { source?: unknown } | undefined)?.source === "voice";
    if (message.role !== "assistant" || !Array.isArray(message.parts)) {
      continue;
    }
    for (const part of message.parts) {
      const p = part as {
        type?: unknown;
        state?: unknown;
        toolCallId?: unknown;
        input?: unknown;
        approval?: unknown;
      };
      if (
        typeof p.type === "string" &&
        p.type.startsWith("tool-") &&
        p.toolCallId === toolCallId &&
        p.state === "approval-requested"
      ) {
        const approval = p.approval as { id?: unknown } | null | undefined;
        return {
          toolName: p.type.slice("tool-".length),
          input: p.input,
          fromVoice,
          ...(approval != null && typeof approval.id === "string"
            ? { approvalId: approval.id }
            : {}),
        };
      }
    }
  }
  return null;
}

/**
 * Resume the model after a confirm decision (Story 2.3). The reconstructed
 * transcript (approval applied from the trusted store) drives streamText with the
 * SAME toolApproval + secret, so the SDK verifies the signature over the stored
 * input and — only on a verified approval — runs the write tool's execute (the
 * broadcast). A decline yields the SDK-native output-denied terminal. No title
 * generation (a resume is never a first turn).
 */
async function handleApprovalResume({
  session,
  conversation,
  decision,
  requestId,
  signal,
  instructions,
}: {
  session: AuthenticatedSession;
  conversation: ConversationRow;
  decision: { toolCallId: string; approved: boolean; postedInput?: unknown };
  requestId: string;
  signal: AbortSignal;
  instructions: string;
}): Promise<Response> {
  const conversationId = conversation.id;
  const orgId = session.orgId;

  // aiConfig is loaded up front: an in-card amount edit re-signs the confirmed quote
  // with the approval secret BEFORE the transcript is rebuilt (Story 2.5, Task 4).
  let aiConfig;
  try {
    aiConfig = getAiConfig();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "chat_config_error",
        conversationId,
        requestId,
        orgId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return Response.json(
      { error: { code: "server_error", message: "The assistant is not configured yet." } },
      { status: 500 },
    );
  }

  // The trusted pending proposal for this toolCallId (the stored approval-requested
  // part) — the baseline an edit is validated + re-signed against, and the evidence
  // a decline records.
  const pending = findPendingProposal(conversation.transcript, decision.toolCallId);

  // An in-card edit (decision 11): the client posted a confirmed input that differs
  // from the trusted stored proposal on an APPROVED confirm. It must be the same
  // action with its editable fields passing the tool's rules (checkEditedWrite);
  // then the edited proposal is re-signed so the SDK verifies + executes exactly
  // what the person authorized, never the model's original. A decline ignores the
  // edit (it refuses the original). Fail-closed on anything else.
  let edit: { input: unknown; signature: string } | undefined;
  if (
    decision.approved === true &&
    pending !== null &&
    decision.postedInput !== undefined &&
    canonicalJSON(decision.postedInput) !== canonicalJSON(pending.input)
  ) {
    if (
      pending.approvalId === undefined ||
      !checkEditedWrite(pending.toolName, pending.input, decision.postedInput).ok
    ) {
      console.error(
        JSON.stringify({
          event: "chat_approval_edit_rejected",
          conversationId,
          requestId,
          orgId,
          toolCallId: decision.toolCallId,
          toolName: pending.toolName,
        }),
      );
      return Response.json(
        {
          error: {
            code: "bad_request",
            message: "This edit could not be authorized. Check the fields and try again.",
          },
        },
        { status: 400 },
      );
    }
    const signature = await signToolApproval({
      secret: aiConfig.toolApprovalSecret,
      approvalId: pending.approvalId,
      toolCallId: decision.toolCallId,
      toolName: pending.toolName,
      input: decision.postedInput,
    });
    edit = { input: decision.postedInput, signature };
  }

  const reconstructed = applyApprovalDecision(conversation.transcript, decision, edit);
  if (reconstructed === null) {
    console.error(
      JSON.stringify({
        event: "chat_approval_stale",
        conversationId,
        requestId,
        orgId,
        toolCallId: decision.toolCallId,
      }),
    );
    return Response.json(
      {
        error: {
          code: "not_found",
          message: "This confirmation is no longer available.",
        },
      },
      { status: 409 },
    );
  }

  // Story 2.4 (AC 2, D21): a DECLINE writes the durable ledger `declined` terminal
  // (AD-2) from the STORED proposal — the queryable evidence overlay beside the
  // SDK-native output-denied part. Only after the 409 guard above (a stale/absent
  // card never writes a row). Best-effort-but-loud (never fails the person's "no");
  // awaited BEFORE the resume so the row lands with the decline, while the resume
  // still produces + persists the output-denied part unchanged.
  if (decision.approved === false && pending !== null) {
    await recordWriteDecline({
      session,
      conversationId,
      toolCallId: decision.toolCallId,
      toolName: pending.toolName,
      input: pending.input,
      requestId,
    });
  }

  return streamResume({
    session,
    conversationId,
    reconstructed,
    requestId,
    signal,
    // Decision 28: voice says a voice card's result out loud, so the chat adds one sentence.
    instructions: pending?.fromVoice ? `${instructions}\n\n${VOICE_RESUME_LINE}` : instructions,
    aiConfig,
    phase: "approval_resume",
  });
}

// --- form cards (decision 32) -------------------------------------------------

/** The answered forms on an incoming assistant message. Only each call id and its answer are read; the stored form decides which one is new. */
export function detectInputAnswers(message: UIMessage): Array<{ toolCallId: string; output: unknown }> {
  if (message.role !== "assistant" || !Array.isArray(message.parts)) {
    return [];
  }
  return message.parts.flatMap((part) => {
    const p = part as { type?: unknown; state?: unknown; toolCallId?: unknown; output?: unknown };
    return p.type === `tool-${REQUEST_INPUT_TOOL}` && p.state === "output-available" && typeof p.toolCallId === "string"
      ? [{ toolCallId: p.toolCallId, output: p.output }]
      : [];
  });
}

/*
 * Resume the model after the person answers a form (decision 32). The answer is
 * checked against the form stored in the transcript, never the browser's copy
 * of it, and applied there; a form no longer waiting is the same 409 a stale
 * approval gets. A form voice asked for and the chat answered (voice ended
 * first) resumes here like any other, with no voice line.
 */
async function handleInputAnswer({
  session,
  conversation,
  answers,
  requestId,
  signal,
  instructions,
}: {
  session: AuthenticatedSession;
  conversation: ConversationRow;
  answers: Array<{ toolCallId: string; output: unknown }>;
  requestId: string;
  signal: AbortSignal;
  instructions: string;
}): Promise<Response> {
  const conversationId = conversation.id;
  const orgId = session.orgId;

  const pending = answers.find((answer) => findOpenForm(conversation.transcript, answer.toolCallId) !== null);
  const open = pending === undefined ? null : findOpenForm(conversation.transcript, pending.toolCallId);
  if (pending === undefined || open === null) {
    console.error(JSON.stringify({ event: "chat_form_stale", conversationId, requestId, orgId }));
    return Response.json(
      { error: { code: "not_found", message: "This form is no longer waiting." } },
      { status: 409 },
    );
  }

  const request = readInputRequest(open.input);
  const checked = request === null ? null : checkInputAnswer(request, pending.output);
  if (checked === null || !checked.ok) {
    console.error(
      JSON.stringify({ event: "chat_form_answer_rejected", conversationId, requestId, orgId, toolCallId: pending.toolCallId }),
    );
    return Response.json(
      {
        error: {
          code: "bad_request",
          message: "These details could not be used. Check the form and try again.",
          ...(checked !== null && !checked.ok ? { issues: checked.issues } : {}),
        },
      },
      { status: 400 },
    );
  }

  let aiConfig;
  try {
    aiConfig = getAiConfig();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "chat_config_error",
        conversationId,
        requestId,
        orgId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return Response.json(
      { error: { code: "server_error", message: "The assistant is not configured yet." } },
      { status: 500 },
    );
  }

  const reconstructed = withFormAnswer(conversation.transcript, pending.toolCallId, checked.answer);
  if (reconstructed === null) {
    return Response.json(
      { error: { code: "not_found", message: "This form is no longer waiting." } },
      { status: 409 },
    );
  }
  return streamResume({
    session,
    conversationId,
    reconstructed,
    requestId,
    signal,
    instructions,
    aiConfig,
    phase: "form_answer",
  });
}

/*
 * Run the model on a transcript rebuilt from the store after an answer on
 * screen: an approval (Story 2.3) or a form (decision 32). The SAME tools and
 * approval config run, so for an approval the SDK re-verifies the signature
 * over the stored input and runs execute only on a verified yes. No title
 * generation (a resume is never a first turn).
 */
async function streamResume({
  session,
  conversationId,
  reconstructed,
  requestId,
  signal,
  instructions,
  aiConfig,
  phase,
}: {
  session: AuthenticatedSession;
  conversationId: string;
  reconstructed: UIMessage[];
  requestId: string;
  signal: AbortSignal;
  instructions: string;
  aiConfig: ReturnType<typeof getAiConfig>;
  phase: "approval_resume" | "form_answer";
}): Promise<Response> {
  const orgId = session.orgId;
  let validatedMessages: UIMessage[];
  let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
  try {
    validatedMessages = await validateUIMessages({ messages: reconstructed });
    modelMessages = await convertToModelMessages(
      validatedMessages.filter(isModelVisibleMessage),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "chat_history_invalid",
        conversationId,
        requestId,
        orgId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return Response.json(
      {
        error: {
          code: "server_error",
          message: "This conversation's history could not be read.",
        },
      },
      { status: 500 },
    );
  }

  const openai = createOpenAI({ apiKey: aiConfig.openaiApiKey });
  const result = streamText({
    model: openai.responses(aiConfig.chatModel),
    instructions,
    messages: modelMessages,
    tools: buildTools(session, requestId, signal, conversationId),
    // The SAME approval config resumes the ceremony: the SDK re-verifies the
    // signature (over the stored input) and runs execute only on a verified yes.
    toolApproval: buildToolApproval(),
    experimental_toolApprovalSecret: aiConfig.toolApprovalSecret,
    stopWhen: stepCountIs(MAX_STEPS),
    abortSignal: signal,
    onError: ({ error }) => {
      console.error(
        JSON.stringify({
          event: "chat_stream_error",
          conversationId,
          requestId,
          orgId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: validatedMessages,
    generateMessageId: () => ulid(),
    onEnd: async ({ messages, isAborted }) => {
      try {
        await persistMessages({ session, conversationId, messages, requestId });
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "chat_persist_failed",
            phase,
            conversationId,
            isAborted,
            requestId,
            orgId,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    },
  });
}

function badRequest(message: string): Response {
  return Response.json(
    { error: { code: "bad_request", message } },
    { status: 400 },
  );
}

/*
 * The 1.5 body shape: `{ conversationId, message }` — the id must be a
 * string and the message a single user-authored object. Deep message shape
 * is validateUIMessages' job; this guards only what routing needs.
 */
function extractChatBody(
  body: unknown,
): { conversationId: string; message: UIMessage } | null {
  if (body === null || typeof body !== "object") {
    return null;
  }
  const { conversationId, message } = body as {
    conversationId: unknown;
    message: unknown;
  };
  if (typeof conversationId !== "string" || conversationId.length === 0) {
    return null;
  }
  if (message === null || typeof message !== "object") {
    return null;
  }
  const role = (message as { role?: unknown }).role;
  // A user turn (chat, re-run) OR an assistant turn carrying a confirm-ceremony
  // approval decision (Story 2.3 resume). Any other role is forged and refused
  // by the caller after the resume check.
  if (role !== "user" && role !== "assistant") {
    return null;
  }
  // Only the routing-level shape is guarded here; the deep part/metadata shape
  // is validateUIMessages' job before anything persists or reaches the model.
  return { conversationId, message: message as unknown as UIMessage };
}
