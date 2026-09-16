import * as React from "react";

import {
  clearTokens,
  hasStoredSession,
  signInWithDevEmail,
  signInWithGoogle,
  signOut as revokeSession,
} from "@/api/auth";

type AuthState = {
  /** Null while the stored session is being read — not the same as signed out. */
  isSignedIn: boolean | null;
  signInWithGoogleToken: (idToken: string) => Promise<void>;
  signInWithEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Called when a refresh fails, to drop straight back to the sign-in screen. */
  onSessionExpired: () => void;
};

const AuthContext = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isSignedIn, setIsSignedIn] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    // Reads the Keychain only. Deliberately no network call: the splash should
    // not wait on a server that might be slow or unreachable, and an expired
    // access token is refreshed lazily on the first real request.
    void hasStoredSession().then((has) => {
      if (!cancelled) setIsSignedIn(has);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = React.useMemo<AuthState>(
    () => ({
      isSignedIn,
      signInWithGoogleToken: async (idToken) => {
        await signInWithGoogle(idToken);
        setIsSignedIn(true);
      },
      signInWithEmail: async (email) => {
        await signInWithDevEmail(email);
        setIsSignedIn(true);
      },
      signOut: async () => {
        await revokeSession();
        setIsSignedIn(false);
      },
      onSessionExpired: () => {
        void clearTokens();
        setIsSignedIn(false);
      },
    }),
    [isSignedIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
