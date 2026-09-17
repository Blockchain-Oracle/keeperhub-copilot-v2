import { validateUIMessages, type UIMessage } from "ai";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { isArchived } from "@/components/chat/chat-rules";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { getConversation } from "@/lib/data";
import { STARTER_SUGGESTIONS } from "@/lib/registry/surface-suggestions";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("metadata"))("chat") };
}

/*
 * Reopen a saved conversation — v1 app/c/[conversationId]/page.tsx: load the
 * stored transcript, validate it, hand it to the same chat. Absent and another
 * org's id are the same null, so the same notFound(). A transcript that fails
 * validation is not a dead end: the chat opens empty with an honest notice.
 *
 * Changes: signed out renders the chat's identity card without loading anything;
 * whether it opens live or read-only follows the 30-minute rule (Abu, 2026-09-13).
 */
export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;

  const session = await getSession().catch((error: unknown) => {
    // Degrade to the signed-out card rather than crash, but never silently.
    console.error(
      JSON.stringify({
        event: "session_read_failed",
        conversationId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
  });

  if (session === null) {
    return <ChatWorkspace starterSuggestions={STARTER_SUGGESTIONS} />;
  }

  const conversation = await getConversation(session, conversationId);
  if (conversation === null) {
    notFound();
  }

  let messages: UIMessage[] = [];
  let loadNotice: string | undefined;
  try {
    messages = await validateUIMessages({ messages: conversation.transcript });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "conversation_load_invalid",
        conversationId,
        orgId: session.orgId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    loadNotice = (await getTranslations("chat"))("loadNotice");
  }

  const updatedAt = conversation.updatedAt.getTime();

  return (
    <ChatWorkspace
      // A client-side move between two conversations must never reuse a mounted chat.
      key={conversation.id}
      conversation={{
        id: conversation.id,
        title: conversation.title,
        messages,
        loadNotice,
        updatedAt,
        archived: archivedNow(updatedAt),
      }}
      starterSuggestions={STARTER_SUGGESTIONS}
    />
  );
}

function archivedNow(updatedAt: number): boolean {
  return isArchived(updatedAt, Date.now());
}
