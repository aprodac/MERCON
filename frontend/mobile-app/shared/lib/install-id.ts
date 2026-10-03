/**
 * A random id for this app install, kept in secure storage for the life of
 * the install. The backend uses it to tell a driver's phones apart even when
 * the phone has no push token (notifications denied), and to know which phone
 * was last seen (sent as `X-Install-Id` on every API request).
 */
import Constants from 'expo-constants';
import { safeSecureStore as SecureStore } from './secure-store';

const INSTALL_ID_KEY = `${Constants.expoConfig?.slug ?? 'mercon-app'}_install_id`;

let cached: string | null = null;
let loading: Promise<string> | null = null;

function randomId(): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${hex(4)}-${hex(12)}`;
}

export function getCachedInstallId(): string | null {
  return cached;
}

export async function getInstallId(): Promise<string> {
  if (cached) return cached;
  if (!loading) {
    loading = (async () => {
      try {
        let id = await SecureStore.getItemAsync(INSTALL_ID_KEY);
        if (!id) {
          id = randomId();
          await SecureStore.setItemAsync(INSTALL_ID_KEY, id);
        }
        cached = id;
        return id;
      } finally {
        loading = null;
      }
    })();
  }
  return loading;
}
