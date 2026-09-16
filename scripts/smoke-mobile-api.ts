/**
 * Composed mobile endpoints and account deletion.
 *
 * Deletion is the reason this file is separate from smoke-mobile-auth: it is
 * irreversible, so the guard rails are what need proving — that a sole owner
 * cannot orphan a shared workspace, that confirmation is actually checked, and
 * that a solo workspace really does go with its owner.
 *
 *   npm run dev            # in another terminal
 *   npm run smoke:mobile-api
 */
import { PrismaClient } from "@prisma/client";

import { createCaller } from "../src/server/api/root";

const db = new PrismaClient();

let failures = 0;
function report(name: string, ok: boolean, detail = "", onFail = "") {
  if (!ok) failures++;
  const suffix = ok ? detail : [detail, onFail].filter(Boolean).join(" · ");
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${suffix ? ` — ${suffix}` : ""}`);
}

const SOLO = "solo-delete@example.invalid";
const OWNER = "owner-delete@example.invalid";
const MATE = "mate-delete@example.invalid";

function caller(user: { id: string; email: string }) {
  return createCaller({
    db,
    session: { user: { id: user.id, email: user.email }, expires: "" } as never,
    headers: new Headers([["x-trpc-source", "rsc"]]),
  });
}

async function makeUser(email: string) {
  return db.user.upsert({
    where: { email },
    create: { email, name: email.split("@")[0], emailVerified: new Date() },
    update: {},
  });
}

async function makeOrg(slug: string, ownerId: string) {
  const org = await db.organization.create({
    data: { name: slug, slug, memberships: { create: { userId: ownerId, role: "OWNER" } } },
  });
  return org;
}

async function cleanup() {
  for (const email of [SOLO, OWNER, MATE]) {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) continue;
    const memberships = await db.membership.findMany({ where: { userId: user.id } });
    for (const membership of memberships) {
      await db.organization.delete({ where: { id: membership.organizationId } }).catch(() => {});
    }
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
  }
}

async function main() {
  await cleanup();

  // --- composed endpoints -------------------------------------------------
  const seededUser = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!seededUser) throw new Error("Run `npm run db:seed` first");

  const seeded = caller({ id: seededUser.id, email: seededUser.email });

  const home = await seeded.mobile.home({ days: 30 });
  report("home returns the app list", home.apps.length > 0, `${home.apps.length} app(s)`);
  report(
    "home returns totals and an alert count in the same call",
    typeof home.openAlerts === "number" && home.totals !== undefined,
    `${home.openAlerts} open alert(s)`,
  );
  report(
    "home distinguishes no data from zero",
    home.apps.every((app) =>
      Object.values(app.metrics).every((m) => typeof m.hasData === "boolean"),
    ),
    "",
    "a metric came back without a hasData flag",
  );

  const installs = home.apps[0]?.metrics.INSTALLS;
  const organic = home.apps[0]?.metrics.ORGANIC_INSTALLS;
  report(
    "home never reports more organic installs than total",
    !installs?.hasData || !organic?.hasData || organic.value <= installs.value,
    `organic ${organic?.value}, total ${installs?.value}`,
  );

  const overview = await seeded.mobile.appOverview({ appId: home.apps[0]!.id, days: 30 });
  report("appOverview returns metric tiles", overview.metrics.length > 0, `${overview.metrics.length} tiles`);
  report(
    "appOverview names the source of each figure",
    overview.metrics.filter((m) => m.hasData).every((m) => m.sources.length > 0),
    "",
    "a figure with data named no source",
  );
  report("appOverview returns a series for the sparkline", overview.series.length > 0, `${overview.series.length} points`);
  report(
    "appOverview returns keyword ranks with scan depth",
    overview.keywords.length > 0 && overview.keywords.every((k) => "scanDepth" in k),
    `${overview.keywords.length} keyword(s)`,
  );

  // The composed endpoint must agree with the web dashboard, or the two
  // surfaces are reporting different numbers for the same app.
  const websummary = await seeded.metrics.summary({
    appId: home.apps[0]!.id,
    days: 30,
    metrics: ["INSTALLS"],
  });
  const mobileInstalls = overview.metrics.find((m) => m.metric === "INSTALLS");
  report(
    "appOverview agrees with the web dashboard on installs",
    Math.round(mobileInstalls?.value ?? -1) === Math.round(websummary[0]?.value ?? -2),
    `mobile ${Math.round(mobileInstalls?.value ?? 0)} vs web ${Math.round(websummary[0]?.value ?? 0)}`,
  );

  // --- account deletion: solo workspace -----------------------------------
  const solo = await makeUser(SOLO);
  const soloOrg = await makeOrg("solo-delete-org", solo.id);

  const soloCaller = caller({ id: solo.id, email: solo.email });
  const soloImpact = await soloCaller.account.deletionImpact();

  report("impact says a solo workspace will be deleted", soloImpact.organizations[0]?.willBeDeleted === true);
  report("impact allows deletion for a solo owner", soloImpact.canDelete === true, "", soloImpact.blockers[0]?.reason);

  const wrongEmail = await soloCaller.account
    .delete({ confirmEmail: "not-my-address@example.invalid" })
    .then(() => null)
    .catch((e: Error) => e);
  report(
    "refuses deletion when the confirmation does not match",
    wrongEmail !== null,
    "",
    "the account was deleted without a matching confirmation",
  );
  report(
    "the account still exists after a failed confirmation",
    (await db.user.findUnique({ where: { id: solo.id } })) !== null,
  );

  const deleted = await soloCaller.account.delete({ confirmEmail: SOLO });
  report("deletes the account", deleted.ok === true);
  report("takes the solo workspace with it", deleted.organizationsDeleted === 1, `${deleted.organizationsDeleted} org(s)`);
  report("the user row is gone", (await db.user.findUnique({ where: { id: solo.id } })) === null);
  report(
    "the workspace row is gone",
    (await db.organization.findUnique({ where: { id: soloOrg.id } })) === null,
  );

  // --- account deletion: sole owner of a shared workspace -----------------
  const owner = await makeUser(OWNER);
  const mate = await makeUser(MATE);
  const sharedOrg = await makeOrg("shared-delete-org", owner.id);
  await db.membership.create({
    data: { userId: mate.id, organizationId: sharedOrg.id, role: "MEMBER" },
  });

  const ownerCaller = caller({ id: owner.id, email: owner.email });
  const ownerImpact = await ownerCaller.account.deletionImpact();

  report("impact blocks a sole owner with other members", ownerImpact.canDelete === false);
  report(
    "impact explains what to do about it",
    (ownerImpact.blockers[0]?.reason ?? "").includes("owner"),
    ownerImpact.blockers[0]?.reason?.slice(0, 80),
  );

  const blocked = await ownerCaller.account
    .delete({ confirmEmail: OWNER })
    .then(() => null)
    .catch((e: Error) => e);
  report(
    "refuses to orphan a shared workspace",
    blocked !== null,
    "",
    "a sole owner deleted their account and left the workspace ownerless",
  );
  report(
    "the shared workspace survives the attempt",
    (await db.organization.findUnique({ where: { id: sharedOrg.id } })) !== null,
  );

  // Promoting the other member unblocks it — the documented way out.
  await db.membership.updateMany({
    where: { userId: mate.id, organizationId: sharedOrg.id },
    data: { role: "OWNER" },
  });

  const afterPromotion = await ownerCaller.account.deletionImpact();
  report("promoting another owner unblocks deletion", afterPromotion.canDelete === true);

  const nowDeleted = await ownerCaller.account.delete({ confirmEmail: OWNER });
  report("deletes once someone else can own the workspace", nowDeleted.ok === true);
  report(
    "leaves the shared workspace intact for the remaining member",
    (await db.organization.findUnique({ where: { id: sharedOrg.id } })) !== null,
    "",
    "the workspace was deleted along with the departing owner",
  );
  report(
    "the remaining member keeps their membership",
    (await db.membership.count({ where: { organizationId: sharedOrg.id } })) === 1,
  );

  await cleanup();
  report("cleans up", (await db.user.findUnique({ where: { email: MATE } })) === null);

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch(() => {});
    process.exit(1);
  })
  .finally(() => void db.$disconnect());
