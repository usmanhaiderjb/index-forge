"use server";

import { signOut } from "@/server/auth";

/**
 * Sign out.
 *
 * A server action rather than the raw `<form action="/api/auth/signout">` this
 * replaced. That form posted without a CSRF token, and Auth.js v5 rejects such
 * a request outright:
 *
 *     302 → /signin?error=MissingCSRF
 *
 * The redirect made it *look* like it had worked — the user landed on the
 * sign-in page — while the session cookie was never cleared. Navigating back to
 * /dashboard signed them straight back in. On a shared machine that is a real
 * problem, not a cosmetic one.
 *
 * Server actions carry their own CSRF protection, so calling `signOut` here
 * both clears the session and redirects, with nothing to forget.
 */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
