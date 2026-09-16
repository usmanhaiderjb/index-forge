import { Check, X } from "lucide-react";
import type { Metadata } from "next";

import { CtaBand, DarkPanel, Eyebrow, Section, SectionHeading } from "@/components/marketing/sections";
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
import { BENEFITS, HOW_IT_WORKS, INTEGRATIONS } from "@/content/site";

export const metadata: Metadata = {
  title: "Benefits",
  description:
    "What ASO removes from your week: one daily table across six providers, numbers that do not double-count, an organic and paid split, rank tracking with competitors in frame, themed reviews, and AI that respects store character limits.",
  alternates: { canonical: "/benefits" },
};

/**
 * Each benefit is paired with the illustration that actually demonstrates it.
 * Every id in BENEFITS must appear here — a benefit with a generic decorative
 * panel next to it says nothing, and a test asserts the map is complete.
 */
const ILLUSTRATIONS: Record<string, React.ReactNode> = {
  "one-table": <DashboardMockup />,
  "no-double-count": <SourcePrecedenceMockup />,
  "organic-split": <OrganicSplitMockup />,
  keywords: <KeywordTableMockup />,
  push: <PushCampaignMockup />,
  reviews: <ReviewThemesMockup />,
  ai: <ListingCompareMockup />,
};

export default function BenefitsPage() {
  return (
    <>
      <PageHero
        crumbs={[{ label: "Benefits" }]}
        eyebrow="Benefits"
        title="What it removes from your week"
        body="Every claim below maps to shipped behaviour, with the mechanism named. If a section cannot say how it works, it should not be on this page."
        primary={{ label: "Start for free", href: "/signin" }}
        secondary={{ label: "See a worked example", href: "/showcase" }}
      />

      <Section>
        <ul className="flex flex-col gap-16 sm:gap-20">
          {BENEFITS.map((benefit, i) => {
            const illustration = ILLUSTRATIONS[benefit.id];
            const flipped = i % 2 === 1;

            return (
              <li
                key={benefit.id}
                id={benefit.id}
                className="scroll-mt-24 grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
              >
                <div className={flipped ? "lg:order-2" : undefined}>
                  <span className="tabular text-xs font-semibold text-[var(--brand-ink)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                    {benefit.title}
                  </h2>
                  <p className="mt-4 text-pretty leading-relaxed text-[var(--text-secondary)]">
                    {benefit.body}
                  </p>

                  <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--brand-ink)]">
                      How it works
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
                      {benefit.detail}
                    </p>
                  </div>
                </div>

                <div className={flipped ? "lg:order-1" : undefined}>{illustration}</div>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section space="joined">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
          <div>
            <Eyebrow>Competitors</Eyebrow>
            <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
              Measured on the same page you were
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-[var(--text-secondary)]">
              Competitor positions come from the result page your own rank was read from. A separate
              lookup taken minutes later is a different page, and comparing the two would be quietly
              wrong.
            </p>
          </div>
          <CompetitorMockup />
        </div>
      </Section>

      <DarkPanel>
        <div className="max-w-2xl">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            Set it up once, then it runs
          </h2>
        </div>

        <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((step) => (
            <li key={step.step}>
              <span className="tabular grid size-9 place-items-center rounded-lg bg-white/[0.07] text-sm font-semibold text-[var(--brand-ink-panel)]">
                {step.step}
              </span>
              <h3 className="mt-3 text-sm font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--panel-ink-secondary)]">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </DarkPanel>

      <Section>
        <SectionHeading
          align="center"
          eyebrow="Sources"
          title="Where each number comes from"
          body="Connect one or all six. Every metric records the provider it came from, so any figure on any chart can be traced back."
        />

        <div className="mt-10 overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--surface)]">
              <tr className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                <th className="px-5 py-3 font-medium">Source</th>
                <th className="px-5 py-3 font-medium">Provides</th>
              </tr>
            </thead>
            <tbody>
              {INTEGRATIONS.map((item) => (
                <tr key={item.name} className="border-t border-[var(--border)]">
                  <td className="px-5 py-4 font-medium">{item.name}</td>
                  <td className="px-5 py-4 text-[var(--text-secondary)]">{item.provides}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section space="joined">
        <SectionHeading
          align="center"
          eyebrow="Scope"
          title="What it does not do"
          body="Being clear about the edges is more useful than a longer feature list."
        />

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Check className="size-4 text-[var(--status-good)]" aria-hidden /> It does
            </h3>
            <ul className="mt-4 flex flex-col gap-2.5 text-sm text-[var(--text-secondary)]">
              {[
                "Pull metrics daily from six providers into one table",
                "Track keyword rank, chart position and competitors per country",
                "Sync, classify and reply to store reviews",
                "Generate metadata inside each field's character limit",
                "Alert on thresholds and percentage moves, and send digests",
                "Export everything as CSV, JSON or a read-only REST API",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-[var(--status-good)]"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <X className="size-4 text-[var(--text-muted)]" aria-hidden /> It does not
            </h3>
            <ul className="mt-4 flex flex-col gap-2.5 text-sm text-[var(--text-secondary)]">
              {[
                "Publish listing changes to the stores on your behalf",
                "Report calibrated search volume from the built-in scraper",
                "Manage or change your ad campaigns",
                "Guess at a number when its source is missing",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <X className="mt-0.5 size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <CtaBand
        title="See it against your own numbers"
        body="One connected account is enough to judge whether this is useful."
        primary={{ label: "Start for free", href: "/signin" }}
        secondary={{ label: "Ask a question", href: "/contact" }}
      />
    </>
  );
}
