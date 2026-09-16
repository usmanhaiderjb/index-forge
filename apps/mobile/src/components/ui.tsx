import { Ionicons } from "@expo/vector-icons";
import * as React from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { formatMetric, METRIC_META, type MetricKeyName } from "@aso/shared";
import { deltaColor, useTheme } from "@/theme";

/* -------------------------------------------------------------- surfaces */

export function Card({
  children,
  style,
  onPress,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
}) {
  const t = useTheme();

  const surface: ViewStyle = {
    backgroundColor: t.color.surfaceRaised,
    borderColor: t.color.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: t.radius.lg,
    padding: padded ? t.spacing.lg : 0,
    ...t.elevation.low,
  };

  if (!onPress) return <View style={[surface, style]}>{children}</View>;

  return (
    <Pressable
      onPress={onPress}
      // A press has to be visible on a phone. There is no cursor to hint that
      // something is tappable, so the surface itself has to answer.
      style={({ pressed }) => [
        surface,
        pressed ? { backgroundColor: t.color.surface, transform: [{ scale: 0.995 }] } : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** A labelled group. Gives long screens a spine instead of a stack of cards. */
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
}) {
  const t = useTheme();

  return (
    <View style={{ gap: t.spacing.md }}>
      <View
        style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: t.spacing.xs }}
      >
        <Text
          style={[t.type.caption, { color: t.color.textMuted, textTransform: "uppercase", flex: 1 }]}
        >
          {title}
        </Text>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={8}>
            <Text style={[t.type.label, { color: t.brand.base }]}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/* -------------------------------------------------------------- identity */

/**
 * App icon.
 *
 * Falls back to initials rather than a broken-image box: most seeded and newly
 * added apps have no icon URL, and an empty grey square in a list reads as a
 * loading failure.
 */
export function AppAvatar({
  name,
  platform,
  size = 44,
}: {
  name: string;
  platform: "IOS" | "ANDROID";
  size?: number;
}) {
  const t = useTheme();

  const initials = name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: t.brand.soft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={[t.type.label, { color: t.brand.ink, fontWeight: "700" }]}>
        {initials || (platform === "IOS" ? "iOS" : "AND")}
      </Text>
    </View>
  );
}

export function PlatformBadge({ platform }: { platform: "IOS" | "ANDROID" }) {
  const t = useTheme();
  const isIos = platform === "IOS";

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Ionicons
        name={isIos ? "logo-apple" : "logo-google-playstore"}
        size={11}
        color={t.color.textMuted}
      />
      <Text style={[t.type.caption, { color: t.color.textMuted, textTransform: "none" }]}>
        {isIos ? "App Store" : "Google Play"}
      </Text>
    </View>
  );
}

/* --------------------------------------------------------------- metrics */

/**
 * One metric.
 *
 * `hasData` is required rather than optional on purpose. The metric layer
 * exists to distinguish "no source connected" from "zero", and a tile that
 * defaulted the flag would quietly render an unconnected integration as a real
 * zero.
 */
export function StatTile({
  metric,
  value,
  hasData,
  currency,
  delta,
  emphasis = false,
}: {
  metric: MetricKeyName;
  value: number;
  hasData: boolean;
  currency?: string;
  delta?: number | null;
  emphasis?: boolean;
}) {
  const t = useTheme();
  const meta = METRIC_META[metric];

  return (
    <Card
      style={
        emphasis
          ? { flex: 1, minWidth: 150, backgroundColor: t.brand.soft, borderColor: "transparent" }
          : { flex: 1, minWidth: 150 }
      }
    >
      <Text
        style={[
          t.type.caption,
          { color: emphasis ? t.brand.ink : t.color.textMuted, textTransform: "uppercase" },
        ]}
        numberOfLines={1}
      >
        {meta.label}
      </Text>

      {hasData ? (
        <>
          <Text
            style={[
              t.type.metric,
              { color: emphasis ? t.brand.ink : t.color.textPrimary, marginTop: 6 },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatMetric(metric, value, currency)}
          </Text>
          {delta !== null && delta !== undefined && delta !== 0 ? (
            <Delta value={delta} metric={metric} />
          ) : null}
        </>
      ) : (
        <>
          <Text style={[t.type.metric, { color: t.color.textMuted, marginTop: 6 }]}>—</Text>
          <Text style={[t.type.caption, { color: t.color.textMuted, textTransform: "none" }]}>
            No source connected
          </Text>
        </>
      )}
    </Card>
  );
}

/** Change indicator. Direction is read from the metric, never assumed. */
/**
 * Day-over-day change in a keyword's rank.
 *
 * Shared by the overview and the keywords screen. They used to render this
 * independently, with different glyphs and — worse — with `null` and `0`
 * collapsed into the same output. Those are different facts: `0` means the rank
 * was measured yesterday and has not moved, `null` means there is nothing to
 * compare against. Showing "unchanged" for a keyword that was never measured
 * states something the data does not support.
 *
 * The delta is already normalised so that positive means the app moved *up* the
 * results, even though the rank number itself goes down.
 */
export function RankDelta({ delta }: { delta: number | null }) {
  const t = useTheme();
  const width = 46;

  if (delta === null) return <View style={{ width }} />;

  if (delta === 0) {
    return (
      <Text
        style={[
          t.type.caption,
          { color: t.color.textMuted, textTransform: "none", width, textAlign: "right" },
        ]}
      >
        —
      </Text>
    );
  }

  const color = delta > 0 ? t.color.deltaUp : t.color.deltaDown;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
        width,
        justifyContent: "flex-end",
      }}
    >
      <Ionicons name={delta > 0 ? "arrow-up" : "arrow-down"} size={11} color={color} />
      <Text style={[t.type.caption, { color, textTransform: "none" }]}>{Math.abs(delta)}</Text>
    </View>
  );
}

