/**
 * Phone health — tells the office whether this phone can receive work and
 * report back (docs/DRIVER_PHONE_AUDIT_PLAN.md):
 *   POST /mobile/health          snapshot / heartbeat (+ "AppOpened")
 *   POST /mobile/devices/logout  this phone signed out
 * Never throws: a failed report must never disturb the driver.
 */
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { api, PUSH_TOKEN_KEY } from '@mercon/mobile-shared/lib/api';
import { getInstallId } from '@mercon/mobile-shared/lib/install-id';
import { safeSecureStore as SecureStore } from '@mercon/mobile-shared/lib/secure-store';

let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');
} catch {
  // Native module unavailable (e.g. Expo Go on some platforms)
}

export type NotifPermission = 'granted' | 'denied' | 'undetermined';
export type LocationPermission = 'always' | 'while_using' | 'denied' | 'undetermined';

export interface PhoneHealth {
  app_version: string | null;
  build_number: string | null;
  os_name: string;
  os_version: string | null;
  device_model: string | null;
  notif_permission: NotifPermission | null;
  location_permission: LocationPermission | null;
  location_services_on: boolean | null;
  battery_level: number | null;
  low_power_mode: boolean | null;
  network_type: 'wifi' | 'cellular' | 'none' | 'unknown' | 'other' | null;
}

const safe = async <T>(fn: () => Promise<T>): Promise<T | null> => {
  try {
    return await fn();
  } catch {
    return null;
  }
};

async function notifPermission(): Promise<NotifPermission | null> {
  if (!Notifications) return null;
  const res = await safe(() => Notifications!.getPermissionsAsync());
  if (!res) return null;
  // iOS "provisional" still delivers quietly — count it as allowed.
  if (res.granted || (res as any).ios?.status === 3) return 'granted';
  return (res.status as NotifPermission) ?? null;
}

async function locationPermission(): Promise<LocationPermission | null> {
  const res = await safe(() => Location.getForegroundPermissionsAsync());
  if (!res) return null;
  if (res.status === 'granted') return 'while_using'; // the app only uses location while open
  return res.status as LocationPermission;
}

function networkType(state: Network.NetworkState | null): PhoneHealth['network_type'] {
  if (!state) return null;
  if (state.isConnected === false) return 'none';
  switch (state.type) {
    case Network.NetworkStateType.WIFI: return 'wifi';
    case Network.NetworkStateType.CELLULAR: return 'cellular';
    case Network.NetworkStateType.NONE: return 'none';
    case Network.NetworkStateType.UNKNOWN: return 'unknown';
    default: return 'other';
  }
}

export async function collectPhoneHealth(): Promise<PhoneHealth> {
  const [notif, location, servicesOn, battery, lowPower, network] = await Promise.all([
    notifPermission(),
    locationPermission(),
    safe(() => Location.hasServicesEnabledAsync()),
    safe(() => Battery.getBatteryLevelAsync()),
    safe(() => Battery.isLowPowerModeEnabledAsync()),
    safe(() => Network.getNetworkStateAsync()),
  ]);
  return {
    app_version: Application.nativeApplicationVersion ?? null,
    build_number: Application.nativeBuildVersion ?? null,
    os_name: Platform.OS,
    os_version: Device.osVersion ?? null,
    device_model: Device.modelName ?? null,
    notif_permission: notif,
    location_permission: location,
    location_services_on: servicesOn,
    // -1 = unknown (simulators); send nothing rather than a fake value
    battery_level: battery != null && battery >= 0 ? battery : null,
    low_power_mode: lowPower,
    network_type: networkType(network),
  };
}

// ── Shared state for the banner / update screen ─────────────────────────────

export interface PhoneHealthState {
  health: PhoneHealth | null;
  updateRequired: boolean;
  minVersion: string | null;
}

let state: PhoneHealthState = { health: null, updateRequired: false, minVersion: null };
const listeners = new Set<(s: PhoneHealthState) => void>();

export function getPhoneHealthState(): PhoneHealthState {
  return state;
}

export function subscribePhoneHealth(fn: (s: PhoneHealthState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setState(next: Partial<PhoneHealthState>) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn(state));
}

/**
 * Sends the current snapshot. `event: 'AppOpened'` adds an entry to the
 * driver's activity log (on app start / return to foreground).
 */
export async function reportPhoneHealth(event?: 'AppOpened'): Promise<void> {
  try {
    const [health, installId, token] = await Promise.all([
      collectPhoneHealth(),
      getInstallId(),
      SecureStore.getItemAsync(PUSH_TOKEN_KEY).catch(() => null),
    ]);
    setState({ health });

    let lat: number | undefined;
    let lng: number | undefined;
    if (event === 'AppOpened' && health.location_permission === 'while_using') {
      const pos = await safe(() => Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 }));
      if (pos) {
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }
    }

    const { data } = await api.post('/mobile/health', {
      install_id: installId,
      platform: Platform.OS,
      token: health.notif_permission === 'granted' ? token : undefined,
      ...health,
      event,
      lat,
      lng,
    });
    setState({
      updateRequired: !!data?.data?.updateRequired,
      minVersion: data?.data?.minVersion ?? null,
    });
  } catch (err) {
    console.warn('[PhoneHealth] report failed:', err);
  }
}

/** Marks this phone as signed out so the office stops sending it pushes. */
export async function reportLogout(): Promise<void> {
  try {
    const [installId, token] = await Promise.all([
      getInstallId(),
      SecureStore.getItemAsync(PUSH_TOKEN_KEY).catch(() => null),
    ]);
    await api.post('/mobile/devices/logout', { install_id: installId, token });
  } catch (err) {
    console.warn('[PhoneHealth] logout report failed:', err);
  }
}
