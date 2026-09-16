import { describe, expect, it } from "vitest";

import {
  formatPostDate,
  getPost,
  listPosts,
  listPostsByTag,
  listTags,
  relatedPosts,
} from "@/lib/blog";

describe("blog loader", () => {
  it("reads the posts on disk", async () => {
    const posts = await listPosts();
    expect(posts.length).toBeGreaterThan(0);
  });

  it("requires the frontmatter every page depends on", async () => {
    // A post missing any of these renders as a blank card and a broken
    // sitemap entry, so the loader throws at read time rather than shipping it.
    for (const post of await listPosts()) {
      expect(post.title, `${post.slug} title`).toBeTruthy();
      expect(post.description, `${post.slug} description`).toBeTruthy();
      expect(post.date, `${post.slug} date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(post.author, `${post.slug} author`).toBeTruthy();
    }
  });

  it("orders newest first", async () => {
    const dates = (await listPosts()).map((post) => post.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("uses unique slugs, since the slug is the URL", async () => {
    const slugs = (await listPosts()).map((post) => post.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("estimates reading time as at least one minute", async () => {
    for (const post of await listPosts()) {
      expect(post.readingMinutes, post.slug).toBeGreaterThanOrEqual(1);
    }
  });

  it("returns a post with its body", async () => {
    const [first] = await listPosts();
    const post = await getPost(first!.slug);
    expect(post?.body.length ?? 0).toBeGreaterThan(200);
  });

  it("returns null for an unknown slug rather than throwing", async () => {
    expect(await getPost("no-such-post")).toBeNull();
  });

  it("counts tags and sorts them by frequency", async () => {
    const tags = await listTags();
    expect(tags.length).toBeGreaterThan(0);
    for (let i = 1; i < tags.length; i++) {
      expect(tags[i - 1]!.count).toBeGreaterThanOrEqual(tags[i]!.count);
    }
  });

  it("filters by tag case-insensitively", async () => {
    const [tag] = await listTags();
    const exact = await listPostsByTag(tag!.tag);
    const upper = await listPostsByTag(tag!.tag.toUpperCase());

    expect(exact.length).toBe(tag!.count);
    expect(upper.map((p) => p.slug)).toEqual(exact.map((p) => p.slug));
  });

  it("returns an empty list for an unknown tag", async () => {
    expect(await listPostsByTag("not-a-tag")).toEqual([]);
  });

  it("never lists a post as related to itself", async () => {
    for (const post of await listPosts()) {
      const related = await relatedPosts(post.slug);
      expect(related.map((r) => r.slug), post.slug).not.toContain(post.slug);
    }
  });

  it("fills the related slot even with no shared tags", async () => {
    const posts = await listPosts();
    if (posts.length < 2) return;
    expect((await relatedPosts(posts[0]!.slug)).length).toBeGreaterThan(0);
  });

  it("formats a date without shifting the day", async () => {
    // `new Date("2026-08-01")` is UTC midnight, which renders as July 31 in
    // any timezone behind UTC. The formatter must pin to the stated day.
    expect(formatPostDate("2026-08-01")).toBe("August 1, 2026");
    expect(formatPostDate("2026-01-01")).toBe("January 1, 2026");
    expect(formatPostDate("2026-12-31")).toBe("December 31, 2026");
  });
});
