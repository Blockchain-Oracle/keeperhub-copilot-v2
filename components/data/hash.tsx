import { shortenDigest } from "@/lib/format";
import { cn } from "@/lib/utils";

/* Masayume components/data/Hash.tsx, with DeepBookie's 8…6 digest rule. */

interface HashProps {
  value: string;
  href?: string;
  lead?: number;
  tail?: number;
  className?: string;
}

export function Hash({ value, href, lead, tail, className }: HashProps) {
  const short = shortenDigest(value, lead, tail);
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        title={value}
        className={cn(
          "font-mono tabular-nums underline decoration-dotted underline-offset-4 hover:text-primary",
          className,
        )}
      >
        {short}
      </a>
    );
  }
  return (
    <span title={value} className={cn("font-mono tabular-nums", className)}>
      {short}
    </span>
  );
}
