"use client";

import { useEffect, type RefObject } from "react";

/**
 * Masayume components/shell/header/useFloatingMenus.ts, verbatim.
 * Closes floating header menus on an outside pointer press or Escape.
 * Refs that contain the press are exempt, so opening one menu from inside another
 * does not immediately dismiss it.
 */
export function useFloatingMenus(refs: ReadonlyArray<RefObject<HTMLElement | null>>, close: () => void): void {
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (refs.some((ref) => ref.current?.contains(target))) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [refs, close]);
}
