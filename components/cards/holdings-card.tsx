"use client";

import { useTranslations } from "next-intl";

import { CopyChip } from "@/components/data/copy-chip";
import { Identicon } from "@/components/data/identicon";
import { ChainMark } from "@/components/data/marks";
import { isZero, readHoldings, shortAmount, type HeldChain } from "@/lib/holdings";
import { cn } from "@/lib/utils";

import { Display, EmptyLine, Label } from "./parts";
import { ReceiptCard } from "./receipt-card";

/*
 * The org wallet's holdings (decision 34). Portaldot components/tools.tsx
 * BalanceCard grammar: the identicon and copyable address, the native amount in
 * the display face with its symbol, ORG WALLET in the meta slot.
 *
 * Changes: KeeperHub reports several tokens per network, so they follow as rows
 * (anything held first, zeros dimmed); asked about every network, it lists each
 * network holding something with its mark. KeeperHub's own caveat is kept: a
 * token it could not read comes back as 0.
 */
export function HoldingsCard({ holdings }: { holdings: unknown }) {
  const t = useTranslations("cards");
  const data = readHoldings(holdings);
  if (data === null) {
    return (
      <ReceiptCard toolName="get_org_wallet_balances" metaRight={t("holdings.unreadableMeta")}>
        <EmptyLine>{t("holdings.unreadable")}</EmptyLine>
      </ReceiptCard>
    );
  }
  const single = data.network !== null ? data.chains[0] : undefined;

  return (
    <ReceiptCard toolName="get_org_wallet_balances" metaRight={t("holdings.orgWallet")}>
      {data.address !== null && (
        <div className="mb-3 flex items-center gap-2">
          <Identicon address={data.address} size={28} />
          <CopyChip value={data.address} />
        </div>
      )}

      {single !== undefined ? (
        <OneNetwork chain={single} />
      ) : data.chains.length === 0 ? (
        <EmptyLine>{t("holdings.nothing")}</EmptyLine>
      ) : (
        <ul className="divide-y divide-border/70">
          {data.chains.map((chain) => (
            <li key={chain.chainId} className="flex items-start gap-3 py-2.5">
              <ChainMark chainId={chain.chainId} name={chain.chainName} size={22} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-foreground">{chain.chainName}</p>
                <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[12.5px] tabular-nums text-fg-secondary">
                  {!isZero(chain.nativeBalance) && (
                    <span>
                      {shortAmount(chain.nativeBalance)} {chain.symbol}
                    </span>
                  )}
                  {chain.tokens
                    .filter((token) => !isZero(token.balance))
                    .map((token) => (
                      <span key={`${token.tokenAddress}-${token.symbol}`}>
                        {shortAmount(token.balance)} {token.symbol}
                      </span>
                    ))}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11.5px] text-fg-muted">{t("holdings.caveat")}</p>
    </ReceiptCard>
  );
}

function OneNetwork({ chain }: { chain: HeldChain }) {
  const t = useTranslations("cards");
  if (chain.unavailable) {
    return (
      <div>
        <Label>{chain.chainName}</Label>
        <p className="mt-1 text-[13px] text-fg-secondary">{t("holdings.networkUnavailable")}</p>
      </div>
    );
  }
  const tokens = [...chain.tokens].sort((a, b) => Number(isZero(a.balance)) - Number(isZero(b.balance)));
  return (
    <div>
      <div className="flex items-center gap-2">
        <ChainMark chainId={chain.chainId} name={chain.chainName} size={16} />
        <Label>{chain.chainName}</Label>
      </div>
      <div className="mt-2 leading-none">
        <Display className="text-[34px] sm:text-[40px]">{shortAmount(chain.nativeBalance)}</Display>{" "}
        <span className="font-mono text-sm text-fg-muted">{chain.symbol}</span>
      </div>
      {tokens.length > 0 && (
        <ul className="mt-3 divide-y divide-border/60 rounded-lg border border-border bg-surface-2/40 px-3">
          {tokens.map((token) => (
            <li key={`${token.tokenAddress}-${token.symbol}`} className="flex items-center justify-between gap-3 py-1.5">
              <span className={cn("min-w-0 truncate text-[13px]", isZero(token.balance) ? "text-fg-muted" : "text-foreground")}>
                {token.symbol}
                <span className="ml-2 text-[11.5px] text-fg-muted">{token.name}</span>
              </span>
              <span
                className={cn(
                  "shrink-0 font-mono text-[13px] tabular-nums",
                  isZero(token.balance) ? "text-fg-muted" : "text-foreground",
                )}
              >
                {shortAmount(token.balance)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
