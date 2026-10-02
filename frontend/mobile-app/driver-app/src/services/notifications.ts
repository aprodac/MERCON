/**
 * Driver notifications — talks to the mobile notification endpoints.
 *   GET  /mobile/notifications        → the driver's recent notifications
 *   POST /mobile/notifications/:id/read → mark one as read
 */
import { Platform } from 'react-native';
import { api } from '@mercon/mobile-shared/lib/api';
import { getInstallId } from '@mercon/mobile-shared/lib/install-id';
import type { AppNotification } from '@mercon/mobile-shared/lib/notifications';
import { getExpoPushTokenAsync, setupNotificationChannelAsync } from '@mercon/mobile-shared/lib/push';

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

// Pushes the app already handles in-app while foregrounded, so the system
// banner would only duplicate it. TripAssigned → the "Got it" prompt
// (AcknowledgeTripsPrompt). Background/closed-app pushes are shown by the OS
// and never pass through this handler, so they are unaffected.
const SILENT_IN_FOREGROUND = new Set(['TripAssigned']);

// Configure how notifications are presented when the app is foregrounded
try {
  if (isNotificationsAvailable()) {
    Notifications?.setNotificationHandler({
      handleNotification: async (notification) => {
        const type = (notification?.request?.content?.data as any)?.type;
        const show = !SILENT_IN_FOREGROUND.has(type);
        return {
          shouldShowAlert: show,
          shouldPlaySound: show,
          shouldSetBadge: false,
          shouldShowBanner: show,
          shouldShowList: show,
        };
      },
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
 * Requests push permission (if needed) and acquires an Expo Push Token.
 * The driver app's EAS project id is also in app.config.ts; the fallback
 * keeps older configs working.
 */
export function registerForPushNotificationsAsync(): Promise<string | null> {
  return getExpoPushTokenAsync('2697c85a-0ac8-4a2e-9225-5cc84a5b518d');
}

export { setupNotificationChannelAsync };

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
