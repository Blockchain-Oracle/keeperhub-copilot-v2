"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"

/*
 * Modal. Masayume has no ui/dialog file — it uses Base UI Dialog inline
 * (features/onboarding/Tutorial.tsx) and one shared grammar in styles/modal.css:
 * a scrim, a 448px panel, a head / scrolling body / fixed footer, an eyebrow row,
 * and a round close button top-right. That grammar is kept here.
 *
 * The shell and motion are Portaldot's wallet picker (components/wallet-picker.tsx):
 * background/70 scrim with blur fading 180ms, a bezel card (p-1 outer, 22px inner)
 * that rises from y 24 / scale .98 over 320ms on the print curve, bottom sheet on
 * phones and centred from `sm`.
 */

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & { showCloseButton?: boolean }) {
  const t = useTranslations("common")
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="dialog-overlay"
        className="fixed inset-0 z-[1000] bg-background/70 backdrop-blur-md transition-opacity duration-180 data-ending-style:opacity-0 data-starting-style:opacity-0"
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed inset-x-0 bottom-0 z-[1000] mx-auto flex max-h-[90dvh] w-full max-w-[448px] flex-col overflow-hidden rounded-t-3xl border border-border-strong/70 bg-card p-1 outline-none sm:inset-0 sm:m-auto sm:h-fit sm:rounded-3xl",
          "shadow-[0_40px_100px_-20px_oklch(0_0_0_/_70%)] ring-1 ring-white/5",
          "[transition:opacity_320ms_var(--ease-print),transform_320ms_var(--ease-print)] data-ending-style:translate-y-6 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:translate-y-6 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
          className
        )}
        {...props}
      >
        <div className="relative flex min-h-0 flex-1 flex-col rounded-[22px] border border-border bg-card/90">
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              aria-label={t("close")}
              className="absolute top-4 right-4 z-10 flex size-7 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <X className="size-3.5" />
            </DialogPrimitive.Close>
          )}
        </div>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("px-7 pt-7", className)} {...props} />
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-7 py-4", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-footer" className={cn("flex flex-col gap-2 px-7 pb-7", className)} {...props} />
}

function DialogEyebrow({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-eyebrow"
      className={cn(
        "mb-1 flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] text-fg-muted uppercase",
        className
      )}
      {...props}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-telemetry glow-telemetry" />
      {children}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "pr-8 font-display text-[24px] leading-tight font-medium tracking-tight text-foreground",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("mt-1.5 text-[13px] text-fg-secondary", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogEyebrow,
  DialogTitle,
  DialogDescription,
}
