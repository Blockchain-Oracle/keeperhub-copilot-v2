import Image from "next/image";

import { getGuide, guideImagePath, type Guide } from "@/lib/docs/guides";

/*
 * A screen capture with its own annotation layer.
 *
 * The picture is the app as it was, never edited. The numbered dots and the
 * arrows are an SVG drawn on top from percentages in lib/docs/guides.ts, at the
 * same aspect ratio, so retaking the capture never means redrawing anything and
 * the annotations can never contradict what is underneath.
 *
 * Under it: the numbered legend, then what the app was showing when it was
 * taken and the date. A capture that has drifted away from the app should be
 * obvious as drift rather than quietly passing for current.
 */

export function GuideShot({ name, caption }: { name: string; caption: string }) {
  const guide = getGuide(name);
  if (!guide) return <PendingShot caption={caption} />;

  return (
    <figure className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-card-bezel bg-surface-2/40 shadow-[var(--lift-card)]">
        <Image
          src={guideImagePath(name)}
          alt={guide.alt}
          width={guide.width}
          height={guide.height}
          className="block h-auto w-full"
        />
        <Annotations guide={guide} />
      </div>

      <figcaption className="space-y-2">
        <p className="text-[14px] leading-relaxed text-fg-secondary">{caption}</p>
        {guide.annotations.length > 0 ? (
          <ol className="space-y-1.5">
            {guide.annotations.map((annotation, index) => (
              <li
                key={annotation.label}
                className="flex gap-2.5 text-[13px] leading-relaxed text-fg-secondary"
              >
                <span className="mt-[1px] flex size-[18px] shrink-0 items-center justify-center rounded-full bg-primary font-mono text-[10px] text-primary-foreground">
                  {index + 1}
                </span>
                {annotation.label}
              </li>
            ))}
          </ol>
        ) : null}
        <p className="font-mono text-[10px] text-fg-muted uppercase tracking-[0.16em]">
          {guide.state} · captured {guide.capturedAt}
        </p>
      </figcaption>
    </figure>
  );
}

function Annotations({ guide }: { guide: Guide }) {
  if (guide.annotations.length === 0) return null;
  const { width, height } = guide;
  const scale = width / 1440;

  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full"
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      <defs>
        <marker
          id="guide-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 10 5 0 10Z" fill="var(--neon)" />
        </marker>
      </defs>
      {guide.annotations.map((annotation, index) => {
        const x = (annotation.x * width) / 100;
        const y = (annotation.y * height) / 100;
        const toX = (annotation.toX * width) / 100;
        const toY = (annotation.toY * height) / 100;
        // A quadratic that leaves the dot horizontally, so an arrow never runs
        // straight through the label it is pointing at.
        const path = `M${x} ${y} Q${(x + toX) / 2} ${y} ${toX} ${toY}`;
        return (
          <g key={annotation.label}>
            {/* A dark casing under the line, so it stays visible over a light
                area of the capture as well as a dark one. */}
            <path d={path} fill="none" stroke="oklch(0 0 0 / 55%)" strokeWidth={8 * scale} />
            <path
              d={path}
              fill="none"
              stroke="var(--neon)"
              strokeWidth={3 * scale}
              markerEnd="url(#guide-arrow)"
            />
            <circle cx={x} cy={y} r={17 * scale} fill="var(--neon)" stroke="oklch(0 0 0 / 55%)" strokeWidth={3 * scale} />
            <text
              x={x}
              y={y + 6 * scale}
              fill="#0a0f0c"
              textAnchor="middle"
              fontSize={19 * scale}
              fontWeight="700"
              fontFamily="ui-monospace, monospace"
            >
              {index + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/*
 * A capture that has not been taken yet. It says so rather than leaving a hole
 * or, worse, shipping a drawing of a screen that does not exist.
 */
function PendingShot({ caption }: { caption: string }) {
  return (
    <figure className="space-y-2">
      <div className="flex min-h-[132px] items-center justify-center rounded-xl border border-border border-dashed bg-surface-2/30 px-6 py-8">
        <p className="text-center font-mono text-[11px] text-fg-muted uppercase tracking-[0.16em]">
          capture pending
        </p>
      </div>
      <figcaption className="text-[14px] leading-relaxed text-fg-secondary">{caption}</figcaption>
    </figure>
  );
}
