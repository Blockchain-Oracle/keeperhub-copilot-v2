"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import type { LedgerListItem, LedgerListResponse } from "@/app/api/ledger/route";
import { shortenDigest } from "@/lib/format";

import { useAccount } from "./account-context";
import { usePlatformChains } from "./use-platform-chains";

/*
 * Masayume components/shell/Marquee.tsx + part-02.css (`.marquee*`). The ticker
 * earns its motion by carrying live signal, and says LOADING rather than
 * scrolling invented figures. Their signal is prices and the next close; ours
 * is the networks KeeperHub can run on right now and, when signed in, this
 * org's latest receipts. Added: UNAVAILABLE when the network list failed, so a
 * dead feed does not read as one still loading.
 */

const RECEIPT_SLOTS = 8;
const LEDGER_PAGE = 20;

interface MarqueeItem {
  label: string;
  value: string;
}

function useLatestReceipts(signedIn: boolean): LedgerListItem[] {
  const [rows, setRows] = useState<LedgerListItem[]>([]);

  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    fetch(`/api/ledger?limit=${LEDGER_PAGE}`, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        if (res.ok) setRows(((await res.json()) as LedgerListResponse).rows);
      })
      .catch(() => {
        /* no receipts shown — the ticker never fills the gap with anything else */
      });
    return () => controller.abort();
  }, [signedIn]);

  if (!signedIn) return [];
  return rows.filter((row) => row.state === "receipt" && row.txHash).slice(0, RECEIPT_SLOTS);
}

export function Marquee() {
  const t = useTranslations("shell.marquee");
  const chains = usePlatformChains();
  const { identity } = useAccount();
  const receipts = useLatestReceipts(identity.status === "signed-in");

  const items: MarqueeItem[] = [];
  if (chains.status === "ready") {
    items.push({ label: t("networks"), value: String(chains.chains.length) });
    for (const chain of chains.chains) {
      items.push({ label: chain.name.toUpperCase(), value: chain.symbol || "—" });
    }
  }
  for (const row of receipts) {
    items.push({ label: row.opId.toUpperCase(), value: shortenDigest(row.txHash ?? "") });
  }

  // An honest holding state: loading is a product state, an invented feed is not.
  if (items.length === 0) {
    items.push({ label: "KEEPERHUB", value: chains.status === "error" ? t("unavailable") : t("loading") });
  }

  const renderCells = (keyPrefix: string) =>
    items.map((item, i) => (
      <span key={`${keyPrefix}-${i}`} className="inline-flex items-center gap-2.5 max-[720px]:gap-[7px]">
        <span className="text-fg-muted">{item.label}</span>
        <span className="text-foreground">{item.value}</span>
      </span>
    ));

  return (
    <div className="fixed inset-x-0 top-(--appstrip) z-[850] flex h-7 items-center overflow-hidden border-b border-border bg-background font-mono text-[11px] tracking-[0.04em] text-fg-muted max-[720px]:h-5 max-[720px]:text-[7px] max-[720px]:tracking-[0.01em]">
      <div className="flex animate-[marquee-scroll_80s_linear_infinite] gap-14 pl-14 whitespace-nowrap max-[720px]:gap-7 max-[720px]:pl-7">
        {renderCells("a")}
        {renderCells("b")}
        {renderCells("c")}
      </div>
    </div>
  );
}
