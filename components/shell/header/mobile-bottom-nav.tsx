"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useTranslate } from "@/lib/i18n/use-translate";
import { cn } from "@/lib/utils";

import {
  isActiveNavItem,
  MOBILE_DRAWER_SECTIONS,
  MOBILE_NAV,
  MOBILE_OVERFLOW,
  navDescription,
  navName,
} from "./nav-items";

/*
 * Masayume components/shell/header/MobileBottomNav.tsx + part-15.css
 * (`.mobile-bottom-nav`) and navigation.css (`.mobile-nav-*`, the ≤720px sizing).
 * Four fast destinations plus one complete drawer. The drawer closes on route
 * change by remembering which page it was opened on, instead of an effect.
 */

const pillItemClassName =
  "flex min-w-0 flex-[1_1_20%] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full border-0 bg-transparent px-[0.35rem] py-[0.45rem] text-[9px] font-medium tracking-[0.02em] text-fg-muted no-underline transition-[color,background-color] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] [-webkit-tap-highlight-color:transparent] hover:bg-foreground/8 hover:text-foreground data-active:bg-foreground/8 data-active:text-foreground data-active:[&_svg]:stroke-primary [&_span]:max-w-full [&_span]:truncate [&_svg]:size-[18px] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.8]";

export function MobileBottomNav() {
  const pathname = usePathname();
  const t = useTranslations("shell");
  const translate = useTranslate();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean) => setOpenOn(next ? pathname : null);

  const fastPathActive = MOBILE_NAV.some((item) => isActiveNavItem(pathname, item));
  const moreActive = !fastPathActive && MOBILE_OVERFLOW.some((item) => isActiveNavItem(pathname, item));

  return (
    <Sheet open={open} onOpenChange={(next) => setOpen(next)}>
      <nav
        aria-label={t("mobileNav.label")}
        className="fixed bottom-[calc(0.8rem+env(safe-area-inset-bottom))] left-1/2 z-[900] hidden w-[min(26rem,calc(100vw-1.25rem))] max-w-[calc(100vw-20px)] -translate-x-1/2 gap-0.5 rounded-full border border-border bg-background/72 px-1.5 py-[5px] backdrop-blur-[24px] max-[720px]:flex"
      >
        {MOBILE_NAV.map((item) => {
          const active = isActiveNavItem(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              data-active={active || undefined}
              aria-current={active ? "page" : undefined}
              className={pillItemClassName}
            >
              <Icon aria-hidden="true" />
              <span>{navName(item, translate)}</span>
            </Link>
          );
        })}
        <SheetTrigger
          render={<button type="button" data-active={moreActive || open || undefined} className={pillItemClassName} />}
          aria-label={t("mobileNav.openAll")}
        >
          <MoreHorizontal aria-hidden="true" />
          <span>{t("mobileNav.more")}</span>
        </SheetTrigger>
      </nav>

      <SheetContent
        side="right"
        overlayClassName="z-[980] bg-background/72 supports-backdrop-filter:backdrop-blur-none"
        className="top-0 right-0 bottom-0 z-[990] h-dvh max-w-none gap-0 overflow-hidden rounded-none border-border-strong bg-background text-foreground data-[side=right]:w-[min(28rem,100vw)] data-[side=right]:sm:max-w-none max-[480px]:data-[side=right]:w-screen max-[480px]:data-[side=right]:border-l-0"
      >
        <SheetHeader className="gap-0 border-b border-border px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4">
          <span className="font-mono text-[0.6rem] font-bold tracking-[0.18em] text-primary uppercase">
            {t("mobileNav.eyebrow")}
          </span>
          <SheetTitle className="mt-[0.35rem] font-display text-xl font-bold tracking-[-0.02em]">
            {t("mobileNav.title")}
          </SheetTitle>
          <SheetDescription className="mt-[0.3rem] max-w-[34ch] text-xs leading-[1.45] text-fg-muted">
            {t("mobileNav.description")}
          </SheetDescription>
        </SheetHeader>
        <nav
          aria-label={t("mobileNav.allDestinations")}
          className="flex-1 overflow-y-auto overscroll-contain px-4 pt-[0.35rem] pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        >
          {MOBILE_DRAWER_SECTIONS.map((section) => (
            <section
              key={section.id}
              aria-labelledby={`mobile-nav-${section.id}`}
              className="py-4 not-first:border-t not-first:border-border"
            >
              <div className="flex items-baseline justify-between gap-4 px-1 pb-[0.55rem]">
                <h2
                  id={`mobile-nav-${section.id}`}
                  className="font-mono text-[0.65rem] font-bold tracking-[0.15em] text-foreground uppercase"
                >
                  {navName(section, translate)}
                </h2>
                <span className="font-mono text-[0.58rem] text-fg-muted">{navDescription(section, translate)}</span>
              </div>
              <div className="grid gap-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActiveNavItem(pathname, item);
                  const Destination = item.external ? "a" : Link;
                  return (
                    <Destination
                      key={item.id}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "grid min-h-[3.75rem] grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-3 rounded-[0.6rem] border border-transparent p-[0.55rem] text-fg-secondary outline-none hover:border-border hover:bg-surface-2 focus-visible:border-border focus-visible:bg-surface-2",
                        active && "border-border bg-surface-2",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-9 place-items-center rounded-lg border border-border text-fg-muted [&_svg]:size-[1.05rem] [&_svg]:stroke-[1.8]",
                          active && "border-primary/35 text-primary",
                        )}
                      >
                        <Icon aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <strong className="block text-[0.78rem] leading-[1.2] font-semibold">
                          {navName(item, translate)}
                          {item.beta && <sup className="ml-1 font-mono text-[0.5rem] text-primary uppercase">{t("nav.beta")}</sup>}
                        </strong>
                        <small className="mt-1 block text-[0.68rem] leading-[1.35] text-fg-muted">
                          {navDescription(item, translate)}
                        </small>
                      </span>
                    </Destination>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
