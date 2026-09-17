"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

/*
 * Masayume components/shell/AppStrip.tsx + styles/yosuku/part-02.css (`.appstrip*`).
 * One statement at a time, rotating every 7 s, one point of colour on the words
 * you might act on, dismissible for good. Same behaviour: it tells the page
 * whether it is there (`html[data-strip]`) so every fixed offset collapses when
 * it is gone.
 *
 * Changes: our lines and link; the lead glyph is a checked box (theirs is a
 * phone, because their strip is about installing); the dismissal is read with
 * useSyncExternalStore for the React 19 lint rules; paint is Portaldot's.
 */

const KEY = "keeperhub.appstrip.dismissed";
const DISMISS_EVENT = "keeperhub:appstrip-dismissed";
const ROTATE_MS = 7000;

// Statements, not slogans. Each is a fact that survives being read twice.
const LINES = ["readsRun", "orgWalletSigns"] as const;

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(DISMISS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(DISMISS_EVENT, onChange);
  };
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

// Assume dismissed until storage says otherwise: avoids a flash.
const readDismissedOnServer = () => true;

export function AppStrip() {
  const t = useTranslations("shell.appStrip");
  const stored = useSyncExternalStore(subscribe, readDismissed, readDismissedOnServer);
  const [dismissedHere, setDismissedHere] = useState(false);
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const hidden = stored || dismissedHere;

  useEffect(() => {
    if (hidden) return;
    const t = setTimeout(() => setShown(true), 60); // let it arrive rather than snap in
    return () => clearTimeout(t);
  }, [hidden]);

  useEffect(() => {
    if (hidden || LINES.length < 2) return;
    const id = setInterval(() => setI((n) => (n + 1) % LINES.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [hidden]);

  // Every fixed offset is computed off --appstrip, so an absent strip has to say so.
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.strip = hidden ? "off" : "on";
    return () => {
      delete el.dataset.strip;
    };
  }, [hidden]);

  if (hidden) return null;

  return (
    <div
      role="region"
      aria-label={t("label")}
      className={cn(
        "fixed inset-x-0 top-0 z-[900] flex h-(--appstrip) items-center justify-center border-b border-primary/30 bg-background opacity-0 transition-opacity duration-[420ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
        shown && "opacity-100",
      )}
    >
      <Link
        href="/#how"
        className="group/strip inline-flex max-w-full items-center gap-2.5 px-3 font-mono text-[11px] tracking-[0.04em] text-fg-secondary max-[720px]:gap-[7px] max-[720px]:px-2 max-[720px]:text-[9.5px]"
      >
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="size-[13px] flex-none fill-none stroke-primary stroke-[1.7] [stroke-linecap:round] [stroke-linejoin:round]"
        >
          <rect x="1.2" y="1.2" width="13.6" height="13.6" rx="3.4" className="opacity-85" />
          <path d="M4.8 8.2l2.1 2.1 4.3-4.6" className="animate-[appstrip-lead_2.9s_ease-in-out_infinite] opacity-[0.34]" />
        </svg>
        {/* Keyed so React swaps the node and the entrance re-runs on each change. */}
        <span
          key={i}
          className="animate-[appstrip-in_420ms_cubic-bezier(0.4,0,0.2,1)_both] truncate group-hover/strip:text-foreground"
        >
          {t(`lines.${LINES[i]}`)}
        </span>
        <span className="inline-flex flex-none items-center gap-[3px] font-display text-[11px] font-bold tracking-[0.01em] text-primary max-[720px]:text-[10px]">
          {t("howItWorks")}
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3 transition-transform duration-200 group-hover/strip:translate-x-[3px]">
            <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </Link>
      <button
        type="button"
        aria-label={t("dismiss")}
        className="absolute top-1/2 right-1.5 flex size-[26px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors duration-160 hover:bg-foreground/7 hover:text-foreground max-[720px]:right-0.5 max-[720px]:size-[22px]"
        onClick={() => {
          try {
            localStorage.setItem(KEY, "1");
            window.dispatchEvent(new Event(DISMISS_EVENT));
          } catch {
            /* storage unavailable — dismissal still applies for this page */
          }
          setDismissedHere(true);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[13px]">
          <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
