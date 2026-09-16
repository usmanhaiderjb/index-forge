import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { QueryClient } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as React from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import superjson from "superjson";

import { api, createTRPCClient, isAuthError } from "@/api/trpc";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/theme";

/**
 * The query cache is persisted so the app opens with the last known numbers
 * rather than a spinner. Staleness is surfaced in the UI — see StaleBanner —
 * because a cached figure presented as current is the same class of error as a
 * zero-filled chart.
 */
/**
 * Hold the splash until the stored session has been read.
 *
 * Without this the app paints an empty themed screen, then the sign-in screen,
 * then — for an already-signed-in user — the dashboard. Two visible jumps on
 * every cold start. The splash is the natural place to absorb that wait.
 */
void SplashScreen.preventAutoHideAsync();

// Fades rather than cuts, so the handoff to the first screen is not a snap.
SplashScreen.setOptions({ duration: 250, fade: true });

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "aso.query-cache",
  serialize: (data) => superjson.stringify(data),
  deserialize: (data) => superjson.parse(data),
});

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Store data updates a few times a day at most; refetching on every
        // focus would spend a phone's battery and data for nothing.
        staleTime: 5 * 60_000,
        gcTime: 24 * 60 * 60_000,
        retry: (failureCount, error) => {
          // Retrying an auth failure just burns requests — the refresh already
          // happened inside the tRPC link and did not help.
          if (isAuthError(error)) return false;
          return failureCount < 2;
        },
      },
    },
  });
}

export default function RootLayout() {
  const [queryClient] = React.useState(makeQueryClient);
  const [trpcClient] = React.useState(() => createTRPCClient());

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <api.Provider client={trpcClient} queryClient={queryClient}>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister, maxAge: 24 * 60 * 60_000 }}
          >
            <AuthProvider>
              <AuthGate />
            </AuthProvider>
          </PersistQueryClientProvider>
        </api.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Routes between the signed-in and signed-out stacks.
 *
 * Renders nothing while `isSignedIn` is null — the stored session is still
 * being read, and routing on an unknown state flashes the sign-in screen at
 * someone who is already signed in.
 */
function AuthGate() {
  const { isSignedIn } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const t = useTheme();

  React.useEffect(() => {
    if (isSignedIn === null) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!isSignedIn && !inAuthGroup) {
      router.replace("/(auth)/sign-in");
    } else if (isSignedIn && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [isSignedIn, segments, router]);

  // Splash stays up until the session state is known, so the first thing drawn
  // is the screen the user actually belongs on.
  React.useEffect(() => {
    if (isSignedIn !== null) void SplashScreen.hideAsync();
  }, [isSignedIn]);

  if (isSignedIn === null) return null;

  return (
    <>
      <StatusBar style={t.scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.color.page },
          headerTintColor: t.color.textPrimary,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.color.page },
          headerTitleStyle: { fontSize: 17, fontWeight: "600" },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
