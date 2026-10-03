/**
 * Driver notifications — talks to the mobile notification endpoints.
 *   GET  /mobile/notifications        → the driver's recent notifications
 *   POST /mobile/notifications/:id/read → mark one as read
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from '@mercon/mobile-shared/lib/api';
import { getInstallId } from '@mercon/mobile-shared/lib/install-id';
import type { AppNotification } from '@mercon/mobile-shared/lib/notifications';

let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');
} catch (err) {
  console.warn('[Push] expo-notifications native module unavailable in this environment:', err);
}

// Helper to safely check if Notifications native module exists in current runtime
export function isNotificationsAvailable(): boolean {
  try {
    return !!Notifications && typeof Notifications.setNotificationHandler === 'function';
  } catch {
    return false;
  }
}

// Configure how notifications are presented when the app is foregrounded
try {
  if (isNotificationsAvailable()) {
    Notifications?.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }
} catch (err) {
  console.warn('[Push] Could not configure setNotificationHandler:', err);
}


export const notificationService = {
  async list(): Promise<AppNotification[]> {
    const { data } = await api.get('/mobile/notifications');
    return (data.data ?? []) as AppNotification[];
  },

  async markRead(id: string): Promise<void> {
    await api.post(`/mobile/notifications/${id}/read`);
  },

  /** The driver tapped the push itself (shown to the office as "opened"). */
  async markOpened(id: string): Promise<void> {
    await api.post(`/mobile/notifications/${id}/opened`);
  },
};

/**
 * Ensures the default operational notification channel exists on Android.
 * Uses HIGH importance for heads-up alerts and sound on physical devices.
 */
export async function setupNotificationChannelAsync(): Promise<void> {
  try {
    if (Platform.OS === 'android' && isNotificationsAvailable()) {
      await Notifications?.setNotificationChannelAsync('default', {
        name: 'MERCON Operational Alerts',
        importance: Notifications?.AndroidImportance?.HIGH ?? 4,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FA634E',
      });
    }
  } catch (err) {
    console.warn('[Push] Error setting up notification channel:', err);
  }
}

/**
 * Requests push permission (if needed) and acquires an Expo Push Token.
 * Safely handles older Android (API < 33) where permission is granted by default,
 * and Android 13+ where runtime prompt is presented.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    if (!isNotificationsAvailable()) {
      console.log('[Push] Notifications native module unavailable');
      return null;
    }
    await setupNotificationChannelAsync();

    // No "physical device only" gate: an Android emulator with Google Play
    // services gets a real push token, which is how pushes are tested without
    // a phone. Where no token can be had (iOS simulator) the call below throws
    // and is caught like any other failure.

    const existingStatus = (await Notifications?.getPermissionsAsync())?.status ?? 'undetermined';
    let finalStatus: string = existingStatus;

    if (existingStatus !== 'granted') {
      const req = await Notifications?.requestPermissionsAsync();
      finalStatus = req?.status ?? 'denied';
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] Notification permission not granted');
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? '2697c85a-0ac8-4a2e-9225-5cc84a5b518d';

    const tokenData = await Notifications?.getExpoPushTokenAsync({ projectId });
    return tokenData?.data ?? null;
  } catch (error) {
    console.warn('[Push] Error getting push token:', error);
    return null;
  }
}

export async function registerPushDeviceWithBackend(token: string): Promise<void> {
  try {
    await api.post('/mobile/devices', {
      token,
      platform: Platform.OS,
      install_id: await getInstallId(),
    });
  } catch (error) {
    console.warn('[Push] Failed to register device token with backend:', error);
  }
}
