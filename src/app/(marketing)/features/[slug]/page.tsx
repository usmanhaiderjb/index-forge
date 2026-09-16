import { ArrowLeft, ArrowRight, Check, HelpCircle, Layers, ShieldCheck, Sparkles, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import * as React from "react";

import { PageHero } from "@/components/marketing/page-hero";
import { DashboardMockup } from "@/components/marketing/mockups/dashboard";
import {
  CompetitorMockup,
  KeywordTableMockup,
  ListingCompareMockup,
  OrganicSplitMockup,
  PushCampaignMockup,
  ReviewThemesMockup,
  SourcePrecedenceMockup,
} from "@/components/marketing/mockups/panels";
import {
  ButtonLink,
  CtaBand,
  DarkPanel,
  Eyebrow,
  Section,
  SectionHeading,
} from "@/components/marketing/sections";
import {
  FEATURES,
  getAllFeatureSlugs,
  getFeatureBySlug,
  type FeaturePageData,
} from "@/content/features";
import { SITE } from "@/content/site";
import { env } from "@/env";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getAllFeatureSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const feature = getFeatureBySlug(slug);
  if (!feature) return {};

  const base = env.APP_URL.replace(/\/$/, "");
  const canonicalUrl = `${base}/features/${feature.slug}`;

  return {
    title: feature.metaTitle,
    description: feature.metaDescription,
    keywords: feature.keywords,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${feature.metaTitle} | ${SITE.name}`,
      description: feature.metaDescription,
      url: canonicalUrl,
      siteName: SITE.name,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${feature.metaTitle} | ${SITE.name}`,
      description: feature.metaDescription,
    },
  };
}

const MOCKUPS: Record<FeaturePageData["mockupId"], React.ReactNode> = {
  keywords: <KeywordTableMockup />,
  competitors: <CompetitorMockup />,
  ai: <ListingCompareMockup />,
  push: <PushCampaignMockup />,
  reviews: <ReviewThemesMockup />,
  precedence: <SourcePrecedenceMockup />,
  organic: <OrganicSplitMockup />,
  dashboard: <DashboardMockup />,
};

