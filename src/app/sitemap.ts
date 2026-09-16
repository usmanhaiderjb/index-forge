import type { MetadataRoute } from "next";

import { env } from "@/env";
import { listCategories, listPosts, listTags } from "@/lib/blog";
import { FEATURES } from "@/content/features";
import { SHOWCASES } from "@/content/site";

/** Public routes only. Anything behind auth has nothing to offer a crawler. */
const STATIC_ROUTES: { path: string; priority: number; changeFrequency: "weekly" | "monthly" }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/features", priority: 0.9, changeFrequency: "weekly" },
  { path: "/benefits", priority: 0.8, changeFrequency: "monthly" },
  { path: "/showcase", priority: 0.8, changeFrequency: "monthly" },
  { path: "/blog", priority: 0.9, changeFrequency: "weekly" },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.6, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.3, changeFrequency: "monthly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.APP_URL.replace(/\/$/, "");
  const [posts, tags, categories] = await Promise.all([
    listPosts(),
    listTags(),
    listCategories(),
  ]);
  const published = posts.filter((post) => !post.draft);

  const newestPost = published[0]?.date;
  const now = new Date();

  return [
    ...STATIC_ROUTES.map((route) => ({
      url: `${base}${route.path}`,
      // The blog index genuinely changes when a post lands; the rest do not
      // have a meaningful per-route timestamp, so they carry the build time.
      lastModified: route.path === "/blog" && newestPost ? new Date(`${newestPost}T12:00:00Z`) : now,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),

    ...published.map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: new Date(`${post.date}T12:00:00Z`),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),

    // Category hubs rank above individual posts for the broad terms and are the
    // entry point for each cluster, so they carry a higher priority than tag
    // pages — which are a browsing aid rather than a landing page.
    ...categories.map((category) => ({
      url: `${base}/blog/category/${category.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),

    ...tags.map((tag) => ({
      url: `${base}/blog/tag/${encodeURIComponent(tag.tag)}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),

    // Placeholder case studies are excluded: their metadata sets noindex, and
    // listing a noindex URL in a sitemap is a contradiction crawlers report.
    ...SHOWCASES.filter((item) => !item.placeholder).map((item) => ({
      url: `${base}/showcase/${item.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),

    // Dedicated feature landing pages (core SEO assets)
    ...FEATURES.map((feature) => ({
      url: `${base}/features/${feature.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.85,
    })),
  ];
}
