"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { cn } from "@aso/shared";
import { PRIMARY_NAV, SITE } from "@/content/site";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/marketing/theme-toggle";

/**
 * Public site header.
 *
 * `isSignedIn` is resolved on the server and passed down, so the primary action
 * is correct in the first paint rather than flipping from "Sign in" to
 * "Dashboard" once a session query resolves.
 */
export function SiteHeader({ isSignedIn }: { isSignedIn: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [openMenu, setOpenMenu] = React.useState<string | null>(null);
  const pathname = usePathname();

  // Route changes must close both menus; without this, tapping a link on mobile
  // navigates behind a menu that is still covering the page.
  React.useEffect(() => {
    setOpen(false);
    setOpenMenu(null);
  }, [pathname]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      setOpenMenu(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) => {
    const [path] = href.split("#");
    if (!path || path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--page)]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded text-lg font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
        >
          <Logo />
        </Link>

        <nav
          aria-label="Main"
          className="hidden flex-1 items-center justify-center gap-0.5 lg:flex"
          // Leaving the whole bar closes whichever dropdown is open, so a menu
          // never hangs around after the pointer has moved on.
          onMouseLeave={() => setOpenMenu(null)}
        >
          {PRIMARY_NAV.map((item) =>
            item.children ? (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={() => setOpenMenu(item.label)}
              >
                <button
                  type="button"
                  aria-expanded={openMenu === item.label}
                  onClick={() => setOpenMenu((v) => (v === item.label ? null : item.label))}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                    item.children.some((child) => isActive(child.href))
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                  )}
                >
                  {item.label}
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      openMenu === item.label && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>

                {openMenu === item.label ? (
                  <div className="absolute left-1/2 top-full w-80 -translate-x-1/2 pt-2">
                    <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-1.5 shadow-xl shadow-black/10">
                      {item.children.map((child) => (
                        <li key={`${item.label}-${child.label}`}>
                          <Link
                            href={child.href}
                            className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--surface)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]"
                          >
                            <span className="block text-sm font-medium">{child.label}</span>
                            {child.description ? (
                              <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                                {child.description}
                              </span>
                            ) : null}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                  isActive(item.href)
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
          <ThemeToggle />

          {!isSignedIn ? (
            <Link
              href="/signin"
              className="hidden rounded-md px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:block"
            >
              Login
            </Link>
          ) : null}

          <Link href={isSignedIn ? "/dashboard" : "/signin"} className="hidden sm:block">
            <span className="inline-flex items-center rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)]">
              {isSignedIn ? "Dashboard" : "Start for free"}
            </span>
          </Link>

          <button
            type="button"
            className="rounded-md p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-[var(--border)] bg-[var(--page)] lg:hidden"
        >
          <ul className="mx-auto flex max-w-6xl flex-col px-4 py-3 sm:px-6">
            {PRIMARY_NAV.map((item) => (
              <li key={item.label} className="py-0.5">
                {item.href ? (
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-2 py-2.5 text-sm font-medium",
                      isActive(item.href)
                        ? "text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)]",
                    )}
                  >
                    {item.label}
                  </Link>
                ) : (
                  // A parent with children is a group label on mobile, where the
                  // whole list is already expanded and there is nothing to toggle.
                  <p className="px-2 pb-1 pt-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    {item.label}
                  </p>
                )}

                {item.children ? (
                  <ul className="ml-2 flex flex-col border-l border-[var(--border)] pl-3">
                    {item.children.map((child) => (
                      <li key={`m-${item.label}-${child.label}`}>
                        <Link
                          href={child.href}
                          className="block rounded-md px-2 py-2 text-sm text-[var(--text-muted)]"
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}

            <li className="mt-3 flex flex-col gap-2 border-t border-[var(--border)] pt-3">
              {!isSignedIn ? (
                <Link
                  href="/signin"
                  className="rounded-lg border border-[var(--border-strong)] px-4 py-2.5 text-center text-sm font-medium"
                >
                  Login
                </Link>
              ) : null}
              <Link
                href={isSignedIn ? "/dashboard" : "/signin"}
                className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-center text-sm font-medium text-[var(--accent-contrast)]"
              >
                {isSignedIn ? "Go to dashboard" : "Start for free"}
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

/**
 * Re-exported so `site-footer` and anything else that imported the wordmark
 * from here keeps working. The mark itself lives in components/brand.
 */
export { Logo };
