import Link from "next/link";

import { PRIMARY_NAV, SITE } from "@/content/site";

/**
 * Root 404.
 *
 * Deliberately outside the marketing route group: an unknown URL may not sit
 * under any group, so this cannot rely on that layout's header and footer and
 * carries its own minimal chrome instead.
 */
export default function NotFound() {
  const suggestions = [
    { label: "Home", href: "/" },
    ...PRIMARY_NAV.flatMap((item) =>
      item.children ? item.children : item.href ? [{ label: item.label, href: item.href }] : [],
    ),
  ].slice(0, 6);

  return (
    <div
      data-surface="marketing"
      className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-16"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,var(--brand-soft),transparent_55%)] opacity-70"
      />

      <div className="relative w-full max-w-lg text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded text-lg font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
        >
          {SITE.name.toLowerCase()}
          <span aria-hidden className="flex items-end gap-[2px] pb-[3px]">
            <span className="block w-[3px] rounded-sm bg-[var(--accent)]" style={{ height: 7 }} />
            <span className="block w-[3px] rounded-sm bg-[var(--accent)]" style={{ height: 11 }} />
            <span className="block w-[3px] rounded-sm bg-[var(--accent)]" style={{ height: 15 }} />
          </span>
        </Link>

        <p className="tabular mt-12 text-7xl font-bold tracking-tight text-[var(--accent)]/25">
          404
        </p>

        <h1 className="mt-4 text-balance text-3xl font-bold tracking-tight">
          That page does not exist
        </h1>
        <p className="mt-3 text-pretty text-[var(--text-secondary)]">
          The link may be out of date, or the address may have a typo in it.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Back to home
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center rounded-lg border border-[var(--border-strong)] px-5 py-2.5 text-sm font-medium transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Report a broken link
          </Link>
        </div>

        <nav aria-label="Suggested pages" className="mt-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Try one of these
          </p>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {suggestions.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-block rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
