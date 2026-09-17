"use client"

import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"

import { cn } from "@/lib/utils"

/*
 * Dropdown menu. Masayume has no ui/menu file — it uses Base UI Menu inline in
 * components/shell/header/DesktopNavMenu.tsx, styled by styles/navigation.css.
 * This wrapper carries that grammar: 18px offset, end-aligned, a panel capped
 * at the space Base UI reports and scrolling inside itself, and the enter/leave
 * of opacity 160ms + transform 200ms from translateY(-0.4rem) scale(.98).
 * Paint is Portaldot's WalletPill menu (border-border-strong, bg-card/95, blur).
 */

function Menu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="menu" {...props} />
}

function MenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="menu-trigger" {...props} />
}

function MenuContent({
  className,
  side = "bottom",
  sideOffset = 18,
  align = "end",
  alignOffset = 0,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-[920] outline-none"
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
      >
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={cn(
            "max-h-(--available-height) max-w-[calc(100vw-2rem)] origin-(--transform-origin) overflow-x-hidden overflow-y-auto overscroll-contain rounded-[0.75rem] border border-border-strong bg-card/95 text-foreground backdrop-blur outline-none",
            "[transition:opacity_160ms_cubic-bezier(0.4,0,0.2,1),transform_200ms_cubic-bezier(0.22,1,0.36,1)]",
            "data-starting-style:opacity-0 data-starting-style:[transform:translateY(-0.4rem)_scale(0.98)] data-ending-style:opacity-0 data-ending-style:[transform:translateY(-0.4rem)_scale(0.98)]",
            className
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function MenuGroup({ className, ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="menu-group" className={cn("min-w-0 p-[0.55rem]", className)} {...props} />
}

function MenuGroupLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="menu-group-label"
      className={cn(
        "mb-[0.45rem] px-[0.45rem] font-mono text-[0.62rem] font-bold tracking-[0.14em] text-fg-muted uppercase",
        className
      )}
      {...props}
    />
  )
}

const itemClassName =
  "flex w-full min-w-0 cursor-default items-center gap-[0.65rem] rounded-[0.5rem] border border-transparent p-[0.7rem] text-left text-fg-secondary outline-none transition-[border-color,background-color,color] duration-160 ease-[cubic-bezier(0.4,0,0.2,1)] data-highlighted:border-border data-highlighted:bg-surface-2 data-highlighted:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50 aria-[current=page]:border-border aria-[current=page]:bg-surface-2 aria-[current=page]:text-foreground [&_svg]:shrink-0"

function MenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return <MenuPrimitive.Item data-slot="menu-item" className={cn(itemClassName, className)} {...props} />
}

function MenuLinkItem({ className, ...props }: MenuPrimitive.LinkItem.Props) {
  return <MenuPrimitive.LinkItem data-slot="menu-link-item" className={cn(itemClassName, className)} {...props} />
}

function MenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  return <MenuPrimitive.RadioGroup data-slot="menu-radio-group" {...props} />
}

function MenuRadioItem({ className, ...props }: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="menu-radio-item"
      className={cn(itemClassName, "data-checked:text-foreground", className)}
      {...props}
    />
  )
}

function MenuRadioItemIndicator({ className, ...props }: MenuPrimitive.RadioItemIndicator.Props) {
  return (
    <MenuPrimitive.RadioItemIndicator
      data-slot="menu-radio-item-indicator"
      className={cn("text-primary", className)}
      {...props}
    />
  )
}

function MenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return <MenuPrimitive.Separator data-slot="menu-separator" className={cn("my-1 h-px bg-border", className)} {...props} />
}

export {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuLinkItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuSeparator,
}
