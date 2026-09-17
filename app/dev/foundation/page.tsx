import type { Metadata } from "next";

import { FoundationGallery } from "@/components/dev/foundation-gallery";

export const metadata: Metadata = {
  title: "Foundation",
  robots: { index: false, follow: false },
};

/* A review page for the slice-1 building blocks; nothing links here. */
export default function FoundationPage() {
  return <FoundationGallery />;
}
