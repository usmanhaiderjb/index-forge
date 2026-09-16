import { Stack, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { Alert, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";

import { api, errorMessage } from "@/api/trpc";
import { Button, Card, CardSkeleton, EmptyState, ErrorState, Loading } from "@/components/ui";
import { useTheme } from "@/theme";

/**
 * Reviews, and replying to them.
 *
 * The highest-value thing to do from a phone, and the one write path in the
 * app: a reply is public, user-visible content on the store, so the flow is
 * deliberately slower than a one-tap action.
 */
export default function Reviews() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const utils = api.useUtils();

  const reviews = api.reviews.list.useQuery({ appId: id, limit: 30 });
  const [replyTo, setReplyTo] = React.useState<string | null>(null);

  if (reviews.isPending && !reviews.data) {
    return (
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <CardSkeleton lines={3} />
        <CardSkeleton lines={3} />
      </ScrollView>
    );
  }

  if (reviews.isError && !reviews.data) {
    return (
      <ErrorState message={errorMessage(reviews.error)} onRetry={() => void reviews.refetch()} />
    );
  }

  const items = reviews.data?.items ?? [];

  return (
    <>
      <Stack.Screen options={{ title: "Reviews" }} />

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={reviews.isRefetching}
            onRefresh={() => void reviews.refetch()}
            tintColor={t.brand.base}
          />
        }
      >
        {items.length === 0 ? (
          <EmptyState
            icon="chatbubbles-outline"
            title="No reviews yet"
            detail="Reviews sync from the store consoles. Play Console only exposes the last seven days through its API — that is Google's limit, not ours."
          />
        ) : (
          items.map((review) => {
            const isReplying = replyTo === review.id;

            return (
              <Card key={review.id}>
                <View style={{ flexDirection: "row", gap: t.spacing.sm, alignItems: "center" }}>
                  <Text style={[t.type.caption, { color: t.color.statusWarning }]}>
                    {"★".repeat(review.rating)}
                    <Text style={{ color: t.color.textMuted }}>{"★".repeat(5 - review.rating)}</Text>
                  </Text>
                  <Text style={[t.type.caption, { color: t.color.textMuted, marginLeft: "auto" }]}>
                    {new Date(review.submittedAt).toLocaleDateString()}
                  </Text>
                </View>

                {review.title ? (
                  <Text style={[t.type.heading, { color: t.color.textPrimary, marginTop: 6 }]}>
                    {review.title}
                  </Text>
                ) : null}

                <Text
                  style={[t.type.body, { color: t.color.textSecondary, marginTop: 4, lineHeight: 21 }]}
                >
                  {review.body}
                </Text>

                {review.topics?.length ? (
                  <Text style={[t.type.caption, { color: t.color.textMuted, marginTop: 8 }]}>
                    {review.topics.join(" · ")}
                  </Text>
                ) : null}

                {review.developerReply ? (
                  <View
                    style={{
                      marginTop: t.spacing.md,
                      padding: t.spacing.md,
                      borderRadius: t.radius.md,
                      backgroundColor: t.color.page,
                    }}
                  >
                    <Text style={[t.type.caption, { color: t.color.textMuted }]}>Your reply</Text>
                    <Text style={[t.type.body, { color: t.color.textSecondary, marginTop: 4 }]}>
                      {review.developerReply}
                    </Text>
                  </View>
                ) : isReplying ? (
                  <ReplyEditor
                    reviewId={review.id}
                    onDone={() => {
                      setReplyTo(null);
                      void utils.reviews.list.invalidate();
                    }}
                    onCancel={() => setReplyTo(null)}
                  />
                ) : (
                  // A full-width button on every card turned the list into a
                  // stack of forms — the reviews are what the screen is for, and
                  // four identical blocks of chrome outweighed them. Right
                  // aligned and quiet: still a 48pt target, no longer the
                  // loudest thing in the card.
                  <View style={{ marginTop: t.spacing.sm, alignItems: "flex-start" }}>
                    <Button
                      label="Reply"
                      variant="ghost"
                      icon="arrow-undo-outline"
                      onPress={() => setReplyTo(review.id)}
                    />
                  </View>
                )}
              </Card>
            );
          })
        )}
      </ScrollView>
    </>
  );
}

/**
 * The reply editor for one review.
 *
 * Its own component because the character limit is a per-review query, not a
 * field on the list: the limit depends on which store the review came from
 * (roughly 350 on Google Play against 5970 on the App Store) and on whether the
 * connection can actually publish. Showing one number for both either cramps an
 * iOS reply or lets an Android one be rejected on submit.
 */
function ReplyEditor({
  reviewId,
  onDone,
  onCancel,
}: {
  reviewId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTheme();
  const [body, setBody] = React.useState("");

  const limit = api.reviews.replyLimit.useQuery({ reviewId });
  const reply = api.reviews.reply.useMutation({
    onSuccess: onDone,
    onError: (error) => Alert.alert("Could not publish", errorMessage(error)),
  });

  if (limit.isPending) return <Loading />;

  const max = limit.data?.limit ?? 350;
  const canReply = limit.data?.canReply ?? false;
  const remaining = max - body.length;

  return (
    <View style={{ marginTop: t.spacing.md }}>
      {!canReply ? (
        <Text style={[t.type.caption, { color: t.color.statusWarning, marginBottom: t.spacing.sm }]}>
          {limit.data && "reason" in limit.data ? limit.data.reason : "Replies are unavailable."}
        </Text>
      ) : null}

      <TextInput
        value={body}
        onChangeText={setBody}
        multiline
        autoFocus
        editable={canReply}
        placeholder="Write a reply…"
        placeholderTextColor={t.color.textMuted}
        style={{
          borderWidth: 1,
          borderColor: remaining < 0 ? t.color.statusCritical : t.color.border,
          borderRadius: t.radius.md,
          padding: 12,
          minHeight: 90,
          textAlignVertical: "top",
          color: t.color.textPrimary,
          backgroundColor: t.color.page,
        }}
      />

      <Text
        style={[
          t.type.caption,
          {
            color: remaining < 0 ? t.color.statusCritical : t.color.textMuted,
            marginTop: 4,
            textAlign: "right",
          },
        ]}
      >
        {body.length} / {max}
      </Text>

      <View style={{ flexDirection: "row", gap: t.spacing.sm, marginTop: t.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button label="Cancel" variant="secondary" onPress={onCancel} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="Publish"
            loading={reply.isPending}
            disabled={!canReply || body.trim().length === 0 || remaining < 0}
            onPress={() =>
              // Confirmed rather than sent on tap: this publishes publicly and
              // cannot be quietly undone.
              Alert.alert("Publish reply?", "This appears publicly on your store listing.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Publish",
                  onPress: () => reply.mutate({ reviewId, body: body.trim() }),
                },
              ])
            }
          />
        </View>
      </View>
    </View>
  );
}
