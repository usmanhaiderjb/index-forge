import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import * as React from "react";

import { api } from "@/api/trpc";
import { useAuth } from "@/hooks/use-auth";
import { usePushRegistration } from "@/hooks/use-push";
import { useTheme } from "@/theme";

/**
 * Tab shell.
 *
 * Push registration lives here rather than in the root layout because it needs
 * an authenticated tRPC client — registering a token requires a device session.
 */
export default function TabsLayout() {
  const t = useTheme();
  const { isSignedIn } = useAuth();

  usePushRegistration(isSignedIn === true);

  const alerts = api.alerts.events.useQuery(
    { status: "TRIGGERED", limit: 100 },
    { enabled: isSignedIn === true },
  );

  const openCount = alerts.data?.length ?? 0;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.brand.base,
        tabBarInactiveTintColor: t.color.textMuted,
        tabBarStyle: { backgroundColor: t.color.surface, borderTopColor: t.color.border },
        headerStyle: { backgroundColor: t.color.page },
        headerTintColor: t.color.textPrimary,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: t.color.page },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Apps",
          tabBarIcon: ({ color, size }) => <Ionicons name="apps" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="trends"
        options={{
          title: "Trends",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trending-up" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alerts",
          // Zero renders as no badge rather than as "0", which reads as a
          // notification that turns out to be nothing.
          tabBarBadge: openCount > 0 ? openCount : undefined,
          tabBarBadgeStyle: { backgroundColor: t.color.statusCritical },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="push"
        options={{
          title: "Push",
          tabBarIcon: ({ color, size }) => <Ionicons name="send" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
