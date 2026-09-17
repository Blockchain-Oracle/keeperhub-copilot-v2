"use client";

import { Dialog } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useTranslate } from "@/lib/i18n/use-translate";
import { cn } from "@/lib/utils";

import { useAccount } from "../account-context";
import { ConnectButton } from "../sign-in/connect-button";
import { tutorialSteps, tutorialUi } from "./steps";
import { useFirstRun } from "./use-first-run";

/*
 * The first-run walkthrough — Masayume features/onboarding/Tutorial.tsx +
 * TutorialChoice.tsx + styles/tutorial.css. Base UI Dialog; bottom sheet on
 * phones, centred from 640px; focus on the dialog itself, not Close; each step
 * re-keyed so it re-animates; progress pills; Skip and Next; the last screen
 * ends on the real Connect and carries no Next.
 *
 * Changes: Masayume closes when a wallet connects on the last screen. Here
 * connecting leaves the page for KeeperHub, so pressing Connect marks the
 * walkthrough seen and closes it before the sign-in modal opens (two modal
 * dialogs never stack); arriving on the last screen already signed in closes
 * it too. tutorial.css became utilities (the keyframe lives in shell.css).
 * Paint: neutral-900 → card, white hairlines → border, gray-400/500/600 →
 * fg-secondary/fg-muted, vermilion → primary.
 */

export function Tutorial() {
  const { open, dismiss } = useFirstRun();
  const [step, setStep] = useState(0);
  const { identity } = useAccount();
  const popupRef = useRef<HTMLDivElement>(null);
  const t = useTranslate();
  const steps = tutorialSteps(t);
  const ui = tutorialUi(t);

  const isLast = step === steps.length - 1;
  const current = steps[step];
  const signedIn = identity.status === "signed-in";

  // The walkthrough ends by connecting; already connected on the closing screen means done.
  useEffect(() => {
    if (open && isLast && signedIn) dismiss();
  }, [open, isLast, signedIn, dismiss]);

  if (!open || !current) return null;

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[9500] bg-background/70 backdrop-blur-[4px]" />
        <Dialog.Popup
          ref={popupRef}
          /* Default focus would land on Close, so a welcome screen would open by pointing
             at the way out. Focus the dialog itself; Tab reaches Skip and Next in order. */
          initialFocus={popupRef}
          className="fixed bottom-4 left-1/2 z-[9500] max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-xl -translate-x-1/2 overflow-x-hidden overflow-y-auto rounded-2xl border border-border bg-card/95 backdrop-blur-xl outline-none sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2"
        >
          {/* key={step} restarts the entry animation */}
          <div
            key={step}
            className="animate-[tutorial-step-in_200ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none"
          >
            <div className="flex items-start justify-between gap-3 px-8 pt-8 pb-3">
              <Dialog.Title className="font-display text-2xl font-bold text-foreground">{current.title}</Dialog.Title>
              <Dialog.Close
                render={<Button variant="ghost" size="icon-sm" className="-mt-1 -mr-2 text-fg-muted hover:text-foreground" />}
                aria-label={ui.close}
              >
                <XIcon />
              </Dialog.Close>
            </div>

            <div className="px-8 py-5">
              {current.choice ? (
                <>
                  <div className="rounded-xl border border-border bg-foreground/[0.02] px-4 py-4">
                    <div className="mb-1 font-mono text-[10px] tracking-[0.16em] text-fg-muted uppercase">
                      {ui.lastStep}
                    </div>
                    <p className="mb-0.5 text-sm font-semibold text-foreground">{ui.connectTitle}</p>
                    <p className="mb-3 text-xs leading-snug text-fg-muted">{ui.connectNote}</p>
                    <div className="flex justify-center">
                      <ConnectButton onBeforeOpen={dismiss} />
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] text-fg-muted">{current.description}</p>
                </>
              ) : (
                <Dialog.Description className="text-base leading-relaxed text-fg-secondary">
                  {current.description}
                </Dialog.Description>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between px-8 pb-8">
            <ol className="flex gap-1.5" aria-label={ui.progress(step + 1, steps.length)}>
              {steps.map((s, i) => (
                <li
                  key={s.title}
                  aria-current={i === step ? "step" : undefined}
                  className={cn(
                    "h-1 rounded-full transition-all",
                    i === step ? "w-6 bg-primary" : i < step ? "w-2 bg-foreground/20" : "w-2 bg-foreground/10",
                  )}
                />
              ))}
            </ol>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={dismiss} className="h-12 px-4 text-fg-muted hover:text-foreground">
                {ui.skip}
              </Button>
              {/* The closing screen ends on Connect, so it carries no Next of its own. */}
              {!current.choice && (
                <Button
                  className="h-12 rounded-lg px-5 text-sm font-bold tracking-wider uppercase"
                  onClick={() => (isLast ? dismiss() : setStep(step + 1))}
                >
                  {isLast ? ui.done : ui.next}
                </Button>
              )}
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
