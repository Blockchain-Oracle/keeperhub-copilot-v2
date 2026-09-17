import { Ask } from "@/components/landing/ask";
import { Automations } from "@/components/landing/automations";
import { Cards } from "@/components/landing/cards";
import { FinalCta } from "@/components/landing/final-cta";
import { FloatingNav } from "@/components/landing/floating-nav";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks, Install } from "@/components/landing/how-install";

/*
 * The landing page.
 *
 * The order argues the product rather than a safety mechanism: what it is, what
 * you can ask it, what comes back, what it can keep doing for you, how it
 * works, and how to connect it.
 */
export default function Page() {
  return (
    <div className="min-h-dvh bg-background">
      <FloatingNav />
      <main>
        <Hero />
        <Ask />
        <Cards />
        <Automations />
        <HowItWorks />
        <Install />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
