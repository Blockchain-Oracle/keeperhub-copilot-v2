"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { DiamondMark } from "@/components/ui/diamond-mark";
import { useTranslate } from "@/lib/i18n/use-translate";

import { PaletteTrigger } from "../command/palette-trigger";
import { AddFunds } from "../funding/add-funds";
import { ReceiptWelcome } from "../funding/receipt-welcome";
import { AccountPill } from "./account-pill";
import { DesktopNavMenu, navLinkClassName } from "./desktop-nav-menu";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { MoneyPill } from "./money-pill";
import { NetworkPill } from "./network-pill";
import { DESKTOP_NAV, isActiveNavItem, navName, type NavGroup } from "./nav-items";

/*
 * Masayume components/shell/header/Header.tsx + part-02.css (`.header`, `.logo`,
 * `.nav*`), part-15.css (≤720px) and navigation.css (721–1040px, ≤380px).
 * Logo left; links, menus and the right-hand pills right. The header owns which
 * group menu is open, so only one ever is; menus close on route change and at
 * 720px or less. Changes: our wordmark and Portaldot's diamond; the theme
 * toggle is gone (dark only); a network pill sits before the money pill. Like
 * Masayume's, it mounts the funds modal and the one-time welcome (ours greets
 * an org's first receipt rather than a first credit).
 */

const MOBILE_MAX_WIDTH = 720;

export function Header() {
  const pathname = usePathname();
  const t = useTranslations("shell.nav");
  const translate = useTranslate();
  // Remembering the page a menu was opened on closes it on navigation without an effect.
  const [opened, setOpened] = useState<{ id: NavGroup["id"]; pathname: string } | null>(null);
  const openGroup = opened?.pathname === pathname ? opened.id : null;

  useEffect(() => {
    const closeAtMobileWidth = () => {
      if (window.innerWidth <= MOBILE_MAX_WIDTH) setOpened(null);
    };
    window.addEventListener("resize", closeAtMobileWidth);
    return () => window.removeEventListener("resize", closeAtMobileWidth);
  }, []);

  return (
    <>
      <header className="fixed inset-x-0 top-[calc(var(--appstrip)+28px)] z-[800] flex h-16 items-center justify-between border-b border-border bg-background/96 px-8 backdrop-blur-[20px] min-[721px]:max-[1040px]:px-5 max-[720px]:top-[calc(var(--appstrip)+20px)] max-[720px]:h-[46px] max-[720px]:px-3.5 max-[380px]:gap-1 max-[380px]:px-2.5">
        <Link
          href="/app"
          aria-label="KeeperHub Copilot"
          className="flex items-center gap-2.5 font-display text-[15px] font-bold tracking-[0.18em] text-foreground max-[720px]:gap-2 max-[720px]:text-sm max-[720px]:tracking-[0.12em] max-[380px]:gap-1.5 max-[380px]:text-[13px] max-[380px]:tracking-[0.09em]"
        >
          <DiamondMark className="size-[18px] text-primary max-[720px]:size-4" />
          <span className="min-[721px]:max-[1040px]:hidden">KEEPERHUB</span>
        </Link>

        <nav aria-label={t("primary")} className="flex items-center gap-7 min-[721px]:max-[1040px]:gap-[1.1rem]">
          <div className="flex items-center gap-6 min-[721px]:max-[1040px]:gap-4 max-[720px]:hidden">
            {DESKTOP_NAV.map((entry) => {
              if (entry.kind === "group") {
                return (
                  <DesktopNavMenu
                    key={entry.group.id}
                    group={entry.group}
                    pathname={pathname}
                    open={openGroup === entry.group.id}
                    onOpenChange={(open) => setOpened(open ? { id: entry.group.id, pathname } : null)}
                  />
                );
              }

              const active = isActiveNavItem(pathname, entry.item);
              return (
                <Link
                  key={entry.item.id}
                  href={entry.item.href}
                  data-active={active || undefined}
                  aria-current={active ? "page" : undefined}
                  className={navLinkClassName}
                >
                  {navName(entry.item, translate)}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-3.5 max-[720px]:gap-2 max-[380px]:gap-[5px]">
            <PaletteTrigger />
            <NetworkPill onOpen={() => setOpened(null)} />
            <MoneyPill />
            <AccountPill />
          </div>
        </nav>
      </header>

      <MobileBottomNav />
      <ReceiptWelcome />
      <AddFunds />
    </>
  );
}
