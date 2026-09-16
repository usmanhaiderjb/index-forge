import "server-only";

import { db } from "@/server/db";
import { dispatchDueDigests } from "@/server/jobs/handlers/digest";
import { enqueue } from "@/server/jobs/queues";

/**
 * Fans the hourly tick out into per-tenant work. Everything here is spread
 * across the hour so a hundred organizations do not all hit the App Store in
 * the same second.
 */
export async function scheduleTick() {
  const hour = new Date().getUTCHours();
  const spread = (index: number) => ({ delay: (index % 50) * 20_000 });

  // Connections: every 6 hours, at an offset derived from the connection so
  // each one keeps a stable slot.
  const connections = await db.connection.findMany({
    where: { status: { in: ["ACTIVE", "PENDING"] } },
    select: { id: true },
  });

  let queued = 0;

  for (const [index, connection] of connections.entries()) {
    const slot = hashToRange(connection.id, 6);
    if (hour % 6 !== slot) continue;
    await enqueue({ type: "connection.sync", connectionId: connection.id, days: 7 }, spread(index));
    queued++;
  }

  const apps = await db.app.findMany({ where: { isActive: true }, select: { id: true } });

  for (const [index, app] of apps.entries()) {
    const slot = hashToRange(app.id, 24);

    // Listing snapshot twice a day.
    if (hour % 12 === slot % 12) {
      await enqueue({ type: "app.listing", appId: app.id }, spread(index));
      queued++;
    }

    // Rank tracking once a day, early UTC so the numbers are comparable
    // day to day.
    if (hour === (slot % 4) + 2) {
      await enqueue({ type: "app.ranks", appId: app.id }, spread(index));
      await enqueue({ type: "app.charts", appId: app.id }, { delay: 120_000 + index * 20_000 });
      await enqueue({ type: "app.competitors", appId: app.id }, { delay: 300_000 + index * 20_000 });
      queued++;
    }

    // Derived metrics once a day. Syncs already trigger derivation, but an app
    // whose connections all failed today still needs yesterday's late-arriving
    // console data folded in — stores restate the last few days.
    if (hour === (slot % 4) + 4) {
      await enqueue({ type: "app.derive", appId: app.id, days: 30 }, spread(index));
      queued++;
    }

    // AI insight pass once a day, after ranks have landed.
    if (hour === (slot % 4) + 5) {
      await enqueue({ type: "ai.insights", appId: app.id }, spread(index));
      queued++;
    }
  }

  const digests = await dispatchDueDigests();

  return {
    connections: connections.length,
    apps: apps.length,
    queued,
    digests: digests.queued,
  };
}

/** Stable, uniform slot assignment from an id — same input, same slot forever. */
function hashToRange(id: string, range: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % range;
}
