"use client";

import { useRouter } from "next/navigation";

import { RECEIPT_EVENT, type ReceiptDetail } from "@/components/shell/funding/receipt-announce";
import { OPEN_FUNDS_EVENT } from "@/components/shell/header/money-pill";
import { replayTutorial } from "@/components/shell/onboarding/use-first-run";
import { useSignIn } from "@/components/shell/sign-in/sign-in";
import { announceRecovery } from "@/components/shell/write-recovery";
import { Button } from "@/components/ui/button";
import type { RecoveredWrite } from "@/lib/execution";

/*
 * Opens each sign-in and onboarding surface on demand, so its look can be checked
 * without a first visit, a real receipt or an interrupted write. The welcome and
 * the recovery notices are previews with sample outcomes, fired under a "preview"
 * org so the real one-time welcome is left untouched.
 */

const PREVIEW_ORG = "preview";

const SAMPLE_RECOVERY: RecoveredWrite[] = [
  { ledgerId: "preview-1", opId: "execute_transfer", outcome: "landed", txHash: null },
  { ledgerId: "preview-2", opId: "execute_contract_call", outcome: "failed", txHash: null },
  { ledgerId: "preview-3", opId: "execute_transfer", outcome: "expired", txHash: null },
  { ledgerId: "preview-4", opId: "execute_transfer", outcome: "pending", txHash: null },
];

export function OnboardingReview() {
  const router = useRouter();
  const { openSignIn } = useSignIn();

  const surfaces = [
    { name: "Sign-in modal", note: "What every Connect opens.", run: () => openSignIn() },
    {
      name: "Tutorial",
      note: "Forgets it was seen, then opens Chat.",
      run: () => {
        replayTutorial();
        router.push("/app");
      },
    },
    { name: "Add funds", note: "What the money pill's + opens.", run: () => window.dispatchEvent(new Event(OPEN_FUNDS_EVENT)) },
    {
      name: "First-receipt welcome",
      note: "Preview. Normally once per org.",
      run: () =>
        window.dispatchEvent(
          new CustomEvent<ReceiptDetail>(RECEIPT_EVENT, { detail: { opId: "execute_transfer", txHash: null, firstTime: true } }),
        ),
    },
    {
      name: "Recovery notices",
      note: "Preview. Landed, failed, expired, still checking.",
      run: () => announceRecovery(PREVIEW_ORG, SAMPLE_RECOVERY),
    },
  ];

  return (
    <section className="mx-auto max-w-[62ch] px-5 py-12">
      <p className="font-mono text-[11px] tracking-[0.16em] text-primary uppercase">Review</p>
      <h1 className="mt-3 font-display text-[28px] leading-[1.15] font-bold tracking-[-0.02em] text-foreground">
        Sign-in and onboarding
      </h1>
      <ul className="mt-6 divide-y divide-border border-y border-border">
        {surfaces.map((surface) => (
          <li key={surface.name} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{surface.name}</p>
              <p className="font-mono text-[11px] text-fg-muted">{surface.note}</p>
            </div>
            <Button variant="outline" onClick={surface.run}>
              Open
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
