/**
 * Operator-app push: registers this install's Expo push token for the
 * signed-in Admin/Operator so staff alerts (driver emergencies, delays,
 * password resets…) reach the phone, and signs the install out again.
 *   POST /notifications/devices         → register / refresh this phone
 *   POST /notifications/devices/logout  → this phone signed out
 */
import { Platform } from 'react-native';
import { api, PUSH_TOKEN_KEY } from '@mercon/mobile-shared/lib/api';
import { getInstallId } from '@mercon/mobile-shared/lib/install-id';
import { getExpoPushTokenAsync, getNotificationsModule } from '@mercon/mobile-shared/lib/push';
import { safeSecureStore as SecureStore } from '@mercon/mobile-shared/lib/secure-store';

// Pushes that arrive while the app is open still show as a banner — the
// operator may be on any screen, and these alerts need attention.
try {
  getNotificationsModule()?.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (err) {
  console.warn('[Push] Could not configure setNotificationHandler:', err);
}

/** Runs on sign-in and on every app start with a saved session. Never throws. */
export async function registerOperatorPush(): Promise<void> {
  try {
    const token = await getExpoPushTokenAsync();
    if (!token) return;
    await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
    await api.post('/notifications/devices', {
      token,
      platform: Platform.OS,
      install_id: await getInstallId(),
    });
  } catch (err) {
    console.warn('[Push] Failed to register operator device:', err);
  }
}

/** Runs before credentials are wiped on sign-out. Never throws. */
export async function unregisterOperatorPush(): Promise<void> {
  try {
    const [token, installId] = await Promise.all([
      SecureStore.getItemAsync(PUSH_TOKEN_KEY),
      getInstallId(),
    ]);
    await api.post('/notifications/devices/logout', { token, install_id: installId });
  } catch (err) {
    console.warn('[Push] Failed to sign out operator device:', err);
  }
}
