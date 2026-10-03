/**
 * Auth store — the JWT and user object for this browser.
 *
 * "Keep me signed in" on: kept in localStorage (survives closing the browser,
 * until the token expires). Off: sessionStorage (gone when the browser closes)
 * — for shared computers. Reads check both, so the rest of the app doesn't care.
 */

import type { User } from '@mercon/shared-types';

const TOKEN_KEY  = 'mercon_token';
const USER_KEY   = 'mercon_user';
/** Who signed in last on this browser (name only, never a secret) — for "Welcome back". */
const LAST_USER_KEY = 'mercon_last_user';

/** @deprecated alias kept for existing imports — use `User` from @mercon/shared-types */
export type AuthUser = User;

export interface RememberedUser {
  username: string;
  name: string | null;
  role: string;
}

const safe = <T,>(fn: () => T, fallback: T): T => {
  try { return fn(); } catch { return fallback; }
};
const read = (key: string) => safe(() => localStorage.getItem(key) ?? sessionStorage.getItem(key), null);

export const authStore = {
  getToken(): string | null {
    return read(TOKEN_KEY);
  },

  getUser(): AuthUser | null {
    const raw = read(USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as AuthUser; }
    catch { return null; }
  },

  /**
   * `persist`: true = keep me signed in (localStorage), false = this browser
   * session only. Left out, the session stays wherever it already is (e.g. a
   * profile update re-saving the user).
   */
  setSession(token: string, user: AuthUser, persist?: boolean) {
    const keep = persist ?? safe(() => sessionStorage.getItem(TOKEN_KEY) === null, true);
    const target = keep ? localStorage : sessionStorage;
    const other = keep ? sessionStorage : localStorage;
    safe(() => {
      other.removeItem(TOKEN_KEY);
      other.removeItem(USER_KEY);
      target.setItem(TOKEN_KEY, token);
      target.setItem(USER_KEY, JSON.stringify(user));
    }, undefined);
  },

  clearSession() {
    safe(() => {
      for (const s of [localStorage, sessionStorage]) {
        s.removeItem(TOKEN_KEY);
        s.removeItem(USER_KEY);
      }
    }, undefined);
  },

  getRememberedUser(): RememberedUser | null {
    return safe(() => {
      const raw = localStorage.getItem(LAST_USER_KEY);
      return raw ? (JSON.parse(raw) as RememberedUser) : null;
    }, null);
  },

  setRememberedUser(user: RememberedUser | null) {
    safe(() => (user ? localStorage.setItem(LAST_USER_KEY, JSON.stringify(user)) : localStorage.removeItem(LAST_USER_KEY)), undefined);
  },

  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;
    try {
      // Decode payload without verifying signature — server will validate on each request
      const payload = JSON.parse(atob(token.split('.')[1]));
      // exp is in seconds
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  },
};
