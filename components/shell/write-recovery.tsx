"use client";

import { useEffect } from "react";

import type { RecoveredWrite } from "@/lib/execution";
import type { RecoverResponse } from "@/app/api/ledger/recover/route";
import { toast } from "@/components/ui/toast";
import { activityLabel } from "@/lib/activity";
import { englishTranslate, type Translate } from "@/lib/i18n/translate";
import { useTranslate } from "@/lib/i18n/use-translate";

import { useAccount } from "./account-context";
import { announceReceipt } from "./funding/receipt-announce";

/*
 * Masayume features/recovery/WriteRecovery.tsx + copy.ts. Once per visit, asks
 * about every write left open (a tab closed while its receipt was still being
 * polled) and says what it found, one toast per outcome and one for everything
 * still unanswered. Nothing is re-sent; the server moves a record only on
 * KeeperHub's answer.
 *
 * Changes: the check runs on the server (POST /api/ledger/recover) because the
 * record and the KeeperHub token live there; a write that turns out to have
 * landed also counts toward the first-receipt welcome. Asked once per org per
 * page load, and never cancelled on unmount, so React's development double-run
 * cannot swallow the answer.
 */

const asked = new Set<string>();

// An automation saved, changed, switched or deleted is not a receipt for the org wallet's first-receipt welcome; a run is.
function isAutomationChange(opId: string): boolean {
  return opId.startsWith("workflow/") && opId !== "workflow/run";
}

export function announceRecovery(orgId: string, results: readonly RecoveredWrite[], t: Translate = englishTranslate): void {
  let pending = 0;
  for (const result of results) {
    const name = activityLabel(result.opId, t);
    if (result.outcome === "landed") {
      const where = isAutomationChange(result.opId) ? "landedRecorded" : "landedReceipt";
      toast.add({
        title: t("shell.writeRecovery.landed"),
        description: t(`shell.writeRecovery.${where}`, { name }),
      });
      if (!isAutomationChange(result.opId)) announceReceipt(orgId, result.opId, result.txHash);
    } else if (result.outcome === "failed") {
      toast.add({
        type: "warning",
        title: t("shell.writeRecovery.failed"),
        description: t("shell.writeRecovery.failedDescription", { name }),
      });
    } else if (result.outcome === "expired") {
      toast.add({
        type: "warning",
        title: t("shell.writeRecovery.expired"),
        description: t("shell.writeRecovery.expiredDescription", { name }),
      });
    } else {
      pending += 1;
    }
  }
  if (pending > 0) {
    toast.add({
      title: t("shell.writeRecovery.pending", { count: pending }),
      description: t("shell.writeRecovery.pendingDescription"),
    });
  }
}

export function WriteRecovery() {
  const { identity } = useAccount();
  const orgId = identity.status === "signed-in" ? identity.orgId : null;
  const t = useTranslate();

  useEffect(() => {
    if (!orgId || asked.has(orgId)) return;
    asked.add(orgId);
    fetch("/api/ledger/recover", { method: "POST", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as RecoverResponse;
        announceRecovery(orgId, body.results, t);
      })
      .catch((error: unknown) => console.warn("[recovery] could not check earlier actions:", error));
  }, [orgId, t]);

  return null;
}
