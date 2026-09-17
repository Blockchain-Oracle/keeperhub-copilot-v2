"use client";

import { Loader2, Maximize2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { UtcTime } from "@/components/data/utc-time";
import { Dialog, DialogBody, DialogContent, DialogEyebrow, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getChain } from "@/lib/chains";
import { formatBaseUnits } from "@/lib/format";
import type { PriceFeed } from "@/lib/price-feeds";
import type { RoundReading } from "@/lib/read-results";
import { cn } from "@/lib/utils";

import { Display, Label } from "./parts";
import { ReceiptCard } from "./receipt-card";
import { Sparkline } from "./sparkline";

/*
 * A Chainlink price, on Portaldot components/tools.tsx BlockInfoCard's grammar:
 * the figure large in the display face, a small mono label, the time on the
 * right. Under it, DeepBookie's Sparkline with VaultPoolCard's footer (the range
 * and its ±% change), drawn from the feed's recent real rounds (decision 13).
 * Portaldot's "gathering signal" stands in while they load.
 *
 * Expand opens the chart full width in the dialog with every update listed, the
 * Apps SDK's inline → fullscreen move. A read-only chat never fetches (DeepBookie
 * replays without live reads), so its card shows the price alone.
 */

type Point = { roundId: string; answer: string; updatedAt: number };

type History =
  | { status: "off" }
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; decimals: number; points: Point[] };

const PHASE_MASK = (1n << 64n) - 1n;

export function PriceCard({
  opId,
  feed,
  chainId,
  reading,
  live,
}: {
  opId: string;
  feed: PriceFeed;
  chainId: string | undefined;
  reading: RoundReading;
  live: boolean;
}) {
  const t = useTranslations("cards");
  const fetchable = live && chainId !== undefined && feed.addresses[chainId] !== undefined;
  const [history, setHistory] = useState<History>(fetchable ? { status: "loading" } : { status: "off" });
  const [expanded, setExpanded] = useState(false);
  const roundKey = reading.roundId.toString();

  useEffect(() => {
    if (!fetchable) return;
    let active = true;
    fetch("/api/cards/price-history", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ opId, network: chainId, roundId: roundKey }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (!active) return;
        const parsed = parseHistory(body);
        setHistory(parsed === null ? { status: "unavailable" } : { status: "ready", ...parsed });
      })
      .catch(() => {
        if (active) setHistory({ status: "unavailable" });
      });
    return () => {
      active = false;
    };
  }, [fetchable, opId, chainId, roundKey]);

  const decimals = history.status === "ready" ? history.decimals : feed.decimals;
  const latest: Point = { roundId: roundKey, answer: reading.answer.toString(), updatedAt: reading.updatedAt };
  const updates = history.status === "ready" ? [...history.points, latest] : [latest];
  const series = updates.map((point) => toNumber(point.answer, decimals));
  const first = series[0];
  const last = series[series.length - 1];
  const changePct = first ? ((last - first) / first) * 100 : 0;
  const chainName = chainId !== undefined ? getChain(chainId).name : undefined;

  return (
    <ReceiptCard
      toolName={opId}
      metaRight={t("price.round", { round: (reading.roundId & PHASE_MASK).toLocaleString("en-US") })}
    >
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <Label className="mb-1">
            {feed.base} / {feed.quote}
            {chainName ? ` · ${chainName}` : ""}
          </Label>
          <div className="leading-none">
            <Display className="text-[34px] sm:text-[44px]">{formatPrice(reading.answer, decimals, feed.quote)}</Display>{" "}
            <span className="font-mono text-sm text-fg-muted">{feed.quote}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <Label>{t("price.updated")}</Label>
          <UtcTime ms={reading.updatedAt * 1000} withSeconds={false} className="text-[12px] text-fg-secondary" />
        </div>
      </div>

      {history.status === "loading" && (
        <span className="mt-4 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">
          {t("price.gathering")}
          <Loader2 className="size-3 animate-spin" />
        </span>
      )}
      {history.status === "unavailable" && (
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">{t("price.historyUnavailable")}</p>
      )}
      {history.status === "ready" && series.length >= 2 && (
        <>
          <div className="mt-3">
            <Sparkline points={series} height={80} stroke="var(--telemetry)" />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3 font-mono text-[10px] text-fg-muted">
            <span>
              {t("price.lastUpdates", { count: String(series.length) })} ·{" "}
              <span className={changePct >= 0 ? "text-success" : "text-destructive"}>
                {changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}%
              </span>
            </span>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex items-center gap-1 uppercase tracking-[0.18em] text-telemetry transition-colors hover:text-foreground"
            >
              {t("price.expand")}
              <Maximize2 className="size-3" />
            </button>
          </div>
          <Dialog open={expanded} onOpenChange={setExpanded}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogEyebrow>chainlink{chainName ? ` · ${chainName}` : ""}</DialogEyebrow>
                <DialogTitle>
                  {feed.base} / {feed.quote}
                </DialogTitle>
              </DialogHeader>
              <DialogBody className="pb-7">
                <Sparkline points={series} height={220} stroke="var(--telemetry)" />
                <ul className="divide-y divide-border/70">
                  {[...updates].reverse().map((point, index) => (
                    <li key={point.roundId} className="flex items-center justify-between gap-4 py-1.5 text-sm">
                      <UtcTime ms={point.updatedAt * 1000} withDate className="text-[12px] text-fg-secondary" />
                      <span className={cn("font-mono tabular-nums", index === 0 ? "text-foreground" : "text-fg-secondary")}>
                        {formatPrice(BigInt(point.answer), decimals, feed.quote)} {feed.quote}
                      </span>
                    </li>
                  ))}
                </ul>
              </DialogBody>
            </DialogContent>
          </Dialog>
        </>
      )}
    </ReceiptCard>
  );
}

/* Big prices to cents; small ones (a stablecoin, an ETH-quoted pair) keep enough places to move. */
function formatPrice(answer: bigint, decimals: number, quote: "USD" | "ETH"): string {
  const whole = answer / 10n ** BigInt(decimals);
  const maxDp = quote === "ETH" ? 6 : whole >= 100n ? 2 : 4;
  return formatBaseUnits(answer, decimals, { maxDp, minDp: 2 });
}

/* Chart geometry only: the displayed figures never go through a float. */
function toNumber(answer: string, decimals: number): number {
  return Number(answer) / 10 ** decimals;
}

function parseHistory(body: unknown): { decimals: number; points: Point[] } | null {
  if (body === null || typeof body !== "object") return null;
  const record = body as { ok?: unknown; decimals?: unknown; points?: unknown };
  if (record.ok !== true || typeof record.decimals !== "number" || !Array.isArray(record.points)) return null;
  const points = record.points.filter(
    (point): point is Point =>
      point !== null &&
      typeof point === "object" &&
      typeof (point as Point).roundId === "string" &&
      /^\d+$/.test((point as Point).answer) &&
      typeof (point as Point).updatedAt === "number",
  );
  return { decimals: record.decimals, points };
}
