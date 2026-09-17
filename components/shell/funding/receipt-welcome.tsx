"use client";

import { Sparkles, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { RECEIPT_EVENT, type ReceiptDetail } from "./receipt-announce";

/*
 * Masayume features/funding/CreditWelcome.tsx + funding.css (`.credit-*`): a
 * one-time card, springing in with a badge that spins into place, auto-closed
 * after eight seconds because it is a moment, not a wall. Fired by an event,
 * never by a page.
 *
 * Changes: the moment is an org's first landed receipt rather than a first
 * faucet credit, so the copy is ours. Paint: #0c0c0f → card, profit → success,
 * gray → fg tokens, vermilion CTA → primary.
 */

const AUTO_CLOSE_MS = 8_000;

export function ReceiptWelcome() {
  const reduced = useReducedMotion();
  const t = useTranslations("shell.receiptWelcome");
  const tc = useTranslations("common");
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);

  useEffect(() => {
    const onReceipt = (event: Event) => {
      const detail = (event as CustomEvent<ReceiptDetail>).detail;
      if (!detail?.firstTime) return;
      setReceipt(detail);
    };
    window.addEventListener(RECEIPT_EVENT, onReceipt);
    return () => window.removeEventListener(RECEIPT_EVENT, onReceipt);
  }, []);

  useEffect(() => {
    if (!receipt) return;
    const timer = setTimeout(() => setReceipt(null), AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [receipt]);

  const close = () => setReceipt(null);
  return (
    <AnimatePresence>
      {receipt && (
        <motion.div
          className="fixed inset-0 z-[10020] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div className="absolute inset-0 bg-background/60 backdrop-blur-[4px]" onClick={close} />
          <motion.div
            className="relative w-full max-w-sm rounded-2xl border border-success/25 bg-card px-6 pt-7 pb-6 text-center"
            style={{ boxShadow: "0 24px 90px color-mix(in oklab, var(--color-success) 18%, transparent)" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="receipt-welcome-title"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: "spring", damping: 20, stiffness: 280 }}
          >
            <button
              type="button"
              onClick={close}
              aria-label={tc("close")}
              className="absolute top-3.5 right-3.5 rounded-full p-1 text-fg-muted transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
            <motion.div
              className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-success/30 bg-success/10 text-success"
              style={{ boxShadow: "0 0 28px color-mix(in oklab, var(--color-success) 25%, transparent)" }}
              initial={reduced ? { scale: 1 } : { scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", damping: 12, stiffness: 240, delay: 0.05 }}
            >
              <Sparkles className="size-6" />
            </motion.div>
            <span className="font-mono text-[10px] tracking-[0.22em] text-success/80 uppercase">{t("eyebrow")}</span>
            <h2
              id="receipt-welcome-title"
              className="mt-1.5 font-display text-2xl leading-[1.2] font-extrabold tracking-[-0.025em] text-foreground"
            >
              {t("title")}
            </h2>
            <p className="mt-2 mb-5 text-[13px] leading-relaxed text-fg-secondary">
              {t("body")}
            </p>
            <button
              type="button"
              onClick={close}
              className="block w-full rounded-full bg-primary py-3 text-center font-semibold text-primary-foreground transition-colors hover:bg-primary-press"
            >
              {t("keepGoing")} →
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
