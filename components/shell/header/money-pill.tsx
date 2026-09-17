"use client";

import { useTranslations } from "next-intl";

import { TokenMark } from "@/components/data/marks";
import { getChain } from "@/lib/chains";
import { formatDecimalString } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useAccount } from "../account-context";
import { useNetwork } from "../network-context";

/*
 * Masayume components/shell/header/HeaderMoneyPill.tsx + shell.css (`.dusdc-pill`)
 * and the ≤720px slimming in part-15.css. One figure of the org wallet's money
 * and a `+` that opens Add funds; an em dash, never a zero, until the balance
 * has answered. Changes: the figure is the native token on the selected network
 * (KeeperHub reports balances per chain, and there is no price to sum them by),
 * shown to 4 places rather than 2; the fund modal it opens lands with sign-in.
 */

export const OPEN_FUNDS_EVENT = "keeperhub:open-funds";

const AMOUNT_DP = 4;

export function MoneyPill() {
  const { identity, balance } = useAccount();
  const { chainId } = useNetwork();
  const t = useTranslations("shell.moneyPill");
  if (identity.status !== "signed-in") return null;

  const reading = balance.status === "ok" ? balance.balance : null;
  const total = reading ? formatDecimalString(reading.nativeBalance, { maxDp: AMOUNT_DP, minDp: AMOUNT_DP }) : null;
  const symbol = reading?.symbol || getChain(chainId).nativeSymbol;
  const title =
    balance.status === "unavailable"
      ? t("unavailable")
      : balance.status === "no-wallet"
        ? t("noWallet")
        : t("addFunds");

  return (
    <button
      type="button"
      title={title}
      aria-label={total === null ? t("balanceUnavailable") : t("balance", { amount: total, symbol })}
      onClick={() => window.dispatchEvent(new Event(OPEN_FUNDS_EVENT))}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-mono text-xs text-fg-secondary transition-[border-color,background-color,color] duration-220 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-border-strong hover:bg-foreground/[0.03] hover:text-foreground max-[720px]:gap-[3px] max-[720px]:px-[9px] max-[720px]:py-1 max-[720px]:text-[11px]"
    >
      {symbol && <TokenMark symbol={symbol} size={14} />}
      <span className={cn("font-semibold text-foreground tabular-nums", total === null && "text-foreground/55")}>{total ?? "—"}</span>
      {symbol && <span className="text-fg-muted max-[720px]:hidden">{symbol}</span>}
      <span aria-hidden className="ml-0.5 text-[15px] leading-none font-bold text-primary">
        +
      </span>
    </button>
  );
}
