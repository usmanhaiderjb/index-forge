/**
 * Stub for the `server-only` package under vitest.
 *
 * The real package throws when imported outside a React Server Component. The
 * test runner is already server-side, so the guard has nothing to protect and
 * would only block server modules from being tested at all.
 */
export {};
