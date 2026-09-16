import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

interface BlogPaginationProps {
  currentPage: number;
  totalPages: number;
  baseUrl?: string;
  searchParams?: Record<string, string | undefined>;
}

export function BlogPagination({
  currentPage,
  totalPages,
  baseUrl = "/blog",
  searchParams = {},
}: BlogPaginationProps) {
  if (totalPages <= 1) return null;

  function createPageUrl(pageNumber: number): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && key !== "page" && value !== "") {
        params.set(key, value);
      }
    }
    if (pageNumber > 1) {
      params.set("page", pageNumber.toString());
    }
    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }

  function getPageNumbers(): (number | string)[] {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, "ellipsis-1", totalPages];
    }

    if (currentPage >= totalPages - 3) {
      return [
        1,
        "ellipsis-1",
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      ];
    }

    return [1, "ellipsis-1", currentPage - 1, currentPage, currentPage + 1, "ellipsis-2", totalPages];
  }

  const pageNumbers = getPageNumbers();
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <nav
      aria-label="Blog pagination"
      className="mt-12 flex flex-wrap items-center justify-center gap-2 pt-6 border-t border-[var(--border)]"
    >
      {hasPrev ? (
        <Link
          href={createPageUrl(currentPage - 1)}
          prefetch={false}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-all hover:bg-[var(--surface-raised)] hover:border-[var(--accent)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" aria-hidden />
          <span>Previous</span>
        </Link>
      ) : (
        <span
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--text-muted)] opacity-50 cursor-not-allowed select-none"
          aria-disabled="true"
        >
          <ChevronLeft className="size-4" aria-hidden />
          <span>Previous</span>
        </span>
      )}

      <div className="flex items-center gap-1.5">
        {pageNumbers.map((item, index) => {
          if (typeof item === "string") {
            return (
              <span
                key={`${item}-${index}`}
                className="flex h-9 min-w-8 items-center justify-center px-1 text-xs text-[var(--text-muted)] select-none"
                aria-hidden
              >
                …
              </span>
            );
          }

          const isCurrent = item === currentPage;

          return (
            <Link
              key={item}
              href={createPageUrl(item)}
              prefetch={false}
              aria-current={isCurrent ? "page" : undefined}
              className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-xs font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                isCurrent
                  ? "bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm font-semibold pointer-events-none"
                  : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
              }`}
            >
              {item}
            </Link>
          );
        })}
      </div>

      {hasNext ? (
        <Link
          href={createPageUrl(currentPage + 1)}
          prefetch={false}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-all hover:bg-[var(--surface-raised)] hover:border-[var(--accent)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          aria-label="Next page"
        >
          <span>Next</span>
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--text-muted)] opacity-50 cursor-not-allowed select-none"
          aria-disabled="true"
        >
          <span>Next</span>
          <ChevronRight className="size-4" aria-hidden />
        </span>
      )}
    </nav>
  );
}
