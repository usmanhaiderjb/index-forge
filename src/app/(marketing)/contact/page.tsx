import { Clock, Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ContactForm } from "@/components/marketing/contact-form";
import { PlaceholderNotice, Section } from "@/components/marketing/sections";
import { PageHero } from "@/components/marketing/page-hero";
import { FAQ, SITE } from "@/content/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Ask about integrations, pricing, or whether ASO fits what you are trying to measure. We answer questions directly.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        crumbs={[{ label: "Contact" }]}
        eyebrow="Contact"
        title="Ask what you actually want to know"
        body="Whether it handles your setup, what it cannot do, how a specific number is calculated. A straight answer is faster than a trial."
      />

      <Section>
        <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:gap-12">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
            <h2 className="text-lg font-semibold tracking-tight">Send a message</h2>
            <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
              Every field except company is required.
            </p>
            <div className="mt-6">
              <ContactForm />
            </div>
          </div>

          <aside className="flex flex-col gap-6">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <h2 className="text-sm font-semibold">Reach us directly</h2>

              <ul className="mt-4 flex flex-col gap-4">
                <li className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand-ink)]">
                    <Mail className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs text-[var(--text-muted)]">Email</span>
                    <a
                      href={`mailto:${SITE.contact.email}`}
                      className="block break-all rounded text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                    >
                      {SITE.contact.email}
                    </a>
                  </span>
                </li>

                {SITE.contact.phone ? (
                  <li className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand-ink)]">
                      <Phone className="size-4" aria-hidden />
                    </span>
                    <span>
                      <span className="block text-xs text-[var(--text-muted)]">Phone</span>
                      <a
                        href={`tel:${SITE.contact.phone.replace(/\s/g, "")}`}
                        className="block rounded text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                      >
                        {SITE.contact.phone}
                      </a>
                    </span>
                  </li>
                ) : null}

                <li className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand-ink)]">
                    <MapPin className="size-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-xs text-[var(--text-muted)]">Where</span>
                    <span className="block text-sm text-[var(--text-secondary)]">
                      {SITE.contact.location}
                    </span>
                  </span>
                </li>

                <li className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand-ink)]">
                    <Clock className="size-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-xs text-[var(--text-muted)]">Response</span>
                    {/* No SLA is promised here. Email delivery is optional on a
                        deployment, and a stated turnaround nobody is on the hook
                        for is worse than none. */}
                    <span className="block text-sm text-[var(--text-secondary)]">
                      We read everything and reply to what needs a reply.
                    </span>
                  </span>
                </li>
              </ul>

              {SITE.contact.placeholder ? (
                <div className="mt-5">
                  <PlaceholderNotice what="These contact details are not real yet." />
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <h2 className="text-sm font-semibold">Might already be answered</h2>
              <dl className="mt-4 flex flex-col gap-4">
                {FAQ.slice(0, 3).map((item) => (
                  <div key={item.q}>
                    <dt className="text-sm font-medium">{item.q}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                      {item.a}
                    </dd>
                  </div>
                ))}
              </dl>
              <Link
                href="/#faq"
                className="mt-4 inline-block rounded text-sm font-medium text-[var(--brand-ink)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                All questions
              </Link>
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
