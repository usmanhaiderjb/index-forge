import { BarChart3, Bell, Cable, LayoutGrid, Search, Settings, Star } from "lucide-react";

import { Panel, Sparkline, StatTile } from "@/components/marketing/mockups/primitives";

const RANK_SERIES = [
  { label: "You", color: "#6d8dff", points: [0.34, 0.4, 0.38, 0.46, 0.52, 0.5, 0.58, 0.62, 0.6, 0.68] },
  { label: "Competitor A", color: "#4ade80", points: [0.62, 0.58, 0.6, 0.55, 0.52, 0.54, 0.5, 0.48, 0.5, 0.46] },
  { label: "Competitor B", color: "#a78bfa", points: [0.24, 0.26, 0.22, 0.28, 0.3, 0.27, 0.31, 0.29, 0.33, 0.3] },
];

const TOP_KEYWORDS = [
  { term: "habit tracker", rank: 1 },
  { term: "daily routine", rank: 2 },
  { term: "streak app", rank: 3 },
  { term: "goal tracker", rank: 4 },
  { term: "morning routine", rank: 5 },
];

const SIDEBAR = [LayoutGrid, Search, BarChart3, Cable, Star, Bell, Settings];

/** The hero illustration: a compressed, honest sketch of the real overview. */
export function DashboardMockup() {
  return (
    <Panel>
      <div className="flex">
        <nav
          aria-hidden
          className="hidden w-11 shrink-0 flex-col items-center gap-3 border-r border-[var(--panel-border)] bg-[var(--panel)] py-4 sm:flex"
        >
          {SIDEBAR.map((Icon, i) => (
            <span
              key={i}
              className={
                i === 0
                  ? "grid size-7 place-items-center rounded-md bg-[var(--accent)] text-white"
                  : "grid size-7 place-items-center rounded-md text-[var(--panel-ink-muted)]"
              }
            >
              <Icon className="size-3.5" />
            </span>
          ))}
        </nav>

        <div className="min-w-0 flex-1 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold">Overview</span>
            <span className="ml-auto flex items-center gap-1.5 rounded-md border border-[var(--panel-border)] px-2 py-1 text-[10px] text-[var(--panel-ink-secondary)]">
              <span className="size-2 rounded-[3px] bg-[var(--accent)]" /> Habitly
            </span>
            <span className="rounded-md border border-[var(--panel-border)] px-2 py-1 text-[10px] text-[var(--panel-ink-secondary)]">
              United States
            </span>
            <span className="hidden rounded-md border border-[var(--panel-border)] px-2 py-1 text-[10px] text-[var(--panel-ink-muted)] sm:inline">
              Last 30 days
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <StatTile label="Installs" value="37.9K" delta="+17.4%" />
            <StatTile label="Organic" value="32.0K" delta="+18.9%" />
            <StatTile label="Avg. rank" value="#18" delta="-5" />
            <StatTile label="Revenue" value="$19.1K" delta="+19.0%" />
          </div>

          <div className="mt-3 grid gap-2 lg:grid-cols-[1.7fr_1fr]">
            <div className="rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] p-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[10px] font-medium">Keyword rankings</p>
                <ul className="flex flex-wrap gap-2.5">
                  {RANK_SERIES.map((series) => (
                    <li
                      key={series.label}
                      className="flex items-center gap-1 text-[9px] text-[var(--panel-ink-muted)]"
                    >
                      <span
                        className="size-1.5 rounded-full"
                        style={{ background: series.color }}
                      />
                      {series.label}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="relative mt-2 h-24">
                {RANK_SERIES.map((series) => (
                  <div key={series.label} className="absolute inset-0">
                    <Sparkline
                      points={series.points}
                      color={series.color}
                      fill={series.label === "You"}
                      className="h-24"
                      strokeWidth={1.5}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-1 flex justify-between text-[9px] text-[var(--panel-ink-muted)]">
                <span>May 12</span>
                <span className="hidden sm:inline">May 15</span>
                <span>May 18</span>
              </div>
            </div>

            <div className="rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] p-3">
              <p className="text-[10px] font-medium">Top keywords</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {TOP_KEYWORDS.map((item) => (
                  <li
                    key={item.term}
                    className="flex items-center justify-between text-[10px] text-[var(--panel-ink-secondary)]"
                  >
                    <span className="truncate">{item.term}</span>
                    <span className="tabular ml-2 shrink-0 text-[var(--panel-ink-muted)]">
                      #{item.rank}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
