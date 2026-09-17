"use client";

import { useTranslations } from "next-intl";

import { AddressQR } from "@/components/data/address-qr";
import { CopyChip } from "@/components/data/copy-chip";
import { Identicon } from "@/components/data/identicon";
import { useAccount } from "@/components/shell/account-context";
import { getChain } from "@/lib/chains";
import { formatBaseUnits } from "@/lib/format";
import type { BalanceReading } from "@/lib/read-results";

import { Display, useRampBigInt } from "./parts";
import { ReceiptCard } from "./receipt-card";

/*
 * Portaldot components/tools.tsx BalanceCard: identicon and copyable address,
 * the total counting up from 0 over 700ms in the display face, the symbol, and
 * the address as a QR "scan to send".
 *
 * Changes: the amount is KeeperHub's raw units through the no-float formatter;
 * Portaldot's Free/Reserved grid is dropped (KeeperHub reports no such split);
 * the meta slot says ORG WALLET when the address is this organisation's, else
 * the network.
 */
export function BalanceCard({
  opId,
  chainId,
  reading,
}: {
  opId: string;
  chainId: string | undefined;
  reading: BalanceReading;
}) {
  const { identity } = useAccount();
  const t = useTranslations("cards");
  const ramped = useRampBigInt(reading.raw);
  const chain = chainId !== undefined ? getChain(chainId) : undefined;
  const symbol = reading.symbol ?? chain?.nativeSymbol ?? "";
  const yours =
    identity.status === "signed-in" &&
    identity.walletAddress !== null &&
    identity.walletAddress.toLowerCase() === reading.address.toLowerCase();

  return (
    <ReceiptCard
      toolName={opId}
      metaRight={yours ? t("balance.orgWallet") : chain !== undefined ? chain.name.toUpperCase() : t("balance.meta")}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center gap-2">
            <Identicon address={reading.address} size={28} />
            <CopyChip value={reading.address} />
          </div>
          <div className="leading-none">
            <Display className="text-[34px] sm:text-[44px]">
              {formatBaseUnits(ramped, reading.decimals, { maxDp: 6, minDp: 2 })}
            </Display>{" "}
            <span className="font-mono text-sm text-fg-muted">{symbol}</span>
          </div>
        </div>
        <div className="self-start sm:self-auto">
          <AddressQR value={reading.address} size={84} caption={t("balance.scanToSend")} />
        </div>
      </div>
    </ReceiptCard>
  );
}
