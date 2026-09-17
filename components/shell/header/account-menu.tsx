"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState } from "react";

import type { LimitsResponse } from "@/app/api/account/limits/route";
import { Identicon } from "@/components/data/identicon";
import { explorerAddressUrl, getChain } from "@/lib/chains";
import { formatAddress, formatBaseUnits, formatDecimalString } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import type { SpendLimit } from "@/lib/session/spend-cap";
import { cn } from "@/lib/utils";

import { useAccount } from "../account-context";
import { useLocale } from "../locale-context";
import { useNetwork } from "../network-context";
import { useSound } from "../sound-context";

import { LanguageDialog } from "./language-dialog";
import { useFloatingMenus } from "./use-floating-menus";

/*
 * Masayume components/shell/header/HeaderAccount.tsx (the connected chip and
 * its menu) + shell.css (`.header-account-*`) + part-03.css (`.wallet-pill`).
 * The same grammar: a pools block of named mono rows, never summed, then plain
 * links, then Disconnect; no open/close animation; closes on an outside press,
 * Escape, an item click, and (added) a route change.
 *
 * Changes: the rows are the org wallet on the selected network and today's
 * spend against KeeperHub's daily limit (read when the menu opens). Portfolio
 * becomes Activity. Portaldot's WalletPill menu items are added: Copy address
 * and View on explorer. Paint: var(--bg) → background, white hairlines →
 * border, gray-300/500 → fg-secondary/fg-muted, vermilion → primary. A
 * Language row opens the language dialog (decisions 38–40).
 */

type LimitState = { status: "loading" } | { status: "ok"; limit: SpendLimit } | { status: "unavailable" };

const DP = 4;
const COPIED_MS = 1400;

const pillClassName =
  "inline-flex cursor-pointer items-center gap-2.5 rounded-full border border-border py-[7px] pr-3.5 pl-2 font-mono text-xs text-fg-secondary transition-[border-color,color] duration-220 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-border-strong hover:text-foreground aria-expanded:border-border-strong aria-expanded:text-foreground max-[720px]:gap-[5px] max-[720px]:py-1 max-[720px]:pr-[9px] max-[720px]:pl-1 max-[720px]:text-[10px] max-[420px]:size-9 max-[420px]:justify-center max-[420px]:p-0";

const linkClassName =
  "block w-full px-4 py-2 text-left font-mono text-[12px] text-fg-secondary transition-[background-color,color] duration-180 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-foreground/5 hover:text-foreground";

const wei = (value: string) => formatBaseUnits(BigInt(value), 18, { maxDp: DP, minDp: DP });

export function AccountMenu({ walletAddress }: { walletAddress: string | null }) {
  const t = useTranslations("shell");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const { balance } = useAccount();
  const { chainId } = useNetwork();
  // Remembering the page the menu opened on closes it on navigation without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const [limit, setLimit] = useState<LimitState>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const language = getLocale(useLocale().locale);
  const { muted, toggle: toggleSound } = useSound();
  const menuRef = useRef<HTMLDivElement>(null);
  const refs = useMemo(() => [menuRef], []);
  const close = useCallback(() => setOpenOn(null), []);
  useFloatingMenus(refs, close);

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    setOpenOn(pathname);
    setLimit({ status: "loading" });
    fetch("/api/account/limits", { cache: "no-store" })
      .then(async (res) => {
        const body = res.ok ? ((await res.json()) as LimitsResponse) : null;
        setLimit(body?.limit ? { status: "ok", limit: body.limit } : { status: "unavailable" });
      })
      .catch(() => setLimit({ status: "unavailable" }));
  };

  const copyAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      /* clipboard refused: the address is still in the pill's title */
    }
  };

  const reading = balance.status === "ok" ? balance.balance : null;
  const amount = reading ? formatDecimalString(reading.nativeBalance, { maxDp: DP, minDp: DP }) : null;
  const symbol = reading?.symbol || getChain(chainId).nativeSymbol;
  const explorer = walletAddress ? explorerAddressUrl(chainId, walletAddress) : null;
  const spent = limit.status === "ok" ? `${wei(limit.limit.usedWei)} / ${wei(limit.limit.capWei)}` : "—";
  const spentTitle =
    limit.status === "ok"
      ? t(limit.limit.platformDefault ? "accountMenu.spentTitleDefault" : "accountMenu.spentTitle")
      : limit.status === "unavailable"
        ? t("accountMenu.limitUnavailable")
        : undefined;

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label={t("accountMenu.open")}
        aria-haspopup="menu"
        aria-expanded={open}
        title={walletAddress ?? t("accountMenu.noWalletTitle")}
        onClick={toggle}
        className={pillClassName}
      >
        <Identicon
          address={walletAddress ?? ""}
          size={22}
          ariaLabel={walletAddress ? t("accountMenu.walletLabel", { address: walletAddress }) : t("accountMenu.noWalletLabel")}
          className="max-[720px]:size-3.5!"
        />
        <span className="max-[420px]:hidden">{walletAddress ? formatAddress(walletAddress) : t("accountMenu.noWallet")}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t("accountMenu.menu")}
          className="absolute top-full right-0 z-50 mt-2 min-w-[210px] overflow-hidden rounded-lg border border-border bg-background backdrop-blur-[12px]"
        >
          <div className="border-b border-border px-4 py-3">
            <PoolRow label={t("accountMenu.orgWallet")} value={amount === null ? "—" : `${amount} ${symbol}`} />
            <PoolRow label={t("accountMenu.spentToday")} value={spent} title={spentTitle} soft />
          </div>
          {walletAddress && (
            <button type="button" role="menuitem" onClick={copyAddress} className={linkClassName}>
              {copied ? `${tc("copied")} ✓` : t("accountMenu.copyAddress")}
            </button>
          )}
          {explorer && (
            <a role="menuitem" href={explorer} target="_blank" rel="noreferrer" onClick={close} className={linkClassName}>
              {t("accountMenu.viewOnExplorer")} ↗
            </a>
          )}
          <Link role="menuitem" href="/app/activity" onClick={close} className={linkClassName}>
            {t("nav.items.activity.name")}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              setLanguageOpen(true);
            }}
            className={cn(linkClassName, "flex items-center justify-between gap-4")}
          >
            <span>{tc("language")}</span>
            <span lang={language.code} className="text-fg-muted">
              {language.native}
            </span>
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={!muted}
            onClick={toggleSound}
            className={cn(linkClassName, "flex items-center justify-between gap-4")}
          >
            <span>{t("accountMenu.sound")}</span>
            <span className="text-fg-muted">
              {muted ? t("accountMenu.soundOff") : t("accountMenu.soundOn")}
            </span>
          </button>
          <form action="/api/auth/logout" method="post">
            <button type="submit" role="menuitem" className={cn(linkClassName, "text-destructive/80 hover:text-destructive")}>
              {t("accountMenu.disconnect")}
            </button>
          </form>
        </div>
      )}
      <LanguageDialog open={languageOpen} onOpenChange={setLanguageOpen} />
    </div>
  );
}

/* Each pool is named. Economically different money is never summed into one number. */
function PoolRow({ label, value, title, soft }: { label: string; value: string; title?: string; soft?: boolean }) {
  return (
    <div title={title} className="flex items-center justify-between gap-4 font-mono text-[11px] text-fg-muted not-first:mt-1">
      <span>{label}</span>
      <span className={cn("whitespace-nowrap tabular-nums", soft ? "text-foreground/80" : "text-foreground")}>{value}</span>
    </div>
  );
}
