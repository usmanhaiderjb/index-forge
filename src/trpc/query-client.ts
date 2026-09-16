import { defaultShouldDehydrateQuery, QueryClient } from "@tanstack/react-query";
import superjson from "superjson";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Dashboard data is minutes-fresh at best; keeping queries fresh for 60s
        // and in garbage-collection cache for 5m gives instant tab switching.
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const code = (error as { data?: { code?: string } })?.data?.code;
          if (code === "UNAUTHORIZED" || code === "FORBIDDEN" || code === "NOT_FOUND") return false;
          return failureCount < 2;
        },
      },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
}
