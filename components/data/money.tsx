import { formatBaseUnits } from "@/lib/format";
import { cn } from "@/lib/utils";

/*
 * Masayume components/data/Money.tsx. Its `numbers` class becomes
 * `font-mono tabular-nums`, and its profit/loss inks become Portaldot's
 * success/destructive.
 */

type MoneyTone = "neutral" | "pnl";

interface MoneyProps {
  value: bigint;
  decimals: number;
  symbol?: string;
  signed?: boolean;
  maxDp?: number;
  /** `pnl` is the only tone allowed to colour the figure. */
  tone?: MoneyTone;
  className?: string;
}

function pnlInk(value: bigint): string {
  if (value > 0n) return "text-success";
  if (value < 0n) return "text-destructive";
  return "text-fg-secondary";
}

export function Money({ value, decimals, symbol, signed = false, maxDp, tone = "neutral", className }: MoneyProps) {
  return (
    <span className={cn("font-mono tabular-nums", tone === "pnl" && pnlInk(value), className)}>
      {formatBaseUnits(value, decimals, { signed: signed || tone === "pnl", maxDp })}
      {symbol && <span className="text-fg-secondary"> {symbol}</span>}
    </span>
  );
}
