import { ArrowRight, Clock } from "lucide-react";
import Link from "next/link";

import { findCategory } from "@/content/blog-taxonomy";
import type { PostMeta } from "@/lib/blog";
import { formatPostDate } from "@/lib/blog";

export function PostCard({ post }: { post: PostMeta }) {
  const categoryInfo = findCategory(post.category);
  const categoryLabel = categoryInfo ? categoryInfo.name : post.category;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-ink)]/40 hover:shadow-lg hover:shadow-black/5 focus-within:border-[var(--accent)]">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-0.5 font-medium text-[var(--brand-ink)]">
          {categoryLabel}
        </span>
        <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
          <Clock className="size-3" aria-hidden />
          <span>{post.readingMinutes} min read</span>
        </div>
      </div>

      <h2 className="mt-3 text-balance text-base font-semibold tracking-tight text-[var(--text-primary)] transition-colors group-hover:text-[var(--brand-ink)]">
        <Link
          href={`/blog/${post.slug}`}
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          {post.title}
        </Link>
      </h2>

      <p className="mt-2.5 line-clamp-3 flex-1 text-pretty text-sm leading-relaxed text-[var(--text-secondary)]">
        {post.description}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)]/60 pt-3 text-xs text-[var(--text-muted)]">
        <time dateTime={post.date}>{formatPostDate(post.date)}</time>

        <Link
          href={`/blog/${post.slug}`}
          tabIndex={-1}
          aria-hidden
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand-ink)] transition-transform group-hover:translate-x-0.5"
        >
          <span>Read article</span>
          <ArrowRight className="size-3" />
        </Link>
      </div>
    </article>
  );
}
