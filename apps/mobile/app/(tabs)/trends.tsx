import { Ionicons } from "@expo/vector-icons";
import * as React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { api, errorMessage } from "@/api/trpc";
import { Card, CardSkeleton, EmptyState, ErrorState } from "@/components/ui";
import { useTheme } from "@/theme";

/**
 * Trends — apps climbing their category charts.
 *
 * **Not "recently launched".** Play publishes no reliable release date, and the
 * best inference from a listing page was wrong by up to six years when tested
 * against apps with known launches. Chart movement is published and
 * unambiguous, and answers the more useful question: an app entering the top
 * twenty is rising now, whatever its age.
 *
 * Read-only on a phone. Sweeping the charts is a long sequence of throttled
 * outbound requests — roughly eleven minutes across eight categories — which is
 * work for the scheduler or the web app, not for a tap on a train.
 */
export default function Trends() {
  const t = useTheme();

  const coverage = api.trends.coverage.useQuery();
  const rising = api.trends.rising.useQuery({});

  if (rising.isPending && !rising.data) {
    return (
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
      </ScrollView>
    );
  }

  // A failed query must never render as an empty one. On the web these two
  // looked identical, and a stale client and then a database outage both
  // reported "nothing tracked" over a full collection.
  if (!rising.data) {
    return (
      <ErrorState
        message={rising.error ? errorMessage(rising.error) : "The request did not come back."}
        onRetry={() => void rising.refetch()}
      />
    );
  }

  const { rows, measured } = rising.data;

  return (
    <ScrollView
      contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}
      refreshControl={
        <RefreshControl
          refreshing={rising.isRefetching}
          onRefresh={() => {
            void rising.refetch();
            void coverage.refetch();
          }}
          tintColor={t.brand.base}
        />
      }
    >
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Figure label="Apps" value={coverage.data?.apps ?? null} />
          <Figure label="Snapshots" value={coverage.data?.snapshots ?? null} />
          <Figure label="Ready" value={coverage.data?.readyForMovement ?? null} />
        </View>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          icon="trending-up-outline"
          title="Nothing tracked yet"
          detail="Sweep the charts from the web app to record what is currently ranking. One sweep gives standings; a second gives movement."
        />
      ) : (
        <>
          <Text style={[t.type.caption, { color: t.color.textMuted }]}>
            {measured > 0
              ? `${measured} of ${rows.length} rows have two chart readings to compare, so their climb is measured. The rest are ranked by chart standing alone.`
              : "No app here has two chart readings yet, so nothing below is movement — rows are ranked by chart standing. Sweep again in a few days and climbs appear."}
          </Text>

          {rows.map((row) => (
            <Card key={row.id}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: t.spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[t.type.body, { color: t.color.textPrimary }]}
                    numberOfLines={1}
                  >
                    {row.name}
                  </Text>
                  <Text
                    style={[t.type.caption, { color: t.color.textMuted, marginTop: 2 }]}
                    numberOfLines={1}
                  >
                    {row.developer ?? "Unknown developer"}
                  </Text>
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[t.type.heading, { color: t.color.textPrimary }]}>
                    {row.chartRank ? `#${row.chartRank}` : "—"}
                  </Text>
                  <Text
                    style={[t.type.caption, { color: t.color.textMuted, marginTop: 2 }]}
                    numberOfLines={1}
                  >
                    {row.chartRank ? (row.categoryLabel ?? "uncategorised") : "not charting"}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginTop: t.spacing.md,
                  paddingTop: t.spacing.md,
                  borderTopWidth: 1,
                  borderTopColor: t.color.border,
                }}
              >
                <Climb climb={row.climb} hasPrevious={row.hasPrevious} />

                <Text style={[t.type.caption, { color: t.color.textMuted }]}>
                  {row.ratingsPerDay === null
                    ? "ratings/day not yet measured"
                    : `${row.ratingsPerDay.toLocaleString("en-US")} ratings/day over ${row.velocityDays}d`}
                </Text>
              </View>
            </Card>
          ))}

          <Text
            style={[
              t.type.caption,
              { color: t.color.textMuted, lineHeight: 16, marginTop: t.spacing.sm },
            ]}
          >
            Ranked on chart movement, not launch date. Ratings per day is a proxy for install
            velocity, never an install count — neither store publishes installs for apps you do not
            own. Compare within a category, not across. Google Play only.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

/**
 * A coverage figure.
 *
 * Renders a dash until the query answers. Showing "0" while loading states
 * something false about the collection.
 */
function Figure({ label, value }: { label: string; value: number | null }) {
  const t = useTheme();

  return (
    <View>
      <Text style={[t.type.caption, { color: t.color.textMuted }]}>{label}</Text>
      <Text style={[t.type.heading, { color: t.color.textPrimary, marginTop: 2 }]}>
        {value === null ? "—" : value.toLocaleString("en-US")}
      </Text>
    </View>
  );
}

/**
 * Chart movement.
 *
 * Never a bare dash, which reads as "no movement". The two ways of having no
 * climb are different facts: no earlier reading at all, or an earlier reading
 * taken before this app appeared in a chart.
 */
function Climb({ climb, hasPrevious }: { climb: number | null; hasPrevious: boolean }) {
  const t = useTheme();

  if (climb === null) {
    return (
      <Text style={[t.type.caption, { color: t.color.textMuted }]}>
        {hasPrevious ? "no earlier rank" : "first reading"}
      </Text>
    );
  }

  if (climb === 0) {
    return <Text style={[t.type.caption, { color: t.color.textSecondary }]}>no change</Text>;
  }

  const rising = climb > 0;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Ionicons
        name={rising ? "trending-up" : "trending-down"}
        size={13}
        color={rising ? t.color.deltaUp : t.color.deltaDown}
      />
      <Text
        style={[t.type.caption, { color: rising ? t.color.deltaUp : t.color.deltaDown }]}
      >
        {rising ? `+${climb}` : climb} places
      </Text>
    </View>
  );
}
