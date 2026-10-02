/**
 * Driver sign-in for the shared <AuthProvider> (@mercon/mobile-shared/lib/auth-context).
 * Drivers log in with phone + license number (POST /mobile/auth/login); the
 * device's push token and phone health are reported once a session starts, and the
 * phone is marked signed-out on sign-out.
 */
import { api, PUSH_TOKEN_KEY } from '@mercon/mobile-shared/lib/api';
import { safeSecureStore as SecureStore } from '@mercon/mobile-shared/lib/secure-store';
import type { SignInStrategy } from '@mercon/mobile-shared/lib/auth-context';
import { registerForPushNotificationsAsync, registerPushDeviceWithBackend } from './notifications';
import { reportLogout, reportPhoneHealth } from './phoneHealth';
import { stopTripTracking } from './tripLocationTask';

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

/**
 * Runs on sign-in and on every app start with a saved session: asks for push
 * permission (first time), saves the token, then reports the phone's health
 * so the office can see whether this phone can receive work — even when the
 * driver denied notifications and there is no token.
 */
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
  await reportPhoneHealth('AppOpened');
}

export async function unregisterPushToken(): Promise<void> {
  // A signed-out phone must stop sharing its location.
  await stopTripTracking().catch(() => {});
  await reportLogout();
}
