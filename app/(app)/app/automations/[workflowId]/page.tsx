import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AutomationDetailView } from "@/components/pages/automation-detail";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("metadata"))("automation") };
}

export default async function AutomationPage({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await params;
  return <AutomationDetailView workflowId={workflowId} />;
}
