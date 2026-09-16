import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import * as React from "react";
import { Platform } from "react-native";

import { api } from "@/api/trpc";

/**
 * Push registration and notification handling.
 *
 * Permission is requested lazily rather than on first launch. A prompt shown
 * before the user has seen a single number gets declined, and iOS only asks
 * once — after that the only route back is Settings, which nobody takes.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

export type PushStatus =
  | "unknown"
  | "granted"
  | "denied"
  | "unsupported"
  /**
   * Permission was given, but this build cannot actually obtain a push token —
   * on Android that means no FCM credentials, on iOS no APNs key. Distinct from
   * "denied": the user did their part and there is nothing for them to fix.
   */
  | "unavailable";

export function usePushRegistration(enabled: boolean) {
  const [status, setStatus] = React.useState<PushStatus>("unknown");
  const register = api.devices.registerPush.useMutation();
  const router = useRouter();

  /** Asks, then registers. Safe to call again — the server upserts. */
  const requestPermission = React.useCallback(async (): Promise<PushStatus> => {
    // A simulator cannot receive push, and asking there produces a confusing
    // failure rather than a useful one.
    if (!Device.isDevice) {
      setStatus("unsupported");
      return "unsupported";
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;

    if (!granted && existing.canAskAgain) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }

    if (!granted) {
      setStatus("denied");
      return "denied";
    }

    if (Platform.OS === "android") {
      // Android 8+ ignores notifications with no channel. Silently.
      await Notifications.setNotificationChannelAsync("alerts", {
        name: "Alerts",
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: "#ff5722",
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;

    // Everything past this point can fail for reasons the user cannot act on:
    // no EAS project id, no FCM credentials in the build, no network. None of
    // them should surface as an unhandled rejection — this runs from an effect
    // on sign-in, so a throw here had nothing to catch it and became a
    // full-screen error over a working app.
    try {
      const token = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      );

      await register.mutateAsync({
        token: token.data,
        platform: Platform.OS === "ios" ? "IOS" : "ANDROID",
      });
    } catch {
      setStatus("unavailable");
      return "unavailable";
    }

    setStatus("granted");
    return "granted";
  }, [register]);

  // Registers on sign-in when permission was already granted, so a reinstall or
  // an OS-rotated token reaches the server without the user doing anything.
  React.useEffect(() => {
    if (!enabled || !Device.isDevice) return;

    void Notifications.getPermissionsAsync()
      .then((permission) => {
        if (permission.granted) return requestPermission();
        setStatus(permission.canAskAgain ? "unknown" : "denied");
        return undefined;
      })
      .catch(() => setStatus("unavailable"));
    // requestPermission is intentionally omitted: it changes identity whenever
    // the mutation object does, which would re-register on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // A tap opens whatever the alert was about. The server puts the path in
  // `data.url`; without this the notification just opens the home screen and
  // the user has to find the thing themselves.
  React.useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === "string" && url.startsWith("/")) {
        router.push(url as never);
      }
    });
    return () => subscription.remove();
  }, [router]);

  return { status, requestPermission };
}
