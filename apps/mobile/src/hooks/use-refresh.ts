import * as React from "react";

/**
 * Pull-to-refresh state.
 *
 * `RefreshControl` must not be driven from react-query's `isRefetching`.
 * That flag is true for *every* refetch, including the ones nobody asked for —
 * a background revalidation, a retry after a failed request, a refetch on
 * reconnect. On Android the spinner for a programmatic refresh is not attached
 * to a finger, so it animates to a floating position in the middle of the
 * screen and sits there on top of the content for as long as the request takes.
 * With retries that is tens of seconds of a spinner over the numbers, on a
 * screen the user never touched.
 *
 * So the spinner is tied to the gesture instead: it appears when the user pulls
 * and goes away when that specific refetch settles. Background work stays
 * invisible, which is the point of having a cache.
 */
export function usePullToRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = React.useState(false);
  // Guards a setState after the screen has gone.
  const mounted = React.useRef(true);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // `refetch` resolves rather than rejects on failure — the error lands on
    // the query. `catch` is here only so an unexpected throw cannot leave the
    // spinner running forever.
    refetch()
      .catch(() => undefined)
      .finally(() => {
        if (mounted.current) setRefreshing(false);
      });
  }, [refetch]);

  return { refreshing, onRefresh };
}
