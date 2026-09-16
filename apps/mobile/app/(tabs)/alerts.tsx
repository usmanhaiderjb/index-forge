import * as React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { api, errorMessage } from "@/api/trpc";
import { Button, Card, CardSkeleton, EmptyState, ErrorState, StaleBanner } from "@/components/ui";
import { usePullToRefresh } from "@/hooks/use-refresh";
import { useTheme } from "@/theme";

const SEVERITY_TONE = {
  CRITICAL: "statusCritical",
  HIGH: "statusSerious",
  MEDIUM: "statusWarning",
  LOW: "textSecondary",
  INFO: "textMuted",
} as const;

export default function Alerts() {
  const t = useTheme();
  const utils = api.useUtils();
  const events = api.alerts.events.useQuery({ status: "TRIGGERED", limit: 50 });
  const pull = usePullToRefresh(events.refetch);

  const acknowledge = api.alerts.setEventStatus.useMutation({
    onSuccess: () => {
      void utils.alerts.events.invalidate();
    },
  });

  if (events.isPending && !events.data) {
    return (
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
      </ScrollView>
    );
  }

  if (events.isError && !events.data) {
    return <ErrorState message={errorMessage(events.error)} onRetry={() => void events.refetch()} />;
  }

  const open = events.data ?? [];
  const isStale = events.isError && Boolean(events.data);

  return (
    <ScrollView
      contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}
      refreshControl={
        <RefreshControl
          refreshing={pull.refreshing}
          onRefresh={pull.onRefresh}
          tintColor={t.brand.base}
          colors={[t.brand.base]}
        />
      }
    >
      {isStale ? <StaleBanner updatedAt={events.dataUpdatedAt} /> : null}

      {open.length === 0 ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title="Nothing needs your attention"
          detail="Alerts you have configured are evaluated twice an hour. Anything that trips a rule appears here and on your phone."
        />
      ) : (
        open.map((event) => {
          const toneKey = SEVERITY_TONE[event.rule.severity as keyof typeof SEVERITY_TONE];
          const tone = t.color[toneKey];

          return (
            <Card key={event.id}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.sm }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: tone,
                  }}
                />
                <Text style={[t.type.caption, { color: tone, textTransform: "uppercase" }]}>
                  {event.rule.severity}
                </Text>
                <Text style={[t.type.caption, { color: t.color.textMuted, marginLeft: "auto" }]}>
                  {new Date(event.triggeredAt).toLocaleDateString()}
                </Text>
              </View>

              <Text style={[t.type.heading, { color: t.color.textPrimary, marginTop: 8 }]}>
                {event.rule.name}
              </Text>
              <Text
                style={[
                  t.type.body,
                  { color: t.color.textSecondary, marginTop: 4, lineHeight: 21 },
                ]}
              >
                {event.message}
              </Text>

              <View style={{ marginTop: t.spacing.md }}>
                <Button
                  label="Acknowledge"
                  variant="secondary"
                  loading={acknowledge.isPending && acknowledge.variables?.eventId === event.id}
                  onPress={() =>
                    acknowledge.mutate({ eventId: event.id, status: "ACKNOWLEDGED" })
                  }
                />
              </View>
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}
