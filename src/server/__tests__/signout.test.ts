import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Sign-out must go through a server action, not a bare form POST.
 *
 * This is a source-level assertion, which is unusual, but the failure it guards
 * against is invisible at runtime unless you specifically check the cookie.
 *
 * The app shell used to render:
 *
 *     <form action="/api/auth/signout" method="post">
 *
 * Auth.js v5 rejects that for a missing CSRF token and answers
 * `302 → /signin?error=MissingCSRF`. The redirect lands the user on the sign-in
 * page, so it looks like it worked — while the session cookie is untouched and
 * going back to /dashboard signs them straight in again. On a shared machine
 * that is a security problem wearing the costume of a working feature.
 *
 * Server actions carry their own CSRF protection, so `signOut` there both
 * clears the session and redirects.
 */

const root = join(process.cwd(), "src");

function source(relative: string): string {
  return readFileSync(join(root, relative), "utf8");
}

describe("sign out", () => {
  it("does not post directly to the Auth.js signout route", () => {
    const shell = source("components/app-shell.tsx");

    expect(shell).not.toContain('action="/api/auth/signout"');
    expect(shell).toContain("signOutAction");
  });

  it("clears the session and redirects home", () => {
    const action = source("server/actions/auth.ts");

    expect(action).toContain('"use server"');
    expect(action).toContain("signOut");
    // Redirecting to a protected route would bounce through /signin and look
    // like an error; home is the page a signed-out visitor belongs on.
    expect(action).toContain('redirectTo: "/"');
  });

  it("keeps sign-in on a server action too, for the same reason", () => {
    const signin = source("app/signin/page.tsx");

    expect(signin).toContain('"use server"');
    expect(signin).not.toContain('action="/api/auth/signin"');
  });
});
