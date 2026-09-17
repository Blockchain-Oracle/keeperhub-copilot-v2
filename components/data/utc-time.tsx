import { formatUtc } from "@/lib/format";
import { cn } from "@/lib/utils";

/* Masayume components/data/UtcTime.tsx. */

interface UtcTimeProps {
  ms: number;
  withSeconds?: boolean;
  withDate?: boolean;
  className?: string;
}

/** Absolute UTC wherever a screenshot can outlive the clock. */
export function UtcTime({ ms, withSeconds = true, withDate = false, className }: UtcTimeProps) {
  return (
    <time dateTime={new Date(ms).toISOString()} className={cn("font-mono tabular-nums", className)}>
      {formatUtc(ms, { withSeconds, withDate })}
    </time>
  );
}
