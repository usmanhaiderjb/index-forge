import * as React from "react";

import { Section } from "@/components/marketing/sections";
import { PageHero } from "@/components/marketing/page-hero";

export type LegalSection = { id: string; heading: string; body: React.ReactNode };

/**
 * Shared layout for privacy and terms.
 *
 * Sections are data rather than markup so the sticky contents list cannot drift
 * out of sync with the headings it links to — the usual failure on these pages
 * is a nav entry pointing at a section someone renamed.
 */
export function LegalPage({
  title,
  intro,
  disclaimer,
  sections,
  updated,
}: {
  title: string;
  intro: string;
  disclaimer: string;
  sections: LegalSection[];
  updated: string;
}) {
  return (
    <>
      <PageHero crumbs={[{ label: title }]} eyebrow="Legal" title={title} body={intro}>
        <p className="mt-6 text-sm text-[var(--text-muted)]">Last updated {updated}</p>
      </PageHero>

      <Section>
        <div className="grid gap-10 lg:grid-cols-[16rem_1fr] lg:gap-16">
          <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              On this page
            </h2>
            <ul className="mt-3 flex flex-col gap-1">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="block rounded-md px-2 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  >
                    {section.heading}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0">
            <p className="rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-3 text-sm text-[var(--text-muted)]">
              {disclaimer}
            </p>

            <div className="mt-10 flex flex-col gap-10">
              {sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-24">
                  <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
                  <div className="mt-3 flex flex-col gap-3 leading-relaxed text-[var(--text-secondary)]">
                    {section.body}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