export function Delta({ value, metric }: { value: number; metric: MetricKeyName }) {
  const t = useTheme();
  const color = deltaColor(value, METRIC_META[metric].higherIsBetter, t.scheme);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginTop: 4 }}>
      <Ionicons name={value > 0 ? "arrow-up" : "arrow-down"} size={11} color={color} />
      <Text style={[t.type.caption, { color, textTransform: "none" }]}>
        {Math.abs(value).toFixed(1)}%
      </Text>
    </View>
  );
}

/* ---------------------------------------------------------------- inputs */

export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "danger-outline" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const t = useTheme();

  const background =
    // `action`, not `base`: the label is white, and white on raw Molten Orange
    // is 3.16:1. See the note in packages/shared/src/tokens.ts.
    variant === "primary"
      ? t.brand.action
      : variant === "danger"
        ? t.color.statusCritical
        : "transparent";

  const foreground =
    variant === "secondary"
      ? t.color.textPrimary
      : variant === "ghost"
        ? t.brand.base
        : variant === "danger-outline"
          ? t.color.statusCritical
          : t.brand.contrast;

  // `danger-outline` is for the entry point to a destructive flow — the button
  // that opens the confirmation, not the one that does the deleting. Styling it
  // the same as every other secondary button, which is what "Delete account"
  // was, makes it indistinguishable from "Sign out" one row above it.
  const border =
    variant === "secondary"
      ? t.color.border
      : variant === "danger-outline"
        ? t.color.statusCritical
        : background;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        backgroundColor: background,
        borderColor: border,
        borderWidth: variant === "ghost" ? 0 : StyleSheet.hairlineWidth,
        borderRadius: t.radius.md,
        // 48pt tall, comfortably above the 44pt minimum touch target.
        minHeight: 48,
        paddingHorizontal: t.spacing.lg,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: t.spacing.sm,
        opacity: pressed || disabled ? 0.6 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={17} color={foreground} /> : null}
          <Text style={[t.type.body, { color: foreground, fontWeight: "600" }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/* ---------------------------------------------------------------- states */

/**
 * Skeleton.
 *
 * Preferred over a spinner because it holds the shape the content will take, so
 * the screen does not jump when data lands. Animated on the native driver so
 * the pulse does not stutter behind a fetch.
 */
export function Skeleton({
  width,
  height = 16,
  radius,
  style,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const pulse = React.useRef(new Animated.Value(0.4)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          width: (width ?? "100%") as ViewStyle["width"],
          height,
          borderRadius: radius ?? t.radius.sm,
          backgroundColor: t.color.border,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

export function CardSkeleton({ lines = 2 }: { lines?: number }) {
  const t = useTheme();

  return (
    <Card>
      <Skeleton width="45%" height={11} />
      <View style={{ marginTop: t.spacing.md, gap: t.spacing.sm }}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} width={i === 0 ? "70%" : "50%"} height={20} />
        ))}
      </View>
    </Card>
  );
}

/**
 * Empty state.
 *
 * Takes a reason rather than a generic "nothing here". The reason a screen is
 * empty is usually actionable — no integration connected, no paid data, nothing
 * tracked yet — and hiding it makes the app look broken.
 */
export function EmptyState({
  icon = "cube-outline",
  title,
  detail,
  action,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  action?: { label: string; onPress: () => void };
}) {
  const t = useTheme();

  return (
    <View
      style={{
        paddingVertical: t.spacing.xxxl,
        paddingHorizontal: t.spacing.lg,
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: t.radius.xl,
          backgroundColor: t.brand.soft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={26} color={t.brand.ink} />
      </View>

      <Text
        style={[
          t.type.heading,
          { color: t.color.textPrimary, textAlign: "center", marginTop: t.spacing.lg },
        ]}
      >
        {title}
      </Text>

      <Text
        style={[
          t.type.body,
          {
            color: t.color.textSecondary,
            textAlign: "center",
            marginTop: 6,
            lineHeight: 22,
            maxWidth: 320,
          },
        ]}
      >
        {detail}
      </Text>

      {action ? (
        <View style={{ marginTop: t.spacing.xl, alignSelf: "stretch", maxWidth: 320 }}>
          <Button label={action.label} onPress={action.onPress} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="alert-circle-outline"
      title="Could not load this"
      detail={message}
      action={onRetry ? { label: "Try again", onPress: onRetry } : undefined}
    />
  );
}

/**
 * Banner for cached data shown while offline.
 *
 * Stale numbers presented as current are the same class of error as a
 * zero-filled chart, so the staleness is stated rather than implied.
 */
export function StaleBanner({ updatedAt }: { updatedAt: number }) {
  const t = useTheme();
  const minutes = Math.max(1, Math.round((Date.now() - updatedAt) / 60_000));

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: t.spacing.sm,
        backgroundColor: t.color.surface,
        borderColor: t.color.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: t.radius.md,
        paddingVertical: t.spacing.sm,
        paddingHorizontal: t.spacing.md,
      }}
    >
      <Ionicons name="cloud-offline-outline" size={14} color={t.color.textMuted} />
      <Text
        style={[t.type.caption, { color: t.color.textSecondary, textTransform: "none", flex: 1 }]}
      >
        Offline — showing data from {minutes} minute{minutes === 1 ? "" : "s"} ago.
      </Text>
    </View>
  );
}

/** Kept for screens that genuinely have nothing to skeleton, like a first boot. */
export function Loading() {
  const t = useTheme();
  return (
    <View style={{ padding: t.spacing.xxxl, alignItems: "center" }}>
      <ActivityIndicator color={t.brand.base} />
    </View>
  );
}
