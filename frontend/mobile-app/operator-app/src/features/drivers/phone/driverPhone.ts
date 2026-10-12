/**
 * A driver's phone and what they did — the same data as the web's "Phone & app"
 * sheet (web-dashboard services/driverPhoneService.ts):
 *   GET  /drivers/:id/phone        → status, phones (permissions, battery, app version), notifications, activity
 *   POST /drivers/:id/test-push    → send a test notification
 *   GET  /trips/:id/driver-trail   → what was sent for one trip, "Got it" taps, activity on the trip
 */
import { api } from '@mercon/mobile-shared/lib/api';

export type PhoneLevel = 'green' | 'amber' | 'red';
export type PushStatus = 'NoDevice' | 'Sent' | 'Delivered' | 'Failed' | 'Unknown';

export interface DriverDevice {
  id: string;
  hasPushToken: boolean;
  platform: string;
  isActive: boolean;
  lastSeenAt: string;
  createdAt: string;
  app_version: string | null;
  build_number: string | null;
  os_name: string | null;
  os_version: string | null;
  device_model: string | null;
  notif_permission: 'granted' | 'denied' | 'undetermined' | null;
  location_permission: 'always' | 'while_using' | 'denied' | 'undetermined' | null;
  location_services_on: boolean | null;
  battery_level: number | null;
  low_power_mode: boolean | null;
  network_type: string | null;
  health_reported_at: string | null;
}

export interface PushDeliveryRow {
  id: string;
  status: PushStatus;
  reason: string | null;
  sent_at: string;
}

export interface NotificationTrail {
  id: string;
  title: string;
  message: string;
  type: string;
  createdAt: string;
  opened_at: string | null;
  read_at: string | null;
  is_read: boolean;
  /** Best outcome across the driver's phones; null = no push attempted (older notifications). */
  push: PushStatus | null;
  deliveries: PushDeliveryRow[];
  driverName?: string | null;
}

export interface ActivityRow {
  id: string;
  type: string;
  tripId: string | null;
  tripRef?: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}

export interface DriverPhone {
  status: { level: PhoneLevel; reasons: string[]; lastSeenAt: string | null };
  minVersion: string | null;
  latestVersion: string | null;
  devices: DriverDevice[];
  notifications: NotificationTrail[];
  activity: ActivityRow[];
}

export interface TripTrail {
  notifications: NotificationTrail[];
  acknowledgements: { id: string; driverId: string; driverName: string; createdAt: string }[];
  activity: ActivityRow[];
}

export const driverPhoneApi = {
  async details(driverId: string): Promise<DriverPhone> {
    const { data } = await api.get(`/drivers/${driverId}/phone`);
    return data.data as DriverPhone;
  },
  async testPush(driverId: string): Promise<void> {
    await api.post(`/drivers/${driverId}/test-push`);
  },
  async tripTrail(tripId: string): Promise<TripTrail> {
    const { data } = await api.get(`/trips/${tripId}/driver-trail`);
    return data.data as TripTrail;
  },
};

export const driverPhoneKey = (driverId: string) => ['drivers', 'phone', driverId] as const;
export const tripTrailKey = (tripId: string) => ['trips', 'driver-trail', tripId] as const;

// ── Words ────────────────────────────────────────────────────────────────────

export const LEVEL_LABEL: Record<PhoneLevel, string> = { green: 'Ready', amber: 'Check phone', red: 'Not ready' };
/** The chip colour (a trip-details Tone) for each level. */
export const LEVEL_TONE: Record<PhoneLevel, 'green' | 'amber' | 'red'> = { green: 'green', amber: 'amber', red: 'red' };

export const PUSH_LABEL: Record<PushStatus, string> = {
  NoDevice: 'Not sent — no phone',
  Sent: 'Sent, waiting for Apple/Google',
  Delivered: 'Delivered to phone',
  Failed: 'Not delivered',
  Unknown: 'Result unknown',
};

export const ACTIVITY_LABEL: Record<string, string> = {
  Login: 'Logged in',
  Logout: 'Logged out',
  AppOpened: 'Opened the app',
  WentOffline: 'Went offline',
  CameOnline: 'Back online',
  PermissionChanged: 'Changed phone permissions',
  TripStatusChanged: 'Updated trip status',
  PhotoUploaded: 'Uploaded a photo',
  Emergency: 'Raised an emergency',
  Acknowledged: 'Tapped "Got it"',
};

export const NOTIF_TEXT: Record<string, string> = { granted: 'Allowed', denied: 'Turned off', undetermined: 'Not asked yet' };
export const LOC_TEXT: Record<string, string> = { always: 'Always', while_using: 'While using app', denied: 'Denied', undetermined: 'Not asked yet' };

/** "3 min ago", "5 h ago", "2 days ago". */
export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'never';
  const ms = now - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

const PERMISSION_TEXT: Record<string, string> = { notif_permission: 'Notifications', location_permission: 'Location', location_services_on: 'Phone GPS' };

/** One line describing an activity row's details. */
export function activityDetail(a: ActivityRow): string | null {
  const m = a.metadata ?? {};
  switch (a.type) {
    case 'TripStatusChanged':
      return m.from && m.to ? `${m.from} → ${m.to}${m.workflow ? ` (${String(m.workflow).replace(/_/g, ' ').toLowerCase()})` : ''}` : null;
    case 'PermissionChanged':
      return Object.entries(m.changes ?? {})
        .map(([k, v]: [string, any]) => `${PERMISSION_TEXT[k] ?? k}: ${String(v.from).replace('_', ' ')} → ${String(v.to).replace('_', ' ')}`)
        .join(' · ') || null;
    case 'PhotoUploaded':
      return [m.kind, m.operation].filter(Boolean).join(' · ') || null;
    case 'Emergency':
      return m.incident_type ?? null;
    case 'CameOnline':
      return m.offlineMinutes != null ? `after ${m.offlineMinutes} min offline` : null;
    case 'AppOpened':
    case 'Login':
      return [m.app_version && `app ${m.app_version}`, m.network_type].filter(Boolean).join(' · ') || null;
    default:
      return null;
  }
}

/** Red for things the office should look at. */
export function isAlarming(a: ActivityRow): boolean {
  return a.type === 'Emergency' || a.type === 'WentOffline' || (a.type === 'PermissionChanged' && /→ (denied|false)/.test(activityDetail(a) ?? ''));
}

/** The phone the driver uses now: the most recently seen active one. */
export function currentDevice(p: DriverPhone | undefined | null): DriverDevice | null {
  return p?.devices.find((d) => d.isActive) ?? null;
}

export const batteryText = (d: DriverDevice | null) => (d?.battery_level != null ? `${Math.round(d.battery_level * 100)}%` : null);
