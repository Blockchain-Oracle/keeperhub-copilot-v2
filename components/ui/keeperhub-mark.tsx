import { cn } from "@/lib/utils";

/*
 * The Copilot's mark: a jet climbing, lifting off KeeperHub's square.
 *
 * It is related to KeeperHub's own mark without copying it. KeeperHub draws a
 * concave bracket beside a solid square; this keeps the square — tucked into
 * the jet's tail as the thruster it lifts off from — and cuts the jet's tail
 * with the same concave curve as the bracket. The wingtips are cut flat rather
 * than rounded, KeeperHub's hard corners. Flat fill, no gradient, no stroke.
 *
 * Square aspect, so it sits cleanly in a tab, an app icon and a line of text.
 * Colour comes from `currentColor` unless `fill` is passed, which server-rendered
 * images need, since they cannot resolve CSS variables.
 */

/* The jet, nose up. Leading edges near-straight with a slight outward bow, the
   wingtips cut flat, the tail a deep concave notch. */
const JET =
  "M256 40Q350 188 440 352L418 380Q326 312 256 300Q186 312 94 380L72 352Q162 188 256 40Z";

/* KeeperHub's square, nested in the notch. */
const SQUARE = { x: 223, y: 322, size: 66 };

export type MarkState = "idle" | "thinking" | "listening";

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
      viewBox="0 0 512 512"
      fill="none"
      height={height}
      width={height}
      className={cn("w-auto shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {/* The jet banks while the copilot thinks and breathes while it listens
          (globals.css); the square it lifts off from stays put. */}
      <path
        d={JET}
        fill={fill ?? "currentColor"}
        data-mark-shard={state === "idle" ? undefined : state}
        style={{ transformOrigin: "256px 220px", transformBox: "view-box" }}
      />
      <rect
        x={SQUARE.x}
        y={SQUARE.y}
        width={SQUARE.size}
        height={SQUARE.size}
        fill={fill ?? "currentColor"}
      />
    </svg>
  );
}
