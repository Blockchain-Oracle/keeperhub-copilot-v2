"use client";

import { useTranslations } from "next-intl";

import { Address } from "@/components/data/address";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useAccount } from "../account-context";
import { useSignIn } from "./sign-in";

/*
 * Masayume features/markets/wallet/ConnectButton.tsx — the connect ladder, for
 * Connect buttons inside surfaces (the tutorial's last step, Add funds). Before
 * the session is known the control is present but inert; signed out it opens
 * the sign-in modal; "Connecting…" while the browser leaves for KeeperHub;
 * signed in, the accent dot and the short org wallet address.
 *
 * Changes: Masayume's "Wrong network" rung has no equivalent (the org wallet
 * signs on whatever network a card names), so the outline rung is "KeeperHub
 * unreachable" and retries. The signed-in rung is a label, not a button: there
 * is no account modal to open; the account menu lives in the header.
 * `onBeforeOpen` lets a surface close itself before the sign-in modal opens.
 */

const size = "h-12 rounded-full px-6 text-sm";

export function ConnectButton({ className, onBeforeOpen }: { className?: string; onBeforeOpen?: () => void }) {
  const { identity, refresh } = useAccount();
  const { connecting, openSignIn } = useSignIn();
  const t = useTranslations("shell.connect");

  if (identity.status === "loading") {
    return (
      <Button variant="secondary" aria-hidden="true" tabIndex={-1} className={cn(size, "invisible", className)}>
        {t("connect")}
      </Button>
    );
  }

  if (identity.status === "signed-out") {
    return (
      <Button
        disabled={connecting}
        className={cn(size, className)}
        onClick={() => {
          onBeforeOpen?.();
          openSignIn();
        }}
      >
        {connecting ? t("connecting") : t("connect")}
      </Button>
    );
  }

  if (identity.status === "unavailable") {
    return (
      <Button variant="outline" onClick={refresh} className={cn(size, "text-pending", className)}>
        {t("unreachable")}
      </Button>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2 bg-secondary text-secondary-foreground", size, className)}>
      <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
      {identity.walletAddress ? <Address value={identity.walletAddress} /> : t("noOrgWallet")}
    </span>
  );
}
