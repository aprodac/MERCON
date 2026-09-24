/**
 * Driver notifications — talks to the mobile notification endpoints.
 *   GET  /mobile/notifications        → the driver's recent notifications
 *   POST /mobile/notifications/:id/read → mark one as read
 */
import { TriangleAlert, Truck, FileText, Settings, Bell, type LucideIcon } from 'lucide-react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from '@mercon/mobile-shared/lib/api';
import type { LanguageMode } from '@mercon/mobile-shared/lib/language-context';

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

export interface MobileNotification {
  id: string;
  title: string;
  message: string;
  type: string; // "Emergency" | "Trip" | "Document" | "System"
  is_read: boolean;
  entity_type?: string | null;
  entity_id?: string | null;
  createdAt: string;
}

export const notificationService = {
  async list(): Promise<MobileNotification[]> {
    const { data } = await api.get('/mobile/notifications');
    return (data.data ?? []) as MobileNotification[];
  },

  async markRead(id: string): Promise<void> {
    await api.post(`/mobile/notifications/${id}/read`);
  },
};

/** lucide icon component for a notification type. */
export function notificationIcon(type: string): LucideIcon {
  switch (type.toLowerCase()) {
    case 'emergency': return TriangleAlert;
    case 'trip':
    case 'tripassigned':
    case 'tripstartingsoon':
    case 'tripcancelled':
    case 'tripreassigned':
    case 'tripdelayprompt':
      return Truck;
    case 'document': return FileText;
    case 'system': return Settings;
    default: return Bell;
  }
}

/** Relative "time ago" label from an ISO timestamp. */
export function timeAgo(iso: string, lang: LanguageMode = 'en'): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return lang === 'ur' ? 'ابھی ابھی' : 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return lang === 'ur' ? `${mins} منٹ پہلے` : `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return lang === 'ur' ? `${hrs} گھنٹے پہلے` : `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return lang === 'ur' ? 'کل' : 'Yesterday';
  return lang === 'ur' ? `${days} دن پہلے` : `${days} days ago`;
}

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

    if (!Device.isDevice) {
      console.log('[Push] Must use physical device for push notifications');
      return null;
    }

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
    });
  } catch (error) {
    console.warn('[Push] Failed to register device token with backend:', error);
  }
}

export async function unregisterPushDeviceWithBackend(token: string): Promise<void> {
  try {
    await api.delete(`/mobile/devices/${encodeURIComponent(token)}`);
  } catch (error) {
    console.warn('[Push] Failed to unregister device token with backend:', error);
  }
}
