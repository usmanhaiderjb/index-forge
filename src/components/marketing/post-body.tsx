import { MDXRemote } from "next-mdx-remote/rsc";
import Link from "next/link";
import type { MDXComponents } from "mdx/types";

/**
 * MDX element mapping.
 *
 * Styled explicitly rather than with a prose plugin, so post typography uses
 * the same theme tokens as the rest of the site and stays readable in both
 * colour schemes without a second set of overrides.
 */
const components: MDXComponents = {
  h2: (props) => (
    <h2
      {...props}
      className="mt-10 scroll-mt-20 text-xl font-semibold tracking-tight text-[var(--text-primary)]"
    />
  ),
  h3: (props) => (
    <h3
      {...props}
      className="mt-8 scroll-mt-20 text-base font-semibold tracking-tight text-[var(--text-primary)]"
    />
  ),
  p: (props) => <p {...props} className="mt-4 text-pretty leading-7" />,
  ul: (props) => <ul {...props} className="mt-4 flex list-disc flex-col gap-2 pl-5" />,
  ol: (props) => <ol {...props} className="mt-4 flex list-decimal flex-col gap-2 pl-5" />,
  li: (props) => <li {...props} className="leading-7" />,
  strong: (props) => (
    <strong {...props} className="font-semibold text-[var(--text-primary)]" />
  ),
  blockquote: (props) => (
    <blockquote
      {...props}
      className="mt-4 border-l-2 border-[var(--accent)] pl-4 text-[var(--text-muted)]"
    />
  ),
  code: (props) => (
    <code
      {...props}
      className="rounded bg-[var(--page)] px-1 py-0.5 font-mono text-[0.875em] text-[var(--text-primary)]"
    />
  ),
  pre: (props) => (
    <pre
      {...props}
      className="mt-4 overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--page)] p-4 text-sm [&_code]:bg-transparent [&_code]:p-0"
    />
  ),
  hr: (props) => <hr {...props} className="my-10 border-[var(--border)]" />,
  table: (props) => (
    <div className="my-6 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface-raised)]">
      <table {...props} className="w-full text-left text-sm" />
    </div>
  ),
  thead: (props) => (
    <thead
      {...props}
      className="border-b border-[var(--border)] bg-[var(--surface)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
    />
  ),
  tbody: (props) => <tbody {...props} className="divide-y divide-[var(--border)]" />,
  tr: (props) => <tr {...props} className="hover:bg-[var(--surface)]/50 transition-colors" />,
  th: (props) => <th {...props} className="px-4 py-3 font-semibold text-[var(--text-primary)]" />,
  td: (props) => (
    <td {...props} className="px-4 py-3 leading-relaxed text-[var(--text-secondary)]" />
  ),
  figure: (props) => <figure {...props} className="my-8" />,
  figcaption: (props) => (
    <figcaption {...props} className="mt-2 text-center text-xs text-[var(--text-muted)]" />
  ),
  img: (props) => (
    <span className="block my-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...props}
        className="h-auto w-full rounded-xl object-cover"
        alt={props.alt || "Article graphic"}
      />
    </span>
  ),
  a: ({ href = "", ...props }) => {
    const isInternal = href.startsWith("/");
    const className =
      "rounded text-[var(--brand-ink)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

    return isInternal ? (
      <Link href={href} className={className} {...props} />
    ) : (
      <a href={href} rel="noopener noreferrer" target="_blank" className={className} {...props} />
    );
  },
};

export function PostBody({ source }: { source: string }) {
  return (
    <div className="text-[var(--text-secondary)]">
      <MDXRemote source={source} components={components} />
    </div>
  );
}
