"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { AddressQR } from "@/components/data/address-qr";
import { TokenMark } from "@/components/data/marks";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogEyebrow,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { explorerAddressUrl, getChain } from "@/lib/chains";
import { formatDecimalString } from "@/lib/format";

import { useAccount } from "../account-context";
import { OPEN_FUNDS_EVENT } from "../header/money-pill";
import { useNetwork } from "../network-context";
import { ConnectButton } from "../sign-in/connect-button";

/*
 * Masayume features/funding/AddFunds.tsx + FundingProgress.tsx + funding.css
 * (`.fund-*`), with Portaldot's components/cards/address-qr.tsx. Opened by the
 * money pill's `+` or anything dispatching the open-funds event. Eyebrow, title
 * and body; "Connect first" with the real Connect when signed out; the account
 * row whose address copies ("copied ✓"); the balances grid; one CTA; a footer.
 *
 * Changes: KeeperHub has no faucet to mint from, so funding means sending to
 * the org wallet — the QR (Portaldot) sits under the address, and the CTA is
 * "Check balance again" until the wallet holds something, then "Start in chat"
 * (Masayume's done state, "Trade from wallet →"). The balances are the selected
 * network's native token and up to three of its tokens, as KeeperHub reports
 * them. External faucet links are left out: no reference or KeeperHub source
 * names faucets we can vouch for. The frame is ui/dialog (Masayume's modal
 * grammar in Portaldot's shell), which the hand-rolled `.fund-modal` duplicates.
 * Paint: gray → fg tokens, white CTA → foreground, vermilion → primary.
 */

const DP = 4;
const TOKEN_CELLS = 3;
const COPIED_MS = 1500;

const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;
const holdsSomething = (decimal: string) => /[1-9]/.test(decimal);

export function AddFunds() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { identity, balance, refresh } = useAccount();
  const { chainId } = useNetwork();
  const t = useTranslations("shell.addFunds");

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_FUNDS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_FUNDS_EVENT, onOpen);
  }, []);

  const chain = getChain(chainId);
  const reading = balance.status === "ok" ? balance.balance : null;
  const networkName = reading?.chainName ?? chain.name;
  const symbol = reading?.symbol || chain.nativeSymbol;
  const testnet = reading?.isTestnet ?? chain.testnet;
  const address = identity.status === "signed-in" ? identity.walletAddress : null;
  const explorer = address ? explorerAddressUrl(chainId, address) : null;

  const balanceText =
    balance.status === "ok"
      ? null
      : balance.status === "loading"
        ? t("checking")
        : t("unavailable");
  const cells = reading
    ? [
        {
          label: t("nativeOn", { symbol, network: networkName }),
          value: `${formatDecimalString(reading.nativeBalance, { maxDp: DP }) ?? "—"} ${symbol}`,
          mark: symbol,
        },
        ...reading.tokens.slice(0, TOKEN_CELLS).map((token) => ({
          label: token.name || token.symbol,
          value: `${formatDecimalString(token.balance, { maxDp: DP }) ?? "—"} ${token.symbol}`,
          mark: token.symbol,
        })),
      ]
    : [{ label: t("nativeOn", { symbol, network: networkName }), value: balanceText ?? "—", mark: symbol }];
  const funded =
    reading !== null && (holdsSomething(reading.nativeBalance) || reading.tokens.some((token) => holdsSomething(token.balance)));

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      /* clipboard refused: the QR still carries the address */
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogEyebrow>{t("eyebrow", { network: testnet ? "testnet" : "mainnet" })}</DialogEyebrow>
          <DialogTitle className="mt-3">{t("title")}</DialogTitle>
          <DialogDescription className="text-[14px] leading-relaxed">
            {t("description", { symbol, network: networkName })}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {identity.status !== "signed-in" ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center font-mono text-xs text-fg-muted">
              <p>{t("connectFirst")}</p>
              <ConnectButton onBeforeOpen={() => setOpen(false)} />
            </div>
          ) : address === null ? (
            <p className="py-6 text-center font-mono text-xs leading-relaxed text-fg-muted">
              {t("noWallet")}
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                <span className="font-mono text-[11px] text-fg-muted">{t("orgWallet")}</span>
                <button
                  type="button"
                  onClick={copy}
                  aria-label={t("copyAddress")}
                  className="font-mono text-[12px] text-fg-secondary transition-colors duration-200 hover:text-foreground"
                >
                  {copied ? t("copied") : `${short(address)} ⧉`}
                </button>
              </div>

              <div className="flex justify-center">
                <AddressQR value={address} size={132} caption={t("scanToSend")} />
              </div>

              <dl className="grid grid-cols-2 gap-3" aria-live="polite">
                {cells.map((cell) => (
                  <div key={cell.label} className="min-w-0 rounded-lg border border-border p-2.5">
                    <dt className="flex items-center gap-1.5 truncate text-[11px] text-fg-muted">
                      <TokenMark symbol={cell.mark} size={12} />
                      {cell.label}
                    </dt>
                    <dd className="mt-1 truncate font-mono text-[13px] text-foreground tabular-nums">{cell.value}</dd>
                  </div>
                ))}
              </dl>

              {funded ? (
                <Link
                  href="/app"
                  onClick={() => setOpen(false)}
                  className="block w-full rounded-full bg-primary py-3 text-center font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary-press"
                >
                  {t("startInChat")} →
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={refresh}
                  className="inline-flex w-full items-center justify-center rounded-full bg-foreground py-3 font-semibold text-background transition-transform duration-150 hover:scale-[1.02] active:scale-[0.97]"
                >
                  {t("checkAgain")}
                </button>
              )}
            </>
          )}
        </DialogBody>

        {address !== null && identity.status === "signed-in" && (
          <DialogFooter className="items-center gap-1.5 border-t border-border pt-4 text-center">
            <p className="font-mono text-[11px] text-fg-muted">{t("rereads")}</p>
            {explorer && (
              <a
                href={explorer}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] text-fg-muted transition-colors duration-200 hover:text-primary"
              >
                {t("viewOnExplorer")} ↗
              </a>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
