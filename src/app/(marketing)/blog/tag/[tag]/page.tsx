import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Section } from "@/components/marketing/sections";
import { PageHero } from "@/components/marketing/page-hero";
import { PostCard } from "@/components/marketing/post-card";
import { listPostsByTag, listTags } from "@/lib/blog";

export async function generateStaticParams() {
  return (await listTags()).map(({ tag }) => ({ tag }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);

  return {
    title: `Posts tagged ${decoded}`,
    description: `App Store Optimization writing tagged ${decoded}.`,
    alternates: { canonical: `/blog/tag/${encodeURIComponent(decoded)}` },
  };
}

export default async function TagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  const [posts, allTags] = await Promise.all([listPostsByTag(decoded), listTags()]);

  // An empty tag page is a dead end that would otherwise be linkable and
  // indexable, so it is a 404 rather than a page saying nothing.
  if (posts.length === 0) notFound();

  return (
    <>
      <PageHero
        crumbs={[{ label: "Blog", href: "/blog" }, { label: decoded }]}
        eyebrow="Topic"
        title={decoded}
        body={`${posts.length} post${posts.length === 1 ? "" : "s"} on this topic.`}
      >
        <nav aria-label="Other topics" className="mt-8">
          <ul className="flex flex-wrap gap-2">
            {allTags
              .filter((item) => item.tag.toLowerCase() !== decoded.toLowerCase())
              .map(({ tag: other, count }) => (
                <li key={other}>
                  <Link
                    href={`/blog/tag/${encodeURIComponent(other)}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--brand-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  >
                    {other}
                    <span className="tabular text-[var(--text-muted)]">{count}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
      </PageHero>

      <Section>
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <li key={post.slug}>
              <PostCard post={post} />
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
