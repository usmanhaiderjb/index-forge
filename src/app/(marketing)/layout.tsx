import { env } from "@/env";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { SITE } from "@/content/site";
import { auth } from "@/server/auth";

/**
 * Public site shell.
 *
 * Deliberately does not redirect signed-in visitors to the dashboard. The blog
 * and the marketing pages are things a customer may want to read while logged
 * in, and bouncing them away makes those pages unreachable from inside the app.
 */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: env.APP_URL,
    description: SITE.description,
    // Placeholder social links are omitted rather than published as claimed
    // profiles for accounts that are not ours.
    sameAs: SITE.social.filter((item) => !item.placeholder).map((item) => item.href),
  };

  return (
    // data-surface swaps in the violet brand palette for the public site only,
    // leaving the app's chart colours alone. See globals.css.
    <div data-surface="marketing" className="flex min-h-dvh flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--surface-raised)] focus:px-3 focus:py-2 focus:text-sm focus:outline-2 focus:outline-[var(--accent)]"
      >
        Skip to content
      </a>

      <SiteHeader isSignedIn={Boolean(session?.user)} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
