import * as React from "react";
import { Alert, ScrollView, Text, TextInput, View } from "react-native";

import { api, errorMessage } from "@/api/trpc";
import { Button, Card, CardSkeleton, EmptyState, ErrorState, Section } from "@/components/ui";
import { useTheme } from "@/theme";

/**
 * Send a push campaign from a phone.
 *
 * Worth having on mobile specifically because this is the surface used in a
 * hurry — the release is live, tell everyone — which is also exactly when a
 * mistake gets sent to every device. So the confirmation step is the same one
 * the web has, and it names the app count before anything leaves.
 */
export default function Push() {
  const t = useTheme();
  const utils = api.useUtils();

  const readiness = api.push.readiness.useQuery();

  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [topic, setTopic] = React.useState("all");
  const [selected, setSelected] = React.useState<string[]>([]);

  const send = api.push.send.useMutation({
    onSuccess: (result) => {
      Alert.alert(
        "Queued",
        `Sending to ${result.queued} app${result.queued === 1 ? "" : "s"}` +
          (result.skipped > 0 ? `, ${result.skipped} skipped.` : "."),
      );
      setTitle("");
      setBody("");
      setSelected([]);
      void utils.push.readiness.invalidate();
    },
    onError: (error) => Alert.alert("Could not send", errorMessage(error)),
  });

  if (readiness.isPending && !readiness.data) {
    return (
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <CardSkeleton lines={3} />
        <CardSkeleton lines={2} />
      </ScrollView>
    );
  }

  if (readiness.isError && !readiness.data) {
    return (
      <ErrorState message={errorMessage(readiness.error)} onRetry={() => void readiness.refetch()} />
    );
  }

  const ready = (readiness.data ?? []).filter((a) => a.ready);
  const canSend = title.trim().length > 0 && body.trim().length > 0 && selected.length > 0;

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const confirm = () => {
    Alert.alert(
      "Send now?",
      `"${title.trim()}" goes to the "${topic.trim()}" topic across ${selected.length} app${
        selected.length === 1 ? "" : "s"
      }. This cannot be undone once Firebase accepts it.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          style: "destructive",
          onPress: () =>
            send.mutate({
              title: title.trim(),
              body: body.trim(),
              appIds: selected,
              target: { kind: "TOPIC", topic: topic.trim() },
            }),
        },
      ],
    );
  };

  const input = {
    borderWidth: 1,
    borderColor: t.color.border,
    borderRadius: t.radius.md,
    padding: 12,
    color: t.color.textPrimary,
    backgroundColor: t.color.surface,
  } as const;

  return (
    <ScrollView
      contentContainerStyle={{
        padding: t.spacing.lg,
        gap: t.spacing.lg,
        paddingBottom: t.spacing.xxxl,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {ready.length === 0 ? (
        <EmptyState
          icon="send-outline"
          title="No app is set up for push"
          detail="Add a Firebase service account for at least one app on the web dashboard, then come back here to send."
        />
      ) : (
        <>
          <Card>
            <Text style={[t.type.heading, { color: t.color.textPrimary }]}>Compose</Text>

            <Text style={[t.type.caption, { color: t.color.textMuted, marginTop: t.spacing.md }]}>
              TITLE
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Version 3.2 is live"
              placeholderTextColor={t.color.textMuted}
              maxLength={120}
              style={[input, { marginTop: 4 }]}
            />

            <Text style={[t.type.caption, { color: t.color.textMuted, marginTop: t.spacing.md }]}>
              MESSAGE
            </Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Streaks now sync across devices."
              placeholderTextColor={t.color.textMuted}
              multiline
              numberOfLines={3}
              maxLength={1000}
              style={[input, { marginTop: 4, minHeight: 88, textAlignVertical: "top" }]}
            />

            <Text style={[t.type.caption, { color: t.color.textMuted, marginTop: t.spacing.md }]}>
              TOPIC
            </Text>
            <TextInput
              value={topic}
              onChangeText={setTopic}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="all"
              placeholderTextColor={t.color.textMuted}
              style={[input, { marginTop: 4 }]}
            />
            {/* The same caveat the web states. Reaching "everyone" is not
                something the FCM API can do; only a subscribed topic is. */}
            <Text
              style={[t.type.caption, { color: t.color.textMuted, marginTop: 8, lineHeight: 18 }]}
            >
              Reaches devices whose app subscribed to this topic — not every install.
              Firebase’s own “all users” option is not available outside its console.
            </Text>
          </Card>

          <Section title={`Apps · ${selected.length} selected`}>
            <Card padded={false}>
              {ready.map((app, index) => {
                const isOn = selected.includes(app.id);
                return (
                  <View
                    key={app.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: t.spacing.md,
                      padding: t.spacing.md,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: t.color.border,
                    }}
                  >
                    <Text
                      style={[t.type.body, { color: t.color.textPrimary, flex: 1 }]}
                      numberOfLines={1}
                    >
                      {app.name}
                    </Text>
                    <Button
                      label={isOn ? "Selected" : "Select"}
                      variant={isOn ? "primary" : "secondary"}
                      onPress={() => toggle(app.id)}
                    />
                  </View>
                );
              })}
            </Card>
          </Section>

          <Button
            label={send.isPending ? "Sending…" : "Review and send"}
            icon="send"
            disabled={!canSend || send.isPending}
            loading={send.isPending}
            onPress={confirm}
          />
        </>
      )}
    </ScrollView>
  );
}
