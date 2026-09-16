import "server-only";

import { db } from "@/server/db";

export type CannibalizationConflict = {
  keyword: string;
  appsInvolved: {
    appId: string;
    appName: string;
    platform: string;
    currentRank: number | null;
    estimatedCpcUsd: number;
  }[];
  severity: "HIGH" | "MEDIUM" | "LOW";
  estimatedMonthlyWastedSpendUsd: number;
  recommendedAction: string;
};

export type PortfolioCannibalizationReport = {
  totalConflicts: number;
  totalEstimatedWastedSpendUsd: number;
  conflicts: CannibalizationConflict[];
  strategicSummary: string;
};

export async function auditPortfolioCannibalization(
  organizationId: string,
): Promise<PortfolioCannibalizationReport> {
  const trackedKeywords = await db.keyword.findMany({
    where: {
      app: { organizationId },
      isTracked: true,
    },
    include: {
      app: true,
      ranks: { orderBy: { date: "desc" }, take: 1 },
      metrics: { orderBy: { date: "desc" }, take: 1 },
    },
  });

  const termMap = new Map<string, typeof trackedKeywords>();
  for (const kw of trackedKeywords) {
    const term = kw.term.trim().toLowerCase();
    const existing = termMap.get(term) || [];
    existing.push(kw);
    termMap.set(term, existing);
  }

  const conflicts: CannibalizationConflict[] = [];
  let totalWastedSpend = 0;

  for (const [term, instances] of termMap.entries()) {
    if (instances.length > 1) {
      const appsInvolved = instances.map((inst) => ({
        appId: inst.appId,
        appName: inst.app.name,
        platform: inst.app.platform,
        currentRank: inst.ranks[0]?.rank ?? null,
        estimatedCpcUsd: (inst.metrics[0]?.popularity ?? 50) > 60 ? 2.40 : 1.20,
      }));

      const avgCpc = appsInvolved[0]?.estimatedCpcUsd ?? 1.50;
      const wastedMonthly = Math.round(avgCpc * 250 * (instances.length - 1));
      totalWastedSpend += wastedMonthly;

      const severity = wastedMonthly > 500 ? "HIGH" : wastedMonthly > 200 ? "MEDIUM" : "LOW";
      const topApp = appsInvolved.sort((a, b) => (a.currentRank ?? 999) - (b.currentRank ?? 999))[0];

      conflicts.push({
        keyword: term,
        appsInvolved,
        severity,
        estimatedMonthlyWastedSpendUsd: wastedMonthly,
        recommendedAction: `Assign exact-match bidding exclusively to "${topApp?.appName}" (better rank #${topApp?.currentRank ?? "N/A"}). Add negative match in other portfolio apps to save $${wastedMonthly}/mo.`,
      });
    }
  }

  return {
    totalConflicts: conflicts.length,
    totalEstimatedWastedSpendUsd: totalWastedSpend,
    conflicts,
    strategicSummary:
      conflicts.length > 0
        ? `Found ${conflicts.length} internal keyword cannibalization collisions across your portfolio costing ~$${totalWastedSpend.toLocaleString()}/mo in inflated bids.`
        : "Zero internal keyword conflicts detected across your portfolio.",
  };
}
