"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

import type { CueName } from "@/lib/sound/cues";
import { isMuted, play, setMuted } from "@/lib/sound/player";

/*
 * Sound, for the whole app.
 *
 * `useSound().cue(...)` is safe to call from anywhere, including from an effect
 * that may run before anyone has touched the page — the player drops a cue it
 * cannot legally play rather than throwing.
 *
 * The mute state lives in the player, not in React, because the player is also
 * read from outside the tree. This subscribes to it so the toggle re-renders.
 */

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

interface SoundApi {
  muted: boolean;
  cue: (name: CueName) => void;
  toggle: () => void;
}

const SoundContext = createContext<SoundApi | null>(null);

export function SoundProvider({ children }: { children: ReactNode }) {
  const muted = useSyncExternalStore(
    subscribe,
    () => isMuted(),
    // On the server nothing can play, so it renders as muted and corrects on
    // hydration. Reporting "on" here would mismatch.
    () => true,
  );

  const cue = useCallback((name: CueName) => play(name), []);

  const toggle = useCallback(() => {
    setMuted(!isMuted());
    notify();
  }, []);

  const value = useMemo<SoundApi>(() => ({ muted, cue, toggle }), [muted, cue, toggle]);

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

/** Outside the provider this is a no-op, so a component can always ask for it. */
export function useSound(): SoundApi {
  return (
    useContext(SoundContext) ?? {
      muted: true,
      cue: () => {},
      toggle: () => {},
    }
  );
}
