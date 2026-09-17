import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Automations } from "@/components/pages/automations";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("metadata"))("automations") };
}

export default function AutomationsPage() {
  return <Automations />;
}
