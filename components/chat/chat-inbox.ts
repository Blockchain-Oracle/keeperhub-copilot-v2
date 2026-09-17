/*
 * How the ⌘K palette hands an action's prompt to the chat (decision 36). The
 * chat on screen registers itself; the palette posts to it, and when no chat is
 * mounted it opens /app?prompt= instead, which the chat's arrival flow sends
 * once. Free of React so it runs under node tests.
 */

type Inbox = (text: string) => void;

let inbox: Inbox | null = null;

/** The mounted chat takes prompts; the returned function lets it go when the chat unmounts. */
export function registerChatInbox(handler: Inbox): () => void {
  inbox = handler;
  return () => {
    if (inbox === handler) inbox = null;
  };
}

/** Hand text to the chat on screen. False when there is none. */
export function postToChat(text: string): boolean {
  if (inbox === null) return false;
  inbox(text);
  return true;
}
