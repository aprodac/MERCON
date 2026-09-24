/**
 * Driver sign-in for the shared <AuthProvider> (@mercon/mobile-shared/lib/auth-context).
 * Drivers log in with phone + license number (POST /mobile/auth/login); the
 * device's push token is registered once a session starts and removed on sign-out.
 */
import { api, PUSH_TOKEN_KEY } from '@mercon/mobile-shared/lib/api';
import { safeSecureStore as SecureStore } from '@mercon/mobile-shared/lib/secure-store';
import type { SignInStrategy } from '@mercon/mobile-shared/lib/auth-context';
import {
  registerForPushNotificationsAsync,
  registerPushDeviceWithBackend,
  unregisterPushDeviceWithBackend,
} from './notifications';

export const signInDriver: SignInStrategy = async (phone_primary, secret) => {
  const trimmedSecret = secret.trim();
  const { data } = await api.post('/mobile/auth/login', {
    phone_primary,
    password: trimmedSecret,
    license_number: trimmedSecret,
  });
  const { token, driver } = data.data;
  return { token, session: { role: 'Driver', profile: driver } };
};

export async function syncPushToken(): Promise<void> {
  try {
    const pushToken = await registerForPushNotificationsAsync();
    if (pushToken) {
      await SecureStore.setItemAsync(PUSH_TOKEN_KEY, pushToken);
      await registerPushDeviceWithBackend(pushToken);
    }
  } catch (err) {
    console.warn('[Auth] Non-fatal push token registration failure:', err);
  }
}

export async function unregisterPushToken(): Promise<void> {
  try {
    const pushToken = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
    if (pushToken) {
      await unregisterPushDeviceWithBackend(pushToken).catch(() => {});
    }
  } catch {
    // Non-fatal unregistration
  }
}
