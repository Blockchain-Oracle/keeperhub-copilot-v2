import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { History } from "@/components/pages/history";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("metadata"))("history") };
}

export default function HistoryPage() {
  return <History />;
}
