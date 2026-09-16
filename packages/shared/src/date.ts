import { addDays, differenceInCalendarDays, format, parseISO, startOfDay, subDays } from "date-fns";

/** Matches a bare calendar date, with or without separators: 2026-08-01, 20260801. */
const DATE_ONLY = /^(\d{4})-?(\d{2})-?(\d{2})$/;

/**
 * All metric dates are stored as UTC midnight so joins across sources line up.
 *
 * Date-only strings are parsed as UTC, not as local time. Every store API
 * reports "2026-08-01" meaning that calendar day in the report's own timezone —
 * `parseISO` would read it as local midnight, which on any host east of UTC is
 * the previous day once converted, filing a whole sync one day early.
 */
export function toUtcDate(input: Date | string): Date {
  if (typeof input === "string") {
    const match = DATE_ONLY.exec(input.trim());
    if (match) {
      return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    }
  }

  const d = typeof input === "string" ? parseISO(input) : input;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function ymd(date: Date): string {
  return format(toUtcDate(date), "yyyy-MM-dd");
}

/** Google/Apple analytics APIs use compact dates in a few places. */
export function ymdCompact(date: Date): string {
  return format(toUtcDate(date), "yyyyMMdd");
}

export function dateRange(days: number, endingAt: Date = todayUtc()) {
  const end = toUtcDate(endingAt);
  const start = subDays(end, days - 1);
  return { start, end };
}

/** Inclusive list of UTC dates, used to zero-fill charts. */
export function eachDay(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const total = differenceInCalendarDays(toUtcDate(end), toUtcDate(start));
  for (let i = 0; i <= total; i++) out.push(addDays(toUtcDate(start), i));
  return out;
}

/** Equal-length window immediately before [start, end], for period-over-period. */
export function previousPeriod(start: Date, end: Date) {
  const days = differenceInCalendarDays(end, start) + 1;
  return { start: subDays(start, days), end: subDays(end, days) };
}

export { startOfDay, subDays, addDays, differenceInCalendarDays, format };
