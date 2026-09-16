import type { Metadata } from "next";

import { CtaBand, Section, SectionHeading } from "@/components/marketing/sections";
import {
  AiWriterSection,
  AppIntelligenceSection,
  ComparisonSection,
  CompetitorSection,
  CrossLocaleSection,
  DashboardShowcase,
  FeatureGrid,
  Hero,
  ImpactSection,
  IntegrationsSection,
  KeywordSection,
  LogoWall,
  Pricing,
} from "@/components/marketing/home-sections";
import { TestimonialGrid } from "@/components/marketing/social-proof";
import { FAQ, SITE } from "@/content/site";

export const metadata: Metadata = {
  title: { absolute: "IndexForge — App Intelligence, 720K+ Keyword Corpus & Precision ASO" },
  description: SITE.description,
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <LogoWall />
      <FeatureGrid />

      {/* Complete Product Story: Market Intelligence -> Dashboard -> Keywords -> 9x Cross-Locales -> AI Writer -> Competitors -> Integrations -> Comparison */}
      <AppIntelligenceSection />
      <DashboardShowcase />
      <KeywordSection />
      <CrossLocaleSection />
      <CompetitorSection />
      <AiWriterSection />
      <ImpactSection />
      <IntegrationsSection />
      <ComparisonSection />
      <TestimonialGrid />
      <Pricing />

      <Section id="faq">
        <SectionHeading
          align="center"
          eyebrow="FAQ"
          title="Questions worth answering up front"
        />

        <dl className="mx-auto mt-12 grid max-w-4xl gap-x-10 gap-y-8 md:grid-cols-2">
          {FAQ.map((item) => (
            <div key={item.q}>
              <dt className="text-sm font-semibold">{item.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{item.a}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <CtaBand
        title="Your next 100,000 downloads are already searching for you"
        body="Connect your store accounts or inspect any competitor app instantly. Full market intelligence and keyword corpus in one unified engine."
        primary={{ label: "Start for free", href: "/signin" }}
        secondary={{ label: "Talk to us first", href: "/contact" }}
      />
    </>
  );
}
