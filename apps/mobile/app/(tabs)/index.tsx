import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { formatMetric } from "@aso/shared";
import { api, errorMessage } from "@/api/trpc";
import {
  AppAvatar,
  Card,
  CardSkeleton,
  EmptyState,
  ErrorState,
  PlatformBadge,
  Section,

  StaleBanner,
} from "@/components/ui";
import { usePullToRefresh } from "@/hooks/use-refresh";
import { useTheme } from "@/theme";

/**
 * Home.
 *
 * One `mobile.home` call rather than the six the web dashboard fires — a screen
 * needing four round trips on a mobile network feels broken before anything has
 * gone wrong.
 */
export default function Home() {
  const t = useTheme();
  const router = useRouter();
  const home = api.mobile.home.useQuery({ days: 30 });
  const pull = usePullToRefresh(home.refetch);

  if (home.isPending && !home.data) {
    return (
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <CardSkeleton lines={2} />
        <CardSkeleton lines={1} />
        <CardSkeleton lines={1} />
      </ScrollView>
    );
  }

  if (home.isError && !home.data) {
    return <ErrorState message={errorMessage(home.error)} onRetry={() => void home.refetch()} />;
  }

  const data = home.data;
  if (!data) return null;

  // Served from cache while a refetch fails — say so rather than presenting
  // stale numbers as current.
  const isStale = home.isError && Boolean(data);

  const totalInstalls = data.totals.INSTALLS;
  const totalOrganic = data.totals.ORGANIC_INSTALLS;
  const organicShare =
    totalInstalls?.hasData && totalOrganic?.hasData && totalInstalls.value > 0
      ? Math.round((totalOrganic.value / totalInstalls.value) * 100)
      : null;

  return (
    <ScrollView
      contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.xl, paddingBottom: t.spacing.xxxl }}
      refreshControl={
        <RefreshControl
          refreshing={pull.refreshing}
          onRefresh={pull.onRefresh}
          tintColor={t.brand.base}
          colors={[t.brand.base]}
        />
      }
    >
      {isStale ? <StaleBanner updatedAt={home.dataUpdatedAt} /> : null}

      {data.apps.length === 0 ? (
        <EmptyState
          icon="apps-outline"
          title="No apps yet"
          detail="Add an app on the web dashboard and connect an integration. Numbers appear here once the first sync runs."
        />
      ) : (
        <>
          {/* Portfolio summary. The organic share is the headline because it is
              the figure ASO is actually judged on — total installs move with
              ad spend whether or not the listing improved. */}
          {/* `action`, not `base`: every label on this card is white, and white on
              raw Molten Orange is 3.16:1. */}
          <Card style={{ backgroundColor: t.brand.action, borderColor: "transparent" }}>
            <Text
              style={[
                t.type.caption,
                { color: t.brand.contrast, opacity: 0.75, textTransform: "uppercase" },
              ]}
            >
              Portfolio · last {data.days} days
            </Text>

            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: t.spacing.xxl, marginTop: t.spacing.md }}>
              <View>
                <Text style={[t.type.display, { color: t.brand.contrast }]}>
                  {totalInstalls?.hasData ? formatMetric("INSTALLS", totalInstalls.value) : "—"}
                </Text>
                <Text style={[t.type.label, { color: t.brand.contrast, opacity: 0.75 }]}>
                  installs
                </Text>
              </View>

              <View style={{ paddingBottom: 2 }}>
                <Text style={[t.type.title, { color: t.brand.contrast }]}>
                  {totalOrganic?.hasData ? formatMetric("INSTALLS", totalOrganic.value) : "—"}
                </Text>
                <Text style={[t.type.label, { color: t.brand.contrast, opacity: 0.75 }]}>
                  organic
                </Text>
              </View>
            </View>

            {organicShare === null ? (
              <Text
                style={[
                  t.type.caption,
                  { color: t.brand.contrast, opacity: 0.75, marginTop: t.spacing.lg, textTransform: "none" },
                ]}
              >
                Connect an ad account to separate organic from paid.
              </Text>
            ) : (
              <View style={{ marginTop: t.spacing.lg }}>
                <View
                  style={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: "rgba(255,255,255,0.28)",
                    overflow: "hidden",
                    flexDirection: "row",
                  }}
                >
                  <View
                    style={{
                      width: `${organicShare}%`,
                      backgroundColor: t.brand.contrast,
                    }}
                  />
                </View>
                <Text
                  style={[
                    t.type.caption,
                    { color: t.brand.contrast, opacity: 0.85, marginTop: 6, textTransform: "none" },
                  ]}
                >
                  {organicShare}% earned, {100 - organicShare}% paid
                </Text>
              </View>
            )}
          </Card>

          <Section title={`Apps · ${data.apps.length}`}>
            <View style={{ gap: t.spacing.md }}>
              {data.apps.map((app) => {
                const installs = app.metrics.INSTALLS;
                const organic = app.metrics.ORGANIC_INSTALLS;
                const share =
                  installs?.hasData && organic?.hasData && installs.value > 0
                    ? Math.round((organic.value / installs.value) * 100)
                    : null;

                return (
                  <Card key={app.id} onPress={() => router.push(`/apps/${app.id}`)}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.md }}>
                      <AppAvatar name={app.name} platform={app.platform} />

                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={[t.type.heading, { color: t.color.textPrimary }]}
                          numberOfLines={1}
                        >
                          {app.name}
                        </Text>
                        <View style={{ marginTop: 3 }}>
                          <PlatformBadge platform={app.platform} />
                        </View>
                      </View>

                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[t.type.heading, { color: t.color.textPrimary }]}>
                          {installs?.hasData
                            ? formatMetric("INSTALLS", installs.value, app.currency)
                            : "—"}
                        </Text>
                        <Text
                          style={[t.type.caption, { color: t.color.textMuted, textTransform: "none" }]}
                        >
                          {share === null ? "installs" : `${share}% organic`}
                        </Text>
                      </View>

                      <Ionicons name="chevron-forward" size={16} color={t.color.textMuted} />
                    </View>

                    {/* A thin share bar per app, so the list is scannable at a
                        glance rather than requiring the numbers to be read. */}
                    {share !== null ? (
                      <View
                        style={{
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: t.color.border,
                          overflow: "hidden",
                          marginTop: t.spacing.md,
                        }}
                      >
                        <View
                          style={{ width: `${share}%`, height: "100%", backgroundColor: t.brand.contrast }}
                        />
                      </View>
                    ) : null}
                  </Card>
                );
              })}
            </View>
          </Section>
        </>
      )}
    </ScrollView>
  );
}

