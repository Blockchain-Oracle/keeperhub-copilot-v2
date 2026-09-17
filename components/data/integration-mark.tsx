import Image from "next/image";
import { Search, TextCursorInput } from "lucide-react";
import { useTranslations } from "next-intl";

import { integrations } from "@/lib/registry";

/*
 * An integration's mark, on the tiers of slice 1's CoinLogo port
 * (components/data/marks.tsx): KeeperHub's own logo file where it ships one,
 * else the first letter on a neutral disc. The files are KeeperHub's
 * public/protocols @ 946eeb5c9 (decision 14); its aave mark serves both Aave
 * versions. "search" is the catalog lookup, which belongs to no integration, and
 * "form" a form asking the person for details (decision 32).
 */

const LOGO: Record<string, string> = {
  "aave-v3": "aave",
  "aave-v4": "aave",
  aerodrome: "aerodrome",
  ajna: "ajna",
  chainlink: "chainlink",
  chronicle: "chronicle",
  compound: "compound",
  cowswap: "cowswap",
  curve: "curve",
  ethena: "ethena",
  "frax-ether-v2": "frax-ether-v2",
  hyperliquid: "hyperliquid",
  lido: "lido",
  morpho: "morpho",
  pendle: "pendle",
  "rocket-pool": "rocket-pool",
  safe: "safe",
  sky: "sky",
  spark: "spark",
  superfluid: "superfluid",
  uniswap: "uniswap",
  wrapped: "wrapped",
  yearn: "yearn",
};

export function IntegrationMark({ integration, size = 20 }: { integration: string; size?: number }) {
  const t = useTranslations("shell.integrationMark");
  if (integration === "form") {
    return (
      <span
        role="img"
        aria-label={t("form")}
        className="flex shrink-0 items-center justify-center rounded-full bg-pending/15 text-pending"
        style={{ width: size, height: size }}
      >
        <TextCursorInput style={{ width: size * 0.55, height: size * 0.55 }} />
      </span>
    );
  }
  if (integration === "search") {
    return (
      <span
        role="img"
        aria-label={t("search")}
        className="flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-secondary"
        style={{ width: size, height: size }}
      >
        <Search style={{ width: size * 0.55, height: size * 0.55 }} />
      </span>
    );
  }
  const label = integrations[integration]?.label ?? integration;
  const file = LOGO[integration];
  if (file) {
    return (
      <Image
        src={`/protocols/${file}.png`}
        alt={label}
        width={size}
        height={size}
        unoptimized
        className="shrink-0 rounded-full"
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={label}
      className="flex shrink-0 items-center justify-center rounded-full bg-surface-2 font-bold text-foreground"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {label.charAt(0).toUpperCase()}
    </span>
  );
}
