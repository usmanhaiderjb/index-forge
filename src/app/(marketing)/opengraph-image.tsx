import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "IndexForge — Engineer Your App Store Dominance";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Social card for every marketing route that does not define its own.
 *
 * Uses only system fonts and flat colours: `next/og` runs in a constrained
 * renderer, and fetching a webfont here means the card silently fails to build
 * whenever that fetch is slow or blocked.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0d0d0d",
          color: "#ffffff",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/*
            The mark, inlined as SVG. Satori renders this element tree directly
            and cannot fetch an image at request time, so the logo component
            cannot be reused here — but the geometry is the same 64-grid.
          */}
          <svg width="56" height="56" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="15" fill="#0f172a" />
            <g fill="#3b82f6">
              <rect x="12" y="28" width="5.5" height="10" rx="1.5" />
              <rect x="20" y="23" width="5.5" height="15" rx="1.5" />
              <rect x="28" y="18" width="5.5" height="20" rx="1.5" />
            </g>
            <path
              d="M4 44.5 16 40 H52 v7 H16 Z M26 47 H42 L39.5 53 H28.5 Z M21 53 H47 L50 58.5 H18 Z"
              fill="#f8fafc"
            />
            <path
              d="M14 38 27 27l7 5 13-13"
              stroke="#ff5722"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path d="M40 12 H54 V26 Z" fill="#ff5722" />
          </svg>
          <div style={{ fontSize: 32, fontWeight: 600, display: "flex" }}>
            <span>Index</span>
            <span style={{ color: "#ff7043" }}>Forge</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 60, fontWeight: 600, lineHeight: 1.1, letterSpacing: -1.5 }}>
            Stop tracking rankings. Start forging them.
          </div>
          <div style={{ fontSize: 28, color: "#c3c2b7", lineHeight: 1.4 }}>
            Six store and ad integrations · traffic-source conversion · keyword and rank
            tracking · AI listing suggestions
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, fontSize: 22, color: "#898781" }}>
          <span>Firebase</span>
          <span>·</span>
          <span>AdMob</span>
          <span>·</span>
          <span>Google Ads</span>
          <span>·</span>
          <span>Play Console</span>
          <span>·</span>
          <span>App Store Connect</span>
          <span>·</span>
          <span>Apple Search Ads</span>
        </div>
      </div>
    ),
    size,
  );
}
