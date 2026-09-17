"use client";

import { useTranslations } from "next-intl";

import { IntegrationMark } from "@/components/data/integration-mark";
import { getOperationEntry, integrations } from "@/lib/registry";

import { Inset } from "./parts";
import { ReceiptCard } from "./receipt-card";

/*
 * v1 components/cards/NeedsCredentialCard.tsx in the receipt frame: the action
 * needs a credential bound in KeeperHub before it can run. Setup, not a
 * ceremony, so it has no button; the pending tone says it is waiting on you.
 * No deep link to bind a credential exists, so the instruction stays in words.
 */
export function NeedsCredentialCard({
  toolName,
  opId,
  integration,
  message,
}: {
  toolName: string;
  opId?: string;
  integration: string;
  message: string;
}) {
  const t = useTranslations("cards");
  const entry = opId !== undefined ? getOperationEntry(opId) : undefined;
  const label = integrations[integration]?.label ?? integration;
  return (
    <ReceiptCard toolName={opId ?? toolName} metaRight={t("needsCredential.meta")} tone="pending">
      <p className="text-[15px] font-medium text-foreground">{entry?.label ?? t("needsCredential.title")}</p>
      <p className="mt-1 text-sm text-fg-secondary">{message}</p>
      <Inset className="mt-3 flex items-center gap-2.5">
        <IntegrationMark integration={integration} size={18} />
        <span className="text-[13px] text-fg-secondary">{t("needsCredential.setup", { integration: label })}</span>
      </Inset>
    </ReceiptCard>
  );
}
