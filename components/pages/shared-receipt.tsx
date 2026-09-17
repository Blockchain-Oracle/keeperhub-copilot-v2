"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Row } from "@/components/cards/parts";
import { ReceiptCard, ReceiptStamp } from "@/components/cards/receipt-card";
import {
  NetworkName,
  PRIMARY_BUTTON,
  TransferBody,
  TxInset,
  useChainLabel,
  WriteHeader,
} from "@/components/cards/write-card-parts";
import { CopyChip } from "@/components/data/copy-chip";
import { IntegrationMark } from "@/components/data/integration-mark";
import { UtcTime } from "@/components/data/utc-time";
import { activityLabel } from "@/lib/activity";
import { useTranslate } from "@/lib/i18n/use-translate";
import type { SharedReceiptView } from "@/lib/shares";

/*
 * A shared receipt, open to anyone with the link (decision 37). The write
 * card's receipt as DeepBookie's StaticToolReceipt replays one: drawn from
 * stored facts with no account and no buttons. Portaldot's receipt frame and
 * EXECUTED stamp, SignReceipt's header, Portaldot TransferCard's body for a
 * transfer and its transaction inset. Only what lib/shares.ts lets through
 * reaches this page.
 */
export function SharedReceipt({ view }: { view: SharedReceiptView }) {
  const chain = useChainLabel(view.network ?? undefined);
  const t = useTranslations("pages.sharedReceipt");
  // The verb names translate; a KeeperHub action keeps its own label (decision 39).
  const label = activityLabel(view.opId, useTranslate());
  const shortHash = `${view.txHash.slice(0, 6)}…${view.txHash.slice(-4)}`;

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-8 md:py-10">
      <p className="mb-3 font-mono text-[10px] tracking-[0.22em] text-fg-muted uppercase">{t("kicker")}</p>
      <ReceiptCard toolName={label} metaRight={t("stamp")} tone="success" stamp={<ReceiptStamp label={t("stamp")} tone="success" />}>
        <WriteHeader
          kicker={t("executed")}
          status={view.verified === true ? t("verified") : t("sent")}
          doc={shortHash}
          ink="success"
          stamped
        />
        <div className="mt-3 flex items-center gap-2.5">
          <IntegrationMark integration={view.integration} size={24} />
          <p className="text-[17px] font-semibold tracking-[-0.02em] text-foreground [overflow-wrap:anywhere]">{label}</p>
        </div>

        {view.transfer !== null && (
          <div className="mt-4">
            <TransferBody
              from={null}
              to={view.transfer.to}
              amount={view.transfer.amount}
              unit={view.transfer.tokenAddress === null ? chain.symbol : t("tokens")}
              showQr={false}
            />
          </div>
        )}

        <div className="mt-3 divide-y divide-border/60">
          {view.network !== null && <Row k={t("rows.network")} v={<NetworkName chainId={view.network} />} />}
          {view.transfer?.tokenAddress != null && <Row k={t("rows.token")} v={<CopyChip value={view.transfer.tokenAddress} />} />}
          {view.blockNumber !== null && <Row k={t("rows.block")} v={<span className="font-mono tabular-nums">{view.blockNumber}</span>} />}
          <Row k={t("rows.executed")} v={<UtcTime ms={Date.parse(view.executedAt)} withDate className="text-[13px]" />} />
        </div>

        <TxInset txHash={view.txHash} chainId={view.network ?? undefined} verified={view.verified ?? undefined} />
      </ReceiptCard>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-sm text-[12.5px] text-fg-muted">{t("footnote")}</p>
        <Link href="/" className={PRIMARY_BUTTON}>
          {t("tryCopilot")}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
