import type { Metadata } from "next";

import { LegalPage } from "@/components/marketing/legal-page";
import { SITE } from "@/content/site";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What data ASO stores, how credentials are encrypted, who it is shared with, and how to delete it.",
  alternates: { canonical: "/privacy" },
};

/**
 * Describes what the software actually does with data. It is not legal advice
 * and does not pretend to be a reviewed policy — the notice at the top says so
 * rather than letting a template imply a lawyer wrote it.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      intro="What the software stores, where it sends it, and how to get rid of it."
      disclaimer="This page describes how the software handles data as built. It has not been reviewed by a lawyer and is not a substitute for a policy written for your jurisdiction. Replace it before operating commercially."
      updated="17 August 2026"
      sections={[
        {
          id: "what-is-stored",
          heading: "What is stored",
          body: (
            <ul className="flex flex-col gap-2.5">
              <li>
                <strong className="font-medium text-[var(--text-primary)]">Account data</strong> —
                your email address and the workspace you belong to, used to sign you in and scope
                what you can see.
              </li>
              <li>
                <strong className="font-medium text-[var(--text-primary)]">
                  Integration credentials
                </strong>{" "}
                — OAuth tokens and API keys for the providers you connect, encrypted with
                AES-256-GCM before they are written and never returned to the browser.
              </li>
              <li>
                <strong className="font-medium text-[var(--text-primary)]">Store data</strong> — the
                metrics, listings, keyword ranks and reviews pulled from the accounts you connect.
              </li>
              <li>
                <strong className="font-medium text-[var(--text-primary)]">
                  Contact messages
                </strong>{" "}
                — anything you send through the contact form, kept so it can be answered, along with
                a hashed IP used only for rate limiting.
              </li>
              <li>
                <strong className="font-medium text-[var(--text-primary)]">Audit log</strong> — who
                changed a connection or published a review reply, and when.
              </li>
            </ul>
          ),
        },
        {
          id: "who-it-goes-to",
          heading: "Who it is sent to",
          body: (
            <p>
              The store and ad APIs you connect, because that is where the data comes from. The
              configured AI provider, when you request a generated suggestion — the prompt carries
              your listing text and metric summaries. Your own configured webhook and SMTP
              endpoints, when you enable alert delivery. Nothing else.
            </p>
          ),
        },
        {
          id: "deleting",
          heading: "Deleting it",
          body: (
            <p>
              Revoking a connection deletes its stored credential. Deleting an app removes its
              metrics, listings, ranks and reviews. For full workspace deletion, contact{" "}
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
        {
          id: "cookies",
          heading: "Cookies",
          body: (
            <p>
              A session cookie to keep you signed in, and a local preference for your light or dark
              theme. No advertising or cross-site tracking cookies are set.
            </p>
          ),
        },
      ]}
    />
  );
}
