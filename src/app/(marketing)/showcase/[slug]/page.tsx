import { ArrowRight, Quote } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CtaBand, PlaceholderNotice, Section } from "@/components/marketing/sections";
import { PageHero } from "@/components/marketing/page-hero";
import { SHOWCASES } from "@/content/site";

export function generateStaticParams() {
  return SHOWCASES.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = SHOWCASES.find((s) => s.slug === slug);
  if (!item) return {};

  return {
    title: `${item.company} — showcase`,
    description: item.summary,
    alternates: { canonical: `/showcase/${item.slug}` },
    // A page whose figures are invented must not be indexed as a real case
    // study, whatever the copy on it says.
    robots: item.placeholder ? { index: false, follow: true } : undefined,
  };
}

export default async function ShowcaseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = SHOWCASES.find((s) => s.slug === slug);
  if (!item) notFound();

  const others = SHOWCASES.filter((s) => s.slug !== item.slug).slice(0, 2);

  return (
    <>
      <PageHero
        crumbs={[{ label: "Showcase", href: "/showcase" }, { label: item.company }]}
        eyebrow={item.industry}
        title={item.company}
        body={item.summary}
      >
        {item.placeholder ? (
          <div className="mt-6">
            <PlaceholderNotice what="This company does not exist and the figures below are unmeasured. The product behaviour described is accurate." />
          </div>
        ) : null}
      </PageHero>

      <Section>
        <dl className="grid gap-px overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--border)] sm:grid-cols-3">
          {item.results.map((result) => (
            <div key={result.label} className="bg-[var(--surface)] px-6 py-5">
              <dt className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                {result.label}
              </dt>
              <dd className="tabular mt-1.5 text-3xl font-bold">{result.value}</dd>
              <dd className="mt-0.5 text-xs text-[var(--text-muted)]">{result.note}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* The case study continues from the results strip above it. */}
      <Section space="joined">
        <div className="grid gap-12 lg:grid-cols-[1fr_18rem] lg:gap-16">
          <div className="flex flex-col gap-10">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">The problem</h2>
              <p className="mt-3 text-pretty leading-relaxed text-[var(--text-secondary)]">
                {item.challenge}
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold tracking-tight">What was done</h2>
              <ol className="mt-5 flex flex-col gap-4">
                {item.approach.map((step, i) => (
                  <li key={step} className="flex gap-4">
                    <span
                      aria-hidden
                      className="tabular grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--brand-soft)] text-sm font-semibold text-[var(--brand-ink)]"
                    >
                      {i + 1}
                    </span>
                    <span className="pt-1 text-pretty leading-relaxed text-[var(--text-secondary)]">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {item.quote ? (
              <figure className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
                <Quote className="size-5 text-[var(--brand-ink)]" aria-hidden />
                <blockquote className="mt-3 text-pretty leading-relaxed text-[var(--text-secondary)]">
                  {item.quote.body}
                </blockquote>
                <figcaption className="mt-4 border-t border-[var(--border)] pt-3 text-sm">
                  <span className="font-medium">{item.quote.author}</span>
                  <span className="block text-xs text-[var(--text-muted)]">{item.quote.role}</span>
                </figcaption>
              </figure>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="text-sm font-semibold">Run this on your app</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                Every view described here is available against your own numbers once one account is
                connected.
              </p>
              <Link
                href="/signin"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                Start for free
              </Link>
            </div>

            {others.length > 0 ? (
              <div className="mt-6">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  More showcases
                </h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {others.map((other) => (
                    <li key={other.slug}>
                      <Link
                        href={`/showcase/${other.slug}`}
                        className="group block rounded-lg border border-[var(--border)] p-3 transition-colors hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                      >
                        <span className="block text-sm font-medium">{other.company}</span>
                        <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                          {other.industry}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </Section>

      <CtaBand
        title="Run the same check on your app"
        body="Connect an account and the same views are available against your own numbers."
        primary={{ label: "Start for free", href: "/signin" }}
        secondary={{ label: "Ask a question", href: "/contact" }}
      />
    </>
  );
}
