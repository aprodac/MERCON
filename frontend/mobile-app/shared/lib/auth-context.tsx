/**
 * Auth state shared by the MERCON mobile apps.
 * - Token + role + profile persisted in SecureStore
 * - Each app passes its own `signIn` strategy (which backend endpoint, which
 *   roles are allowed):
 *     Driver app   → POST /mobile/auth/login  (phone + license)
 *     Operator app → POST /auth/login         (username + password)
 * - Optional hooks let an app react to a session starting (sign-in or restore
 *   on app start) or ending — the driver app registers its push token there.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { safeSecureStore as SecureStore } from './secure-store';
import { TOKEN_KEY, SESSION_KEY, PUSH_TOKEN_KEY, setAuthToken, ensureAuthToken } from './api';
import { queryClient } from './query-client';

export type Role = 'Driver' | 'Operator' | 'Admin';

/** Unified profile — driver fields and operator fields are both optional. */
export interface Profile {
  id: string;
  name: string;
  // Driver-specific
  ref_id?: string;
  status?: string;
  // Operator/Admin-specific
  username?: string;
}

export interface Session {
  role: Role;
  profile: Profile;
}

/** Calls the app's login endpoint; throws on bad credentials or a disallowed role. */
export type SignInStrategy = (identifier: string, secret: string) => Promise<{ token: string; session: Session }>;

interface AuthContextValue {
  role: Role | null;
  profile: Profile | null;
  isLoggedIn: boolean;
  isLoading: boolean; // true while restoring the session on app start
  signIn: (identifier: string, secret: string) => Promise<void>;
  signOut: () => Promise<void>;
}

interface AuthProviderProps {
  children: React.ReactNode;
  signIn: SignInStrategy;
  /** Roles this app accepts; a restored session with any other role is discarded. */
  allowedRoles: Role[];
  /** Runs after a session starts (sign-in or restore). Must not throw. */
  onSessionStart?: (session: Session) => Promise<void>;
  /** Runs before credentials are wiped on sign-out. Must not throw. */
  onSignOut?: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, signIn: signInStrategy, allowedRoles, onSessionStart, onSignOut }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on app start
  useEffect(() => {
    (async () => {
      try {
        const [token, rawSession] = await Promise.all([
          ensureAuthToken(),
          SecureStore.getItemAsync(SESSION_KEY),
        ]);
        if (token && rawSession) {
          const parsed: Session = JSON.parse(rawSession);
          if (allowedRoles.includes(parsed.role)) {
            setAuthToken(token);
            setSession(parsed);
            onSessionStart?.(parsed).catch(() => {});
          }
        }
      } finally {
        setIsLoading(false);
      }
    })();
    // Runs once on mount; the props are fixed per app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (identifier: string, secret: string) => {
    const { token, session: next } = await signInStrategy(identifier.trim(), secret);
    setAuthToken(token);
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, token),
      SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next)),
    ]);
    setSession(next);
    // Background work (e.g. push registration) — non-blocking for login
    onSessionStart?.(next).catch(() => {});
  };

  const signOut = async () => {
    // 1. App-specific cleanup (e.g. unregister push token) before wiping credentials
    await onSignOut?.().catch(() => {});
    // 2. Purge query cache so previous user data cannot linger in memory
    queryClient.clear();
    // 3. Clear in-memory token
    setAuthToken(null);
    // 4. Clear SecureStore items
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(SESSION_KEY),
      SecureStore.deleteItemAsync(PUSH_TOKEN_KEY),
    ]);
    // 5. Reset auth session state
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        role: session?.role ?? null,
        profile: session?.profile ?? null,
        isLoggedIn: session !== null,
        isLoading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
