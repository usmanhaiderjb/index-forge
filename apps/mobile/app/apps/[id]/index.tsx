import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { api, errorMessage } from "@/api/trpc";
import { Sparkline } from "@/components/charts";
import {
  AppAvatar,
  Card,
  CardSkeleton,
  ErrorState,
  PlatformBadge,
  RankDelta,
  Section,
  StaleBanner,
  StatTile,
} from "@/components/ui";
import { usePullToRefresh } from "@/hooks/use-refresh";
import { seriesColor, useTheme } from "@/theme";

export default function AppOverview() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const overview = api.mobile.appOverview.useQuery({ appId: id, days: 30 });
  const pull = usePullToRefresh(overview.refetch);

  if (overview.isPending && !overview.data) {
    return (
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <CardSkeleton lines={3} />
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
      </ScrollView>
    );
  }

  if (overview.isError && !overview.data) {
    return (
      <ErrorState message={errorMessage(overview.error)} onRetry={() => void overview.refetch()} />
    );
  }

  const data = overview.data;
  if (!data) return null;

  // Served from cache while a refetch fails — say so rather than presenting
  // stale numbers as current.
  const isStale = overview.isError && Boolean(data);

  const series = data.series.map((point) => point.value);
  // The first two tiles carry the headline pair — total and the earned share —
  // so they get the brand emphasis and the rest stay quiet.
  const headline = data.metrics.slice(0, 2);
  const rest = data.metrics.slice(2);

  return (
    <>
      <Stack.Screen options={{ title: data.app.name, headerBackTitle: "Apps" }} />

      <ScrollView
        contentContainerStyle={{
          padding: t.spacing.lg,
          gap: t.spacing.xl,
          paddingBottom: t.spacing.xxxl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={pull.refreshing}
            onRefresh={pull.onRefresh}
            tintColor={t.brand.base}
            colors={[t.brand.base]}
          />
        }
      >
        {isStale ? <StaleBanner updatedAt={overview.dataUpdatedAt} /> : null}

        {/* Which store and which storefront these numbers are for. The name is
            deliberately not repeated here — it is already the navigation title,
            and printing a long app name twice, one line apart, was the first
            thing the eye landed on. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.sm }}>
          <AppAvatar name={data.app.name} platform={data.app.platform} size={28} />
          <PlatformBadge platform={data.app.platform} />
          <Text style={[t.type.caption, { color: t.color.textMuted }]}>·</Text>
          <Text style={[t.type.caption, { color: t.color.textMuted, textTransform: "uppercase" }]}>
            {data.app.country}
          </Text>
        </View>

        {series.length > 1 ? (
          <Card padded={false}>
            <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.sm }}>
              <Text
                style={[t.type.caption, { color: t.color.textMuted, textTransform: "uppercase" }]}
              >
                Installs · last {data.days} days
              </Text>
            </View>
            {/* Bleeds to the card edge: an area chart inset on all four sides
                reads as a picture of a chart rather than as the data. */}
            <Sparkline points={series} color={seriesColor(0, t.scheme)} height={120} />
          </Card>
        ) : null}

        <Section title="Performance">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.md }}>
            {headline.map((metric) => (
              <StatTile
                key={metric.metric}
                metric={metric.metric}
                value={metric.value}
                hasData={metric.hasData}
                currency={metric.currency}
                emphasis
              />
            ))}
            {rest.map((metric) => (
              <StatTile
                key={metric.metric}
                metric={metric.metric}
                value={metric.value}
                hasData={metric.hasData}
                currency={metric.currency}
              />
            ))}
          </View>
        </Section>

        <Section
          title="Keywords"
          action={{ label: "See all", onPress: () => router.push(`/apps/${id}/keywords`) }}
        >
          <Card padded={false}>
            {data.keywords.map((keyword, i) => (
              <View
                key={keyword.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: t.spacing.md,
                  paddingHorizontal: t.spacing.lg,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: t.color.border,
                }}
              >
                <Text
                  style={[t.type.body, { color: t.color.textPrimary, flex: 1 }]}
                  numberOfLines={1}
                >
                  {keyword.term}
                </Text>

                <Text style={[t.type.heading, { color: t.color.textPrimary }]}>
                  {/* Not-in-the-top-N is shown as a bounded ">100", never as a
                      rank. An absent rank and rank 101 are different facts. */}
                  {keyword.rank === null ? `>${keyword.scanDepth ?? 100}` : `#${keyword.rank}`}
                </Text>

                <RankDelta delta={keyword.delta} />
              </View>
            ))}
          </Card>
        </Section>

        {/* Provenance, same as the web. Any figure should be traceable to the
            provider it came from without opening a laptop. */}
        <Section title="Where these come from">
          <Card>
            {data.metrics
              .filter((metric) => metric.hasData)
              .map((metric, i) => (
                <View
                  key={metric.metric}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: t.spacing.md,
                    marginTop: i === 0 ? 0 : t.spacing.sm,
                  }}
                >
                  <Text style={[t.type.label, { color: t.color.textSecondary, flex: 1 }]}>
                    {metric.label}
                  </Text>
                  <Text style={[t.type.label, { color: t.color.textMuted }]}>
                    {metric.sources.join(", ")}
                  </Text>
                </View>
              ))}
          </Card>
        </Section>

        <Section title="More">
          <Card onPress={() => router.push(`/apps/${id}/reviews`)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.md }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: t.radius.md,
                  backgroundColor: t.brand.soft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="chatbubbles-outline" size={18} color={t.brand.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[t.type.heading, { color: t.color.textPrimary }]}>Reviews</Text>
                <Text
                  style={[t.type.caption, { color: t.color.textMuted, textTransform: "none" }]}
                >
                  Read and reply from here
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={t.color.textMuted} />
            </View>
          </Card>
        </Section>
      </ScrollView>
    </>
  );
}
