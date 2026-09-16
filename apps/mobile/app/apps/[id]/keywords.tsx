import { Stack, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { api, errorMessage } from "@/api/trpc";
import { Card, CardSkeleton, EmptyState, ErrorState, RankDelta } from "@/components/ui";
import { useTheme } from "@/theme";

/**
 * Keyword ranks, with the competitors on the same result page.
 *
 * The head-to-head is the reason this screen is worth opening on a phone: your
 * rank moving means one thing if everyone moved and something else if only you
 * did.
 */
export default function Keywords() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const list = api.keywords.list.useQuery({ appId: id, sort: "rank", onlyTracked: true });
  const head = api.keywords.competitorRanks.useQuery({ appId: id });

  if (list.isPending && !list.data) {
    return (
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
      </ScrollView>
    );
  }

  if (list.isError && !list.data) {
    return <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} />;
  }

  const keywords = list.data ?? [];
  const byKeyword = new Map((head.data ?? []).map((row) => [row.keywordId, row]));

  return (
    <>
      <Stack.Screen options={{ title: "Keywords" }} />

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching}
            onRefresh={() => void list.refetch()}
            tintColor={t.brand.base}
          />
        }
      >
        {keywords.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="No keywords tracked"
            detail="Add keywords on the web dashboard. Ranks are checked once a day, early UTC, so figures stay comparable day to day."
          />
        ) : (
          keywords.map((keyword) => {
            const rivals = byKeyword.get(keyword.id);

            return (
              <Card key={keyword.id}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.md }}>
                  <Text style={[t.type.body, { color: t.color.textPrimary, flex: 1 }]}>
                    {keyword.term}
                  </Text>

                  <Text style={[t.type.heading, { color: t.color.textPrimary }]}>
                    {keyword.rank === null
                      ? `>${keyword.scanDepth ?? 100}`
                      : `#${keyword.rank}`}
                  </Text>

                  <RankDelta delta={keyword.delta ?? null} />
                </View>

                {rivals && rivals.rivals.length > 0 ? (
                  <View
                    style={{
                      marginTop: t.spacing.md,
                      paddingTop: t.spacing.md,
                      borderTopWidth: 1,
                      borderTopColor: t.color.border,
                    }}
                  >
                    <Text style={[t.type.caption, { color: t.color.textMuted }]}>
                      {rivals.us.rank === null
                        ? `Not in the top ${rivals.scanDepth ?? 100} · ${rivals.competitorsRanked} competitor${
                            rivals.competitorsRanked === 1 ? "" : "s"
                          } rank`
                        : rivals.competitorsAhead === 0
                          ? "Ahead of every tracked competitor"
                          : `Behind ${rivals.competitorsAhead} tracked competitor${
                              rivals.competitorsAhead === 1 ? "" : "s"
                            }`}
                    </Text>

                    {rivals.rivals.slice(0, 3).map((rival) => (
                      <View
                        key={rival.competitorId}
                        style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}
                      >
                        <Text
                          style={[t.type.caption, { color: t.color.textSecondary, flex: 1 }]}
                          numberOfLines={1}
                        >
                          {rival.name}
                        </Text>
                        <Text style={[t.type.caption, { color: t.color.textMuted }]}>
                          {rival.rank === null ? `>${rivals.scanDepth ?? 100}` : `#${rival.rank}`}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </Card>
            );
          })
        )}
      </ScrollView>
    </>
  );
}
