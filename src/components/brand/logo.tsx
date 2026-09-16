import { cn } from "@aso/shared";

/**
 * The IndexForge mark: an anvil, a molten arrow rising off it, and three index
 * bars stepping up behind.
 *
 * Drawn rather than imported as a bitmap. A single raster cannot be a 16px
 * favicon, a 1024px store icon and a wordmark lockup without either blurring or
 * shipping four files that drift apart; and the arrow has to switch colour
 * between themes, which a PNG cannot do.
 *
 * Geometry sits on a 64×64 grid so every coordinate is a whole number at the
 * sizes that matter (16, 32, 64, 512, 1024).
 */
export function LogoMark({
  className,
  /** Draws the obsidian squircle behind the mark, as on the app icon. */
  plate = false,
  title,
}: {
  className?: string;
  plate?: boolean;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {plate ? (
        // Squircle rather than a rounded rect: iOS masks to a superellipse, and
        // a plain rx corner shows a visible gap at the diagonals under that mask.
        <rect width="64" height="64" rx="15" fill="var(--forge-obsidian, #0f172a)" />
      ) : null}

      {/* Index bars, stepping up. Behind the arrow, so the arrow reads as the
          thing moving and these as the record of where it has been. */}
      <g fill="var(--forge-accent, #3b82f6)">
        <rect x="12" y="28" width="5.5" height="10" rx="1.5" />
        <rect x="20" y="23" width="5.5" height="15" rx="1.5" />
        <rect x="28" y="18" width="5.5" height="20" rx="1.5" />
      </g>

      {/* The anvil: horn tapering left off the face, narrow waist, splayed
          foot. Three straight-edged pieces and no interior detail, because the
          silhouette has to survive at 16px in a browser tab. */}
      <path
        d="M4 44.5 16 40 H52 v7 H16 Z M26 47 H42 L39.5 53 H28.5 Z M21 53 H47 L50 58.5 H18 Z"
        fill="var(--forge-face, #f8fafc)"
      />

      {/* Molten arrow, struck off the anvil face and rising out of the frame's
          top right. */}
      <path
        d="M14 38 27 27l7 5 13-13"
        stroke="var(--forge-molten, #ff5722)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M40 12 H54 V26 Z" fill="var(--forge-molten, #ff5722)" />
    </svg>
  );
}

/**
 * Mark plus wordmark.
 *
 * "Index" takes the surface's own text colour so the lockup works on any
 * background; "Forge" is the accent, which is the half of the name that carries
 * the product's whole argument — that store visibility is built, not observed.
 */
export function Logo({
  className,
  markOnly = false,
}: {
  className?: string;
  markOnly?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark className="h-7 w-7 shrink-0" plate />
      {markOnly ? null : (
        <span className="text-lg font-bold tracking-tight">
          Index<span className="text-[var(--brand-ink)]">Forge</span>
        </span>
      )}
    </span>
  );
}
