import Image from "next/image";
import { useTranslations } from "next-intl";

import { CHAINS, type ChainId } from "@/lib/chains";

/*
 * Chain and token marks, on DeepBookie components/widgets/CoinLogo.tsx's three tiers:
 *   1. the brand's own SVG — svgl, found with `21st logo <name>`, bytes unchanged in public/marks/
 *   2. a disc in the brand colour with a glyph
 *   3. the first letter on a neutral disc
 *
 * svgl has no mark for Base, Arbitrum, Optimism, Gnosis, Avalanche, Tempo or USDC
 * (searched 2026-09-12), so those render on tier 2.
 */

const CHAIN_SVG: Record<ChainId, string> = {
  "1": "eth",
  "11155111": "eth",
  "137": "matic",
  "80002": "matic",
  "56": "binance",
  "97": "binance",
  "101": "sol",
  "103": "sol",
};

const TOKEN_SVG: Record<string, string> = {
  ETH: "eth",
  POL: "matic",
  MATIC: "matic",
  BNB: "binance",
  SOL: "sol",
  USDT: "tether",
};

/** Disc tint + glyph per token without an svgl mark — DeepBookie's own USDC entry. */
const TOKEN_DISC: Record<string, { bg: string; glyph: string }> = {
  USDC: { bg: "#2775CA", glyph: "$" },
};

function SvgMark({ name, label, size }: { name: string; label: string; size: number }) {
  return <Image src={`/marks/${name}.svg`} alt={label} width={size} height={size} unoptimized className="shrink-0" />;
}

function Disc({ label, glyph, bg, size }: { label: string; glyph: string; bg?: string; size: number }) {
  return (
    <span
      role="img"
      aria-label={label}
      className={
        bg
          ? "flex shrink-0 items-center justify-center rounded-full font-bold text-foreground"
          : "flex shrink-0 items-center justify-center rounded-full bg-surface-2 font-bold text-foreground"
      }
      style={{ width: size, height: size, fontSize: size * (bg ? 0.44 : 0.42), background: bg }}
    >
      {glyph}
    </span>
  );
}

/** `name` is the platform's label, for networks KeeperHub lists that lib/chains does not name yet (tier 3). */
export function ChainMark({ chainId, name, size = 20 }: { chainId: ChainId | number; name?: string; size?: number }) {
  const t = useTranslations("shell.chainMark");
  const id = String(chainId);
  const chain = CHAINS[id];
  const label = chain?.name ?? name ?? t("fallback", { id });
  const svg = CHAIN_SVG[id];
  if (svg) return <SvgMark name={svg} label={label} size={size} />;
  if (chain) return <Disc label={label} glyph={chain.name.charAt(0)} bg={chain.dot} size={size} />;
  return <Disc label={label} glyph={name ? name.charAt(0) : "?"} size={size} />;
}

export function TokenMark({ symbol, size = 20 }: { symbol: string; size?: number }) {
  const key = symbol.toUpperCase();
  const svg = TOKEN_SVG[key];
  if (svg) return <SvgMark name={svg} label={key} size={size} />;
  const disc = TOKEN_DISC[key];
  if (disc) return <Disc label={key} glyph={disc.glyph} bg={disc.bg} size={size} />;
  return <Disc label={key} glyph={key.charAt(0)} size={size} />;
}
