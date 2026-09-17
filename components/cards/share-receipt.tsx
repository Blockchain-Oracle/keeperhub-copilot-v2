"use client";

import { Copy, ExternalLink, Link2Off, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import type { ShareResponse } from "@/app/api/receipts/share/route";
import { Menu, MenuContent, MenuGroup, MenuItem, MenuLinkItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { useErrorMessage } from "@/lib/i18n/use-translate";
import { cn } from "@/lib/utils";

/*
 * Share a receipt (decision 37). Masayume features/games/duel/
 * DuelResultModal.tsx: copy the link, "Copied" for two seconds; its share card
 * hands a phone's share sheet the link where one exists (useShareCard.ts). Our
 * ui/menu carries the choices: copy, share, open, and Stop sharing once a link
 * is live, with one plain line on what the link shows. The link is made on the
 * first copy, never just by opening the menu. Signed out, or for a receipt that
 * can't be shared, the button isn't there.
 */

type Target = { ledgerId: string } | { toolCallId: string };

type Status =
  | { state: "unknown" }
  | { state: "loading" }
  | { state: "ready"; url: string | null }
  | { state: "hidden" };

/* A failed call carries the route's code and words; none when the route never answered. */
type Call = { ok: true; body: ShareResponse } | { ok: false; status: number; code?: string; message?: string };

async function callShare(method: "GET" | "POST" | "DELETE", target: Target): Promise<Call> {
  try {
    const res =
      method === "GET"
        ? await fetch(`/api/receipts/share?${new URLSearchParams(target)}`, { cache: "no-store" })
        : await fetch("/api/receipts/share", {
            method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(target),
          });
    const body = (await res.json().catch(() => ({}))) as Partial<ShareResponse> & { error?: { code?: string; message?: string } };
    if (!res.ok) {
      return { ok: false, status: res.status, code: body.error?.code, message: body.error?.message };
    }
    return { ok: true, body: { shareable: body.shareable === true, url: typeof body.url === "string" ? body.url : null } };
  } catch {
    return { ok: false, status: 0 };
  }
}

export function ShareReceipt({
  ledgerId,
  toolCallId,
  compact = false,
}: {
  ledgerId?: string;
  toolCallId?: string;
  /** Icon only, for a table row. */
  compact?: boolean;
}) {
  const t = useTranslations("cards");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const [status, setStatus] = useState<Status>({ state: "unknown" });
  const [copied, setCopied] = useState(false);
  const busy = useRef(false);

  const target: Target | null = ledgerId !== undefined ? { ledgerId } : toolCallId !== undefined ? { toolCallId } : null;
  if (target === null || status.state === "hidden") return null;
  const url = status.state === "ready" ? status.url : null;

  function giveUp(call: Extract<Call, { ok: false }>): void {
    if (call.status === 401 || call.status === 404 || call.status === 409) {
      setStatus({ state: "hidden" });
    } else {
      const description =
        call.status === 0 ? t("share.offline") : errorMessage(call.code, call.message ?? t("share.unreachable"));
      toast.add({ type: "error", title: t("share.failed"), description });
      setStatus({ state: "unknown" });
    }
  }

  async function check(forTarget: Target) {
    setStatus({ state: "loading" });
    const call = await callShare("GET", forTarget);
    if (!call.ok) return giveUp(call);
    setStatus(call.body.shareable ? { state: "ready", url: call.body.url } : { state: "hidden" });
  }

  async function ensureLink(forTarget: Target): Promise<string | null> {
    if (url !== null) return url;
    const call = await callShare("POST", forTarget);
    if (!call.ok) {
      giveUp(call);
      return null;
    }
    setStatus({ state: "ready", url: call.body.url });
    return call.body.url;
  }

  async function copy(forTarget: Target) {
    if (busy.current) return;
    busy.current = true;
    try {
      const link = await ensureLink(forTarget);
      if (link === null) return;
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.add({ title: t("share.copiedTitle"), description: t("share.copiedBody") });
      } catch {
        toast.add({ title: t("share.readyTitle"), description: link });
      }
    } finally {
      busy.current = false;
    }
  }

  async function shareSheet(forTarget: Target) {
    const link = await ensureLink(forTarget);
    if (link !== null) await navigator.share({ url: link, title: t("share.sheetTitle") }).catch(() => {});
  }

  async function stop(forTarget: Target) {
    const call = await callShare("DELETE", forTarget);
    if (!call.ok) return giveUp(call);
    setStatus({ state: "ready", url: null });
    toast.add({ title: t("share.offTitle"), description: t("share.offBody") });
  }

  const canShareSheet = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <Menu
      modal={false}
      onOpenChange={(open) => {
        if (open && status.state === "unknown") void check(target);
      }}
    >
      <MenuTrigger
        aria-label={compact ? t("share.ariaLabel") : undefined}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border text-fg-secondary transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-popup-open:border-border-strong data-popup-open:text-foreground",
          compact ? "size-7 justify-center" : "px-3 py-1 text-[12.5px]",
        )}
      >
        <Share2 aria-hidden className="size-3.5" />
        {!compact && (copied ? tc("copied") : t("share.share"))}
      </MenuTrigger>
      <MenuContent sideOffset={8} className="w-72">
        <MenuGroup>
          {status.state === "loading" ? (
            <p role="status" className="px-3 py-2.5 font-mono text-[11px] text-fg-muted">
              {t("share.checking")}
            </p>
          ) : (
            <>
              <MenuItem onClick={() => void copy(target)} className="py-2 text-[13px]">
                <Copy aria-hidden className="size-3.5" />
                {url !== null ? t("share.copyLink") : t("share.createAndCopy")}
              </MenuItem>
              {canShareSheet && (
                <MenuItem onClick={() => void shareSheet(target)} className="py-2 text-[13px]">
                  <Share2 aria-hidden className="size-3.5" />
                  {t("share.shareSheet")}
                </MenuItem>
              )}
              {url !== null && (
                <MenuLinkItem render={<a href={url} target="_blank" rel="noreferrer" />} className="py-2 text-[13px]">
                  <ExternalLink aria-hidden className="size-3.5" />
                  {t("share.openLink")}
                </MenuLinkItem>
              )}
              {url !== null && (
                <MenuItem
                  onClick={() => void stop(target)}
                  className="py-2 text-[13px] text-destructive data-highlighted:text-destructive"
                >
                  <Link2Off aria-hidden className="size-3.5" />
                  {t("share.stop")}
                </MenuItem>
              )}
            </>
          )}
        </MenuGroup>
        <MenuSeparator />
        <p className="px-4 pt-1 pb-3 text-[11.5px] leading-snug text-fg-muted">
          {t("share.explainer")}
        </p>
      </MenuContent>
    </Menu>
  );
}
