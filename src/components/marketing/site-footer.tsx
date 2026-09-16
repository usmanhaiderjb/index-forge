import { Github, Linkedin, Twitter } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/marketing/site-header";
import { FOOTER_NAV, SITE } from "@/content/site";

const SOCIAL_ICONS: Record<string, typeof Github> = {
  GitHub: Github,
  X: Twitter,
  LinkedIn: Linkedin,
};

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--panel-border)] bg-[var(--panel)] text-[var(--panel-ink)]">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.6fr_repeat(3,1fr)]">
          <div>
            <Link
              href="/"
              className="inline-flex rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
            >
              <Logo />
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--panel-ink-secondary)]">
              {SITE.tagline}
            </p>

            <ul className="mt-5 flex gap-2">
              {SITE.social.map((item) => {
                const Icon = SOCIAL_ICONS[item.label];
                return (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      rel="noopener noreferrer me"
                      target="_blank"
                      aria-label={
                        item.placeholder ? `${item.label} (placeholder link)` : item.label
                      }
                      className="grid size-9 place-items-center rounded-lg border border-[var(--panel-border)] text-[var(--panel-ink-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--panel-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                    >
                      {Icon ? <Icon className="size-4" aria-hidden /> : item.label.slice(0, 1)}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          {FOOTER_NAV.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--panel-ink-muted)]">
                {column.heading}
              </h2>
              <ul className="mt-4 flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={`${column.heading}-${link.href}`}>
                    <Link
                      href={link.href}
                      className="rounded text-sm text-[var(--panel-ink-secondary)] transition-colors hover:text-[var(--panel-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-[var(--panel-border)] pt-6 text-xs text-[var(--panel-ink-muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {SITE.name}. All rights reserved.
          </p>
          <p className="max-w-md sm:text-right">
            Not affiliated with Apple or Google. App Store and Google Play are trademarks of their
            respective owners.
          </p>
        </div>
      </div>
    </footer>
  );
}
