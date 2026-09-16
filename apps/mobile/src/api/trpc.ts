import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "../../../../src/server/api/root";
import { API_URL, SessionExpiredError, getAccessToken } from "@/api/auth";

/**
 * Typed client for the web app's tRPC router.
 *
 * `AppRouter` is imported as a **type only** — TypeScript erases it, so no
 * server code reaches the bundle. Renaming a field on the server breaks this
 * app at compile time, which is the entire reason for choosing tRPC over a
 * hand-written REST client.
 */
export const api = createTRPCReact<AppRouter>();

export function createTRPCClient() {
  return api.createClient({
    links: [
      httpBatchLink({
        url: `${API_URL}/api/trpc`,
        transformer: superjson,

        headers: async () => {
          try {
            return { authorization: `Bearer ${await getAccessToken()}` };
          } catch {
            // Send the request unauthenticated rather than throwing. Public
            // procedures still work, and anything protected returns a clean
            // UNAUTHORIZED the UI can act on.
            return {};
          }
        },

        /**
         * Retries once on a 401 with a freshly forced token.
         *
         * The token can look valid locally and still be rejected — a device
         * revoked from another session, for instance. `getAccessToken(true)`
         * shares the same in-flight promise as everything else, so a batch of
         * simultaneous 401s still triggers exactly one refresh.
         */
        fetch: async (input, init) => {
          const response = await fetch(input as RequestInfo, init as RequestInit);
          if (response.status !== 401) return response;

          try {
            const token = await getAccessToken(true);
            const headers = new Headers(init?.headers as HeadersInit);
            headers.set("authorization", `Bearer ${token}`);
            return await fetch(input as RequestInfo, { ...(init as RequestInit), headers });
          } catch {
            // Refresh failed: the session is genuinely gone. Return the
            // original 401 so the query fails normally and the auth gate can
            // route to sign-in.
            return response;
          }
        },
      }),
    ],
  });
}

/** True when an error means "sign in again" rather than "try again". */
export function isAuthError(error: unknown): boolean {
  if (error instanceof SessionExpiredError) return true;
  if (error instanceof TRPCClientError) {
    return error.data?.code === "UNAUTHORIZED";
  }
  return false;
}

/** A message worth showing a user, from whatever the layer below threw. */
export function errorMessage(error: unknown): string {
  if (error instanceof TRPCClientError) {
    if (error.data?.code === "TOO_MANY_REQUESTS") {
      return "Too many requests. Give it a moment and try again.";
    }
    return error.message;
  }
  if (error instanceof Error) {
    // The message fetch throws for a dead connection is not one to show anyone.
    if (error.message.includes("Network request failed")) {
      return "No connection. Showing the last data we have.";
    }
    return error.message;
  }
  return "Something went wrong.";
}
