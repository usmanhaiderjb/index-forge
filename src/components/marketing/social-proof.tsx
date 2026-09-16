import { Quote } from "lucide-react";

import { TESTIMONIALS } from "@/content/site";
import { PlaceholderNotice, Section, SectionHeading } from "@/components/marketing/sections";

export function TestimonialGrid() {
  if (TESTIMONIALS.length === 0) return null;
  const anyPlaceholder = TESTIMONIALS.some((t) => t.placeholder);

  return (
    <Section id="testimonials">
      <SectionHeading
        eyebrow="Testimonials"
        title="What people say"
        body="Quotes from teams running the product day to day."
      />

      {anyPlaceholder ? (
        <PlaceholderNotice what="Nobody has said these things. They are layout placeholders." />
      ) : null}

      <ul className="mt-8 grid gap-4 md:grid-cols-3">
        {TESTIMONIALS.map((item, i) => (
          <li
            key={`${item.author}-${i}`}
            className="flex flex-col rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5"
          >
            <Quote className="size-4 text-[var(--brand-ink)]" aria-hidden />
            <blockquote className="mt-3 flex-1 text-sm text-pretty text-[var(--text-secondary)]">
              {item.body}
            </blockquote>
            <footer className="mt-4 border-t border-[var(--border)] pt-3 text-sm">
              <span className="font-medium">{item.author}</span>
              <span className="block text-xs text-[var(--text-muted)]">{item.role}</span>
            </footer>
          </li>
        ))}
      </ul>
    </Section>
  );
}
