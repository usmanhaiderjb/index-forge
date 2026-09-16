import * as React from "react";
import { Alert, ScrollView, Switch, Text, TextInput, View } from "react-native";

import { api, errorMessage } from "@/api/trpc";
import { Button, Card, CardSkeleton, Loading, Section } from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import { usePushRegistration } from "@/hooks/use-push";
import { useTheme } from "@/theme";

export default function Settings() {
  const t = useTheme();
  const { signOut, onSessionExpired } = useAuth();
  const utils = api.useUtils();

  const me = api.org.me.useQuery();
  const devices = api.devices.list.useQuery();
  const prefs = api.devices.preferences.useQuery();
  const { status: pushStatus, requestPermission } = usePushRegistration(false);

  const setPrefs = api.devices.setPreferences.useMutation({
    onSuccess: () => void utils.devices.preferences.invalidate(),
    onError: (error) => Alert.alert("Could not save", errorMessage(error)),
  });

  const revokeDevice = api.devices.revoke.useMutation({
    onSuccess: () => void utils.devices.list.invalidate(),
  });

  if (me.isPending || prefs.isPending) {
    return (
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <CardSkeleton lines={1} />
        <CardSkeleton lines={3} />
        <CardSkeleton lines={2} />
      </ScrollView>
    );
  }

  const preferences = prefs.data;

  return (
    <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}>
      <Card>
        <Text style={[t.type.caption, { color: t.color.textMuted, textTransform: "uppercase" }]}>
          Signed in as
        </Text>
        <Text style={[t.type.heading, { color: t.color.textPrimary, marginTop: 4 }]}>
          {me.data?.user.email}
        </Text>
      </Card>

      {/* --- notifications ------------------------------------------------ */}
      <Card>
        <Text style={[t.type.heading, { color: t.color.textPrimary }]}>Notifications</Text>

        {pushStatus === "denied" ? (
          <Text style={[t.type.caption, { color: t.color.textMuted, marginTop: 8, lineHeight: 18 }]}>
            Notifications are turned off for this app in system settings. Enable them there first —
            iOS only asks once.
          </Text>
        ) : pushStatus === "unsupported" ? (
          <Text style={[t.type.caption, { color: t.color.textMuted, marginTop: 8 }]}>
            Push is not available on a simulator.
          </Text>
        ) : pushStatus === "unavailable" ? (
          <Text style={[t.type.caption, { color: t.color.textMuted, marginTop: 8, lineHeight: 18 }]}>
            This build cannot receive push. It has no FCM credentials on Android or no APNs key on
            iOS — nothing to change here; the build has to be configured. Alerts still arrive by
            email and webhook.
          </Text>
        ) : null}

        <Row label="Push alerts">
          <Switch
            {...switchColors(t)}
            value={preferences?.pushEnabled ?? true}
            onValueChange={async (value) => {
              if (value && pushStatus !== "granted") {
                const result = await requestPermission();
                if (result !== "granted") return;
              }
              setPrefs.mutate({
                pushEnabled: value,
                minSeverity: preferences?.minSeverity ?? "MEDIUM",
                quietHoursFrom: preferences?.quietHoursFrom ?? null,
                quietHoursTo: preferences?.quietHoursTo ?? null,
                timeZone:
                  preferences?.timeZone ??
                  Intl.DateTimeFormat().resolvedOptions().timeZone ??
                  "UTC",
              });
            }}
          />
        </Row>

        <Row label="Quiet hours 22:00 – 08:00">
          <Switch
            {...switchColors(t)}
            value={preferences?.quietHoursFrom !== null && preferences?.quietHoursFrom !== undefined}
            onValueChange={(value) =>
              setPrefs.mutate({
                pushEnabled: preferences?.pushEnabled ?? true,
                minSeverity: preferences?.minSeverity ?? "MEDIUM",
                quietHoursFrom: value ? 22 : null,
                quietHoursTo: value ? 8 : null,
                timeZone:
                  Intl.DateTimeFormat().resolvedOptions().timeZone ??
                  preferences?.timeZone ??
                  "UTC",
              })
            }
          />
        </Row>

        <Text style={[t.type.caption, { color: t.color.textMuted, marginTop: 8, lineHeight: 18 }]}>
          Critical alerts are delivered during quiet hours. Everything else waits.
        </Text>
      </Card>

      {/* --- devices ------------------------------------------------------ */}
      <Card>
        <Text style={[t.type.heading, { color: t.color.textPrimary }]}>Devices</Text>

        {devices.data?.map((device) => (
          <View
            key={device.id}
            style={{
              marginTop: t.spacing.md,
              paddingTop: t.spacing.md,
              borderTopWidth: 1,
              borderTopColor: t.color.border,
            }}
          >
            <Text style={[t.type.body, { color: t.color.textPrimary }]}>
              {device.deviceName ?? device.platform}
              {device.isCurrent ? "  ·  this device" : ""}
            </Text>
            <Text style={[t.type.caption, { color: t.color.textMuted, marginTop: 2 }]}>
              Last used {new Date(device.lastUsedAt).toLocaleDateString()}
            </Text>

            {!device.isCurrent ? (
              <View style={{ marginTop: t.spacing.sm }}>
                <Button
                  label="Sign this device out"
                  variant="secondary"
                  onPress={() => revokeDevice.mutate({ sessionId: device.id })}
                />
              </View>
            ) : null}
          </View>
        ))}
      </Card>

      <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />

      <DeleteAccount onDeleted={onSessionExpired} />
    </ScrollView>
  );
}

