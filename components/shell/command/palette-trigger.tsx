"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { useCommandPalette } from "./command-palette";

/*
 * The header's way into the ⌘K palette (decision 36). DeepBookie apps/docs
 * Navbar.tsx: a "Search…" pill with a ⌘K badge, and an icon button where there
 * is no room. Drawn in the network pill's geometry with Portaldot tokens.
 * Whether the badge reads ⌘K or Ctrl K is only known in the browser.
 */

const noSubscribe = () => () => {};
const onApple = () => /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

export function PaletteTrigger() {
  const palette = useCommandPalette();
  const t = useTranslations("shell.palette");
  const apple = useSyncExternalStore(noSubscribe, onApple, () => true);
  if (palette === null) return null;

  return (
    <button
      type="button"
      onClick={palette.open}
      aria-label={t("search")}
      aria-keyshortcuts={apple ? "Meta+K" : "Control+K"}
      className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border py-1 pr-1 pl-3 font-mono text-xs text-fg-muted transition-[border-color,background-color,color] duration-220 hover:border-border-strong hover:bg-foreground/[0.03] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring max-[1040px]:p-[7px] max-[720px]:p-[5px]"
    >
      <Search aria-hidden className="size-3.5" />
      <span className="max-[1040px]:hidden">{t("trigger")}</span>
      <kbd className="rounded-full border border-border bg-surface-2/60 px-2 py-0.5 text-[10px] max-[1040px]:hidden">{apple ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}
