import { ArrowRight, BarChart2, CheckCircle2, ChevronRight, Layers, Sparkles, TrendingUp, Users, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import * as React from "react";

import { PageHero } from "@/components/marketing/page-hero";
import {
  ButtonLink,
  CtaBand,
  DarkPanel,
  Eyebrow,
  Section,
  SectionHeading,
} from "@/components/marketing/sections";
import { FEATURES, type FeaturePageData } from "@/content/features";
import { INTEGRATIONS, SITE } from "@/content/site";
import { env } from "@/env";

export const metadata: Metadata = {
  title: "ASO Engineering Platform Features | IndexForge",
  description:
    "Explore the complete suite of App Store and Google Play optimization tools: keyword research, SERP rank tracking, competitor intelligence, AI metadata writer, market trends, push campaigns, and 6-provider revenue reconciliation.",
  alternates: { canonical: "/features" },
  openGraph: {
    title: `Platform Features | ${SITE.name}`,
    description:
      "Explore the complete suite of App Store and Google Play optimization tools: keyword research, SERP rank tracking, competitor intelligence, AI metadata writer, and metrics reconciliation.",
    url: `${env.APP_URL.replace(/\/$/, "")}/features`,
    siteName: SITE.name,
    type: "website",
  },
};

const FEATURE_ICONS: Record<string, typeof Sparkles> = {
  "keyword-research": Sparkles,
  "rank-tracking": TrendingUp,
  "competitor-intelligence": Users,
  "ai-aso-writer": Zap,
  "market-trends": BarChart2,
  "push-campaigns": Layers,
  "metrics-reconciliation": CheckCircle2,
};

export default function FeaturesIndexPage() {
  const base = env.APP_URL.replace(/\/$/, "");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        name: "IndexForge Features Suite",
        description: "App Store Optimization and store analytics toolset.",
        itemListElement: FEATURES.map((feature, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: feature.navTitle,
          description: feature.metaDescription,
          url: `${base}/features/${feature.slug}`,
        })),
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
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <PageHero
        crumbs={[{ label: "Features" }]}
        eyebrow="Platform Capabilities"
        title="ASO tools engineered for precision"
        body="Seven dedicated capabilities built from ground-truth store telemetry, strict source precedence, and character-limit validation. No black boxes, no double-counting."
        primary={{ label: "Start for free", href: "/signin" }}
        secondary={{ label: "View pricing", href: "/#pricing" }}
      />

      {/* Main Features Grid */}
      <Section space="default">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => {
            const Icon = FEATURE_ICONS[feature.slug] ?? Sparkles;
            const isFeatured = index === 0 || index === 3;

            return (
              <div
                key={feature.slug}
                className="group flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 transition-all hover:border-[var(--brand-border)] hover:shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--brand-ink)] group-hover:bg-[var(--brand-soft)] group-hover:border-[var(--brand-border)] transition-colors">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="tabular text-xs font-semibold text-[var(--text-muted)]">
                      0{index + 1}
                    </span>
                  </div>

                  <h2 className="mt-5 text-xl font-bold tracking-tight text-[var(--text-primary)]">
                    <Link
                      href={`/features/${feature.slug}`}
                      className="hover:text-[var(--brand-ink)] transition-colors"
                    >
                      {feature.navTitle}
                    </Link>
                  </h2>

                  <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                    {feature.heroSubheadline}
                  </p>

                  {/* Highlights list */}
                  <ul className="mt-5 flex flex-col gap-2 border-t border-[var(--border)] pt-4">
                    {feature.capabilities.slice(0, 2).map((cap) => (
                      <li
                        key={cap.title}
                        className="flex items-start gap-2 text-xs text-[var(--text-secondary)]"
                      >
                        <CheckCircle2 className="size-3.5 mt-0.5 shrink-0 text-[var(--brand-ink)]" />
                        <span className="font-medium text-[var(--text-primary)]">{cap.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8 border-t border-[var(--border)] pt-4">
                  <Link
                    href={`/features/${feature.slug}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-ink)] hover:underline"
                  >
                    Explore {feature.navTitle}
                    <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Connected Integrations Section */}
      <DarkPanel>
        <div className="max-w-2xl">
          <Eyebrow tone="panel">Unified Architecture</Eyebrow>
          <h2 className="mt-2 text-balance text-2xl font-bold tracking-tight sm:text-3xl text-[var(--panel-ink)]">
            Powered by six connected providers
          </h2>
          <p className="mt-3 text-pretty text-sm text-[var(--panel-ink-secondary)]">
            IndexForge ingests raw event tables and revenue metrics directly from official store APIs and ad networks.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INTEGRATIONS.map((source) => (
            <div
              key={source.name}
              className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel-raised)] p-4 text-[var(--panel-ink)]"
            >
              <h3 className="text-sm font-semibold text-[var(--brand-ink-panel)]">{source.name}</h3>
              <p className="mt-1 text-xs text-[var(--panel-ink-secondary)]">{source.provides}</p>
            </div>
          ))}
        </div>
      </DarkPanel>

      <CtaBand
        title="Ready to build your store ranking pipeline?"
        body="Start tracking keywords, monitoring competitors, and generating compliant metadata in under two minutes."
        primary={{ label: "Start for free", href: "/signin" }}
        secondary={{ label: "See how it works", href: "/benefits" }}
      />
    </>
  );
}
