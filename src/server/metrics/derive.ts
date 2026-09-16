import "server-only";

import { MetricKey, MetricSource } from "@prisma/client";

import { dateRange, ymd } from "@aso/shared";
import { db } from "@/server/db";
import { preferAuthoritativeSource } from "@/server/metrics/precedence";

/**
 * Organic installs — total minus paid.
 *
 * This is the number ASO work is actually judged on, and no store reports it:
 * the console counts every install, the ad network counts the ones it claims.
 *
 * Derived at write time rather than in the dashboard query, because alerts,
 * digests, exports and the public API all read MetricPoint directly. Computing
 * it in one place would leave it missing from four others.
 */
export async function deriveOrganicInstalls(
  appId: string,
  opts: { days?: number } = {},
): Promise<{ written: number; removed: number; skipped: string | null }> {
  const { start, end } = dateRange(opts.days ?? 90);

  const [installRows, paidRows] = await Promise.all([
    db.metricPoint.findMany({
      where: {
        appId,
        metric: MetricKey.INSTALLS,
        dimension: "",
        date: { gte: start, lte: end },
      },
      select: { appId: true, date: true, metric: true, source: true, value: true, currency: true },
    }),
    db.metricPoint.findMany({
      where: {
        appId,
        metric: MetricKey.PAID_INSTALLS,
        date: { gte: start, lte: end },
      },
      select: { date: true, value: true, dimension: true },
    }),
  ]);

  // Without paid data there is nothing to subtract, and asserting
  // "organic == total" would be claiming knowledge we do not have — the ad
  // account might simply not be connected.
  if (paidRows.length === 0) {
    return { written: 0, removed: 0, skipped: "no paid install data in this window" };
  }

  // Ad platforms omit zero-spend days rather than reporting a zero, so a gap
  // inside the reported span really is a day with no paid installs. Outside the
  // span we know nothing, and a day before the ad account was connected — or
  // after it went dark — must not have its whole install count called organic.
  const paidDates = paidRows.map((row) => row.date.getTime());
  const paidFrom = Math.min(...paidDates);
  const paidTo = Math.max(...paidDates);

  // Installs can be reported by more than one provider; use the same
  // precedence the dashboard uses, or the subtraction would start from a
  // double-counted total.
  const installs = preferAuthoritativeSource(installRows).filter(
    (row) => row.date.getTime() >= paidFrom && row.date.getTime() <= paidTo,
  );

  const totalByDate = new Map<string, number>();
  for (const row of installs) {
    const key = ymd(row.date);
    totalByDate.set(key, (totalByDate.get(key) ?? 0) + row.value);
  }

  // Paid installs arrive per campaign, so they are summed across campaigns.
  const paidByDate = new Map<string, number>();
  for (const row of paidRows) {
    const key = ymd(row.date);
    paidByDate.set(key, (paidByDate.get(key) ?? 0) + row.value);
  }

  let written = 0;
  const writtenDates: Date[] = [];

  for (const [key, total] of totalByDate) {
    const paid = paidByDate.get(key) ?? 0;

    // Ad networks attribute on their own windows and can claim more installs
    // than the console counted that day. A negative organic figure is not
    // meaningful, so it is floored — the discrepancy is real, but reporting
    // "-40 organic installs" would be worse than reporting none.
    const organic = Math.max(0, total - paid);

    const date = new Date(`${key}T00:00:00.000Z`);

    await db.metricPoint.upsert({
      where: {
        appId_date_source_metric_dimension: {
          appId,
          date,
          source: MetricSource.DERIVED,
          metric: MetricKey.ORGANIC_INSTALLS,
          dimension: "",
        },
      },
      create: {
        appId,
        date,
        source: MetricSource.DERIVED,
        metric: MetricKey.ORGANIC_INSTALLS,
        dimension: "",
        value: organic,
        meta: { total, paid, floored: total - paid < 0 },
      },
      update: {
        value: organic,
        meta: { total, paid, floored: total - paid < 0 },
      },
    });

    written++;
    writtenDates.push(date);
  }

  // A derived row is only as good as its inputs. If a correction shrinks the
  // paid-data span or a source is disconnected, yesterday's derivation left
  // rows behind that nothing will overwrite — so anything in this window that
  // was not just recomputed is stale and gets dropped rather than lingering.
  const { count: removed } = await db.metricPoint.deleteMany({
    where: {
      appId,
      source: MetricSource.DERIVED,
      metric: MetricKey.ORGANIC_INSTALLS,
      date: { gte: start, lte: end, notIn: writtenDates },
    },
  });

  return { written, removed, skipped: null };
}

/** Every derived metric for one app. Kept as one entry point for the job. */
export async function deriveMetrics(appId: string, opts: { days?: number } = {}) {
  const organic = await deriveOrganicInstalls(appId, opts);
  return { organic };
}
