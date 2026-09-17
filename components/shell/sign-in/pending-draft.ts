/*
 * A question typed before sign-in survives the trip through KeeperHub. Portaldot
 * keeps it in the URL and sends it once the wallet connects
 * (components/app/chat-app.tsx:112-124); an OAuth redirect loses the URL, so this
 * tab's sessionStorage holds it just before leaving and hands it over once on
 * return. It lapses with the sign-in window (the OAuth transaction cookie's 10
 * minutes), so an abandoned sign-in never replays a stale question later.
 */

export const PENDING_DRAFT_KEY = "keeperhub.pending-draft";
export const PENDING_DRAFT_MAX_AGE_MS = 10 * 60_000;

const MAX_DRAFT_CHARS = 4_000;

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The landing hands a question over as `/app?prompt=`. */
export function draftFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get("prompt");
  return value && value.trim() ? value.trim() : null;
}

export function stashDraft(storage: DraftStorage, text: string, now = Date.now()): boolean {
  const trimmed = text.trim().slice(0, MAX_DRAFT_CHARS);
  if (!trimmed) return false;
  try {
    storage.setItem(PENDING_DRAFT_KEY, JSON.stringify({ text: trimmed, at: now }));
    return true;
  } catch {
    return false; // storage refused: sign-in still works, the question is simply not carried
  }
}

/** Returns the stashed question at most once, and only inside the sign-in window. */
export function takeDraft(storage: DraftStorage, now = Date.now()): string | null {
  let raw: string | null;
  try {
    raw = storage.getItem(PENDING_DRAFT_KEY);
    if (raw !== null) storage.removeItem(PENDING_DRAFT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { text?: unknown; at?: unknown };
    if (typeof parsed.text !== "string" || typeof parsed.at !== "number") return null;
    const age = now - parsed.at;
    if (age < 0 || age > PENDING_DRAFT_MAX_AGE_MS) return null;
    return parsed.text;
  } catch {
    return null;
  }
}
