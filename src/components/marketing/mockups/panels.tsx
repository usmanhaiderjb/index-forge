import { ArrowRight, Check, Sparkles } from "lucide-react";

import { cn } from "@aso/shared";
import { Panel, Sparkline } from "@/components/marketing/mockups/primitives";

const KEYWORDS = [
  { term: "photo scanner", volume: "92K", difficulty: 34, tone: "#fbbf24", opportunity: 3 },
  { term: "pdf scanner", volume: "74K", difficulty: 29, tone: "#4ade80", opportunity: 5 },
  { term: "document scanner", volume: "61K", difficulty: 41, tone: "#f87171", opportunity: 2 },
  { term: "scan documents", volume: "48K", difficulty: 22, tone: "#4ade80", opportunity: 4 },
  { term: "pdf maker", volume: "36K", difficulty: 31, tone: "#fbbf24", opportunity: 3 },
];

export function KeywordTableMockup() {
  return (
    <Panel className="p-3 sm:p-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-[var(--panel-ink-muted)]">
              <th className="pb-2 font-medium">Keyword</th>
              <th className="pb-2 font-medium">Volume</th>
              <th className="pb-2 font-medium">Difficulty</th>
              <th className="pb-2 font-medium">Opportunity</th>
            </tr>
          </thead>
          <tbody>
            {KEYWORDS.map((row) => (
              <tr key={row.term} className="border-t border-[var(--panel-border)]">
                <td className="py-2.5 text-xs">{row.term}</td>
                <td className="tabular py-2.5 text-xs text-[var(--panel-ink-secondary)]">
                  {row.volume}
                </td>
                <td className="py-2.5">
                  <span className="tabular inline-flex items-center gap-1.5 text-xs">
                    <span className="size-1.5 rounded-full" style={{ background: row.tone }} />
                    {row.difficulty}
                  </span>
                </td>
                <td className="py-2.5">
                  <span className="flex gap-0.5" aria-label={`${row.opportunity} of 5`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span
                        key={i}
                        className="size-2.5 rounded-[3px]"
                        style={{
                          background: i < row.opportunity ? "var(--accent)" : "rgba(255,255,255,0.1)",
                        }}
                      />
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** Before and after for the AI writer, with the field limits made visible. */
export function ListingCompareMockup() {
  return (
    <div className="grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Your listing
        </p>
        <div className="mt-3 flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand-ink)]">
            PDF
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">PDF Scanner</p>
            <p className="truncate text-xs text-[var(--text-muted)]">Scan Documents</p>
          </div>
        </div>

        <dl className="mt-4 flex flex-col gap-2.5">
          <Field label="Title" value="PDF Scanner" used={11} limit={30} />
          <Field label="Subtitle" value="Scan Documents" used={14} limit={30} />
        </dl>
      </div>

      <div className="flex justify-center lg:flex-col">
        <span className="flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-medium text-[var(--brand-ink)]">
          <Sparkles className="size-3.5" aria-hidden /> AI
          <ArrowRight className="size-3.5 lg:rotate-90" aria-hidden />
        </span>
      </div>

      <div className="rounded-xl border-2 border-[var(--accent)] bg-[var(--surface-raised)] p-4">
        {/* --brand-ink is the text token; --accent is the fill token used for
            the border and badge beside it. As text on --surface-raised the
            fill colour managed only 3.51:1. */}
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-ink)]">
          Optimised
        </p>
        <div className="mt-3 flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--accent)] text-xs font-bold text-[var(--accent-contrast)]">
            PDF
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">PDF Scanner &amp; Doc Scan</p>
            <p className="truncate text-xs text-[var(--text-muted)]">Scan, Save &amp; Share PDFs</p>
          </div>
        </div>

        <dl className="mt-4 flex flex-col gap-2.5">
          <Field label="Title" value="PDF Scanner & Doc Scan" used={22} limit={30} improved />
          <Field label="Subtitle" value="Scan, Save & Share PDFs" used={23} limit={30} improved />
        </dl>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  used,
  limit,
  improved = false,
}: {
  label: string;
  value: string;
  used: number;
  limit: number;
  improved?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <dt className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</dt>
        <span className="tabular text-[10px] text-[var(--text-muted)]">
          {used}/{limit}
        </span>
      </div>
      <dd className="mt-1 flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--page)] px-2.5 py-1.5">
        <span className="min-w-0 flex-1 truncate text-xs">{value}</span>
        {improved ? (
          <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-[var(--status-good)]">
            <Check className="size-3" aria-hidden /> Fits
          </span>
        ) : null}
      </dd>
    </div>
  );
}

/** Two providers reporting one pot of money, and what aggregation does with it. */
export function SourcePrecedenceMockup() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-5">
      <p className="text-xs font-semibold">Ad revenue · last 7 days</p>

      <ul className="mt-4 flex flex-col gap-2">
        {[
          { source: "AdMob", value: "$700.00", used: true, note: "bills the ads" },
          { source: "Firebase / GA4", value: "$686.00", used: false, note: "observes the events" },
        ].map((row) => (
          <li
            key={row.source}
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-2.5",
              row.used
                ? "border-[var(--accent)] bg-[var(--brand-soft)]"
                : "border-[var(--border)] opacity-60",
            )}
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-md text-[10px] font-bold",
                row.used
                  ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                  : "bg-[var(--border)] text-[var(--text-muted)]",
              )}
            >
              {row.used ? <Check className="size-3.5" aria-hidden /> : "—"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{row.source}</span>
              <span className="block text-[11px] text-[var(--text-muted)]">{row.note}</span>
            </span>
            <span
              className={cn(
                "tabular shrink-0 text-sm",
                row.used ? "font-semibold" : "text-[var(--text-muted)] line-through",
              )}
            >
              {row.value}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between rounded-lg bg-[var(--page)] px-3 py-2.5">
        <span className="text-sm font-medium">Reported</span>
        <span className="tabular text-lg font-semibold">$700.00</span>
      </div>
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
        Summing both sources would report $1,386 — the same money, counted twice.
      </p>
    </div>
  );
}

/** The organic and paid split, and the share that ASO is judged on. */
export function OrganicSplitMockup() {
  const organic = 85;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold">Installs · last 30 days</p>
        <p className="tabular text-sm text-[var(--text-muted)]">37.9K total</p>
      </div>

      <div className="mt-4 flex h-3 overflow-hidden rounded-full">
        <div style={{ width: `${organic}%`, background: "var(--accent)" }} aria-hidden />
        <div style={{ width: `${100 - organic}%`, background: "#4ade80" }} aria-hidden />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <dt className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <span className="size-2 rounded-[3px] bg-[var(--accent)]" aria-hidden /> Organic
          </dt>
          <dd className="tabular mt-0.5 text-xl font-semibold">32.0K</dd>
          <dd className="tabular text-[11px] text-[var(--text-muted)]">{organic}% of installs</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <span className="size-2 rounded-[3px]" style={{ background: "#4ade80" }} aria-hidden />{" "}
            Paid
          </dt>
          <dd className="tabular mt-0.5 text-xl font-semibold">5.9K</dd>
          <dd className="tabular text-[11px] text-[var(--text-muted)]">
            {100 - organic}% of installs
          </dd>
        </div>
      </dl>

      <p className="mt-4 border-t border-[var(--border)] pt-3 text-[11px] text-[var(--text-muted)]">
        With no ad account connected the split is withheld, not assumed to be fully organic.
      </p>
    </div>
  );
}

const REVIEWS = [
  {
    rating: 2,
    title: "Crashes on open",
    themes: ["crash", "stability"],
    tone: "#f87171",
  },
  {
    rating: 5,
    title: "Finally one that sticks",
    themes: ["onboarding"],
    tone: "#4ade80",
  },
  {
    rating: 1,
    title: "Lost all my streaks",
    themes: ["sync", "data-loss"],
    tone: "#f87171",
  },
];

/** Reviews arriving as themes rather than as a rating that moved. */
export function ReviewThemesMockup() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold">Recent reviews</p>
        <p className="text-[11px] text-[var(--text-muted)]">classified on ingest</p>
      </div>

      <ul className="mt-4 flex flex-col gap-2.5">
        {REVIEWS.map((review) => (
          <li
            key={review.title}
            className="rounded-lg border border-[var(--border)] bg-[var(--page)] p-3"
          >
            <div className="flex items-center gap-2">
              <span className="tabular text-xs" style={{ color: review.tone }} aria-hidden>
                {"★".repeat(review.rating)}
                <span className="text-[var(--text-muted)]">{"★".repeat(5 - review.rating)}</span>
              </span>
              <span className="sr-only">{review.rating} out of 5</span>
              <span className="truncate text-sm font-medium">{review.title}</span>
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {review.themes.map((theme) => (
                <li
                  key={theme}
                  className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]"
                >
                  {theme}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] text-[var(--text-muted)]">
        A rating that fell 0.2 tells you something is wrong. A spike in{" "}
        <span className="text-[var(--text-secondary)]">crash</span> tells you what.
      </p>
    </div>
  );
}

const VISIBILITY = [
  { label: "Your app", value: 72, color: "var(--accent)" },
  { label: "Competitor A", value: 86, color: "#4ade80" },
  { label: "Competitor B", value: 64, color: "#fbbf24" },
  { label: "Competitor C", value: 51, color: "#f87171" },
];

export function CompetitorMockup() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
        <p className="text-xs font-semibold">Visibility comparison</p>
        <ul className="mt-4 flex flex-col gap-3">
          {VISIBILITY.map((row) => (
            <li key={row.label}>
              <div className="flex items-center justify-between text-xs">
                <span className={row.label === "Your app" ? "font-medium" : "text-[var(--text-secondary)]"}>
                  {row.label}
                </span>
                <span className="tabular text-[var(--text-muted)]">{row.value}%</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${row.value}%`, background: row.color }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
        <p className="text-xs font-semibold">Keyword gap</p>

        <div className="mt-3 flex justify-center">
          <svg viewBox="0 0 200 110" className="h-28 w-full max-w-[15rem]" role="img" aria-label="Keyword overlap: 312 yours, 563 theirs, 157 shared">
            <circle cx="78" cy="55" r="46" fill="var(--accent)" opacity="0.28" />
            <circle cx="122" cy="55" r="46" fill="#4ade80" opacity="0.28" />
            <text x="50" y="60" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--text-primary)">312</text>
            <text x="100" y="60" textAnchor="middle" fontSize="11" fill="var(--text-secondary)">157</text>
            <text x="150" y="60" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--text-primary)">563</text>
          </svg>
        </div>

        <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[11px] text-[var(--text-secondary)]">
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-[3px]" style={{ background: "var(--accent)" }} /> Yours
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-[3px]" style={{ background: "#4ade80" }} /> Theirs
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-[3px] bg-[var(--text-muted)]" /> Shared
          </li>
        </ul>
      </div>
    </div>
  );
}

export function ImpactMockup() {
  return (
    <div className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr]">
      <ImpactCard
        heading="Before"
        stats={[
          { label: "Visibility", value: "45" },
          { label: "Avg. rank", value: "#32" },
          { label: "Installs / day", value: "1,250" },
        ]}
        points={[0.2, 0.28, 0.24, 0.32, 0.3, 0.38, 0.34, 0.4]}
        color="#8892b0"
      />

      <div className="flex items-center justify-center">
        <div className="rounded-xl border border-[var(--panel-border)] bg-[var(--accent)] px-4 py-3 text-center text-[var(--accent-contrast)]">
          <p className="text-xs font-semibold">Optimisation</p>
          <ul className="mt-1.5 flex flex-col gap-0.5 text-[10px] opacity-90">
            <li>Keyword targeting</li>
            <li>Metadata rewrite</li>
            <li>Creative order</li>
          </ul>
        </div>
      </div>

      <ImpactCard
        heading="After"
        stats={[
          { label: "Visibility", value: "72", delta: "+60%" },
          { label: "Avg. rank", value: "#18", delta: "-14" },
          { label: "Installs / day", value: "2,890", delta: "+131%" },
        ]}
        points={[0.32, 0.4, 0.46, 0.52, 0.62, 0.7, 0.78, 0.88]}
        color="#4ade80"
      />
    </div>
  );
}

function ImpactCard({
  heading,
  stats,
  points,
  color,
}: {
  heading: string;
  stats: { label: string; value: string; delta?: string }[];
  points: number[];
  color: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel-raised)] p-4 text-[var(--panel-ink)]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--panel-ink-muted)]">
        {heading}
      </p>

      <dl className="mt-3 grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-[10px] text-[var(--panel-ink-muted)]">{stat.label}</dt>
            <dd className="tabular mt-0.5 text-base font-semibold leading-none">{stat.value}</dd>
            {stat.delta ? (
              <dd className="tabular text-[10px]" style={{ color }}>
                {stat.delta}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>

      <div className="mt-3">
        <Sparkline points={points} color={color} className="h-14" />
      </div>
    </div>
  );
}

/**
 * One campaign, many apps, and the partial outcome that makes it honest.
 *
 * The "1 partial" row is the point of the illustration: a tool that reports
 * every campaign as sent is hiding the one key that expired.
 */
const PUSH_DELIVERIES = [
  { app: "Habitly", status: "Sent", tone: "var(--status-good)" },
  { app: "Pocketwise", status: "Sent", tone: "var(--status-good)" },
  { app: "Streakly", status: "Sent", tone: "var(--status-good)" },
  { app: "Routinely", status: "Key expired", tone: "var(--status-critical)" },
];

export function PushCampaignMockup() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold">Version 3.2 is live</p>
        <p className="text-[11px] text-[var(--text-muted)]">topic: all</p>
      </div>

      <p className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--page)] p-3 text-sm text-[var(--text-secondary)]">
        Streaks now sync across devices.
      </p>

      <ul className="mt-4 flex flex-col gap-1.5">
        {PUSH_DELIVERIES.map((row) => (
          <li
            key={row.app}
            className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--page)] px-3 py-2"
          >
            <span className="text-sm">{row.app}</span>
            <span className="text-[11px]" style={{ color: row.tone }}>
              {row.status}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] text-[var(--text-muted)]">
        Three sent, one key expired — reported as{" "}
        <span className="text-[var(--text-secondary)]">partial</span>, not as sent.
      </p>
    </div>
  );
}

/** Market Intelligence Dossier Mockup */
export function AppIntelligenceMockup() {
  return (
    <Panel className="p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--panel-border)] pb-3">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-md flex items-center justify-center font-bold text-white text-lg">
            D
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--panel-ink-primary)]">Duolingo: Language Lessons</span>
              <span className="rounded bg-[var(--panel-border)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--panel-ink-secondary)]">iOS &bull; US</span>
            </div>
            <p className="text-[11px] text-[var(--panel-ink-muted)]">Education &bull; 4.8 ★ (2.5M reviews)</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-[var(--panel-ink-muted)] uppercase tracking-wider block">Health Score</span>
          <span className="text-base font-bold text-emerald-400">96/100</span>
        </div>
      </div>

      {/* 4-KPI Row */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-lg bg-[rgba(255,255,255,0.03)] border border-[var(--panel-border)] p-2.5">
          <span className="text-[10px] text-[var(--panel-ink-muted)] block">Est. Monthly DLs</span>
          <span className="text-base font-bold text-[var(--panel-ink-primary)]">1,125,000</span>
          <span className="text-[9px] text-emerald-400 block">+14.2% MoM</span>
        </div>
        <div className="rounded-lg bg-[rgba(255,255,255,0.03)] border border-[var(--panel-border)] p-2.5">
          <span className="text-[10px] text-[var(--panel-ink-muted)] block">Monthly Revenue</span>
          <span className="text-base font-bold text-emerald-400">$4,850,000</span>
          <span className="text-[9px] text-[var(--panel-ink-secondary)]">$58.2M ARR</span>
        </div>
        <div className="rounded-lg bg-[rgba(255,255,255,0.03)] border border-[var(--panel-border)] p-2.5">
          <span className="text-[10px] text-[var(--panel-ink-muted)] block">Est. Ad Spend</span>
          <span className="text-base font-bold text-blue-400">$1,180,000</span>
          <span className="text-[9px] text-[var(--panel-ink-muted)]">68% Share of Voice</span>
        </div>
        <div className="rounded-lg bg-[rgba(255,255,255,0.03)] border border-[var(--panel-border)] p-2.5">
          <span className="text-[10px] text-[var(--panel-ink-muted)] block">Paid vs Organic</span>
          <span className="text-base font-bold text-[var(--accent)]">35% / 65%</span>
          <span className="text-[9px] text-[var(--panel-ink-secondary)]">$3.00 Blended CPI</span>
        </div>
      </div>

      {/* Active Ad Networks & Tech Stack */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1">
        <div className="rounded-lg border border-[var(--panel-border)] bg-[rgba(255,255,255,0.02)] p-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--panel-ink-muted)] block mb-2">
            Active Paid Ad Networks
          </span>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 text-[10px]">
              Apple Search Ads (45%)
            </span>
            <span className="rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[10px]">
              Google UAC (30%)
            </span>
            <span className="rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 text-[10px]">
              Meta / IG (15%)
            </span>
            <span className="rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2 py-0.5 text-[10px]">
              TikTok Ads (8%)
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--panel-border)] bg-[rgba(255,255,255,0.02)] p-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--panel-ink-muted)] block mb-2">
            Detected Tech Stack & SDKs
          </span>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded bg-[var(--panel-border)] text-[var(--panel-ink-primary)] px-2 py-0.5 text-[10px]">
              Native Swift
            </span>
            <span className="rounded bg-[var(--panel-border)] text-[var(--panel-ink-primary)] px-2 py-0.5 text-[10px]">
              Adjust
            </span>
            <span className="rounded bg-[var(--panel-border)] text-[var(--panel-ink-primary)] px-2 py-0.5 text-[10px]">
              RevenueCat
            </span>
            <span className="rounded bg-[var(--panel-border)] text-[var(--panel-ink-primary)] px-2 py-0.5 text-[10px]">
              Google AdMob
            </span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/** Apple Cross-Localization 9x Multiplier Mockup */
export function CrossLocaleMockup() {
  const LOCALES = [
    { loc: "en-US", lang: "English (US)", chars: "100/100", status: "Primary Storefront", mult: "1x" },
    { loc: "es-MX", lang: "Spanish (Mexico)", chars: "100/100", status: "Cross-Indexed in US", mult: "2x" },
    { loc: "ar-SA", lang: "Arabic", chars: "100/100", status: "Cross-Indexed in US", mult: "3x" },
    { loc: "ru-RU", lang: "Russian", chars: "100/100", status: "Cross-Indexed in US", mult: "4x" },
    { loc: "zh-Hans", lang: "Chinese (Simplified)", chars: "100/100", status: "Cross-Indexed in US", mult: "5x" },
  ];

  return (
    <Panel className="p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--panel-border)] pb-2.5">
        <div>
          <span className="text-xs font-semibold text-[var(--panel-ink-primary)]">US Storefront 9x Multiplier Bank</span>
          <p className="text-[10px] text-[var(--panel-ink-muted)]">Indexed simultaneously by Apple US search</p>
        </div>
        <span className="rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold">
          900 Characters Active
        </span>
      </div>

      <div className="space-y-1.5">
        {LOCALES.map((l) => (
          <div key={l.loc} className="flex items-center justify-between rounded-md bg-[rgba(255,255,255,0.02)] border border-[var(--panel-border)] p-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-amber-400 text-[11px]">{l.loc}</span>
              <span className="text-[var(--panel-ink-secondary)] text-[11px]">{l.lang}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-[var(--panel-ink-muted)]">{l.status}</span>
              <span className="font-mono font-bold text-emerald-400 text-[11px]">{l.chars}</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
