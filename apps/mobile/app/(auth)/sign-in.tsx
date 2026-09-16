import * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { G, Path, Rect } from "react-native-svg";

import { Button } from "@/components/ui";
import { GoogleSignInButton, isGoogleConfigured } from "@/components/google-sign-in";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/theme";

const IS_DEV = __DEV__;

export default function SignIn() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { signInWithEmail } = useAuth();

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState("");

  // Stable identities: GoogleSignInButton has these in an effect's deps, and
  // fresh closures every render would re-run it.
  const handleError = React.useCallback((message: string) => setError(message), []);
  const handleBusy = React.useCallback((value: boolean) => setBusy(value), []);

  const googleConfigured = isGoogleConfigured();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.color.page }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: t.spacing.xl,
          paddingTop: insets.top + t.spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* The mark, drawn rather than imported so it inherits the theme and
            stays sharp at any size. Same 64-grid geometry as the web component
            and the icon generator. */}
        <Svg width={44} height={44} viewBox="0 0 64 64">
          <Rect width={64} height={64} rx={15} fill={t.brand.obsidian} />
          <G fill={t.brand.accent}>
            <Rect x={12} y={28} width={5.5} height={10} rx={1.5} />
            <Rect x={20} y={23} width={5.5} height={15} rx={1.5} />
            <Rect x={28} y={18} width={5.5} height={20} rx={1.5} />
          </G>
          <Path
            d="M4 44.5 16 40 H52 v7 H16 Z M26 47 H42 L39.5 53 H28.5 Z M21 53 H47 L50 58.5 H18 Z"
            fill={t.brand.face}
          />
          <Path
            d="M14 38 27 27l7 5 13-13"
            stroke={t.brand.base}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path d="M40 12 H54 V26 Z" fill={t.brand.base} />
        </Svg>

        <Text style={[t.type.display, { color: t.color.textPrimary, marginTop: t.spacing.lg }]}>
          Index<Text style={{ color: t.brand.ink }}>Forge</Text>
        </Text>
        <Text style={[t.type.body, { color: t.color.textSecondary, marginTop: 8, lineHeight: 22 }]}>
          Every store number in one place. Sign in to see your apps.
        </Text>

        {error ? (
          <View
            style={{
              marginTop: t.spacing.lg,
              padding: t.spacing.md,
              borderRadius: t.radius.md,
              backgroundColor: t.color.surface,
              borderColor: t.color.statusCritical,
              borderWidth: 1,
            }}
          >
            <Text style={[t.type.body, { color: t.color.statusCritical }]}>{error}</Text>
          </View>
        ) : null}

        <View style={{ marginTop: t.spacing.xl, gap: t.spacing.md }}>
          {/* Mounted only when a client id exists — the hook inside throws
              without one, and a hook cannot be called conditionally. */}
          {googleConfigured ? (
            <GoogleSignInButton onError={handleError} onBusyChange={handleBusy} busy={busy} />
          ) : (
            <Text style={[t.type.caption, { color: t.color.textMuted, lineHeight: 18 }]}>
              Google sign-in is not configured for this build. Set
              EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS and EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID.
            </Text>
          )}

          {/* Development only, mirroring the web. The server refuses this
              provider outright when NODE_ENV is production, so a release build
              pointed at production cannot use it even if this rendered. */}
          {IS_DEV ? (
            <View style={{ marginTop: t.spacing.lg, gap: t.spacing.sm }}>
              <Text style={[t.type.caption, { color: t.color.textMuted }]}>DEVELOPMENT ONLY</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={t.color.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={{
                  borderWidth: 1,
                  borderColor: t.color.border,
                  borderRadius: t.radius.md,
                  padding: 14,
                  color: t.color.textPrimary,
                  backgroundColor: t.color.surface,
                }}
              />
              <Button
                label="Sign in without a password"
                variant="secondary"
                loading={busy}
                onPress={() => {
                  setError(null);
                  setBusy(true);
                  signInWithEmail(email)
                    .catch((e: Error) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
