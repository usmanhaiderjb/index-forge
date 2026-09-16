import type { Metadata } from "next";

import { LegalPage } from "@/components/marketing/legal-page";
import { SITE } from "@/content/site";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of use for ASO, including acceptable use of the store integrations.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms"
      intro="How the software is intended to be used, in plain language."
      disclaimer="A plain-language summary of how the software is intended to be used. It has not been reviewed by a lawyer. Replace it with real terms before operating commercially."
      updated="17 August 2026"
      sections={[
        {
          id: "your-data",
          heading: "Your accounts and your data",
          body: (
            <p>
              You connect accounts you are authorised to access, and the data pulled from them
              remains yours. You can export all of it at any time and revoke any connection.
            </p>
          ),
        },
        {
          id: "store-terms",
          heading: "Store terms still apply",
          body: (
            <p>
              Rank tracking reads public store search endpoints. You remain responsible for using
              the product within Apple&apos;s and Google&apos;s own terms, including their rules on
              automated access and on what you publish in a listing or a review reply.
            </p>
          ),
        },
        {
          id: "ai-content",
          heading: "AI-generated content",
          body: (
            <p>
              Generated metadata and suggested replies are drafts. They are validated against store
              character limits, not against accuracy or your brand voice. You are responsible for
              what you publish.
            </p>
          ),
        },
        {
          id: "third-party-data",
          heading: "No warranty on third-party data",
          body: (
            <p>
              Store and ad platforms restate figures for recent days, change their APIs, and rate
              limit. Numbers are reported as the providers give them, with the source recorded. They
              are not guaranteed to match a provider console at any given moment.
            </p>
          ),
        },
        {
          id: "contact",
          heading: "Contact",
          body: (
            <p>
              Questions about these terms:{" "}
              <a
                href={`mailto:${SITE.contact.email}`}
                className="rounded text-[var(--brand-ink)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                {SITE.contact.email}
              </a>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
