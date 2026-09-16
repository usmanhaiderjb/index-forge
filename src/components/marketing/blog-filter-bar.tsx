"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

interface BlogFilterBarProps {
  categories: { slug: string; name: string; count: number }[];
  totalCount: number;
  activeCategory?: string;
  initialQuery?: string;
}

export function BlogFilterBar({
  categories,
  totalCount,
  activeCategory = "all",
  initialQuery = "",
}: BlogFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (query.trim()) {
      params.set("q", query.trim());
    } else {
      params.delete("q");
    }
    params.delete("page"); // Reset to page 1 on new search

    startTransition(() => {
      router.push(`/blog?${params.toString()}`);
    });
  }

  function handleClearSearch() {
    setQuery("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("page");

    startTransition(() => {
      router.push(`/blog?${params.toString()}`);
    });
  }

  return (
    <div className="space-y-6">
      {/* Search Input Bar */}
      <form onSubmit={handleSearch} className="relative max-w-xl">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3.5 size-4 text-[var(--text-muted)]" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 50+ articles by keyword, topic, or concept..."
            className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] pl-10 pr-24 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-colors focus:border-[var(--accent)] focus:bg-[var(--surface-raised)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          {query ? (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-16 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          ) : null}
          <button
            type="submit"
            disabled={isPending}
            className="absolute right-1.5 h-8 rounded-lg bg-[var(--accent)] px-3 text-xs font-medium text-[var(--accent-contrast)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "..." : "Search"}
          </button>
        </div>
      </form>

      {/* Category Pills Navigation */}
      <nav aria-label="Filter articles by category" className="flex flex-wrap items-center gap-2">
        <Link
          href="/blog"
          className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
            activeCategory === "all" && !initialQuery
              ? "border-[var(--brand-ink)] bg-[var(--brand-ink)] text-white shadow-sm"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
          }`}
        >
          <span>All articles</span>
          <span className={`tabular text-xs ${activeCategory === "all" && !initialQuery ? "text-white/80" : "text-[var(--text-muted)]"}`}>
            {totalCount}
          </span>
        </Link>

        {categories.map((cat) => {
          const isActive = activeCategory === cat.slug;
          return (
            <Link
              key={cat.slug}
              href={`/blog?category=${cat.slug}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
                isActive
                  ? "border-[var(--brand-ink)] bg-[var(--brand-ink)] text-white shadow-sm"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span>{cat.name}</span>
              <span className={`tabular text-xs ${isActive ? "text-white/80" : "text-[var(--text-muted)]"}`}>
                {cat.count}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
