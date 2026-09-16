import { env } from "@/env";
import { listPosts } from "@/lib/blog";
import { SITE } from "@/content/site";

export const dynamic = "force-dynamic";

/** XML has five reserved characters; a title containing one would break the feed. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const posts = (await listPosts()).filter((post) => !post.draft);
  const base = env.APP_URL.replace(/\/$/, "");

  const items = posts
    .map((post) => {
      const url = `${base}/blog/${post.slug}`;
      return [
        "    <item>",
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <description>${escapeXml(post.description)}</description>`,
        `      <pubDate>${new Date(`${post.date}T12:00:00Z`).toUTCString()}</pubDate>`,
        ...post.tags.map((tag) => `      <category>${escapeXml(tag)}</category>`),
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(`${SITE.name} — blog`)}</title>`,
    `    <link>${escapeXml(`${base}/blog`)}</link>`,
    `    <description>${escapeXml(SITE.description)}</description>`,
    "    <language>en</language>",
    `    <atom:link href="${escapeXml(`${base}/blog/rss.xml`)}" rel="self" type="application/rss+xml" />`,
    items,
    "  </channel>",
    "</rss>",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
