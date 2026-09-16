/**
 * Checks every public page against a running dev server.
 *
 * Unit tests cover the loaders and the copy; this covers the thing they cannot,
 * which is whether the pages actually render, carry the metadata a crawler
 * needs, and do not quietly 500.
 *
 *   npm run dev      # in another terminal
 *   npm run smoke:site
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const db = new PrismaClient();

let failures = 0;

/**
 * `detail` describes the observed value and prints either way. `onFail` is the
 * diagnosis and prints only on failure — mixing the two produces lines like
 * "PASS … — missing JSON-LD", which reads as a contradiction.
 */
function report(name: string, ok: boolean, detail = "", onFail = "") {
  if (!ok) failures++;
  const suffix = ok ? detail : [detail, onFail].filter(Boolean).join(" · ");
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${suffix ? ` — ${suffix}` : ""}`);
}

const PAGES = [
  "/",
  "/benefits",
  "/showcase",
  "/showcase/habit-tracker-organic-growth",
  "/about",
  "/contact",
  "/blog",
  "/privacy",
  "/terms",
];

function tag(html: string, pattern: RegExp): string | null {
  return html.match(pattern)?.[1]?.trim() ?? null;
}

async function main() {
  console.log(`Checking ${BASE}\n`);

  for (const path of PAGES) {
    const res = await fetch(`${BASE}${path}`);
    const html = await res.text();

    const title = tag(html, /<title[^>]*>([^<]+)<\/title>/i);
    const description = tag(html, /<meta name="description" content="([^"]*)"/i);
    const canonical = tag(html, /<link rel="canonical" href="([^"]*)"/i);
    const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length;

    report(`${path} responds 200`, res.status === 200, `status ${res.status}`);
    report(
      `${path} has a title`,
      Boolean(title && title.length > 5),
      title ?? "",
      "no <title> element",
    );
    report(
      `${path} has a description`,
      Boolean(description && description.length > 30),
      description ? `${description.length} chars` : "",
      "missing, or too short to be useful in a result listing",
    );
    report(
      `${path} declares a canonical url`,
      Boolean(canonical),
      canonical ?? "",
      "no canonical link",
    );
    // More than one h1 makes the page structure ambiguous to a screen reader
    // and to a crawler; zero leaves it with no stated subject.
    report(`${path} has exactly one h1`, h1Count === 1, `${h1Count} found`);
    report(
      `${path} links to the sign-in action`,
      html.includes("/signin"),
      "",
      "no sign-in link, so the page is a dead end",
    );
  }

  // --- blog posts ---------------------------------------------------------
  const blogHtml = await (await fetch(`${BASE}/blog`)).text();
  const slugs = [...blogHtml.matchAll(/href="\/blog\/([a-z0-9-]+)"/g)]
    .map((m) => m[1]!)
    .filter((slug) => slug !== "rss.xml");
  const unique = [...new Set(slugs)];

  report("blog index lists posts", unique.length > 0, `${unique.length} post(s)`);

  for (const slug of unique) {
    const res = await fetch(`${BASE}/blog/${slug}`);
    const html = await res.text();
    report(`/blog/${slug} renders`, res.status === 200, `status ${res.status}`);
    report(
      `/blog/${slug} emits BlogPosting structured data`,
      html.includes('"@type":"BlogPosting"'),
      "",
      "no BlogPosting JSON-LD on the page",
    );
  }

  // --- feeds and crawler files -------------------------------------------
  const rss = await fetch(`${BASE}/blog/rss.xml`);
  const rssBody = await rss.text();
  report("rss feed responds", rss.status === 200, `status ${rss.status}`);
  report(
    "rss feed is served as xml",
    (rss.headers.get("content-type") ?? "").includes("xml"),
    rss.headers.get("content-type") ?? "none",
  );
  report(
    "rss feed contains items",
    rssBody.includes("<item>"),
    `${(rssBody.match(/<item>/g) ?? []).length} item(s)`,
    "the feed is empty",
  );
  report(
    "rss feed escapes reserved characters",
    !/<title>[^<]*[&][^a-z#]/i.test(rssBody),
    "",
    "found an unescaped ampersand in a title",
  );

  const sitemap = await fetch(`${BASE}/sitemap.xml`);
  const sitemapBody = await sitemap.text();
  report("sitemap responds", sitemap.status === 200, `status ${sitemap.status}`);
  report(
    "sitemap lists urls",
    sitemapBody.includes("<loc>"),
    `${(sitemapBody.match(/<loc>/g) ?? []).length} url(s)`,
    "the sitemap is empty",
  );
  report(
    "sitemap omits placeholder case studies",
    !sitemapBody.includes("/showcase/habit-tracker-organic-growth"),
    "",
    "a noindex page is listed, which crawlers report as a contradiction",
  );

  const robots = await fetch(`${BASE}/robots.txt`);
  const robotsBody = await robots.text();
  report("robots.txt responds", robots.status === 200, `status ${robots.status}`);
  report(
    "robots.txt points at the sitemap",
    robotsBody.includes("Sitemap:"),
    "",
    "no Sitemap: line",
  );
  report(
    "robots.txt keeps the app out of the index",
    robotsBody.includes("/dashboard"),
    "",
    "the dashboard is crawlable",
  );

  // --- placeholder content is labelled ------------------------------------
  const showcaseHtml = await (await fetch(`${BASE}/showcase`)).text();
  report(
    "sample case studies are labelled as sample content",
    showcaseHtml.includes("Sample content"),
    "",
    "invented companies are presented as real customers",
  );

  const caseHtml = await (
    await fetch(`${BASE}/showcase/habit-tracker-organic-growth`)
  ).text();
  report(
    "a placeholder case study is marked noindex",
    /<meta name="robots" content="[^"]*noindex/i.test(caseHtml),
    "",
    "invented figures are indexable as a real case study",
  );

  // --- contact form -------------------------------------------------------
  // Rows from a previous run share this machine's IP, so without clearing them
  // the per-IP limit would refuse this run's first message and the test would
  // fail for a reason that has nothing to do with the code under test.
  const testEmail = "smoke@example.invalid";
  await db.contactMessage.deleteMany({ where: { email: testEmail } });

  async function submitContact(message: string, extra: Record<string, unknown> = {}) {
    const res = await fetch(`${BASE}/api/trpc/contact.send?batch=1`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        0: { json: { name: "Smoke Test", email: testEmail, message, ...extra } },
      }),
    });
    return { status: res.status, body: await res.text() };
  }

  const accepted = await submitContact(
    "This is a smoke-test submission checking that the public contact endpoint accepts a valid message.",
  );
  report(
    "contact form accepts a valid message without a session",
    accepted.status === 200 && accepted.body.includes('"ok":true'),
    `status ${accepted.status}`,
    accepted.body.slice(0, 160),
  );

  const tooShort = await submitContact("nope");
  report(
    "contact form rejects a message too short to answer",
    tooShort.body.includes("BAD_REQUEST") || tooShort.status === 400,
    `status ${tooShort.status}`,
    "a two-word message was accepted",
  );

  const honeypot = await submitContact(
    "A bot submission that fills the hidden field a real browser never shows.",
    { website: "http://spam.example" },
  );
  report(
    "contact form refuses a filled honeypot",
    honeypot.body.includes("BAD_REQUEST") || honeypot.status === 400,
    `status ${honeypot.status}`,
    "the honeypot field was ignored",
  );

  // Three per hour is the cap; the first accepted message above counts as one.
  await submitContact("Second valid smoke-test message, exercising the rate limit path.");
  await submitContact("Third valid smoke-test message, exercising the rate limit path.");
  const limited = await submitContact("Fourth message, which must be refused by the rate limit.");
  report(
    "contact form rate-limits a repeat sender",
    limited.body.includes("TOO_MANY_REQUESTS"),
    `status ${limited.status}`,
    "a fourth message within the hour was accepted",
  );

  const removed = await db.contactMessage.deleteMany({ where: { email: testEmail } });
  report(
    "contact test rows are cleaned up",
    removed.count > 0,
    `${removed.count} row(s) removed`,
    "nothing was stored to remove",
  );

  // --- 404 handling -------------------------------------------------------
  for (const path of ["/blog/not-a-real-post", "/showcase/not-a-real-case", "/blog/tag/not-a-tag"]) {
    const res = await fetch(`${BASE}${path}`);
    report(`${path} returns 404`, res.status === 404, `status ${res.status}`);
  }

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void db.$disconnect());
