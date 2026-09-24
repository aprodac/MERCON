/**
 * Auth state for the MERCON mobile app (shared by drivers AND operators).
 * - Token + role + profile persisted in SecureStore
 * - One sign-in form, two backend endpoints. `signIn` figures out which one
 *   the credentials belong to and logs the user in — no manual mode toggle:
 *     driver   → POST /mobile/auth/login  (phone + license)
 *     operator → POST /auth/login         (username + password)
 * - Exposes `role` so the router can send each user to the right home screen
 *   (see src/app/index.tsx and the Stack.Protected guards in src/app/_layout.tsx).
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { safeSecureStore as SecureStore } from '@mercon/mobile-shared/lib/secure-store';
import { api, TOKEN_KEY, SESSION_KEY, PUSH_TOKEN_KEY, setAuthToken, ensureAuthToken } from '@mercon/mobile-shared/lib/api';
import { queryClient } from '@mercon/mobile-shared/lib/query-client';
import {
  registerForPushNotificationsAsync,
  registerPushDeviceWithBackend,
  unregisterPushDeviceWithBackend,
} from './notifications';

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

interface Session {
  role: Role;
  profile: Profile;
}

interface AuthContextValue {
  role: Role | null;
  profile: Profile | null;
  isLoggedIn: boolean;
  isLoading: boolean; // true while restoring the session on app start
  /**
   * Single entry point for both user types. Phone-shaped identifier calls driver
   * endpoint directly; otherwise calls operator endpoint.
   */
  signIn: (identifier: string, secret: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const syncPushToken = async () => {
    try {
      const pushToken = await registerForPushNotificationsAsync();
      if (pushToken) {
        await SecureStore.setItemAsync(PUSH_TOKEN_KEY, pushToken);
        await registerPushDeviceWithBackend(pushToken);
      }
    } catch (err) {
      console.warn('[Auth] Non-fatal push token registration failure:', err);
    }
  };

  // Restore session on app start
  useEffect(() => {
    (async () => {
      try {
        const [token, rawSession] = await Promise.all([
          ensureAuthToken(),
          SecureStore.getItemAsync(SESSION_KEY),
        ]);
        if (token && rawSession) {
          setAuthToken(token);
          const parsed = JSON.parse(rawSession);
          setSession(parsed);
          if (parsed.role === 'Driver') {
            syncPushToken().catch(() => {});
          }
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const persist = async (token: string, next: Session) => {
    setAuthToken(token);
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, token),
      SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next)),
    ]);
    setSession(next);
  };

  const signInDriver = async (phone_primary: string, secret: string) => {
    const trimmedSecret = secret.trim();
    const { data } = await api.post('/mobile/auth/login', {
      phone_primary,
      password: trimmedSecret,
      license_number: trimmedSecret,
    });
    const { token, driver } = data.data;
    await persist(token, { role: 'Driver', profile: driver });
    // Register push device token in background (non-blocking for login)
    syncPushToken().catch(() => {});
  };

  const signInOperator = async (username: string, password: string) => {
    const { data } = await api.post('/auth/login', { username, password });
    const { token, user } = data.data;
    await persist(token, {
      role: user.role,
      profile: { id: user.id, name: user.name, username: user.username },
    });
  };

  const signIn = async (identifier: string, secret: string) => {
    const id = identifier.trim();
    // Driver identifiers are phone numbers (digits / +); operators can use username or phone number.
    const looksLikePhone = /^\+?[\d\s()-]+$/.test(id);
    if (looksLikePhone) {
      try {
        await signInDriver(id, secret.trim());
        return;
      } catch (driverErr) {
        // Fallback to operator login if driver login fails (e.g. operator logging in with phone number)
        try {
          await signInOperator(id, secret);
          return;
        } catch {
          throw driverErr;
        }
      }
    }
    // Operator login
    await signInOperator(id, secret);
  };

  const signOut = async () => {
    // 1. Attempt to unregister push token with backend before wiping credentials
    try {
      const pushToken = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
      if (pushToken) {
        await unregisterPushDeviceWithBackend(pushToken).catch(() => {});
      }
    } catch {
      // Non-fatal unregistration
    }

    // 2. Purge query cache so previous driver data cannot linger in memory
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
