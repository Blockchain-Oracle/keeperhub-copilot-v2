"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";

import { StatusTicker } from "@/components/landing/status-ticker";
import { KeeperHubMark } from "@/components/ui/keeperhub-mark";
import { integrations, registryMeta } from "@/lib/registry/generated/meta";

import { useAccount } from "../account-context";
import { usePlatformChains } from "../use-platform-chains";
import { useSignIn } from "./sign-in";

/*
 * Portaldot components/app/wallet-gate.tsx — the identity card that stands in
 * for the chat when nobody is signed in: the one glass surface, a violet glow
 * beneath, the meta strip with a live ticker, the slowly turning hexagon, the
 * display headline with one cyan italic word, one pill, a perforated footer.
 *
 * Changes: the pill opens the sign-in modal ("Connect KeeperHub"); the ticker
 * is our StatusTicker; the copy says what signs here; the footer's figures are
 * real (the action registry and KeeperHub's live network list) where
 * Portaldot's were hard-coded. When KeeperHub is unreachable the pill retries.
 */

const INTEGRATION_COUNT = Object.keys(integrations).length;

export function SignInGate() {
  const { identity, refresh } = useAccount();
  const { openSignIn, connecting } = useSignIn();
  const chains = usePlatformChains();
  const t = useTranslations("shell");
  const unreachable = identity.status === "unavailable";

  return (
    <div className="flex min-h-[68vh] flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md"
      >
        {/* violet glow underneath the card */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 translate-y-6 scale-95 rounded-[28px] blur-3xl"
          style={{ background: "radial-gradient(closest-side, color-mix(in oklch, var(--primary) 32%, transparent), transparent 70%)" }}
        />

        <div className="overflow-hidden rounded-[26px] border border-border-strong/70 bg-card/65 p-1 shadow-[0_36px_80px_-30px_oklch(0_0_0_/_70%)] ring-1 ring-white/5 backdrop-blur-xl">
          <div className="rounded-[22px] border border-border bg-card/40 px-7 py-8 backdrop-blur-2xl">
            {/* meta strip — identity card top */}
            <div className="mb-7 flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
              <span className="inline-flex items-center gap-2">
                <span aria-hidden className="size-1.5 rounded-full bg-telemetry glow-telemetry" />
                {t("signInGate.eyebrow")}
              </span>
              <div className="origin-right scale-[0.85]">
                <StatusTicker />
              </div>
            </div>

            {/* Sits where the identicon will materialize once you are signed in.
                The mark waits in the middle with its shard banking; the ring
                turns slowly around it. */}
            <div className="mx-auto mb-6 flex size-24 items-center justify-center rounded-full border border-border-strong/60 bg-surface-2/60">
              <div className="relative flex size-16 items-center justify-center">
                <motion.svg
                  viewBox="0 0 96 96"
                  className="absolute inset-0 size-full"
                  aria-hidden
                  animate={{ rotate: 360 }}
                  transition={{ duration: 28, ease: "linear", repeat: Infinity }}
                >
                  <polygon
                    points="48,10 81,29 81,67 48,86 15,67 15,29"
                    stroke="color-mix(in oklch, var(--primary) 45%, transparent)"
                    strokeWidth="1.2"
                    fill="none"
                  />
                </motion.svg>
                <KeeperHubMark state="thinking" className="relative h-8 text-neon" />
              </div>
            </div>

            <h1 className="text-center font-display text-[28px] leading-tight font-medium tracking-tight text-foreground">
              {t.rich("signInGate.title", {
                em: (chunks) => <em className="font-normal text-telemetry italic">{chunks}</em>,
              })}
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-center text-sm text-fg-secondary">
              {t.rich("signInGate.body", {
                highlight: (chunks) => <span className="text-foreground">{chunks}</span>,
              })}
            </p>

            <div className="mt-7 flex flex-col items-center gap-3">
              {unreachable ? (
                <button
                  type="button"
                  onClick={refresh}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-pending transition-[transform,border-color] hover:-translate-y-px hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {t("signInGate.retry")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openSignIn()}
                  disabled={connecting}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-[var(--lift-action-lg)] transition-[transform,filter] hover:-translate-y-px hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                >
                  <KeyRound className="size-4" />
                  {connecting ? t("connect.connecting") : t("connect.connect")}
                </button>
              )}
              <p className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
                <ShieldCheck className="size-3.5 text-primary" /> {t("signInGate.writesWait")}
              </p>
            </div>

            <div className="perforation mt-7" />
            <div className="mt-3 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">
              <span>{t("signInGate.counts", { actions: registryMeta.actionCount, integrations: INTEGRATION_COUNT })}</span>
              <span>
                {chains.status === "ready"
                  ? t("signInGate.networks", { count: chains.chains.length })
                  : t("signInGate.networksUnknown")}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
