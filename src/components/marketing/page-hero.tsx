import { ChevronRight } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { cn } from "@aso/shared";
import { ButtonLink, Eyebrow } from "@/components/marketing/sections";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-[var(--text-muted)]">
        <li>
          <Link
            href="/"
            className="rounded underline-offset-4 hover:text-[var(--text-secondary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Home
          </Link>
        </li>
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-1">
            <ChevronRight className="size-3.5 shrink-0" aria-hidden />
            {item.href ? (
              <Link
                href={item.href}
                className="rounded underline-offset-4 hover:text-[var(--text-secondary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-[var(--text-secondary)]">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Header band for every inner page.
 *
 * One component so the pages share a rhythm — same vertical space, same
 * breadcrumb position, same measure on the copy. Pages differing here by a few
 * pixels each is what makes a site feel assembled rather than designed.
 */
export function PageHero({
  eyebrow,
  title,
  body,
  crumbs,
  primary,
  secondary,
  meta,
  align = "left",
  children,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  crumbs?: Crumb[];
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
  /** Small facts under the copy — post date, reading time, result counts. */
  meta?: React.ReactNode;
  align?: "left" | "center";
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-[var(--border)] bg-[var(--surface)]">
      {/* Decorative wash and grid. Purely visual, kept out of the a11y tree. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,var(--brand-soft),transparent_60%)] opacity-70"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(var(--text-primary)_1px,transparent_1px),linear-gradient(90deg,var(--text-primary)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]"
      />

      <div
        className={cn(
          "relative mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20",
          align === "center" && "text-center",
        )}
      >
        {crumbs ? (
          <div className={cn("mb-6", align === "center" && "flex justify-center")}>
            <Breadcrumbs items={crumbs} />
          </div>
        ) : null}

        <div className={cn("max-w-3xl", align === "center" && "mx-auto")}>
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}

          <h1 className="mt-2 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            {title}
          </h1>

          {body ? (
            <p className="mt-5 text-pretty text-lg leading-relaxed text-[var(--text-secondary)]">
              {body}
            </p>
          ) : null}

          {meta ? <div className="mt-6">{meta}</div> : null}

          {primary || secondary ? (
            <div
              className={cn(
                "mt-8 flex flex-wrap gap-3",
                align === "center" && "justify-center",
              )}
            >
              {primary ? (
                <ButtonLink href={primary.href} size="lg">
                  {primary.label}
                </ButtonLink>
              ) : null}
              {secondary ? (
                <ButtonLink href={secondary.href} variant="secondary" size="lg">
                  {secondary.label}
                </ButtonLink>
              ) : null}
            </div>
          ) : null}

          {children}
        </div>
      </div>
    </section>
  );
}
