import * as Google from "expo-auth-session/providers/google";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import * as React from "react";

import { Button } from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";

// Required for the OAuth redirect to close the browser and return to the app.
WebBrowser.maybeCompleteAuthSession();

/**
 * The Google button, in its own component on purpose.
 *
 * `useIdTokenAuthRequest` throws outright when no client id is configured for
 * the current platform — and a hook cannot be called conditionally, so guarding
 * only the button still crashes the screen on a build with no Google config.
 * Isolating the hook here means the parent can decline to render this at all.
 */
export function GoogleSignInButton({
  onError,
  onBusyChange,
  busy,
}: {
  onError: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
  busy: boolean;
}) {
  const { signInWithGoogleToken } = useAuth();
  const extra = Constants.expoConfig?.extra ?? {};

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: extra.googleClientIdIos as string | undefined,
    androidClientId: extra.googleClientIdAndroid as string | undefined,
  });

  React.useEffect(() => {
    if (!response) return;

    if (response.type === "error") {
      onError("Google sign-in was cancelled or failed.");
      return;
    }
    if (response.type !== "success") return;

    const idToken = response.params.id_token;
    if (!idToken) {
      onError("Google did not return an identity token.");
      return;
    }

    onBusyChange(true);
    signInWithGoogleToken(idToken)
      .catch((e: Error) => onError(e.message))
      .finally(() => onBusyChange(false));
  }, [response, signInWithGoogleToken, onError, onBusyChange]);

  return (
    <Button
      label="Continue with Google"
      loading={busy}
      disabled={!request}
      onPress={() => void promptAsync()}
    />
  );
}

/** Whether a client id exists for this platform, checked before mounting the button. */
export function isGoogleConfigured(): boolean {
  const extra = Constants.expoConfig?.extra ?? {};
  return Boolean(extra.googleClientIdIos || extra.googleClientIdAndroid);
}