/**
 * A `Switch` with no colour props takes the platform accent — teal on this
 * device — so the one obviously interactive control on the screen was the one
 * thing not in the product's colour.
 */
function switchColors(t: ReturnType<typeof useTheme>) {
  return {
    trackColor: { false: t.color.border, true: t.brand.base },
    thumbColor: t.color.surface,
    ios_backgroundColor: t.color.border,
  };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: t.spacing.md,
        gap: t.spacing.md,
      }}
    >
      <Text style={[t.type.body, { color: t.color.textSecondary, flex: 1 }]}>{label}</Text>
      {children}
    </View>
  );
}

/**
 * Account deletion.
 *
 * Apple requires this to be reachable in the app itself (App Review 5.1.1(v)),
 * not only on a website. The impact query runs first so what is about to be
 * destroyed is stated before the confirmation rather than after it fails.
 */
function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const t = useTheme();
  const [open, setOpen] = React.useState(false);
  const [confirmEmail, setConfirmEmail] = React.useState("");

  const impact = api.account.deletionImpact.useQuery(undefined, { enabled: open });
  const remove = api.account.delete.useMutation({
    onSuccess: () => {
      Alert.alert("Account deleted", "Your account and its data have been removed.");
      onDeleted();
    },
    onError: (error) => Alert.alert("Could not delete", errorMessage(error)),
  });

  if (!open) {
    return (
      <View style={{ marginTop: t.spacing.xl, marginBottom: t.spacing.xxl }}>
        <Button label="Delete account" variant="danger-outline" onPress={() => setOpen(true)} />
      </View>
    );
  }

  return (
    <Card style={{ marginTop: t.spacing.xl, marginBottom: t.spacing.xxl, borderColor: t.color.statusCritical }}>
      <Text style={[t.type.heading, { color: t.color.statusCritical }]}>Delete account</Text>

      {impact.isPending ? (
        <Loading />
      ) : impact.data ? (
        <>
          <Text
            style={[t.type.body, { color: t.color.textSecondary, marginTop: 8, lineHeight: 21 }]}
          >
            This is immediate and cannot be undone.
          </Text>

          {impact.data.organizations.map((org) => (
            <Text
              key={org.id}
              style={[t.type.caption, { color: t.color.textMuted, marginTop: 6 }]}
            >
              {org.name} — {org.willBeDeleted
                ? `deleted, including ${org.apps} app${org.apps === 1 ? "" : "s"}`
                : "you leave, the workspace stays"}
            </Text>
          ))}

          {!impact.data.canDelete ? (
            <Text
              style={[t.type.body, { color: t.color.statusCritical, marginTop: t.spacing.md, lineHeight: 21 }]}
            >
              {impact.data.blockers[0]?.reason}
            </Text>
          ) : (
            <>
              <Text style={[t.type.caption, { color: t.color.textMuted, marginTop: t.spacing.md }]}>
                Type {impact.data.email} to confirm
              </Text>
              <TextInput
                value={confirmEmail}
                onChangeText={setConfirmEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={{
                  borderWidth: 1,
                  borderColor: t.color.border,
                  borderRadius: t.radius.md,
                  padding: 12,
                  marginTop: 6,
                  color: t.color.textPrimary,
                  backgroundColor: t.color.page,
                }}
              />
              <View style={{ marginTop: t.spacing.md }}>
                <Button
                  label="Delete permanently"
                  variant="danger"
                  loading={remove.isPending}
                  disabled={confirmEmail.trim().toLowerCase() !== impact.data.email?.toLowerCase()}
                  onPress={() => remove.mutate({ confirmEmail })}
                />
              </View>
            </>
          )}
        </>
      ) : null}

      <View style={{ marginTop: t.spacing.md }}>
        <Button label="Cancel" variant="secondary" onPress={() => setOpen(false)} />
      </View>
    </Card>
  );
}
