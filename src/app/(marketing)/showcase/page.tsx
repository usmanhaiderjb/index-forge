import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand, PlaceholderNotice, Section } from "@/components/marketing/sections";
import { PageHero } from "@/components/marketing/page-hero";
import { TestimonialGrid } from "@/components/marketing/social-proof";
import { SHOWCASES } from "@/content/site";

export const metadata: Metadata = {
  title: "Showcase",
  description:
    "Worked examples of the problems ASO is built for: separating organic from paid installs, turning review noise into a specific bug, and reconciling spend across two ad networks.",
  alternates: { canonical: "/showcase" },
};

export default function ShowcasePage() {
  const anyPlaceholder = SHOWCASES.some((s) => s.placeholder);

  return (
    <>
      <PageHero
        crumbs={[{ label: "Showcase" }]}
        eyebrow="Showcase"
        title="What it looks like in practice"
        body="Each of these describes a real failure mode the product handles, walked through from the symptom to the fix."
      >
        {anyPlaceholder ? (
          <div className="mt-6">
            <PlaceholderNotice what="The product behaviour described is accurate. The companies and result figures are invented." />
          </div>
        ) : null}
      </PageHero>

      <Section>
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {SHOWCASES.map((item, i) => (
            <li key={item.slug}>
              <Link
                href={`/showcase/${item.slug}`}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] transition-all hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-xl hover:shadow-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                {/* A tinted cap gives each card a distinct silhouette without
                    inventing a logo for a company that does not exist. */}
                <div
                  aria-hidden
                  className="flex h-28 items-end bg-[linear-gradient(135deg,var(--brand-soft),var(--surface-raised))] p-5"
                >
                  <span className="tabular text-3xl font-bold text-[var(--brand-ink)]/35">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                    {item.industry}
                  </p>
                  <h2 className="mt-1.5 text-base font-semibold">{item.company}</h2>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                    {item.summary}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-ink)]">
                    Read it
                    <ArrowRight
                      className="size-3.5 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <TestimonialGrid />

      <CtaBand
        title="Have a case like these?"
        body="Tell us what you are trying to measure and we will say plainly whether this helps."
        primary={{ label: "Contact us", href: "/contact" }}
        secondary={{ label: "See the benefits", href: "/benefits" }}
      />
    </>
  );
}
