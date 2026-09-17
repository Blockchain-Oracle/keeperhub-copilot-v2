"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

/*
 * First visit or not — Masayume features/onboarding/useFirstRun.ts, keyed on a
 * localStorage flag. Server and first client render agree (seen until storage
 * says otherwise), so a returning visitor never sees a frame of the modal.
 * Blocked storage reads as unseen, so the walkthrough reappears next visit
 * rather than being suppressed by a write that never landed, as in Masayume.
 * Read with useSyncExternalStore (the app strip's pattern) for the React 19 lint rules.
 */

const KEY = "keeperhub.tutorialSeen";
const SEEN_EVENT = "keeperhub:tutorial-seen";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SEEN_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SEEN_EVENT, onChange);
  };
}

function readSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

const readSeenOnServer = () => true;

export function useFirstRun(): { open: boolean; dismiss: () => void } {
  const seen = useSyncExternalStore(subscribe, readSeen, readSeenOnServer);
  const [dismissedHere, setDismissedHere] = useState(false);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // storage refused: closed for this visit only
    }
    setDismissedHere(true);
    window.dispatchEvent(new Event(SEEN_EVENT));
  }, []);

  return { open: !seen && !dismissedHere, dismiss };
}

/** For the review page: forget the walkthrough was seen. */
export function replayTutorial(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to forget
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}
