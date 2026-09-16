import { Logo } from "@/components/brand/logo";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { env } from "@/env";
import { Button, Input, Label } from "@/components/ui/primitives";
import { DashboardMockup } from "@/components/marketing/mockups/dashboard";
import { HERO } from "@/content/site";
import { auth, signIn } from "@/server/auth";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const { error } = await searchParams;
  const googleEnabled = Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
  const devLoginEnabled = env.NODE_ENV !== "production";

  return (
    <div data-surface="marketing" className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      {/* --- form side ---------------------------------------------------- */}
      <div className="relative flex flex-col px-4 py-8 sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,var(--brand-soft),transparent_45%)] opacity-60 lg:hidden"
        />

        <div className="relative flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
          >
            <Logo />
          </Link>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded text-sm text-[var(--text-secondary)] underline-offset-4 hover:text-[var(--text-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <ArrowLeft className="size-4" aria-hidden /> Back to site
          </Link>
        </div>

        <div className="relative flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
            <p className="mt-2 text-[var(--text-secondary)]">
              A workspace is created for you on first sign-in.
            </p>

            {error ? (
              <p
                role="alert"
                className="mt-6 rounded-lg border border-[var(--status-critical)] bg-[color-mix(in_oklab,var(--status-critical)_10%,transparent)] px-4 py-3 text-sm"
              >
                {error === "OAuthAccountNotLinked"
                  ? "That email is already registered with a different sign-in method."
                  : "Sign-in failed. Try again."}
              </p>
            ) : null}

            <div className="mt-8 flex flex-col gap-4">
              {googleEnabled ? (
                <form
                  action={async () => {
                    "use server";
                    await signIn("google", { redirectTo: "/dashboard" });
                  }}
                >
                  <Button variant="primary" className="w-full" size="lg" type="submit">
                    Continue with Google
                  </Button>
                </form>
              ) : (
                <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                  Google sign-in is not configured on this deployment. Set{" "}
                  <code className="font-mono">AUTH_GOOGLE_ID</code> and{" "}
                  <code className="font-mono">AUTH_GOOGLE_SECRET</code> to enable it.
                </p>
              )}

              {devLoginEnabled ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-[var(--border)]" />
                    <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                      development only
                    </span>
                    <span className="h-px flex-1 bg-[var(--border)]" />
                  </div>

                  <form
                    action={async (formData: FormData) => {
                      "use server";
                      await signIn("dev", {
                        email: String(formData.get("email") ?? ""),
                        redirectTo: "/dashboard",
                      });
                    }}
                    className="flex flex-col gap-2"
                  >
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="you@example.com"
                    />
                    <Button variant="secondary" type="submit" className="mt-2 w-full">
                      Sign in without a password
                    </Button>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      This provider is never registered in production.
                    </p>
                  </form>
                </>
              ) : null}
            </div>

            <ul className="mt-8 flex flex-col gap-2 border-t border-[var(--border)] pt-6">
              {HERO.assurances.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"
                >
                  <Check className="size-4 shrink-0 text-[var(--status-good)]" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>

            <p className="mt-6 text-xs leading-relaxed text-[var(--text-muted)]">
              By signing in you agree to the{" "}
              <Link
                href="/terms"
                className="rounded underline underline-offset-4 hover:text-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                terms
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="rounded underline underline-offset-4 hover:text-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                privacy notice
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      {/* --- brand side ---------------------------------------------------
          Hidden below lg: on a phone this would push the actual form a full
          screen down, which is the one thing a sign-in page must not do. */}
      <div className="relative hidden overflow-hidden bg-[var(--panel)] p-10 lg:flex lg:flex-col lg:justify-center">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full bg-[var(--accent)]/20 blur-3xl"
        />

        <div className="relative mx-auto w-full max-w-lg">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-[var(--panel-ink)]">
            Every store number in one place.
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-[var(--panel-ink-secondary)]">
            Six connected sources, one daily table, and an answer to where every figure came from.
          </p>

          <div className="mt-10">
            <DashboardMockup />
          </div>

          <p className="mt-8 flex items-start gap-2.5 text-sm text-[var(--panel-ink-secondary)]">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" aria-hidden />
            Credentials are encrypted with AES-256-GCM before they are written and are never
            returned to the browser.
          </p>
        </div>
      </div>
    </div>
  );
}
