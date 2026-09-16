import { Stack } from "expo-router";
import * as React from "react";

/**
 * Without this file expo-router flattens the group: the route becomes
 * `(auth)/sign-in` rather than a `(auth)` segment containing `sign-in`, and the
 * root layout's `<Stack.Screen name="(auth)" />` then matches nothing. The
 * router warns about it and the auth gate's segment check never fires.
 */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
