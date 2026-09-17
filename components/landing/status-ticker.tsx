"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The eyebrow chip above the headline.
 *
 * Ported in role from Portaldot's BlockHeightTicker
 * (references/portaldot-mcp/packages/web/components/landing/block-height-ticker.tsx):
 * an instrument-panel chip carrying one live number, with a cyan telemetry dot.
 *
 * Theirs subscribes to new block heads. Ours asks KeeperHub's public chain
 * endpoint how many networks it can actually execute on right now. Same
 * principle, and the same one Portaldot states in its own feature copy: real
 * state or nothing. No placeholder number — if the call fails the chip shows
 * a dimmed, honest fallback rather than a made-up figure.
 *
 * Text: messages/en/landing.json (decision 41).
 */
export function StatusTicker({ className }: { className?: string }) {
  const t = useTranslations("landing");
  const [chains, setChains] = useState<number | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/platform/chains", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { count?: number };
        if (cancelled || typeof data.count !== "number") return;
        setChains(data.count);
        setLive(true);
      } catch {
        // Silent — the chip degrades rather than inventing a number.
        if (!cancelled) setLive(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border-strong/70",
        "bg-card/60 px-3 py-1.5 backdrop-blur-xl",
        "font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full bg-telemetry",
          live && "glow-telemetry",
          !live && "opacity-40",
        )}
      />
      {live && chains !== null ? (
        t.rich("statusTicker.networksLive", {
          count: chains,
          number: (chunks) => <span className="text-fg-secondary tabular-nums">{chunks}</span>,
        })
      ) : (
        <span>{t("statusTicker.connecting")}</span>
      )}
    </span>
  );
}
