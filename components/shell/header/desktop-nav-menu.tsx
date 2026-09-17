"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";

import { Menu, MenuContent, MenuGroup, MenuGroupLabel, MenuLinkItem, MenuTrigger } from "@/components/ui/menu";
import { useTranslate } from "@/lib/i18n/use-translate";
import { cn } from "@/lib/utils";

import { isActiveNavGroup, isActiveNavItem, navDescription, navName, type NavGroup } from "./nav-items";

/*
 * Masayume components/shell/header/DesktopNavMenu.tsx + styles/navigation.css
 * (`.nav-menu-*`) and part-02.css (`.nav-link`). Same structure: an intro row,
 * one 17rem column per section, icon box + name + description per item. The
 * panel, motion and scroll-inside come from ui/menu (the same grammar); hairlines
 * and fills are Portaldot's border/surface tokens, vermilion becomes primary.
 */

export const navLinkClassName =
  "relative text-[13px] font-medium tracking-[0.01em] text-fg-secondary [transition:color_200ms_cubic-bezier(0.4,0,0.2,1),letter-spacing_300ms_cubic-bezier(0.4,0,0.2,1)] after:absolute after:bottom-[-6px] after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-foreground after:transition-transform after:duration-[320ms] after:ease-[cubic-bezier(0.4,0,0.2,1)] after:content-[''] hover:tracking-[0.04em] hover:text-foreground hover:after:scale-x-100 data-active:text-foreground";

type DesktopNavMenuProps = {
  group: NavGroup;
  pathname: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DesktopNavMenu({ group, pathname, open, onOpenChange }: DesktopNavMenuProps) {
  const active = isActiveNavGroup(pathname, group);
  const t = useTranslations("shell.nav");
  const translate = useTranslate();

  return (
    <Menu open={open} onOpenChange={onOpenChange} modal={false}>
      <MenuTrigger
        data-active={active || undefined}
        className={cn(navLinkClassName, "group/trigger inline-flex cursor-pointer items-center gap-[0.3rem] border-0 bg-transparent p-0")}
      >
        {navName(group, translate)}
        <ChevronDown
          aria-hidden="true"
          className="size-[0.8rem] stroke-2 transition-transform duration-180 ease-[cubic-bezier(0.4,0,0.2,1)] group-data-popup-open/trigger:rotate-180"
        />
      </MenuTrigger>
      {/* As wide as its sections — one column each — so a one-section group is one column. */}
      <MenuContent
        sideOffset={18}
        align="end"
        className="w-[min(calc(var(--nav-sections,3)*17rem+1.1rem),calc(100vw-2rem))] max-[720px]:hidden"
        style={{ "--nav-sections": group.sections.length } as CSSProperties}
      >
        <div className="flex items-baseline justify-between gap-8 border-b border-border px-[1.1rem] py-4">
          <span className="font-display text-base font-bold">{navName(group, translate)}</span>
          <p className="font-mono text-[0.65rem] tracking-[0.02em] text-fg-muted">{navDescription(group, translate)}</p>
        </div>
        <div className="grid grid-cols-[repeat(var(--nav-sections,3),minmax(0,1fr))] p-[0.55rem]">
          {group.sections.map((section) => (
            <MenuGroup key={section.id} className="not-first:border-l not-first:border-border">
              <MenuGroupLabel className="flex items-baseline justify-between gap-2">
                <span className="text-primary">{navName(section, translate)}</span>
                <small className="truncate text-[0.56rem] font-normal tracking-normal normal-case">
                  {navDescription(section, translate)}
                </small>
              </MenuGroupLabel>
              <div className="grid gap-[0.15rem]">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const itemActive = isActiveNavItem(pathname, item);
                  return (
                    <MenuLinkItem
                      key={item.id}
                      render={item.external ? <a href={item.href} /> : <Link href={item.href} />}
                      closeOnClick
                      aria-current={itemActive ? "page" : undefined}
                      className="grid grid-cols-[2rem_minmax(0,1fr)] items-start hover:border-border hover:bg-surface-2 hover:text-foreground focus-visible:border-primary"
                    >
                      <span
                        className={cn(
                          "grid size-8 place-items-center rounded-[0.4rem] border border-border text-fg-muted [&_svg]:size-4 [&_svg]:stroke-[1.8]",
                          itemActive && "border-primary/35 text-primary",
                        )}
                      >
                        <Icon aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <strong className="block text-xs leading-[1.2] font-semibold">
                          {navName(item, translate)}
                          {item.beta && <sup className="ml-1 font-mono text-[0.48rem] text-primary uppercase">{t("beta")}</sup>}
                        </strong>
                        <small className="mt-1 block text-[0.66rem] leading-[1.35] text-fg-muted">
                          {navDescription(item, translate)}
                        </small>
                      </span>
                    </MenuLinkItem>
                  );
                })}
              </div>
            </MenuGroup>
          ))}
        </div>
      </MenuContent>
    </Menu>
  );
}
