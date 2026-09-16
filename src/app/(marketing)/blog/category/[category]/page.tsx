import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Section } from "@/components/marketing/sections";
import { PageHero } from "@/components/marketing/page-hero";
import { PostCard } from "@/components/marketing/post-card";
import { BLOG_CATEGORIES, findCategory } from "@/content/blog-taxonomy";
import { listPostsByCategory } from "@/lib/blog";

/**
 * A topic cluster's index page.
 *
 * Distinct from a tag page in purpose, not just in data. A tag page is a
 * browsing convenience; this is the hub of a cluster, so it leads with the
 * pillar article and links every sibling. That structure is the point — search
 * engines reward demonstrated coverage of a subject, and coverage is only
 * demonstrable if the pages reference each other.
 */
export async function generateStaticParams() {
  return BLOG_CATEGORIES.map((category) => ({ category: category.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const category = findCategory(slug);
  if (!category) return {};

  return {
    title: category.name,
    description: category.description,
    alternates: { canonical: `/blog/category/${category.slug}` },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: slug } = await params;
  const category = findCategory(slug);
  if (!category) notFound();

  const posts = await listPostsByCategory(slug);
  if (posts.length === 0) notFound();

  // Pillar first, guaranteed by listPostsByCategory. It is given the full width
  // rather than a grid cell because it is the page this cluster exists to rank,
  // and a hub that buries its own pillar in a grid is not a hub.
  const [pillar, ...rest] = posts;

  return (
    <>
      <PageHero
        crumbs={[{ label: "Blog", href: "/blog" }, { label: category.name }]}
        eyebrow="Category"
        title={category.name}
        body={category.description}
      >
        <nav aria-label="Other categories" className="mt-8">
          <ul className="flex flex-wrap gap-2">
            {BLOG_CATEGORIES.filter((other) => other.slug !== category.slug).map((other) => (
              <li key={other.slug}>
                <Link
                  href={`/blog/category/${other.slug}`}
                  className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--brand-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  {other.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </PageHero>

      {pillar ? (
        <Section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Start here
          </h2>
          <div className="mt-4">
            <PostCard post={pillar} />
          </div>
        </Section>
      ) : null}

      {rest.length > 0 ? (
        <Section space="joined">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            More on {category.name.toLowerCase()}
          </h2>
          <ul className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((post) => (
              <li key={post.slug}>
                <PostCard post={post} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
