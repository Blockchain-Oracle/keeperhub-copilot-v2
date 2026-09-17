import type { Metadata } from "next";

import { OnboardingReview } from "@/components/dev/onboarding-review";

export const metadata: Metadata = {
  title: "Onboarding review",
  robots: { index: false, follow: false },
};

/* A review page for the slice-4 surfaces, inside the app shell; nothing links here. */
export default function OnboardingReviewPage() {
  return <OnboardingReview />;
}
