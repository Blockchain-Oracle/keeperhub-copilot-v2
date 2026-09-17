import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Activity } from "@/components/pages/activity";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("metadata"))("activity") };
}

export default function ActivityPage() {
  return <Activity />;
}
