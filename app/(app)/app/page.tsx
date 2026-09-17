import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { Tutorial } from "@/components/shell/onboarding/tutorial";
import { STARTER_SUGGESTIONS } from "@/lib/registry/surface-suggestions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("metadata"))("chat") };
}

/*
 * A new conversation. No row exists until the first send, which creates one and
 * moves the address to /app/c/[id] (v1 app/page.tsx). Signed out, Portaldot's
 * identity card stands where the messages go; the first-run walkthrough opens
 * over either.
 */
export default function ChatPage() {
  return (
    <>
      <ChatWorkspace starterSuggestions={STARTER_SUGGESTIONS} />
      <Tutorial />
    </>
  );
}
