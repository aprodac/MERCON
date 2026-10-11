/**
 * API client for this build's backend.
 * Base URL comes from EXPO_PUBLIC_API_URL (set in .env or eas.json),
 * falling back to this client's own API (app.config.ts's `extra.apiUrl`,
 * set per CLIENT_PROFILES entry) — never another client's, so a
 * misconfigured build fails loudly instead of silently talking to the
 * wrong backend.
 */
import axios from 'axios';
import Constants from 'expo-constants';
import { safeSecureStore as SecureStore } from './secure-store';
import { translate } from './language-context';
import { LanguageMode } from './translations';
import { getInstallId } from './install-id';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra?.apiUrl as string);

if (!API_URL) {
  throw new Error(
    'No API URL configured: set EXPO_PUBLIC_API_URL, or apiUrl in this client\'s app.config.ts profile.',
  );
}

// Namespaced per client (app.config.ts's `slug`) so two clients' apps
// installed side by side on the same device never collide on session storage.
const KEY_PREFIX = `${Constants.expoConfig?.slug ?? 'mercon-app'}_`;
export const TOKEN_KEY = `${KEY_PREFIX}token`;
export const SESSION_KEY = `${KEY_PREFIX}session`;
export const PUSH_TOKEN_KEY = `${KEY_PREFIX}push_token`;

const LOGIN_PATHS = ['/auth/login', '/mobile/auth/login'];

let inMemoryToken: string | null = null;
let restorePromise: Promise<string | null> | null = null;

export function setAuthToken(token: string | null) {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

/**
 * Returns the cached in-memory token, or awaits an in-flight restoration from SecureStore.
 * Prevents multiple simultaneous SecureStore disk I/O restoration calls during startup.
 */
export async function ensureAuthToken(): Promise<string | null> {
  if (inMemoryToken) return inMemoryToken;
  if (!restorePromise) {
    restorePromise = (async () => {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        inMemoryToken = token;
        return token;
      } finally {
        restorePromise = null;
      }
    })();
  }
  return restorePromise;
}

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

// Attach the saved JWT to every request — using in-memory cache first to eliminate disk I/O delay
api.interceptors.request.use(async (config) => {
  let token = inMemoryToken;
  if (!token) {
    token = await ensureAuthToken();
  }
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Lets the backend mark this phone as "last seen" (driver phone audit).
  try {
    config.headers['X-Install-Id'] = await getInstallId();
  } catch {
    // Never block a request on secure storage
  }
  return config;
});

// A 401 on any authenticated request means the token expired or was revoked.
// Previously every screen just showed a generic "Something went wrong" alert
// with no path back to login — the driver had to manually find Settings →
// Logout. Now the session is cleared and the app returns to login directly.
// Login attempts themselves are excluded: a 401 there is just "wrong
// credentials" (handled by auth-context's dual-endpoint signIn), not an
// expired session, and there's no session to clear yet anyway.
//
// This used to call router.replace('/login') on every 401 without clearing the
// signed-in state, so each failed request (screens refetching, polling, the
// sign-out cleanup calls) pushed another login screen and it slid in again and
// again. Now only a 401 for the current token ends the session, only once, and
// the auth guard in app/_layout.tsx does the single redirect to login.
let onSessionExpired: (() => Promise<void>) | null = null;
let expiring: Promise<void> | null = null;

/** Called by AuthProvider so an expired token signs the user out through it. */
export function setSessionExpiredHandler(handler: (() => Promise<void>) | null) {
  onSessionExpired = handler;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const isLoginRequest = LOGIN_PATHS.some((p) => error.config?.url?.includes(p));
    // Requests sent without a token (already signed out) or with an older
    // token (finished after a new sign-in) say nothing about this session.
    const sentToken = String(error.config?.headers?.Authorization ?? '').replace(/^Bearer /, '');
    const isCurrentSession = !!sentToken && sentToken === inMemoryToken;
    if (error.response?.status === 401 && !isLoginRequest && isCurrentSession && !expiring) {
      expiring = (async () => {
        if (onSessionExpired) {
          await onSessionExpired();
        } else {
          setAuthToken(null);
          await Promise.all([
            SecureStore.deleteItemAsync(TOKEN_KEY),
            SecureStore.deleteItemAsync(SESSION_KEY),
          ]);
        }
      })()
        .catch(() => {})
        .finally(() => { expiring = null; });
    }
    return Promise.reject(error);
  },
);

/**
 * Standard error envelope from the backend: { success: false, error: { code, message } }.
 * Always logs the raw error first — this used to fall through to a generic
 * "Something went wrong" with no trace of what actually failed (network vs.
 * server vs. a plain JS exception from something like FormData/file reading),
 * which made real bugs indistinguishable from transient hiccups. Now the
 * console log (visible in Metro) and the alert text itself carry the real
 * cause so the next occurrence is diagnosable on the spot.
 */
/** An error whose message is already written for the user — shown as-is. */
export class UserFacingError extends Error {}

export function getApiErrorMessage(err: unknown, lang?: LanguageMode): string {
  if (err instanceof UserFacingError) return err.message;
  if (axios.isAxiosError(err)) {
    if (err.response?.status === 401) {
      return (
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        translate('err_invalid_credentials', 'Invalid credentials. Please check your username/phone and password/license.', lang)
      );
    }
    if (err.response?.data?.error?.message) return err.response.data.error.message;
    if (err.response?.data?.message) return err.response.data.message;
    if (err.code === 'ECONNABORTED') {
      return translate('err_network_timeout', 'Request timed out. Check your connection.', lang);
    }
    if (!err.response) {
      const details = err.message || err.code || 'network error';
      return `${translate('err_cannot_reach_server', 'Cannot reach the server.', lang)} (${details})`;
    }
    console.error('[API error]', err);
    return `${translate('err_server_error', 'Server error. Please try again.', lang)} (HTTP ${err.response.status})`;
  }

  console.error('[API error]', err);
  if (err instanceof Error) {
    return `${translate('err_something_went_wrong', 'Something went wrong. Please try again.', lang)}: ${err.message}`;
  }
  return translate('err_something_went_wrong', 'Something went wrong. Please try again.', lang);
}
