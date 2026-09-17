import { formatAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

/* Masayume's Hash structure with DeepBookie's 6…4 address rule. */

interface AddressProps {
  value: string;
  href?: string;
  lead?: number;
  tail?: number;
  className?: string;
}

export function Address({ value, href, lead, tail, className }: AddressProps) {
  const short = formatAddress(value, lead, tail);
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
