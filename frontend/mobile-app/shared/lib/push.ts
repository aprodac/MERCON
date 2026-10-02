/**
 * Push-token plumbing shared by both MERCON apps: creates the Android
 * channel, asks for permission and returns this install's Expo push token.
 * Each app decides where to send the token and how to present/handle pushes.
 *
 * expo-notifications is a native module — builds made before it was added
 * simply get `null` back instead of crashing.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

let Notifications: NotificationsModule | null = null;
let Device: typeof import('expo-device') | null = null;
try {
  Notifications = require('expo-notifications');
  Device = require('expo-device');
} catch (err) {
  console.warn('[Push] expo-notifications native module unavailable in this environment:', err);
}

/** The expo-notifications module, or null when this build doesn't include it. */
export function getNotificationsModule(): NotificationsModule | null {
  try {
    return Notifications && typeof Notifications.setNotificationHandler === 'function' ? Notifications : null;
  } catch {
    return null;
  }
}

/**
 * Ensures the default notification channel exists on Android (the backend
 * sends every push with channelId 'default'). HIGH importance = heads-up + sound.
 */
export async function setupNotificationChannelAsync(): Promise<void> {
  const N = getNotificationsModule();
  try {
    if (Platform.OS === 'android' && N) {
      await N.setNotificationChannelAsync('default', {
        name: 'MERCON Operational Alerts',
        importance: N.AndroidImportance?.HIGH ?? 4,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FA634E',
      });
    }
  } catch (err) {
    console.warn('[Push] Error setting up notification channel:', err);
  }
}

/**
 * Requests push permission (if needed) and returns the Expo push token, or
 * null when unavailable (simulator, permission denied, no EAS project id, or
 * the push service couldn't be reached).
 */
export async function getExpoPushTokenAsync(fallbackProjectId?: string): Promise<string | null> {
  const N = getNotificationsModule();
  try {
    if (!N) {
      console.log('[Push] Notifications native module unavailable');
      return null;
    }
    await setupNotificationChannelAsync();

    if (!Device?.isDevice) {
      console.log('[Push] Must use physical device for push notifications');
      return null;
    }

    const existingStatus = (await N.getPermissionsAsync())?.status ?? 'undetermined';
    let finalStatus: string = existingStatus;
    if (existingStatus !== 'granted') {
      const req = await N.requestPermissionsAsync();
      finalStatus = req?.status ?? 'denied';
    }
    if (finalStatus !== 'granted') {
      console.log('[Push] Notification permission not granted');
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? fallbackProjectId;
    if (!projectId) {
      console.warn('[Push] No EAS projectId in app config (extra.eas.projectId) — cannot get a push token');
      return null;
    }

    const tokenData = await N.getExpoPushTokenAsync({ projectId });
    return tokenData?.data ?? null;
  } catch (error) {
    console.warn('[Push] Error getting push token:', error);
    return null;
  }
}
