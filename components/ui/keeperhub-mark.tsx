import { cn } from "@/lib/utils";

/*
 * The Copilot's mark.
 *
 * KeeperHub's own bracket, lifted verbatim from their
 * components/icons/keeperhub-logo.tsx — a vertical bar pinched inward to a
 * point facing right, which is a "K" with its two arms fused into one concave
 * curve. Their mark puts a solid square in the gap to the right of that pinch.
 *
 * Ours puts a flight shard there instead, cut from the same 90.79 square so the
 * silhouette still reads as KeeperHub at favicon size. The bracket is the
 * platform; the thing flying alongside it is the copilot.
 *
 * Flat fill, hard corners, no gradient and no stroke — the same discipline as
 * the original. Colour comes from `currentColor` unless `fill` is passed, which
 * server-rendered OG images need since they cannot resolve CSS variables.
 */

const BRACKET =
  "M204.28 90.79V0H113.49V90.79C113.456 120.879 101.488 149.725 80.2115 171.002C58.9355 192.278 30.0889 204.246 0 204.28V295.07C30.0889 295.104 58.9355 307.072 80.2115 328.348C101.488 349.625 113.456 378.471 113.49 408.56V499.35H204.28V408.56C204.28 378.075 197.445 347.977 184.279 320.482C171.113 292.987 151.95 268.793 128.2 249.68C151.948 230.563 171.109 206.367 184.275 178.871C197.441 151.374 204.277 121.276 204.28 90.79Z";

/* A delta on KeeperHub's square (x 226.98–317.77, y 204.279–295.069), notched on
   its trailing edge so it reads as a wing rather than a triangle. Slightly taller
   than the square it replaces and shallowly notched, so it still carries at 16px. */
const SHARD = "M224 197.5L317.77 249.674L224 301.85L241 249.674Z";

export type MarkState = "idle" | "thinking" | "listening";

/** 318 : 500, so a height picks the width. */
const RATIO = 318 / 500;

export function KeeperHubMark({
  className,
  fill,
  height,
  state = "idle",
  title,
}: {
  className?: string;
  fill?: string;
  /** Explicit px height. Only for server-rendered images, which ignore classes. */
  height?: number;
  state?: MarkState;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 318 500"
      fill="none"
      height={height}
      width={height === undefined ? undefined : Math.round(height * RATIO)}
      className={cn("w-auto shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <path d={BRACKET} fill={fill ?? "currentColor"} />
      <path
        d={SHARD}
        fill={fill ?? "currentColor"}
        data-mark-shard={state === "idle" ? undefined : state}
        style={{ transformOrigin: "272px 250px", transformBox: "view-box" }}
      />
    </svg>
  );
}
