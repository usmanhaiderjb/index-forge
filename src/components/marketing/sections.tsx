import { Info } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { cn } from "@aso/shared";

/**
 * One vertical rhythm for the whole page.
 *
 * Every section and every panel uses this and nothing else. The page used to
 * carry five different paddings — `pb-10 pt-12`, `py-10`, `pt-8`, `pt-0` and a
 * `py-6` on panels — most of them patches compensating for a neighbour rather
 * than decisions. Compensating paddings are self-defeating: the moment a
 * section is reordered, every patch downstream is wrong, which is exactly what
 * makes a long page feel unsynchronised.
 */
export const SECTION_RHYTHM = "py-16 sm:py-20 lg:py-24";

/**
 * The two deliberate exceptions, named so they cannot be mistaken for drift.
 *
 * `hero` opens tight against the header, and `band` is a thin strip — the logo
 * wall — that should read as a rule between chapters rather than a chapter of
 * its own. Everything else uses the standard rhythm; if a section needs a
 * different gap, it belongs here rather than in a one-off className.
 */
const SPACING = {
  default: SECTION_RHYTHM,
  hero: "pt-12 pb-10 sm:pt-16 lg:pt-20",
  band: "py-10 sm:py-12",
  /**
   * A section that continues the one above it rather than starting a new
   * thought — a stat strip under a hero, a post list under its featured post.
   *
   * The convention is that the *continuing* section declares the relationship.
   * Pages previously did the opposite in places, zeroing the bottom padding of
   * whatever came before, which meant the same visual join was expressed two
   * different ways and neither was searchable.
   */
  joined: "pb-16 sm:pb-20 lg:pb-24",
} as const;

/** Shared page gutter and measure, so panels and sections line up exactly. */
const SECTION_SHELL = "mx-auto max-w-6xl px-4 sm:px-6";

export function Section({
  id,
  space = "default",
  className,
  children,
}: {
  id?: string;
  space?: keyof typeof SPACING;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn(SECTION_SHELL, SPACING[space], className)}>
      {children}
    </section>
  );
}

/**
 * A dark band that stays dark in both themes, matching the product panels.
 * Rounded and inset rather than full-bleed, so the page keeps its rhythm.
 */
export function DarkPanel({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn(SECTION_SHELL, SECTION_RHYTHM)}>
      <div
        className={cn(
          "rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-6 text-[var(--panel-ink)] sm:p-10 lg:p-12",
          className,
        )}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * The small uppercase label above a section title.
 *
 * Uses --brand-ink, not --accent. They look similar and are not
 * interchangeable: --accent is an *interactive fill*, darkened specifically so
 * a white label on it clears AA, which makes it too dark to be legible *as*
 * text on a dark background. These eyebrows sat at 4.28:1 on the dark page and
 * 3.94:1 on panels — both AA failures at 12px semibold, where the large-text
 * exemption does not apply.
 */
export function Eyebrow({
  children,
  tone = "page",
}: {
  children: React.ReactNode;
  tone?: "page" | "panel";
}) {
  return (
    <p
      className={cn(
        "text-xs font-semibold uppercase tracking-[0.12em]",
        tone === "panel" ? "text-[var(--brand-ink-panel)]" : "text-[var(--brand-ink)]",
      )}
    >
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  align = "left",
  as: Heading = "h2",
  tone = "page",
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  align?: "left" | "center";
  as?: "h1" | "h2";
  tone?: "page" | "panel";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow ? <Eyebrow tone={tone}>{eyebrow}</Eyebrow> : null}
      <Heading
        className={cn(
          "mt-2 text-balance font-semibold tracking-tight",
          Heading === "h1"
          ? "text-4xl sm:text-5xl lg:text-6xl"
          : "text-2xl sm:text-3xl lg:text-[2.5rem] lg:leading-[1.1]",
        )}
      >
        {title}
      </Heading>
      {body ? (
        <p
          className={cn(
            "mt-4 text-pretty leading-relaxed",
            tone === "panel" ? "text-[var(--panel-ink-secondary)]" : "text-[var(--text-secondary)]",
          )}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Marks a block running on sample content.
 *
 * Deliberately quiet rather than a loud warning banner — it sits with the
 * section it describes so a reader sees it at the moment it matters, without
 * making the page look broken. It must never be removed to tidy the design:
 * an unmarked invented testimonial is a fabricated endorsement.
 */
export function PlaceholderNotice({
  what,
  tone = "page",
  className,
}: {
  what: string;
  tone?: "page" | "panel";
  className?: string;
}) {
  return (
    <p
      role="note"
      className={cn(
        "inline-flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-xs",
        tone === "panel"
          ? "border-[var(--panel-border)] text-[var(--panel-ink-muted)]"
          : "border-[var(--border-strong)] text-[var(--text-muted)]",
        className,
      )}
    >
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        <strong className="font-medium">Sample content.</strong> {what}
      </span>
    </p>
  );
}

type ButtonLinkProps = {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "onDark";
  size?: "md" | "lg";
  className?: string;
};

/** Anchor styled as a button — the marketing pages navigate, they do not submit. */
export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  className,
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        size === "lg" ? "px-6 py-3 text-base" : "px-4 py-2.5 text-sm",
        variant === "primary" &&
          "bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]",
        variant === "secondary" &&
          "border border-[var(--border-strong)] bg-[var(--surface-raised)] hover:border-[var(--accent)] hover:text-[var(--brand-ink)]",
        variant === "onDark" &&
          "border border-[var(--panel-border)] bg-white/5 text-[var(--panel-ink)] hover:bg-white/10",
        variant === "ghost" && "text-[var(--brand-ink)] hover:underline",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function CtaBand({
  title,
  body,
  primary,
  secondary,
}: {
  title: string;
  body: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <Section>
      <div className="relative overflow-hidden rounded-2xl bg-[var(--accent)] px-6 py-14 text-center sm:px-12">
        {/* Soft light behind the copy, purely decorative. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 size-64 rounded-full bg-white/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -right-16 size-64 rounded-full bg-white/10 blur-3xl"
        />

        <div className="relative">
          {/* Same scale as every other section heading. It used to stop at
              text-4xl while the rest reached 2.5rem, so the closing line of the
              page was quietly the smallest headline on it. */}
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-[var(--accent-contrast)] sm:text-3xl lg:text-[2.5rem] lg:leading-[1.1]">
            {title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-[var(--accent-contrast)]/85">
            {body}
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={primary.href}
              // --accent, not --brand-ink. This button is white in both themes,
              // but --brand-ink flips to a light orange in dark mode, which put
              // the page's most important call to action at 2.74:1 on white.
              // --accent is #d1471c in both marketing themes and is tuned to
              // pair with white, so it reads 4.54:1 either way round.
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 font-medium text-[var(--brand-ink-on-white)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {primary.label}
            </Link>
            {secondary ? (
              <Link
                href={secondary.href}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/30 px-6 py-3 font-medium text-[var(--accent-contrast)] transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {secondary.label}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </Section>
  );
}
