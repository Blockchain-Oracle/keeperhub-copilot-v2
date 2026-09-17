interface SparklineProps {
  points: number[];
  stroke?: string;
  height?: number;
  className?: string;
}

/*
 * DeepBookie components/ui/Sparkline.tsx, verbatim apart from the default
 * stroke: its green token becomes our success token.
 */

/** Minimal area sparkline from a numeric series (already downsampled upstream). */
export function Sparkline({ points, stroke = "var(--success)", height = 48, className = "" }: SparklineProps) {
  if (points.length < 2) return <div style={{ height }} className={className} />;

  const w = 100;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map((p, i): [number, number] => [i * step, height - ((p - min) / range) * height]);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${w},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      style={{ height }}
      aria-hidden
    >
      <path d={area} fill={stroke} opacity={0.1} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
