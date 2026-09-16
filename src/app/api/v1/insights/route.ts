import { optionalInt, resolveApp, withApiKey } from "@/server/api-key";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export const GET = withApiKey(async (request, ctx) => {
  const appId = new URL(request.url).searchParams.get("appId");
  if (appId) await resolveApp(appId, ctx.organization.id);

  const limit = optionalInt(request, "limit", 50, 200);

  const [insights, recommendations] = await Promise.all([
    db.aiInsight.findMany({
      where: {
        organizationId: ctx.organization.id,
        ...(appId ? { appId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { app: { select: { id: true, name: true } } },
    }),
    db.aiRecommendation.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        app: { organizationId: ctx.organization.id, ...(appId ? { id: appId } : {}) },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: limit,
      include: { app: { select: { id: true, name: true } } },
    }),
  ]);

  return {
    insights: insights.map((insight) => ({
      id: insight.id,
      app: insight.app,
      type: insight.type,
      severity: insight.severity,
      title: insight.title,
      summary: insight.summary,
      detail: insight.detail,
      evidence: insight.evidence,
      model: insight.model,
      isRead: insight.isRead,
      createdAt: insight.createdAt,
    })),
    recommendations: recommendations.map((rec) => ({
      id: rec.id,
      app: rec.app,
      category: rec.category,
      title: rec.title,
      rationale: rec.rationale,
      impact: rec.impact,
      effort: rec.effort,
      priority: rec.priority,
      actions: rec.actions,
      status: rec.status,
      createdAt: rec.createdAt,
    })),
  };
});
