"use client";

/*
 * 21st.dev ravikatiyar162/offer-carousel (id 8442), ported by hand — the
 * project has no components.json, so nothing installs through shadcn.
 *
 * The anatomy is theirs and it is the good part: a card in two halves, a tag
 * row above the title, and a footer whose arrow swings to -45° and fills with
 * the action colour on hover. So are the edge arrows that only appear when the
 * pointer is over the rail, and the scroll-snap.
 *
 * One change of substance: the top half takes a React node rather than an image
 * URL. The copilot's cards show a live motif — a price curve, an address, a
 * pair of approve/cancel buttons — not a photograph.
 */

import * as React from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

export interface RailCardItem {
  id: string | number;
  /** Small mono line above the title. */
  tag: string;
  /** Glyph beside the tag. */
  tagIcon?: React.ReactNode;
  title: string;
  description: string;
  /** Fills the top half of the card. */
  visual?: React.ReactNode;
  /** Small mark in the footer — an integration logo, a chain mark. */
  mark?: React.ReactNode;
  /** Mono line beside the mark. */
  markLabel?: string;
  markSubLabel?: string;
  href?: string;
  onSelect?: () => void;
}

export function RailCard({ item, className }: { item: RailCardItem; className?: string }) {
  const body = (
    <>
      {/* top half — the living detail */}
      <div className="relative h-[46%] overflow-hidden border-card-bezel border-b bg-surface-2/50">
        <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.06]">
          {item.visual}
        </div>
      </div>

      {/* bottom half — what it is */}
      <div className="flex h-[54%] flex-col justify-between bg-card p-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-fg-muted uppercase tracking-[0.18em]">
            {item.tagIcon ? <span className="text-primary">{item.tagIcon}</span> : null}
            <span className="truncate">{item.tag}</span>
          </div>
          <h3
            className="text-[15px] leading-tight font-medium text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {item.title}
          </h3>
          <p className="line-clamp-2 text-[13px] text-fg-secondary">{item.description}</p>
        </div>

        <div className="flex items-center justify-between border-border/70 border-t pt-3">
          <div className="flex min-w-0 items-center gap-2">
            {item.mark}
            <div className="min-w-0">
              {item.markLabel ? (
                <p className="truncate text-[11px] font-medium text-foreground">{item.markLabel}</p>
              ) : null}
              {item.markSubLabel ? (
                <p className="truncate font-mono text-[10px] text-fg-muted">{item.markSubLabel}</p>
              ) : null}
            </div>
          </div>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-fg-secondary transition-[transform,background-color,color] duration-300 group-hover:rotate-[-45deg] group-hover:bg-primary group-hover:text-primary-foreground">
            <ArrowRight className="size-4" />
          </span>
        </div>
      </div>
    </>
  );

  const shell = cn(
    "group relative flex h-[340px] w-[272px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl",
    "border-[1.5px] border-card-bezel bg-card text-left shadow-[var(--lift-card)]",
    "transition-shadow hover:shadow-[var(--lift-card-hover)]",
    className,
  );

  if (item.href) {
    return (
      <motion.a
        href={item.href}
        className={shell}
        whileHover={{ y: -8 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        {body}
      </motion.a>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={item.onSelect}
      className={shell}
      whileHover={{ y: -8 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      {body}
    </motion.button>
  );
}

/** Scrolls a track by most of its width, the way the arrows do. */
export function useRailScroll() {
  const track = React.useRef<HTMLDivElement>(null);
  const scroll = React.useCallback((direction: "left" | "right") => {
    const el = track.current;
    if (!el) return;
    const amount = el.clientWidth * 0.8;
    el.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
  }, []);
  return { track, scroll };
}

export function CardRail({
  items,
  className,
  ariaLabel,
}: {
  items: RailCardItem[];
  className?: string;
  ariaLabel?: string;
}) {
  const { track, scroll } = useRailScroll();

  return (
    <div className={cn("group/rail relative w-full", className)}>
      <ScrollArrow side="left" onClick={() => scroll("left")} />

      <div
        ref={track}
        aria-label={ariaLabel}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pt-1.5 pb-5 [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin]"
      >
        {items.map((item) => (
          <RailCard key={item.id} item={item} />
        ))}
      </div>

      {/* edge fades, so a card leaving the rail dissolves rather than being cut */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-[2] w-10 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-[2] w-10 bg-gradient-to-l from-background to-transparent" />

      <ScrollArrow side="right" onClick={() => scroll("right")} />
    </div>
  );
}

export function ScrollArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Scroll left" : "Scroll right"}
      className={cn(
        "-translate-y-1/2 absolute top-1/2 z-10 flex size-9 items-center justify-center rounded-full",
        "border border-card-bezel bg-card/80 text-foreground backdrop-blur-sm",
        "opacity-0 transition-opacity duration-300 group-hover/rail:opacity-100 hover:bg-card focus-visible:opacity-100",
        side === "left" ? "left-0" : "right-0",
      )}
    >
      <Icon className="size-5" />
    </button>
  );
}
