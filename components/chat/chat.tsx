"use client";

import { useChat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from "ai";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { readPreview } from "@/components/cards/automation-view";
import type { RerunRequest } from "@/components/cards/read-card";
import type { SimulateResult, WriteCeremony } from "@/components/cards/write-card.ts";
import { useAccount } from "@/components/shell/account-context";
import { useSelectedNetwork } from "@/components/shell/header/network-pill";
import { takeDraft } from "@/components/shell/sign-in/pending-draft";
import { useSignIn } from "@/components/shell/sign-in/sign-in";
import { useSound } from "@/components/shell/sound-context";
import { SignInGate } from "@/components/shell/sign-in/sign-in-gate";
import { useVoiceSession } from "@/components/voice/use-voice-session";
import { VoiceFormContext } from "@/components/voice/voice-form-context";
import { VoiceHero } from "@/components/voice/voice-hero";
import { readInputRequest } from "@/lib/chat/input-request";
import { useErrorMessage, useTranslate } from "@/lib/i18n/use-translate";
import type { StarterCategory } from "@/lib/registry/surface-suggestions";
import { voiceOutcome } from "@/lib/voice/outcome";

import {
  answerUnsent,
  arrivalDraft,
  awaitingApproval,
  awaitingForm,
  formAnswerReady,
  isSessionLapse,
  mergeMessages,
  msUntilArchive,
  toolPartById,
  withEditedInput,
  withoutArrivalParams,
} from "./chat-rules";
import { registerChatInbox } from "./chat-inbox";
import { cardDecision, chatTransport } from "./chat-transport";
import { Composer } from "./composer";
import { launcherCategories } from "./home/categories";
import { ChatHome } from "./home/chat-home";
import { MessageList } from "./message-list";

/*
 * One conversation. The engine is v1 components/chat/Conversation.tsx: the
 * server's stored transcript is the history, so the transport sends only
 * { conversationId, message }; the first send creates the conversation, then
 * moves the address to /app/c/[id] without remounting mid-stream; an approved or
 * declined write resumes on its own; a read card's "Run again" posts a data-only
 * message the route answers without the model.
 *
 * The behaviour around it is DeepBookie components/chat/Chat.tsx: sending is
 * blocked while a write awaits approval, a failed turn shows a banner with Retry,
 * and a chat idle for 30 minutes turns read-only with New chat in place of the
 * composer. A question arriving with the page is sent once (Portaldot
 * chat-app.tsx:112-124, DeepBookie Chat.tsx:94-110).
 *
 * Changes: signed out, Portaldot's identity card stands where the messages go and
 * sending opens the sign-in modal carrying the text; the 30-minute clock also
 * starts from when a reopened conversation was last touched (Abu, 2026-09-13);
 * a lapsed session offers Connect KeeperHub (v1) instead of Retry. The write
 * card's callbacks are v1's (approve, carrying an edited proposal; cancel; try
 * again; the dry run). An answer whose post failed is retried from its card,
 * so the banner offers no Retry and the composer stays locked until it lands.
 */

/* An approval, or a form answered in the chat (decision 32), resumes the turn on its own. */
function answeredOnScreen({ messages }: { messages: UIMessage[] }): boolean {
  return lastAssistantMessageIsCompleteWithApprovalResponses({ messages }) || formAnswerReady(messages);
}

export type ChatProps = {
  conversationId?: string;
  initialMessages?: UIMessage[];
  /** When the reopened conversation was last touched (ms). */
  lastActivityAt?: number;
  initiallyArchived?: boolean;
  /** Why a stored transcript could not be shown; replaces the launcher. */
  loadNotice?: string;
  starterSuggestions: StarterCategory[];
  onNewChat: () => void;
  onConversationCreated: (id: string) => void;
  onTurnFinished: () => void;
};

export function Chat({
  conversationId,
  initialMessages,
  lastActivityAt,
  initiallyArchived = false,
  loadNotice,
  starterSuggestions,
  onNewChat,
  onConversationCreated,
  onTurnFinished,
}: ChatProps) {
  const t = useTranslations("chat.chat");
  const translate = useTranslate();
  const errorMessage = useErrorMessage();
  const { identity } = useAccount();
  const { cue } = useSound();
  const { openSignIn } = useSignIn();
  const network = useSelectedNetwork();
  const signedIn = identity.status === "signed-in";

  const [input, setInput] = useState("");
  const [createFailed, setCreateFailed] = useState(false);
  const [archived, setArchived] = useState(initiallyArchived);

  // The synchronous active id: a second send in the same tick sees a just-created conversation.
  const conversationIdRef = useRef(conversationId);
  const { messages, sendMessage, regenerate, status, error, clearError, addToolApprovalResponse, addToolOutput, setMessages } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport: chatTransport,
    sendAutomaticallyWhen: answeredOnScreen,
    onFinish: () => onTurnFinished(),
  });

  const busy = status === "submitted" || status === "streaming";
  const unsent = status === "error" && answerUnsent(messages);
  const pending = awaitingApproval(messages) || unsent;

  // One create at a time, so two quick sends never make two conversations.
  const creatingRef = useRef(false);

  // Voice (slice 9) writes into this conversation; what it stored merges into the list on screen.
  const applyVoiceMessages = useCallback(
    (incoming: UIMessage[]) => setMessages((current) => mergeMessages(current, incoming)),
    [setMessages],
  );
  const { voice, engine: voiceEngine } = useVoiceSession(applyVoiceMessages);
  const voiceOn = voice.phase !== "idle" && voice.phase !== "error";

  // Voice opening and closing, heard on the phase rather than on the buttons —
  // a session also ends on its ten-minute limit (decision 29) and on an error,
  // and all three should sound the same.
  const wasVoiceOn = useRef(false);
  useEffect(() => {
    if (voiceOn === wasVoiceOn.current) return;
    wasVoiceOn.current = voiceOn;
    cue(voiceOn ? "voiceStart" : "voiceEnd");
  }, [voiceOn, cue]);

  // The form voice waits on (decision 33): shown above the voice bar while it is still open, and its chat card steps aside.
  const voiceFormId = voice.waitingKind === "form" ? voice.waitingCard : null;
  const voiceFormPart =
    voiceFormId === null ? undefined : (toolPartById(messages, voiceFormId) as { state?: unknown; input?: unknown } | undefined);
  const voiceFormRequest = useMemo(
    () => (voiceFormPart?.state === "input-available" ? readInputRequest(voiceFormPart.input) : null),
    [voiceFormPart],
  );

  // The conversation, created on first use by a typed message or by voice.
  const ensureConversation = useCallback(async (): Promise<string | null> => {
    const existing = conversationIdRef.current;
    if (existing !== undefined) return existing;
    if (creatingRef.current) return null;
    creatingRef.current = true;
    try {
      const res = await fetch("/api/conversations", { method: "POST" });
      if (!res.ok) throw new Error(`Conversation create failed with ${res.status}.`);
      const created = (await res.json()) as { id?: unknown };
      if (typeof created.id !== "string" || created.id.length === 0) {
        throw new Error("Conversation create returned no id.");
      }
      const id = created.id;
      conversationIdRef.current = id;
      // Next syncs its router from replaceState; a push would remount mid-stream.
      window.history.replaceState(null, "", `/app/c/${id}`);
      onConversationCreated(id);
      return id;
    } catch (createError) {
      console.error("Conversation create failed", createError);
      setCreateFailed(true);
      return null;
    } finally {
      creatingRef.current = false;
    }
  }, [onConversationCreated]);

  const handleSend = useCallback(
    async (text: string): Promise<boolean> => {
      if (!signedIn) {
        openSignIn(text);
        return false;
      }
      if (archived || busy || pending || voiceOn) return false;
      const id = await ensureConversation();
      if (id === null) return false;
      setCreateFailed(false);
      void sendMessage({ text }, { body: { conversationId: id } });
      return true;
    },
    [signedIn, archived, busy, pending, voiceOn, openSignIn, sendMessage, ensureConversation],
  );

  const startVoice = useCallback(async () => {
    if (!signedIn) {
      openSignIn(input);
      return;
    }
    if (archived || busy || pending) return;
    const id = await ensureConversation();
    if (id === null) return;
    setCreateFailed(false);
    await voiceEngine.start(id);
  }, [signedIn, openSignIn, input, archived, busy, pending, ensureConversation, voiceEngine]);

  // Decision 26: once the card voice put up has ended and the chat has finished its line, voice hears how.
  useEffect(() => {
    const card = voice.waitingCard;
    if (card === null || status !== "ready") return;
    const outcome = voiceOutcome(toolPartById(messages, card));
    if (outcome !== null) voiceEngine.reportOutcome(card, outcome);
  }, [messages, status, voice.waitingCard, voiceEngine]);

  // An archived chat takes nothing new, spoken or typed.
  useEffect(() => {
    if (archived) voiceEngine.end("closed");
  }, [archived, voiceEngine]);

  // Latest values for the stable callbacks below, written after render.
  const handleSendRef = useRef(handleSend);
  const sendMessageRef = useRef(sendMessage);
  const addApprovalRef = useRef(addToolApprovalResponse);
  const addToolOutputRef = useRef(addToolOutput);
  const setMessagesRef = useRef(setMessages);
  const clearErrorRef = useRef(clearError);
  const blockedRef = useRef(false);
  useEffect(() => {
    handleSendRef.current = handleSend;
    sendMessageRef.current = sendMessage;
    addApprovalRef.current = addToolApprovalResponse;
    addToolOutputRef.current = addToolOutput;
    setMessagesRef.current = setMessages;
    clearErrorRef.current = clearError;
    blockedRef.current = archived || busy || pending;
  });

  // The ⌘K palette hands an action's prompt to this chat (decision 36): sent when it can be, otherwise left in the composer.
  useEffect(
    () =>
      registerChatInbox((text) => {
        void handleSendRef.current(text).then((sent) => {
          if (!sent) setInput(text);
        });
      }),
    [],
  );

  // v1's re-run door. Stable, so settled messages never re-render for it.
  const rerun = useCallback(async (request: RerunRequest): Promise<void> => {
    const id = conversationIdRef.current;
    if (id === undefined || blockedRef.current) return;
    await sendMessageRef.current({ parts: [{ type: "data-rerun", data: request }] }, { body: { conversationId: id } });
  }, []);

  // v1's write card callbacks, stable for the same reason. Approving or cancelling
  // resolves the AI SDK approval, which sendAutomaticallyWhen then posts with the
  // conversation id the decision carries (cardDecision).
  const ceremony = useMemo<WriteCeremony>(
    () => ({
      confirm: (approvalId, editedInput) => {
        const id = conversationIdRef.current;
        if (id === undefined) return;
        if (editedInput !== undefined) {
          setMessagesRef.current((current) =>
            current.map((message) => withEditedInput(message, approvalId, editedInput)),
          );
        }
        void addApprovalRef.current(cardDecision(approvalId, true, id));
      },
      decline: (approvalId) => {
        const id = conversationIdRef.current;
        if (id === undefined) return;
        void addApprovalRef.current(cardDecision(approvalId, false, id));
      },
      retry: (approvalId, approved) => {
        const id = conversationIdRef.current;
        if (id === undefined) return;
        clearErrorRef.current();
        void addApprovalRef.current(cardDecision(approvalId, approved, id));
      },
      // A form's answer (decision 32) resumes the turn as an approval does; after a failed post the card sends it again.
      answer: (toolCallId, answer) => {
        const id = conversationIdRef.current;
        if (id === undefined) return;
        clearErrorRef.current();
        void addToolOutputRef.current({
          tool: "request_input",
          toolCallId,
          output: answer,
          options: { body: { conversationId: id } },
        });
      },
      simulate: async (request): Promise<SimulateResult> => {
        const id = conversationIdRef.current;
        if (id === undefined) return { ok: false, error: { message: t("ceremony.noConversation") } };
        try {
          const res = await fetch("/api/chat/simulate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ conversationId: id, tool: request.tool, args: request.args, toolCallId: request.toolCallId }),
          });
          return (await res.json()) as SimulateResult;
        } catch {
          return { ok: false, error: { message: t("ceremony.dryRunUnprepared") } };
        }
      },
      // A saved automation's card (decision 19): KeeperHub's check, then Turn on.
      automation: {
        check: async (workflowId) => {
          try {
            const res = await fetch(`/api/automations/${encodeURIComponent(workflowId)}/check`, { method: "POST" });
            const body = (await res.json()) as {
              automation?: { enabled?: unknown } | null;
              preview?: unknown;
              error?: { code?: string; message?: string };
            };
            const preview = readPreview(body.preview, translate);
            if (!res.ok || preview === null) {
              return { ok: false, message: errorMessage(body.error?.code, body.error?.message ?? t("ceremony.checkFailed")) };
            }
            return { ok: true, enabled: body.automation?.enabled === true, preview };
          } catch {
            return { ok: false, message: t("ceremony.checkUnreachable") };
          }
        },
        setEnabled: async (workflowId, enabled) => {
          try {
            const res = await fetch(`/api/automations/${encodeURIComponent(workflowId)}/enabled`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ enabled }),
            });
            const body = (await res.json()) as { receipt?: { enabled?: unknown }; error?: { code?: string; message?: string } };
            if (!res.ok || body.receipt === undefined) {
              return { ok: false, message: errorMessage(body.error?.code, body.error?.message ?? t("ceremony.enableFailed")) };
            }
            return { ok: true, enabled: body.receipt.enabled === true };
          } catch {
            return { ok: false, message: t("ceremony.enableUnreachable") };
          }
        },
        // A run's card follows it to KeeperHub's result (decision 21), as the automation page does.
        runStatus: async (ledgerId) => {
          try {
            const res = await fetch(`/api/automations/runs/${encodeURIComponent(ledgerId)}`, { cache: "no-store" });
            if (!res.ok) return null;
            const body = (await res.json()) as { state?: unknown; txHash?: unknown };
            if (body.state !== "pending" && body.state !== "receipt" && body.state !== "failure") return null;
            return { state: body.state, txHash: typeof body.txHash === "string" ? body.txHash : null };
          } catch {
            return null;
          }
        },
      },
    }),
    [t, errorMessage, translate],
  );

  // The question that came with the page: once, as soon as we know who is here.
  const arrivedRef = useRef(false);
  useEffect(() => {
    if (arrivedRef.current || identity.status === "loading") return;
    arrivedRef.current = true;
    let stored: string | null = null;
    try {
      stored = takeDraft(window.sessionStorage);
    } catch {
      stored = null;
    }
    const { pathname, search, hash } = window.location;
    const text = arrivalDraft(stored, search);
    const cleaned = withoutArrivalParams(search);
    if (cleaned !== search) window.history.replaceState(window.history.state, "", `${pathname}${cleaned}${hash}`);
    if (!text) return;
    const who = identity.status;
    const fromLink = stored === null;
    // A tick later: effects may not set state synchronously, and a sign-in error
    // from the return trip opens its modal first. Not cancelled on unmount, so a
    // development double-run cannot swallow the question.
    setTimeout(() => {
      if (who === "signed-in") {
        void handleSendRef.current(text).then((sent) => {
          if (!sent) setInput(text);
        });
        return;
      }
      setInput(text);
      if (who === "signed-out" && fromLink) openSignIn(text);
    }, 0);
  }, [identity.status, openSignIn]);

  // DeepBookie's inactivity archive. The first reading of a reopened conversation
  // counts from when it was last touched; every later change counts from now.
  const activityRef = useRef<{ messages: UIMessage[]; since: number } | null>(null);
  useEffect(() => {
    if (archived || messages.length === 0) return;
    const now = Date.now();
    const seen = activityRef.current;
    const since = seen?.messages === messages ? seen.since : seen === null && lastActivityAt !== undefined ? lastActivityAt : now;
    activityRef.current = { messages, since };
    const timer = setTimeout(() => setArchived(true), msUntilArchive(since, now));
    return () => clearTimeout(timer);
  }, [messages, archived, lastActivityAt]);

  const retry = () => {
    clearError();
    const id = conversationIdRef.current;
    void regenerate(id === undefined ? undefined : { body: { conversationId: id } });
  };

  const categories = useMemo(
    () =>
      launcherCategories(
        { suggestions: starterSuggestions, networkName: network.name, symbol: network.symbol, chainId: network.chainId },
        translate,
      ),
    [starterSuggestions, network.name, network.symbol, network.chainId, translate],
  );
  const walletAddress = identity.status === "signed-in" ? identity.walletAddress : null;

  const sendFromLauncher = (text: string) => {
    void handleSend(text).then((sent) => {
      if (!sent) setInput(text);
    });
  };

  const lapsed = status === "error" && error !== undefined && isSessionLapse(error.message);
  const hint = !signedIn
    ? identity.status === "loading"
      ? undefined
      : t("hints.connect")
    : unsent
      ? t("hints.answerUnsent")
      : pending
        ? awaitingForm(messages)
          ? t("hints.form")
          : t("hints.approval")
        : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {identity.status === "loading" ? (
        <div aria-hidden className="min-h-0 flex-1" />
      ) : !signedIn ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <SignInGate />
        </div>
      ) : (
        <VoiceFormContext value={voiceFormId}>
          <MessageList
            messages={messages}
            status={status}
            readOnly={archived}
            rerun={rerun}
            ceremony={ceremony}
            empty={
              voice.phase !== "idle" ? (
                <VoiceHero voice={voice} engine={voiceEngine} />
              ) : loadNotice ? (
                <p className="mx-auto max-w-3xl px-4 py-10 text-sm text-fg-secondary">{loadNotice}</p>
              ) : (
                <ChatHome categories={categories} walletAddress={walletAddress} onAction={sendFromLauncher} />
              )
            }
          />
        </VoiceFormContext>
      )}

      {(status === "error" || createFailed) && (
        <div className="mx-auto mb-2 w-full max-w-3xl px-4">
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5"
          >
            <span className="text-[12.5px] font-medium text-destructive">
              {createFailed && status !== "error"
                ? t("banner.createFailed")
                : lapsed
                  ? t("banner.sessionEnded")
                  : unsent
                    ? t("banner.answerUnsent")
                    : t("banner.turnFailed")}
            </span>
            {status === "error" && (lapsed || !unsent) && (
              <button
                type="button"
                onClick={lapsed ? () => openSignIn(input) : retry}
                className="flex-none rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ring"
              >
                {lapsed ? t("banner.connect") : t("banner.retry")}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="shrink-0 border-t border-border bg-background/80 px-4 py-3 backdrop-blur max-[720px]:pb-[calc(env(safe-area-inset-bottom)+5rem)]">
        {archived ? (
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-full border border-border-strong bg-card py-2 pr-2 pl-4">
            <span className="text-[12.5px] text-fg-secondary">{t("archived.notice")}</span>
            <button
              type="button"
              onClick={onNewChat}
              className="flex-none rounded-full bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-primary-foreground transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ring"
            >
              {t("archived.newChat")}
            </button>
          </div>
        ) : (
          <Composer
            value={input}
            onChange={setInput}
            onSend={handleSend}
            disabled={signedIn && (busy || pending || voiceOn)}
            hint={hint}
            voice={{
              snapshot: voice,
              engine: voiceEngine,
              // Signed out, talking opens sign-in (startVoice), as sending does.
              available: !signedIn || !(busy || pending),
              onStart: () => void startVoice(),
              onRetry: () => void startVoice(),
              form:
                voiceFormId !== null && voiceFormRequest !== null
                  ? {
                      toolCallId: voiceFormId,
                      request: voiceFormRequest,
                      onAnswer: (answer) => voiceEngine.answerForm(voiceFormId, answer),
                    }
                  : null,
            }}
          />
        )}
      </div>
    </div>
  );
}
