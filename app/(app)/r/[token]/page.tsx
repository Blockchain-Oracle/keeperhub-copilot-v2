import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { SharedReceipt } from "@/components/pages/shared-receipt";
import { readSharedReceipt } from "@/lib/data/shares";
import { sharedReceiptTitle, sharedReceiptView } from "@/lib/shares";

/*
 * A shared receipt link (decision 37): open to anyone, no sign-in. The token
 * finds a live share; a turned-off or unknown link is the not-found page beside
 * this one. Search engines are asked not to index it.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

const load = cache(async (token: string) => {
  const row = await readSharedReceipt(token);
  return row === null ? null : sharedReceiptView(row);
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [view, t] = await Promise.all([load((await params).token), getTranslations("metadata")]);
  const robots = { index: false, follow: false };
  // The root layout's title template adds " · KeeperHub Copilot".
  if (view === null) return { title: t("receiptNotShared"), robots };
  const title = sharedReceiptTitle(view);
  const description = t("receiptDescription");
  return {
    title,
    description,
    robots,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedReceiptPage({ params }: Props) {
  const view = await load((await params).token);
  if (view === null) notFound();
  return <SharedReceipt view={view} />;
}
