import { ArrowLeft, Rss } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { env } from "@/env";
import { CtaBand, Section } from "@/components/marketing/sections";
import { Breadcrumbs } from "@/components/marketing/page-hero";
import { PostBody } from "@/components/marketing/post-body";
import { PostCard } from "@/components/marketing/post-card";
import { findCategory } from "@/content/blog-taxonomy";
import { formatPostDate, getPost, listPosts, relatedPosts } from "@/lib/blog";
import { SITE } from "@/content/site";

export async function generateStaticParams() {
  return (await listPosts()).map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    // A draft is visible in development only, but if one ever reaches a
    // deployed environment it must not be indexed.
    robots: post.draft ? { index: false, follow: false } : undefined,
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      publishedTime: post.date,
      authors: [post.author],
      tags: post.tags,
    },
    twitter: { card: "summary_large_image", title: post.title, description: post.description },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const related = await relatedPosts(post.slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: { "@type": "Organization", name: post.author },
    publisher: { "@type": "Organization", name: SITE.name },
    mainEntityOfPage: `${env.APP_URL}/blog/${post.slug}`,
    keywords: post.tags.join(", "),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Serialized from our own frontmatter, not from user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article>
        <header className="relative overflow-hidden border-b border-[var(--border)] bg-[var(--surface)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,var(--brand-soft),transparent_65%)] opacity-70"
          />

          <div className="relative mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
            <Breadcrumbs items={[{ label: "Blog", href: "/blog" }, { label: post.title }]} />

            {post.draft ? (
              <p className="mt-6 inline-block rounded-full border border-dashed border-[var(--border-strong)] px-3 py-1 text-xs text-[var(--text-muted)]">
                Draft — visible in development only
              </p>
            ) : null}

            <h1 className="mt-6 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
              {post.title}
            </h1>

            <p className="mt-5 text-pretty text-lg leading-relaxed text-[var(--text-secondary)]">
              {post.description}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-5">
              <span
                aria-hidden
                className="grid size-9 place-items-center rounded-full bg-[var(--accent)] text-sm font-bold text-[var(--accent-contrast)]"
              >
                {post.author.slice(0, 1)}
              </span>
              <span className="text-sm">
                <span className="block font-medium">{post.author}</span>
                <span className="block text-xs text-[var(--text-muted)]">
                  <time dateTime={post.date}>{formatPostDate(post.date)}</time> ·{" "}
                  {post.readingMinutes} min read
                </span>
              </span>

              {/* The category link sits with the tags but is styled as the
                  primary one: it returns the reader to the cluster hub, which
                  is the path that keeps them in the topic. */}
              <ul className="ml-auto flex flex-wrap gap-1.5">
                <li>
                  <Link
                    href={`/blog/category/${post.category}`}
                    className="inline-block rounded-full border border-[var(--brand-border)] bg-[var(--brand-soft)] px-2.5 py-1 text-xs font-medium text-[var(--brand-ink)] transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  >
                    {findCategory(post.category)?.name ?? post.category}
                  </Link>
                </li>
              </ul>

              {post.tags.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {post.tags.map((tag) => (
                    <li key={tag}>
                      <Link
                        href={`/blog/tag/${encodeURIComponent(tag)}`}
                        className="inline-block rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--brand-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                      >
                        {tag}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-16">
          <PostBody source={post.body} />

          <footer className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border)] pt-6">
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 rounded text-sm text-[var(--text-secondary)] underline-offset-4 hover:text-[var(--text-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <ArrowLeft className="size-4" aria-hidden /> All posts
            </Link>
            <Link
              href="/blog/rss.xml"
              className="inline-flex items-center gap-1.5 rounded text-sm text-[var(--text-muted)] underline-offset-4 hover:text-[var(--text-secondary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <Rss className="size-4" aria-hidden /> Subscribe
            </Link>
          </footer>
        </div>
      </article>

      {related.length > 0 ? (
        <Section className="border-t border-[var(--border)]">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Related reading
          </h2>
          <ul className="mt-6 grid gap-5 md:grid-cols-3">
            {related.map((item) => (
              <li key={item.slug}>
                <PostCard post={item} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <CtaBand
        title="See this against your own data"
        body="Connect one account and the views described here run on your numbers."
        primary={{ label: "Start for free", href: "/signin" }}
        secondary={{ label: "Ask a question", href: "/contact" }}
      />
    </>
  );
}
