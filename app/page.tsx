import { FloatingNav } from "@/components/landing/floating-nav";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { HowItWorks, Install } from "@/components/landing/how-install";
import { FinalCta } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";

/*
 * The landing page.
 *
 * Section order follows Portaldot's
 * (references/portaldot-mcp/packages/web/app/page.tsx):
 *   FloatingNav → Hero → Features → HowItWorks → Install → FinalCta → Footer
 */
export default function Page() {
  return (
    <div className="min-h-dvh bg-background">
      <FloatingNav />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Install />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