export default async function FeatureDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const feature = getFeatureBySlug(slug);

  if (!feature) {
    notFound();
  }

  const base = env.APP_URL.replace(/\/$/, "");
  const currentIndex = FEATURES.findIndex((f) => f.slug === slug);
  const prevFeature = currentIndex > 0 ? FEATURES[currentIndex - 1] : FEATURES[FEATURES.length - 1];
  const nextFeature = currentIndex < FEATURES.length - 1 ? FEATURES[currentIndex + 1] : FEATURES[0];

  const mockup = MOCKUPS[feature.mockupId] ?? <DashboardMockup />;

  // Structured Data (JSON-LD) for SoftwareApplication, FAQPage, and BreadcrumbList
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: `${SITE.name} - ${feature.navTitle}`,
        applicationCategory: "BusinessApplication",
        operatingSystem: "iOS, Android, Web",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        description: feature.metaDescription,
        featureList: feature.capabilities.map((c) => `${c.title}: ${c.description}`),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: base,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Features",
            item: `${base}/features`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: feature.navTitle,
            item: `${base}/features/${feature.slug}`,
          },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: feature.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.a,
          },
        })),
      },
    ],
  };

  return (
    <>
      {/* Schema.org Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero Header */}
      <PageHero
        crumbs={[
          { label: "Features", href: "/features" },
          { label: feature.navTitle },
        ]}
        eyebrow={feature.eyebrow}
        title={`${feature.heroHeadline.lead} ${feature.heroHeadline.accent}`}
        body={feature.heroSubheadline}
        primary={{ label: "Start for free", href: "/signin" }}
        secondary={{ label: "Explore all features", href: "/features" }}
      />

      {/* Feature Showcase Section & Metrics */}
      <Section space="default">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-[var(--brand-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--brand-ink)]">
              <Sparkles className="size-3.5" aria-hidden /> Core Engine Capability
            </span>

            <h2 className="mt-4 text-balance text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
              Precision engineering behind {feature.navTitle.toLowerCase()}
            </h2>

            <p className="mt-4 text-pretty leading-relaxed text-[var(--text-secondary)]">
              {feature.summary}
            </p>

            {/* Metrics Strip */}
            <dl className="mt-8 grid grid-cols-3 gap-3 border-t border-[var(--border)] pt-6">
              {feature.metrics.map((metric) => (
                <div key={metric.label} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)] truncate">
                    {metric.label}
                  </dt>
                  <dd className="tabular mt-1 text-xl sm:text-2xl font-bold text-[var(--brand-ink)]">
                    {metric.value}
                  </dd>
                  <dd className="mt-1 text-[11px] leading-snug text-[var(--text-secondary)] line-clamp-2">
                    {metric.description}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-2 sm:p-4 shadow-xl shadow-black/5">
              {mockup}
            </div>
          </div>
        </div>
      </Section>

      {/* Key Capabilities Deep Dive */}
      <Section space="joined">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Capabilities</Eyebrow>
          <h2 className="mt-2 text-balance text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            {feature.capabilitiesHeading}
          </h2>
          <p className="mt-4 text-pretty text-base leading-relaxed text-[var(--text-secondary)]">
            Designed from first principles to avoid the inaccuracies, omissions, and black-box estimates common in traditional ASO tools.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {feature.capabilities.map((cap) => (
            <div
              key={cap.title}
              className="flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 transition-all hover:border-[var(--brand-border)] hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                    {cap.title}
                  </h3>
                  {cap.badge ? (
                    <span className="rounded-full bg-[var(--brand-soft)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--brand-ink)] border border-[var(--brand-border)]">
                      {cap.badge}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {cap.description}
                </p>
              </div>

              <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3.5">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-ink)]">
                  <ShieldCheck className="size-3.5" aria-hidden /> How it works
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                  {cap.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* How it Works: 3-Step Walkthrough */}
      <DarkPanel>
        <div className="max-w-2xl">
          <Eyebrow tone="panel">Step-by-step workflow</Eyebrow>
          <h2 className="mt-2 text-balance text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl text-[var(--panel-ink)]">
            How it works in practice
          </h2>
          <p className="mt-3 text-pretty text-sm text-[var(--panel-ink-secondary)]">
            Automated background workers handle the ingestion, normalization, and auditing so you only interact with clean, verifiable results.
          </p>
        </div>

        <ol className="mt-10 grid gap-6 sm:grid-cols-3">
          {feature.howItWorks.map((step) => (
            <li
              key={step.step}
              className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel-raised)] p-5 text-[var(--panel-ink)]"
            >
              <span className="tabular grid size-8 place-items-center rounded-lg bg-white/10 text-xs font-bold text-[var(--brand-ink-panel)]">
                {step.step}
              </span>
              <h3 className="mt-4 text-base font-semibold text-[var(--panel-ink)]">
                {step.title}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[var(--panel-ink-secondary)]">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </DarkPanel>

      {/* Why Legacy Tools Fail Comparison */}
      <Section space="default">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>The Honest Difference</Eyebrow>
          <h2 className="mt-2 text-balance text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            Why legacy ASO tools fall short
          </h2>
          <p className="mt-4 text-pretty text-base leading-relaxed text-[var(--text-secondary)]">
            Most tools sell unverified volume estimates and unweighted aggregations. Here is how IndexForge handles the hard edge cases.
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="grid grid-cols-1 divide-y divide-[var(--border)] md:grid-cols-2 md:divide-x md:divide-y-0">
            <div className="p-6 sm:p-8 bg-red-500/[0.02]">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--status-critical)]">
                <X className="size-4" aria-hidden /> Legacy ASO Platforms
              </div>
              <ul className="mt-6 flex flex-col gap-5">
                {feature.whyLegacyFails.map((item, i) => (
                  <li key={`legacy-${i}`} className="flex items-start gap-3 text-sm text-[var(--text-secondary)]">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--status-critical)]" />
                    <span>{item.legacy}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-6 sm:p-8 bg-[var(--brand-soft)]/20">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--status-good)]">
                <Check className="size-4" aria-hidden /> IndexForge Precision Model
              </div>
              <ul className="mt-6 flex flex-col gap-5">
                {feature.whyLegacyFails.map((item, i) => (
                  <li key={`if-${i}`} className="flex items-start gap-3 text-sm font-medium text-[var(--text-primary)]">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--status-good)]" />
                    <span>{item.indexForge}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      {/* Frequently Asked Questions */}
      <Section space="joined">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Questions &amp; Details</Eyebrow>
          <h2 className="mt-2 text-balance text-2xl font-bold tracking-tight sm:text-3xl">
            Frequently Asked Questions
          </h2>
          <p className="mt-3 text-pretty text-sm text-[var(--text-secondary)]">
            Everything you need to know about the technical mechanisms, data guarantees, and limits.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-3xl divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          {feature.faqs.map((faq, index) => (
            <details
              key={faq.q}
              className="group p-5 sm:p-6 [&_summary::-webkit-details-marker]:hidden cursor-pointer"
              open={index === 0}
            >
              <summary className="flex items-center justify-between gap-4 font-semibold text-base text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
                <span className="flex items-center gap-2.5">
                  <HelpCircle className="size-4 shrink-0 text-[var(--brand-ink)]" aria-hidden />
                  {faq.q}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] transition-transform duration-200 group-open:rotate-180">
                  ↓
                </span>
              </summary>
              <div className="mt-3.5 pl-6 text-sm leading-relaxed text-[var(--text-secondary)]">
                {faq.a}
              </div>
            </details>
          ))}
        </div>
      </Section>

      {/* Feature Navigation Switcher */}
      <Section space="joined">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-6">
          {prevFeature ? (
            <Link
              href={`/features/${prevFeature.slug}`}
              className="flex items-center gap-3 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--brand-ink)] transition-colors"
            >
              <ArrowLeft className="size-4" />
              <div className="text-left">
                <span className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Previous Feature</span>
                <span>{prevFeature.navTitle}</span>
              </div>
            </Link>
          ) : <div />}

          <Link
            href="/features"
            className="text-xs font-semibold uppercase tracking-wider text-[var(--brand-ink)] hover:underline"
          >
            All Features Directory
          </Link>

          {nextFeature ? (
            <Link
              href={`/features/${nextFeature.slug}`}
              className="flex items-center gap-3 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--brand-ink)] transition-colors text-right"
            >
              <div className="text-right">
                <span className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Next Feature</span>
                <span>{nextFeature.navTitle}</span>
              </div>
              <ArrowRight className="size-4" />
            </Link>
          ) : <div />}
        </div>
      </Section>

      {/* CTA Band */}
      <CtaBand
        title="Ready to engineer your store visibility?"
        body="Join high-growth app teams using verifiable keyword data, accurate attribution, and limit-enforced ASO metadata."
        primary={{ label: "Start for free", href: "/signin" }}
        secondary={{ label: "View pricing & tiers", href: "/#pricing" }}
      />
    </>
  );
}
