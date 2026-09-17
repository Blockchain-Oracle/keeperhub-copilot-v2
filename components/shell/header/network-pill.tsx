"use client";

import { Check, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { ChainMark } from "@/components/data/marks";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuTrigger,
} from "@/components/ui/menu";
import type { PlatformChain } from "@/app/api/platform/chains/route";
import { getChain, type ChainId } from "@/lib/chains";

import { useNetwork } from "../network-context";
import { usePlatformChains } from "../use-platform-chains";

/*
 * Additive — Masayume has no network chip (network only shows as its account
 * button's "Wrong network" state) and Portaldot hard-codes "Mainnet". Drawn in
 * the money pill's geometry with Portaldot tokens, opening the same ui/menu the
 * nav menus use. The list is KeeperHub's live one; the pick is a cookie the
 * server reads. The chat composer's plus-menu shows the same list.
 */

const pillClassName =
  "group/network inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-mono text-xs text-fg-secondary transition-[border-color,background-color,color] duration-220 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-border-strong hover:bg-foreground/[0.03] hover:text-foreground data-popup-open:border-border-strong data-popup-open:text-foreground max-[720px]:gap-[3px] max-[720px]:px-[9px] max-[720px]:py-1 max-[720px]:text-[11px]";

/** The selected network's display name and native symbol, from KeeperHub's list when it has answered. */
export function useSelectedNetwork(): { chainId: ChainId; name: string; symbol: string } {
  const { chainId } = useNetwork();
  const chains = usePlatformChains();
  const live = chains.status === "ready" ? chains.chains.find((chain) => chain.chainId === chainId) : undefined;
  const known = getChain(chainId);
  return { chainId, name: live?.name ?? known.name, symbol: live?.symbol ?? known.nativeSymbol };
}

/**
 * Mainnets and testnets as radio groups, for any ui/menu. Bound to the selected
 * network unless given a value of its own (a write card's network field), and
 * narrowed to the ids an action accepts when it names them.
 */
export function NetworkMenuGroups({
  value,
  onValueChange,
  allowedIds,
}: {
  value?: ChainId;
  onValueChange?: (chainId: ChainId) => void;
  allowedIds?: readonly string[];
} = {}) {
  const network = useNetwork();
  const t = useTranslations("shell.networkPill");
  const chainId = value ?? network.chainId;
  const setChainId = onValueChange ?? network.setChainId;
  const chains = usePlatformChains();
  const all = chains.status === "ready" ? chains.chains : [];
  const list = allowedIds !== undefined && allowedIds.length > 0 ? all.filter((chain) => allowedIds.includes(chain.chainId)) : all;

  const groups: Array<["mainnets" | "testnets", PlatformChain[]]> = [
    ["mainnets", list.filter((chain) => !chain.isTestnet)],
    ["testnets", list.filter((chain) => chain.isTestnet)],
  ];

  return (
    <>
      {chains.status === "loading" && <p className="px-4 py-3 font-mono text-[11px] text-fg-muted">{t("loading")}</p>}
      {chains.status === "error" && (
        <p className="px-4 py-3 font-mono text-[11px] text-fg-muted">{t("unavailable")}</p>
      )}
      {groups.map(([kind, group]) =>
        group.length === 0 ? null : (
          <MenuGroup key={kind}>
            <MenuGroupLabel>{t(kind)}</MenuGroupLabel>
            <MenuRadioGroup value={chainId} onValueChange={(value) => setChainId(String(value))}>
              {group.map((chain) => (
                <MenuRadioItem key={chain.chainId} value={chain.chainId} closeOnClick className="py-2">
                  <ChainMark chainId={chain.chainId} name={chain.name} size={18} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{chain.name}</span>
                  <span className="font-mono text-[11px] text-fg-muted">{chain.symbol}</span>
                  <span className="flex w-3.5 justify-end">
                    <MenuRadioItemIndicator>
                      <Check aria-hidden="true" className="size-3.5" />
                    </MenuRadioItemIndicator>
                  </span>
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuGroup>
        ),
      )}
    </>
  );
}

export function NetworkPill({ onOpen }: { onOpen?: () => void }) {
  const { chainId, name } = useSelectedNetwork();
  const t = useTranslations("shell.networkPill");

  return (
    <Menu modal={false} onOpenChange={(open) => open && onOpen?.()}>
      <MenuTrigger aria-label={t("label", { name })} className={pillClassName}>
        <ChainMark chainId={chainId} name={name} size={14} />
        <span className="max-w-[9rem] truncate max-[720px]:hidden">{name}</span>
        <ChevronDown
          aria-hidden="true"
          className="size-3 text-fg-muted transition-transform duration-180 group-data-popup-open/network:rotate-180"
        />
      </MenuTrigger>
      <MenuContent sideOffset={12} className="w-64">
        <NetworkMenuGroups />
      </MenuContent>
    </Menu>
  );
}
