import "server-only";

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

import { BLOG_CATEGORIES, CATEGORY_SLUGS, findCategory } from "@/content/blog-taxonomy";

/**
 * Blog posts, read from MDX files in `content/blog`.
 *
 * Behind a small interface so moving to database-backed posts later means
 * replacing this module, not touching every page that reads a post.
 */
export type PostMeta = {
  slug: string;
  title: string;
  description: string;
  /** ISO date string, `YYYY-MM-DD`. */
  date: string;
  tags: string[];
  /** Slug from `BLOG_CATEGORIES`. Every post belongs to exactly one cluster. */
  category: string;
  author: string;
  draft: boolean;
  readingMinutes: number;
};

export type Post = PostMeta & { body: string };

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

/**
 * Drafts are readable in development so a post can be previewed before it goes
 * out, and invisible in production so an unfinished one cannot be linked to.
 */
const SHOW_DRAFTS = process.env.NODE_ENV !== "production";

/** 200 wpm is the usual reading estimate; code and headings are counted too. */
function readingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function requireString(value: unknown, field: string, slug: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    // A post missing its title or date would render as a blank card and a
    // broken sitemap entry. Failing the build is the cheaper outcome.
    throw new Error(`Blog post "${slug}" is missing required frontmatter: ${field}`);
  }
  return value.trim();
}

function parse(slug: string, raw: string): Post {
  const { data, content } = matter(raw);

  const date = requireString(data.date instanceof Date ? toIsoDay(data.date) : data.date, "date", slug);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Blog post "${slug}" has a date that is not YYYY-MM-DD: ${date}`);
  }

  // Validated against the taxonomy rather than accepted as written. A typo
  // would silently create a one-post category, breaking the internal linking
  // the cluster depends on — and nothing on the page would look wrong.
  const category = requireString(data.category, "category", slug);
  if (!CATEGORY_SLUGS.includes(category)) {
    throw new Error(
      `Blog post "${slug}" has unknown category "${category}". ` +
        `Known categories: ${CATEGORY_SLUGS.join(", ")}.`,
    );
  }

  return {
    slug,
    title: requireString(data.title, "title", slug),
    description: requireString(data.description, "description", slug),
    date,
    category,
    tags: Array.isArray(data.tags) ? data.tags.map((t) => String(t)) : [],
    author: typeof data.author === "string" ? data.author : "The ASO team",
    draft: data.draft === true,
    readingMinutes: readingMinutes(content),
    body: content,
  };
}

/** YAML parses an unquoted date into a Date; normalize back to the UTC day. */
function toIsoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

let cachedPosts: Post[] | null = null;

async function readAll(): Promise<Post[]> {
  if (cachedPosts) return cachedPosts;

  let files: string[];
  try {
    files = await readdir(BLOG_DIR);
  } catch {
    // No content directory yet is an empty blog, not a crash.
    return [];
  }

  const posts = await Promise.all(
    files
      .filter((file) => file.endsWith(".mdx"))
      .map(async (file) => {
        const slug = file.replace(/\.mdx$/, "");
        return parse(slug, await readFile(path.join(BLOG_DIR, file), "utf8"));
      }),
  );

  cachedPosts = posts
    .filter((post) => SHOW_DRAFTS || !post.draft)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));

  return cachedPosts;
}

export function clearBlogCache(): void {
  cachedPosts = null;
}


export async function listPosts(): Promise<PostMeta[]> {
  return (await readAll()).map(({ body: _body, ...meta }) => meta);
}

export async function getPost(slug: string): Promise<Post | null> {
  return (await readAll()).find((post) => post.slug === slug) ?? null;
}

export async function listTags(): Promise<{ tag: string; count: number }[]> {
  const counts = new Map<string, number>();
  for (const post of await readAll()) {
    for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export async function listPostsByTag(tag: string): Promise<PostMeta[]> {
  const wanted = tag.toLowerCase();
  return (await listPosts()).filter((post) =>
    post.tags.some((t) => t.toLowerCase() === wanted),
  );
}

/**
 * Posts sharing the most tags with this one, newest first. Falls back to the
 * most recent posts so the slot is never empty on a post with no tag overlap.
 */
export async function relatedPosts(slug: string, limit = 3): Promise<PostMeta[]> {
  const all = await listPosts();
  const current = all.find((post) => post.slug === slug);
  if (!current) return [];

  const others = all.filter((post) => post.slug !== slug);
  const scored = others
    .map((post) => ({
      post,
      // Same category counts for more than a shared tag. Related links are how
      // a cluster passes authority around, so they should keep a reader inside
      // the topic rather than sending them to whatever shares a loose tag.
      shared:
        post.tags.filter((tag) => current.tags.includes(tag)).length +
        (post.category === current.category ? 3 : 0),
    }))
    .sort((a, b) => b.shared - a.shared || (a.post.date < b.post.date ? 1 : -1));

  return scored.slice(0, limit).map((entry) => entry.post);
}

export function formatPostDate(date: string): string {
  // Parsed as UTC explicitly: `new Date("2026-08-01")` is UTC midnight, which
  // formats as the previous day in any timezone behind UTC.
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Posts in one cluster, pillar first.
 *
 * Pillar first regardless of date: it is the page the category exists to rank,
 * and burying it under whatever was published most recently is the commonest
 * way a cluster stops working.
 */
export async function listPostsByCategory(slug: string): Promise<PostMeta[]> {
  const posts = (await listPosts()).filter((post) => post.category === slug);
  const pillar = findCategory(slug)?.pillar;

  return posts.sort((a, b) => {
    if (a.slug === pillar) return -1;
    if (b.slug === pillar) return 1;
    return a.date < b.date ? 1 : -1;
  });
}

/** Categories that actually have posts, with counts, in taxonomy order. */
export async function listCategories(): Promise<
  { slug: string; name: string; description: string; count: number }[]
> {
  const posts = await listPosts();

  return BLOG_CATEGORIES.map((category) => ({
    slug: category.slug,
    name: category.name,
    description: category.description,
    count: posts.filter((post) => post.category === category.slug).length,
  })).filter((category) => category.count > 0);
}

export type PaginatedResult<T> = {
  items: T[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  hasPrev: boolean;
  hasNext: boolean;
};

export async function listPaginatedPosts({
  page = 1,
  pageSize = 12,
  category,
  tag,
  query,
}: {
  page?: number;
  pageSize?: number;
  category?: string;
  tag?: string;
  query?: string;
} = {}): Promise<PaginatedResult<PostMeta>> {
  let posts = await listPosts();

  if (category && category !== "all") {
    posts = posts.filter((p) => p.category === category);
  }

  if (tag) {
    const wanted = tag.toLowerCase();
    posts = posts.filter((p) => p.tags.some((t) => t.toLowerCase() === wanted));
  }

  if (query && query.trim() !== "") {
    const q = query.trim().toLowerCase();
    posts = posts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)) ||
        p.category.toLowerCase().includes(q),
    );
  }

  const totalItems = posts.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const offset = (currentPage - 1) * pageSize;
  const items = posts.slice(offset, offset + pageSize);

  return {
    items,
    totalItems,
    totalPages,
    currentPage,
    pageSize,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}

