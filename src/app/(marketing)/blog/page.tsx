import { ArrowRight, BookOpen, Rss, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BlogFilterBar } from "@/components/marketing/blog-filter-bar";
import { BlogPagination } from "@/components/marketing/blog-pagination";
import { PageHero } from "@/components/marketing/page-hero";
import { PostCard } from "@/components/marketing/post-card";
import { CtaBand, Section } from "@/components/marketing/sections";
import { findCategory } from "@/content/blog-taxonomy";
import { formatPostDate, listCategories, listPaginatedPosts, listPosts, listTags } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog | App Store Optimization & Mobile Growth Insights",
  description:
    "In-depth engineering notes on App Store Optimization: keyword indexing mechanics, ranking algorithms, conversion rate science, reviews NLP, and revenue attribution.",
  alternates: {
    canonical: "/blog",
    types: { "application/rss+xml": "/blog/rss.xml" },
  },
};

interface BlogIndexPageProps {
  searchParams: Promise<{
    page?: string;
    category?: string;
    tag?: string;
    q?: string;
  }>;
}

export default async function BlogIndexPage({ searchParams }: BlogIndexPageProps) {
  const resolvedParams = await searchParams;
  const pageNum = parseInt(resolvedParams.page || "1", 10) || 1;
  const activeCategory = resolvedParams.category;
  const activeTag = resolvedParams.tag;
  const searchQuery = resolvedParams.q;

  const [allPosts, tags, categories] = await Promise.all([
    listPosts(),
    listTags(),
    listCategories(),
  ]);

  const pageSize = 12;
  const paginatedResult = await listPaginatedPosts({
    page: pageNum,
    pageSize,
    category: activeCategory,
    tag: activeTag,
    query: searchQuery,
  });

  const { items: posts, totalItems, totalPages, currentPage } = paginatedResult;
  const isDefaultView = !activeCategory && !activeTag && !searchQuery && currentPage === 1;
  const featuredPost = isDefaultView && posts.length > 0 ? posts[0] : null;
  const gridPosts = isDefaultView && posts.length > 0 ? posts.slice(1) : posts;

  const startRange = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRange = Math.min(currentPage * pageSize, totalItems);

  return (
    <>
      <PageHero
        crumbs={[{ label: "Blog" }]}
        eyebrow="Growth & Engineering Insights"
        title="Notes on App Store Optimization"
        body="Real data, algorithmic mechanics, and production findings from measuring millions of keyword positions and conversion events across iOS and Android."
      >
        {tags.length > 0 ? (
          <nav aria-label="Popular topics" className="mt-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mr-1">
                Popular tags:
              </span>
              {tags.slice(0, 10).map(({ tag, count }) => (
                <Link
                  key={tag}
                  href={`/blog/tag/${encodeURIComponent(tag)}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--brand-ink)] hover:text-[var(--brand-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  <span>{tag}</span>
                  <span className="tabular text-[10px] text-[var(--text-muted)]">{count}</span>
                </Link>
              ))}
              <Link
                href="/blog/rss.xml"
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <Rss className="size-3" aria-hidden /> RSS
              </Link>
            </div>
          </nav>
        ) : null}
      </PageHero>

      {/* Interactive Filter and Search Bar */}
      <Section>
        <BlogFilterBar
          categories={categories}
          totalCount={allPosts.length}
          activeCategory={activeCategory || "all"}
          initialQuery={searchQuery || ""}
        />
      </Section>

      {/* Main Content Area */}
      <Section space="joined">
        {/* Results summary bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-[var(--border)]">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {searchQuery ? (
                <>Search results for &ldquo;{searchQuery}&rdquo;</>
              ) : activeCategory ? (
                <>Category: {findCategory(activeCategory)?.name || activeCategory}</>
              ) : activeTag ? (
                <>Topic: #{activeTag}</>
              ) : (
                <>All Articles</>
              )}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Showing {startRange}–{endRange} of {totalItems} {totalItems === 1 ? "article" : "articles"}
              {totalPages > 1 ? ` · Page ${currentPage} of ${totalPages}` : ""}
            </p>
          </div>

          {(activeCategory || activeTag || searchQuery) ? (
            <Link
              href="/blog"
              className="text-xs font-medium text-[var(--brand-ink)] hover:underline"
            >
              Clear filters
            </Link>
          ) : null}
        </div>

        {/* Featured Hero Article (Only on Page 1 default view) */}
        {featuredPost ? (
          <div className="mt-8">
            <Link
              href={`/blog/${featuredPost.slug}`}
              className="group grid overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] transition-all duration-200 hover:border-[var(--brand-ink)]/50 hover:shadow-xl hover:shadow-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] lg:grid-cols-12"
            >
              <div
                aria-hidden
                className="relative flex flex-col justify-between bg-[linear-gradient(135deg,var(--brand-soft),var(--surface-raised))] p-8 lg:col-span-5 lg:p-10"
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-ink)] px-2.5 py-1 text-xs font-medium text-white shadow-sm">
                    <Sparkles className="size-3" /> Featured Article
                  </span>
                </div>
                <div className="my-8">
                  <span className="text-4xl font-extrabold tracking-tight text-[var(--brand-ink)]/20 lg:text-5xl">
                    {findCategory(featuredPost.category)?.name || "ASO Intelligence"}
                  </span>
                </div>
                <div className="text-xs text-[var(--text-secondary)] font-mono">
                  {featuredPost.tags.slice(0, 3).map((t) => `#${t}`).join(" ")}
                </div>
              </div>

              <div className="flex flex-col justify-between p-6 sm:p-8 lg:col-span-7">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                    <time dateTime={featuredPost.date}>{formatPostDate(featuredPost.date)}</time>
                    <span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="size-3" /> {featuredPost.readingMinutes} min read
                    </span>
                  </div>

                  <h3 className="mt-3 text-balance text-xl font-bold tracking-tight text-[var(--text-primary)] transition-colors group-hover:text-[var(--brand-ink)] sm:text-2xl">
                    {featuredPost.title}
                  </h3>

                  <p className="mt-3 text-pretty text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
                    {featuredPost.description}
                  </p>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-[var(--border)] pt-4">
                  <span className="text-xs font-medium text-[var(--text-muted)]">
                    By {featuredPost.author}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand-ink)] transition-transform group-hover:translate-x-1">
                    <span>Read full guide</span>
                    <ArrowRight className="size-4" />
                  </span>
                </div>
              </div>
            </Link>
          </div>
        ) : null}

        {/* Empty State */}
        {totalItems === 0 ? (
          <div className="my-12 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <p className="text-base font-semibold text-[var(--text-primary)]">No matching articles found</p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Try adjusting your search terms or clearing the topic filter.
            </p>
            <div className="mt-6">
              <Link
                href="/blog"
                className="inline-flex h-9 items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-xs font-medium text-[var(--accent-contrast)] hover:opacity-90"
              >
                View all 50 articles
              </Link>
            </div>
          </div>
        ) : (
          /* Articles Grid */
          <div className="mt-8">
            {gridPosts.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {gridPosts.map((post) => (
                  <PostCard key={post.slug} post={post} />
                ))}
              </div>
            ) : null}

            {/* Accessible Pagination Navigation */}
            <BlogPagination
              currentPage={currentPage}
              totalPages={totalPages}
              baseUrl="/blog"
              searchParams={{
                category: activeCategory,
                tag: activeTag,
                q: searchQuery,
              }}
            />
          </div>
        )}
      </Section>

      <CtaBand
        title="Put this ASO data to work"
        body="Everything written here is grounded in real index tracking and attribution engine mechanics. Connect your App Store or Play Store account to see live numbers."
        primary={{ label: "Start for free", href: "/signin" }}
        secondary={{ label: "Explore features", href: "/features" }}
      />
    </>
  );
}
