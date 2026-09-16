/**
 * Exercises the AI features against the real Anthropic API.
 *
 * Everything else in this repo is verified without a key; this is the one
 * suite that spends money, so it is opt-in and prints what each call cost.
 *
 *   npm run smoke:ai
 */
import { PrismaClient } from "@prisma/client";
import Module from "node:module";

const load = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...args: unknown[]) => unknown })._load = function (
  this: unknown,
  request: unknown,
  ...rest: unknown[]
) {
  if (typeof request === "string" && request.includes("server-only")) return {};
  return load.call(this, request, ...rest);
} as never;

const engine = (await import("../src/server/ai/engine")) as typeof import("../src/server/ai/engine");
const { usageSummary } = (await import("../src/server/ai/client")) as typeof import("../src/server/ai/client");

const db = new PrismaClient();
let failures = 0;

function report(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function run<T>(name: string, fn: () => Promise<T>, check: (value: T) => string | null) {
  const started = Date.now();
  try {
    const value = await fn();
    const problem = check(value);
    report(name, problem === null, problem ?? `${((Date.now() - started) / 1000).toFixed(1)}s`);
    return value;
  } catch (error) {
    report(name, false, error instanceof Error ? error.message.slice(0, 200) : "threw");
    return null;
  }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("ANTHROPIC_API_KEY is not set — nothing to test.");
    process.exit(1);
  }

  const org = await db.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) throw new Error("No organization — run `npm run db:seed` first");

  const app = await db.app.findFirst({
    where: { organizationId: org.id, platform: "IOS" },
  });
  if (!app) throw new Error("No iOS app — run `npm run db:seed` first");

  console.log(`Running against "${org.name}" / ${app.name}\n`);

  await run(
    "keyword strategy",
    () => engine.generateKeywordStrategy(org.id, app.id),
    (r) => {
      if (!r.data.keywords.length) return "no keywords proposed";
      // Placement must be a real field for the platform, or the advice is
      // not actionable.
      const bad = r.data.keywords.find(
        (k) => !["title", "subtitle", "keyword_field", "short_description", "long_description"].includes(k.placement),
      );
      return bad ? `bad placement "${bad.placement}"` : null;
    },
  );

  await run(
    "metadata variants respect the character limit",
    () => engine.generateMetadataVariants(org.id, app.id, { count: 2 }),
    (r) => {
      if (!r.data.variants.length) return "no variants";
      const limits: Record<string, number> = {
        TITLE: 30,
        SUBTITLE: 30,
        KEYWORDS: 100,
        PROMOTIONAL_TEXT: 170,
        FULL_DESCRIPTION: 4000,
      };
      const over = r.data.variants.find((v) => v.text.length > (limits[v.field] ?? 4000));
      return over
        ? `"${over.field}" is ${over.text.length} chars, over ${limits[over.field]}`
        : null;
    },
  );

  const review = await db.review.findFirst({
    where: { appId: app.id, rating: { lte: 2 } },
  });

  if (review) {
    await run(
      "review reply stays under the store limit",
      () => engine.draftReviewReply(org.id, review.id, { charLimit: 350 }),
      (r) =>
        r.data.reply.length > 350
          ? `${r.data.reply.length} chars, over 350`
          : r.data.reply.trim().length === 0
            ? "empty reply"
            : null,
    );
  }

  await run(
    "review themes count real mentions",
    () => engine.summarizeReviewThemes(org.id, app.id, 90),
    (r) => {
      if (!r.data.themes.length) return "no themes";
      const bogus = r.data.themes.find((t) => t.mentionCount <= 0);
      return bogus ? `theme "${bogus.theme}" has mentionCount ${bogus.mentionCount}` : null;
    },
  );

  await run(
    "recommendations are scored and actionable",
    () => engine.generateRecommendations(org.id, app.id),
    (r) => {
      if (!r.data.recommendations.length) return "none produced";
      const bad = r.data.recommendations.find(
        (rec) => rec.impact < 1 || rec.impact > 5 || rec.effort < 1 || rec.effort > 5,
      );
      if (bad) return `"${bad.title}" has impact ${bad.impact} / effort ${bad.effort}`;
      const noSteps = r.data.recommendations.find((rec) => rec.actions.length === 0);
      return noSteps ? `"${noSteps.title}" has no steps` : null;
    },
  );

  // Vision needs publicly fetchable images; the seed uses inline SVGs, so this
  // asserts the guard rather than the critique.
  await run(
    "screenshot analysis rejects unfetchable images",
    () =>
      engine
        .analyzeScreenshots(org.id, app.id)
        .then(() => "unexpectedly succeeded")
        .catch((e: Error) => e.message),
    (message) =>
      typeof message === "string" && message.includes("not publicly fetchable")
        ? null
        : `unexpected: ${String(message).slice(0, 120)}`,
  );

  const usage = await usageSummary(org.id);
  console.log(
    `\nSpend this month: ${usage.calls} calls, ${usage.outputTokens.toLocaleString()} output tokens, ~$${usage.costUsd.toFixed(4)}`,
  );
  console.log(failures === 0 ? "All checks passed." : `${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void db.$disconnect());
