import { Activity, ArrowRight, BarChart3, Check, Play, Search, Send, Sparkles, Target, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { cn } from "@aso/shared";
import {
  ButtonLink,
  DarkPanel,
  PlaceholderNotice,
  Section,
  SectionHeading,
} from "@/components/marketing/sections";
import { DashboardMockup } from "@/components/marketing/mockups/dashboard";
import {
  AppIntelligenceMockup,
  CompetitorMockup,
  CrossLocaleMockup,
  ImpactMockup,
  KeywordTableMockup,
  ListingCompareMockup,
} from "@/components/marketing/mockups/panels";
import { ClientMark } from "@/components/marketing/client-mark";
import {
  CLIENTS,
  DASHBOARD_POINTS,
  FEATURE_CARDS,
  HERO,
  INTEGRATIONS,
  LOGO_WALL,
  PRICING,
} from "@/content/site";

const ICONS = {
  search: Search,
  trending: TrendingUp,
  users: Users,
  sparkles: Sparkles,
  activity: Activity,
  target: Target,
  chart: BarChart3,
  send: Send,
} as const;

export function Hero() {
  return (
    <Section space="hero">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-10">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-[var(--brand-soft)] px-3 py-1 text-xs font-medium text-[var(--brand-ink)]">
            <Sparkles className="size-3.5" aria-hidden />
            {HERO.badge}
          </span>

          <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            {HERO.headline.lead}{" "}
            <span className="text-[var(--brand-ink)]">{HERO.headline.accent}</span>
          </h1>

          <p className="mt-6 max-w-xl text-pretty leading-relaxed text-[var(--text-secondary)]">
            {HERO.body}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href={HERO.primary.href} size="lg">
              {HERO.primary.label} <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href={HERO.secondary.href} variant="secondary" size="lg">
              <Play className="size-4" aria-hidden /> {HERO.secondary.label}
            </ButtonLink>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
            {HERO.assurances.map((item) => (
              <li key={item} className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
                <Check className="size-4 text-[var(--status-good)]" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* `overflow-x-clip` rather than `overflow-hidden`: the glow below is
            inset by -32px on every side, which pushed the page 32px wider than
            a 375px phone and gave the whole site a horizontal scrollbar. Clip
            trims the bleed without creating a scroll container, so sticky and
            focus behaviour elsewhere is untouched. */}
        <div className="relative overflow-x-clip">
          {/* Decorative glow, kept behind the panel and out of the a11y tree. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-8 -z-10 rounded-full bg-[var(--accent)]/10 blur-3xl"
          />
          <DashboardMockup />
        </div>
      </div>
    </Section>
  );
}

/**
 * Logo wall.
 *
 * Renders neutral marks rather than real company logos: publishing another
 * company's mark claims an endorsement we do not have and uses artwork that is
 * not ours. The headline claim is omitted entirely when no count is set.
 */
export function LogoWall() {
  return (
    <Section space="band">
      <p className="text-center text-sm text-[var(--text-muted)]">
        {LOGO_WALL.customerCount
          ? `Trusted by ${LOGO_WALL.customerCount.toLocaleString()}+ app teams`
          : LOGO_WALL.heading}
      </p>

      <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-10 gap-y-6 sm:gap-x-14">
        {CLIENTS.map((client) => (
          <li
            key={client.name}
            // Muted by default and full strength on hover, the way a real logo
            // wall sits behind the copy instead of competing with it.
            className="flex items-center gap-2 text-[var(--text-muted)] opacity-70 transition-all hover:text-[var(--text-secondary)] hover:opacity-100"
          >
            <ClientMark mark={client.mark} />
            <span className="text-base font-semibold tracking-tight">{client.name}</span>
          </li>
        ))}
      </ul>

      {LOGO_WALL.placeholder ? (
        <div className="mt-6 flex justify-center">
          <PlaceholderNotice what="These studios are invented. Real company logos are not shown because they are not ours to publish and would imply an endorsement." />
        </div>
      ) : null}
    </Section>
  );
}

/**
 * Column spans that keep the last row of a card grid full, whatever the count.
 *
 * Five cards in a four-column grid left one stranded on its own row, which
 * reads as a mistake rather than a layout. A six-column track divides by both
 * two and three, so five cards become a row of three and a row of two, each
 * row filling the width.
 *
 * The rule is derived from the count rather than hardcoded, because the card
 * list is content and will change: six stays 3+3, four becomes 3 plus one wide
 * card, seven becomes 3+3 plus one wide. There is never a lone narrow card.
 */
function cardSpan(index: number, total: number): string {
  const remainder = total % 3;
  const inFullRows = total - remainder;

  if (index < inFullRows) return "lg:col-span-2";
  return remainder === 2 ? "lg:col-span-3" : "lg:col-span-6";
}

export function FeatureGrid() {
  return (
    <Section id="features">
      <SectionHeading
        align="center"
        title="Everything you need to rank higher and grow faster"
        body="Six connected sources, one daily table, and the tools to act on what it shows."
      />

      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {FEATURE_CARDS.map((card, index) => {
          const Icon = ICONS[card.icon];
          const total = FEATURE_CARDS.length;
          // Cards on the shorter last row are wider, so the same short body
          // would leave a band of dead space to its right. Laying the icon
          // beside the text instead keeps the card as dense as its narrower
          // siblings rather than looking like it is missing something.
          const wide = index >= total - (total % 3) && total % 3 !== 0;
          return (
            <li
              key={card.id}
              className={cn(
                cardSpan(index, total),
                // Same problem one breakpoint down: an odd count leaves the
                // last card alone in a two-column grid, so it takes the row.
                total % 2 === 1 && index === total - 1 && "sm:col-span-2 lg:col-span-3",
              )}
            >
              <Link
                href={card.href}
                className={cn(
                  "group flex h-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-lg hover:shadow-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                  wide ? "flex-col lg:flex-row lg:items-start lg:gap-5" : "flex-col",
                )}
              >
                {/* One accent, not four.
                    The tint used to cycle through emerald, amber and sky by
                    array index, so the colour of a card carried no meaning and
                    the grid read as decoration. A single brand tint lets the
                    cards read as one set. */}
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand-ink)] transition-colors group-hover:bg-[var(--accent)] group-hover:text-[var(--accent-contrast)]">
                  <Icon className="size-5" aria-hidden />
                </span>

                <div className={cn("flex flex-1 flex-col", wide && "lg:mt-0")}>
                <h3 className={cn("text-base font-semibold", wide ? "mt-4 lg:mt-0" : "mt-4")}>
                  {card.title}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {card.body}
                </p>

                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-ink)]">
                  Explore
                  <ArrowRight
                    className="size-3.5 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function DashboardShowcase() {
  return (
    <DarkPanel id="dashboard">
      <SectionHeading
        tone="panel"
        eyebrow="Unified dashboard"
        title="Powerful insights. One dashboard."
        body="Every provider writes into the same daily table, with its source recorded — so any number on any chart can be traced back to where it came from."
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-10">
        <ul className="flex flex-col gap-6">
          {DASHBOARD_POINTS.map((point) => {
            const Icon = ICONS[point.icon];
            return (
              <li key={point.title} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.07] text-[var(--brand-ink-panel)]">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{point.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--panel-ink-secondary)]">
                    {point.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        <DashboardMockup />
      </div>
    </DarkPanel>
  );
}

export function KeywordSection() {
  return (
    <DarkPanel id="keywords">
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-12">
        <div>
          <SectionHeading
            tone="panel"
            eyebrow="Keyword research"
            title="Find keywords worth ranking for."
            body="Volume, difficulty and an opportunity score, so prioritisation is a decision rather than a hunch."
          />
          <p className="mt-4 text-sm text-[var(--panel-ink-muted)]">
            Neither store publishes a keyword API. Difficulty here is an explicit model built from
            the strength of the apps currently ranking — stable and comparable across terms, which
            is what prioritisation needs.
          </p>

          <div className="mt-6">
            <ButtonLink href="/benefits#keywords" variant="onDark">
              How it works <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
        </div>

        <KeywordTableMockup />
      </div>
    </DarkPanel>
  );
}

export function AiWriterSection() {
  return (
    <Section id="ai">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-12">
        <div>
          <SectionHeading
            eyebrow="AI ASO writer"
            title="Optimisation that fits the field."
            body="Variants are generated per field and rejected outright if they exceed that store's character limit — nothing reaches the store that the store would truncate."
          />
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            It drafts; you publish. Nothing is written to your listing automatically.
          </p>
        </div>

        <ListingCompareMockup />
      </div>
    </Section>
  );
}

export function CompetitorSection() {
  return (
    <Section id="competitors">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-12">
        <div>
          <SectionHeading
            eyebrow="Competitor intelligence"
            title="Know where you actually stand."
            body="Competitor positions are captured from the same result page your own rank was measured on — not a separate lookup taken minutes later, which would not be comparable."
          />
          <div className="mt-6">
            <ButtonLink href="/showcase" variant="secondary">
              See a worked example <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
        </div>

        <CompetitorMockup />
      </div>
    </Section>
  );
}

export function ImpactSection() {
  return (
    <DarkPanel id="impact">
      <SectionHeading
        tone="panel"
        eyebrow="See the impact"
        title="Measure what the listing did on its own."
        body="Organic separated from paid, so a campaign launch is never mistaken for an optimisation win."
      />

      <div className="mt-8">
        <ImpactMockup />
      </div>

      <PlaceholderNotice
        tone="panel"
        className="mt-6"
        what="An illustration of the comparison the product draws. The figures are not from a real account."
      />
    </DarkPanel>
  );
}

export function IntegrationsSection() {
  return (
    <Section id="integrations">
      <SectionHeading
        align="center"
        eyebrow="Integrations"
        title="Connect what you already have"
        body="Every connector is independent. Metrics with no connected source report as having no data — never as zero."
      />

      <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {INTEGRATIONS.map((item) => (
          <li
            key={item.name}
            className="flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand-ink)]"
            >
              {item.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">{item.name}</h3>
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{item.provides}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
        Credentials are encrypted with AES-256-GCM before they are written and never returned to the
        browser.
      </p>
    </Section>
  );
}

export function Pricing() {
  return (
    <Section id="pricing">
      <SectionHeading
        align="center"
        eyebrow="Pricing"
        title="Simple pricing for every stage"
        body="Start on the free tier with one app and one integration. Move up when the portfolio does."
      />

      {PRICING.placeholder ? (
        <div className="mt-6 flex justify-center">
          <PlaceholderNotice what={PRICING.note} />
        </div>
      ) : null}

      <ul className="mt-10 grid items-start gap-4 lg:grid-cols-3">
        {PRICING.tiers.map((tier) => (
          <li
            key={tier.name}
            className={cn(
              "relative flex h-full flex-col rounded-2xl border p-6",
              tier.featured
                ? "border-[var(--accent)] bg-[var(--surface-raised)] shadow-xl shadow-[var(--accent)]/10 lg:-mt-4 lg:pb-10"
                : "border-[var(--border)] bg-[var(--surface)]",
            )}
          >
            {tier.featured ? (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-medium text-[var(--accent-contrast)]">
                Most popular
              </span>
            ) : null}

            <h3 className="text-sm font-semibold">{tier.name}</h3>
            <p className="mt-3 flex items-baseline gap-1">
              <span className="tabular text-4xl font-bold tracking-tight">{tier.price}</span>
              <span className="text-sm text-[var(--text-muted)]">{tier.cadence}</span>
            </p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{tier.audience}</p>

            <ul className="mt-6 flex flex-1 flex-col gap-2.5">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-[var(--status-good)]" aria-hidden />
                  <span className="text-[var(--text-secondary)]">{feature}</span>
                </li>
              ))}
            </ul>

            <ButtonLink
              href={tier.cta.href}
              variant={tier.featured ? "primary" : "secondary"}
              className="mt-6 w-full"
            >
              {tier.cta.label}
            </ButtonLink>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <span className="text-sm text-[var(--text-muted)]">All plans include</span>
        {PRICING.includedEverywhere.map((item) => (
          <span key={item} className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
            <Check className="size-4 text-[var(--status-good)]" aria-hidden />
            {item}
          </span>
        ))}
      </div>
    </Section>
  );
}

/** 360 App Market Intelligence Feature Section */
export function AppIntelligenceSection() {
  return (
    <Section id="intelligence">
      <SectionHeading
        eyebrow="Market Intelligence"
        title="Reverse-engineer any app on iOS and Android"
        body="Paste any App Store or Google Play URL. Calculate monthly downloads, gross/net publisher revenue, active ad campaigns, tech stack frameworks, and IAP pricing catalogs with calibrated institutional precision."
      />

      <div className="mt-12 grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <AppIntelligenceMockup />
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-[var(--text-primary)]">
              Downloads & Revenue Run-Rate Modeling
            </h3>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              Calibrated mathematical modeling estimating monthly download velocity, annual run-rate ($ ARR), Revenue Per Download (RPD), and ARPPU with 6-month historical momentum curves.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold text-[var(--text-primary)]">
              Paid UA & Active Ad Network Detection
            </h3>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              See exact monthly ad spend estimates, category share of voice (SOV %), and active campaigns across Apple Search Ads, Google UAC, Meta Ads, TikTok, and AppLovin MAX.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold text-[var(--text-primary)]">
              Live In-App Purchase & PPP Matrix
            </h3>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              Scrape full subscription and IAP tiers with Purchasing Power Parity (PPP) adjustments across 15+ global currencies.
            </p>
          </div>

          <div className="pt-2">
            <ButtonLink href="/signin" size="md">
              Inspect Any App Free <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
        </div>
      </div>
    </Section>
  );
}

/** Cross-Localization 9x Multiplier Section */
export function CrossLocaleSection() {
  return (
    <Section id="cross-locale">
      <SectionHeading
        eyebrow="Cross-Localization"
        title="Multiply keyword space by 9x in the US App Store"
        body="Apple's search algorithm indexes multiple secondary storefront languages simultaneously. IndexForge unlocks up to 900 characters in the US storefront alone without keyword duplication."
      />

      <div className="mt-12 grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-[var(--text-primary)]">
              100 Characters is a Bottleneck
            </h3>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              Most ASO tools optimize only the primary 100-character keyword field. IndexForge exploits verified secondary indexing (Spanish Mexico, Arabic, Russian, Chinese Simplified, French Canada, Korean, Portuguese, Vietnamese).
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold text-[var(--text-primary)]">
              Zero Duplication Deduplicator
            </h3>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              Apple combines terms across locales. Our engine automatically eliminates repeated characters across language banks to maximize unique ranking coverage.
            </p>
          </div>

          <div className="pt-2">
            <ButtonLink href="/features/ai-aso-writer" variant="secondary" size="md">
              Learn Cross-Localization <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
        </div>
        <CrossLocaleMockup />
      </div>
    </Section>
  );
}

/** Comprehensive Feature Matrix Comparison */
export function ComparisonSection() {
  const MATRIX = [
    { feature: "Commercial Download & Revenue Estimations ($ ARR)", indexforge: "Included", legacyAso: "Add-on ($1,500/mo)", manual: "None" },
    { feature: "Paid UA Ad Spend & Network Detection", indexforge: "Included", legacyAso: "None", manual: "None" },
    { feature: "722,000+ Keyword Corpus with Live Difficulty", indexforge: "Included", legacyAso: "Limited", manual: "None" },
    { feature: "Apple 9x Cross-Localization Character Bank", indexforge: "Included", legacyAso: "None", manual: "Manual Spreadsheets" },
    { feature: "IAP Pricing & 15+ Currency PPP Matrix", indexforge: "Included", legacyAso: "None", manual: "Manual Currency Lookup" },
    { feature: "SDK Tech Stack & Permission Risk Audit", indexforge: "Included", legacyAso: "Add-on ($2,000/mo)", manual: "None" },
    { feature: "6-Source Attribution & Zero Double-Counting", indexforge: "Included", legacyAso: "None", manual: "Broken Excel Joins" },
    { feature: "Multi-App Push Notification Campaigns (FCM)", indexforge: "Included", legacyAso: "None", manual: "Multiple Consoles" },
  ];

  return (
    <Section id="comparison">
      <SectionHeading
        align="center"
        eyebrow="Direct Comparison"
        title="Why high-growth teams switch to IndexForge"
        body="Everything required to reverse-engineer markets, track ranks, optimize listings, and manage campaigns in one unified system."
      />

      <div className="mx-auto mt-12 max-w-5xl overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 sm:p-6">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
              <th className="py-3 px-4 font-semibold">Capability</th>
              <th className="py-3 px-4 font-bold text-[var(--brand-ink)]">IndexForge</th>
              <th className="py-3 px-4 font-medium">Legacy ASO Tools</th>
              <th className="py-3 px-4 font-medium">Manual Spreadsheets</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {MATRIX.map((row) => (
              <tr key={row.feature} className="hover:bg-[var(--page)]/50 transition-colors">
                <td className="py-3.5 px-4 font-medium text-[var(--text-primary)]">{row.feature}</td>
                <td className="py-3.5 px-4 font-semibold text-emerald-400 flex items-center gap-1.5">
                  <Check className="size-4 shrink-0" /> {row.indexforge}
                </td>
                <td className="py-3.5 px-4 text-[var(--text-secondary)]">{row.legacyAso}</td>
                <td className="py-3.5 px-4 text-[var(--text-muted)]">{row.manual}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
