import type { Client } from "@/content/site";

/**
 * Geometric glyphs for the logo wall.
 *
 * Drawn rather than imported: no real company mark appears on this site, and a
 * set of abstract shapes reads as a logo wall without claiming any brand.
 * `currentColor` throughout so a wordmark inherits the muted treatment real
 * logo walls use.
 */
export function ClientMark({ mark }: { mark: Client["mark"] }) {
  const common = {
    viewBox: "0 0 24 24",
    className: "size-5 shrink-0",
    "aria-hidden": true,
  } as const;

  switch (mark) {
    case "orbit":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-30 12 12)" />
        </svg>
      );
    case "prism":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M12 3 21 19H3Z" />
          <path d="M12 3v16" />
        </svg>
      );
    case "wave":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M2 15c3-6 5-6 8 0s5 6 8 0" />
          <path d="M2 8c3-6 5-6 8 0s5 6 8 0" opacity="0.45" />
        </svg>
      );
    case "grid":
      return (
        <svg {...common} fill="currentColor">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" opacity="0.45" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" opacity="0.45" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common} fill="currentColor">
          <path d="M12 2 14 9l7 3-7 3-2 7-2-7-7-3 7-3Z" />
        </svg>
      );
    case "arc":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 18a9 9 0 0 1 18 0" />
          <circle cx="12" cy="18" r="2.5" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}
