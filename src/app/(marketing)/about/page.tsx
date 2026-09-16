import { Check, ShieldCheck, Telescope, X } from "lucide-react";
import type { Metadata } from "next";

import { CtaBand, DarkPanel, Eyebrow, Section, SectionHeading } from "@/components/marketing/sections";
import { PageHero } from "@/components/marketing/page-hero";
import { ABOUT, INTEGRATIONS } from "@/content/site";

export const metadata: Metadata = {
  title: "About",
  description: ABOUT.body[0],
  alternates: { canonical: "/about" },
};

const PRINCIPLE_ICONS = [ShieldCheck, Telescope, Check];

export default function AboutPage() {
  return (
    <>
      <PageHero
        crumbs={[{ label: "About" }]}
        eyebrow="About"
        title={ABOUT.heading}
        body={ABOUT.body[0]}
      />

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1fr_20rem] lg:gap-16">
          <div className="flex flex-col gap-5">
            {ABOUT.body.slice(1).map((paragraph) => (
              <p
                key={paragraph.slice(0, 32)}
                className="text-pretty text-lg leading-relaxed text-[var(--text-secondary)]"
              >
                {paragraph}
              </p>
            ))}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <dl className="flex flex-col gap-px overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--border)]">
              {[
                { term: "Connected sources", detail: `${INTEGRATIONS.length} providers` },
                { term: "Refresh", detail: "Daily ranks, six-hourly metrics" },
                { term: "Credentials", detail: "AES-256-GCM, never sent to the browser" },
                { term: "Your data", detail: "CSV, JSON and read-only REST export" },
              ].map((item) => (
                <div key={item.term} className="bg-[var(--surface)] px-5 py-4">
                  <dt className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                    {item.term}
                  </dt>
                  <dd className="mt-1 text-sm text-[var(--text-secondary)]">{item.detail}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </Section>

      <DarkPanel>
        <div className="max-w-2xl">
          <Eyebrow>Principles</Eyebrow>
          <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            What this optimises for
          </h2>
        </div>

        <ul className="mt-10 grid gap-8 md:grid-cols-3">
          {ABOUT.principles.map((principle, i) => {
            const Icon = PRINCIPLE_ICONS[i % PRINCIPLE_ICONS.length]!;
            return (
              <li key={principle.title}>
                <span className="grid size-10 place-items-center rounded-lg bg-white/[0.07] text-[var(--brand-ink-panel)]">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-base font-semibold">{principle.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--panel-ink-secondary)]">
                  {principle.body}
                </p>
              </li>
            );
          })}
        </ul>
      </DarkPanel>

      <Section>
        <SectionHeading
          align="center"
          eyebrow="Scope"
          title="What it does and does not do"
          body="Being clear about the edges is more useful than a longer feature list."
        />

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Check className="size-4 text-[var(--status-good)]" aria-hidden /> It does
            </h3>
            <ul className="mt-4 flex flex-col gap-3 text-sm text-[var(--text-secondary)]">
              {[
                `Pull metrics daily from ${INTEGRATIONS.length} providers into one table`,
                "Track keyword rank, chart position and competitors per country",
                "Sync, classify and reply to store reviews",
                "Generate metadata variants inside each field's character limit",
                "Alert on thresholds and percentage moves, and send scheduled digests",
                "Export everything as CSV, JSON or through a read-only REST API",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-[var(--status-good)]"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <X className="size-4 text-[var(--text-muted)]" aria-hidden /> It does not
            </h3>
            <ul className="mt-4 flex flex-col gap-3 text-sm text-[var(--text-secondary)]">
              {[
                "Publish listing changes to the stores on your behalf",
                "Report calibrated search volume from the built-in scraper — neither store publishes one, so difficulty is an explicit model rather than a measurement",
                "Manage or change your ad campaigns",
                "Guess at a number when its source is missing. It reports no data instead",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <X className="mt-0.5 size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <CtaBand
        title="Questions before you start?"
        body="Ask what you actually want to know. A straight answer is faster than a trial."
        primary={{ label: "Contact us", href: "/contact" }}
        secondary={{ label: "Read the blog", href: "/blog" }}
      />
    </>
  );
}
