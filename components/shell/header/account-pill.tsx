"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { useAccount } from "../account-context";
import { useSignIn } from "../sign-in/sign-in";
import { AccountMenu } from "./account-menu";

/*
 * Masayume components/shell/header/HeaderAccount.tsx states + part-03.css
 * (`.btn-primary`, `.btn-outline`), with the ≤720px and ≤420px collapse from
 * part-15.css and navigation.css. Inert and invisible until the session is
 * known; "Connect KeeperHub" when signed out, opening the sign-in modal; the
 * account chip and its menu when signed in.
 *
 * Changes: "Wrong network" has no equivalent here, so its outline slot is used
 * for "KeeperHub unreachable" (click retries). Connect shows "Connecting…"
 * while the browser leaves for KeeperHub.
 */

const connectClassName =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-[22px] py-[11px] text-[13px] leading-none font-semibold tracking-[0.02em] whitespace-nowrap text-primary-foreground transition-[transform,background-color] duration-180 ease-[cubic-bezier(0.4,0,0.2,1)] hover:scale-[1.02] hover:bg-primary-press active:scale-[0.98] disabled:cursor-default disabled:opacity-70 disabled:hover:scale-100";

const outlineClassName =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-transparent px-[22px] py-[11px] text-[13px] leading-none font-semibold tracking-[0.02em] whitespace-nowrap text-pending transition-[transform,border-color] duration-180 ease-[cubic-bezier(0.4,0,0.2,1)] hover:scale-[1.02] hover:border-border-strong active:scale-[0.98]";

export function AccountPill() {
  const { identity, refresh } = useAccount();
  const { connecting, openSignIn } = useSignIn();
  const t = useTranslations("shell.connect");

  // Before the session is known the control is present but inert, so nothing jumps.
  if (identity.status === "loading") {
    return (
      <span aria-hidden="true" className={cn(connectClassName, "invisible")}>
        {t("connect")}
      </span>
    );
  }

  if (identity.status === "signed-out") {
    return (
      <button type="button" disabled={connecting} onClick={() => openSignIn()} className={connectClassName}>
        {connecting ? t("connecting") : t("connect")}
      </button>
    );
  }

  if (identity.status === "unavailable") {
    return (
      <button type="button" onClick={refresh} className={outlineClassName}>
        {t("unreachable")}
      </button>
    );
  }

  return <AccountMenu walletAddress={identity.walletAddress} />;
}
