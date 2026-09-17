"use client";

import type { UIMessage } from "ai";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAccount } from "@/components/shell/account-context";
import type { StarterCategory } from "@/lib/registry/surface-suggestions";

import { Chat } from "./chat";
import { NEW_CONVERSATION_TITLE } from "./chat-rules";
import { SessionDropdown } from "./session-dropdown";

/*
 * DeepBookie components/chat/ChatWorkspace.tsx — the conversation dropdown in a
 * strip above the chat (signed in only), and the chat below it; New chat
 * remounts a fresh one.
 *
 * Changes: conversations have addresses (/app/c/[id], v1), so picking one
 * navigates and New chat goes to /app; the chat column fills the height under
 * the app header, with the composer clear of the phone pill. The title follows
 * the route's automatic naming after the first turn.
 */

// The chat route names a conversation just after its first turn ends.
const TITLE_SETTLE_MS = 1500;

export type LoadedConversation = {
  id: string;
  title: string;
  messages: UIMessage[];
  loadNotice?: string;
  updatedAt: number;
  archived: boolean;
};

export function ChatWorkspace({
  conversation,
  starterSuggestions,
}: {
  conversation?: LoadedConversation;
  starterSuggestions: StarterCategory[];
}) {
  const t = useTranslations("chat");
  const router = useRouter();
  const { identity } = useAccount();
  const [liveKey, setLiveKey] = useState(0);
  const [current, setCurrent] = useState<{ id?: string; title: string }>({
    id: conversation?.id,
    title: conversation?.title ?? NEW_CONVERSATION_TITLE,
  });

  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  });

  const newChat = useCallback(() => {
    setCurrent({ title: NEW_CONVERSATION_TITLE });
    setLiveKey((key) => key + 1);
    router.push("/app");
  }, [router]);

  const onConversationCreated = useCallback((id: string) => {
    setCurrent({ id, title: NEW_CONVERSATION_TITLE });
  }, []);

  const onRenamed = useCallback((id: string, title: string) => {
    setCurrent((previous) => (previous.id === id ? { id, title } : previous));
  }, []);

  const onTurnFinished = useCallback(() => {
    const { id, title } = currentRef.current;
    if (id === undefined || title !== NEW_CONVERSATION_TITLE) return;
    setTimeout(() => {
      fetch("/api/conversations", { cache: "no-store" })
        .then(async (res) => (res.ok ? ((await res.json()) as { conversations?: Array<{ id: string; title: string }> }) : null))
        .then((json) => {
          const found = json?.conversations?.find((item) => item.id === id);
          if (found && found.title !== NEW_CONVERSATION_TITLE) onRenamed(id, found.title);
        })
        .catch((error: unknown) => console.error("Conversation title refresh failed", error));
    }, TITLE_SETTLE_MS);
  }, [onRenamed]);

  return (
    // Pinned to the viewport under the ticker and header (9.9): only the message list scrolls, never the page.
    <div className="fixed inset-x-0 top-[calc(var(--appstrip)+92px)] bottom-0 flex min-h-0 flex-col max-[720px]:top-[calc(var(--appstrip)+66px)]">
      {identity.status === "signed-in" && (
        <div className="flex shrink-0 items-center border-b border-border px-3 py-2 sm:px-4">
          <SessionDropdown
            currentId={current.id}
            title={current.title === NEW_CONVERSATION_TITLE ? t("newConversation") : current.title}
            onNew={newChat}
            onRenamed={onRenamed}
          />
        </div>
      )}
      <Chat
        key={`${conversation?.id ?? "new"}:${liveKey}`}
        conversationId={conversation?.id}
        initialMessages={conversation?.messages}
        lastActivityAt={conversation?.updatedAt}
        initiallyArchived={conversation?.archived}
        loadNotice={conversation?.loadNotice}
        starterSuggestions={starterSuggestions}
        onNewChat={newChat}
        onConversationCreated={onConversationCreated}
        onTurnFinished={onTurnFinished}
      />
    </div>
  );
}
