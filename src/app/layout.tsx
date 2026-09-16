import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

import "@/app/globals.css";
import { env } from "@/env";
import { TRPCReactProvider } from "@/trpc/react";

/**
 * Interface type. Plus Jakarta Sans has the slightly technical, geometric cast
 * the identity asks for while staying readable at 13px in dense tables, which
 * is most of this product.
 */
const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans-brand",
});

/**
 * Numerals. Every metric, rank and delta in the product is a figure the reader
 * compares against the one above it, so the digits have to be tabular and the
 * font monospaced — proportional numerals make a column of ranks wobble.
 */
const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono-brand",
});

export const metadata: Metadata = {
  // Without this, every `alternates.canonical` and OG url stays relative and
  // resolves against whatever host served the page — including preview URLs.
  metadataBase: new URL(env.APP_URL),
  title: {
    default: "IndexForge — Engineer Your App Store Dominance",
    template: "%s · IndexForge",
  },
  description:
    "Connect Firebase, AdMob, Google Ads, Play Console, App Store Connect and Apple Search Ads. Track keywords, ranks, reviews and revenue in one place, with AI-generated ASO recommendations.",
  applicationName: "IndexForge",
  openGraph: {
    type: "website",
    siteName: "IndexForge",
    locale: "en_US",
    url: env.APP_URL,
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
          <TRPCReactProvider>{children}</TRPCReactProvider>
          <Toaster position="bottom-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
