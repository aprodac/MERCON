/**
 * Driver phone audit — can each driver's phone receive work and report back?
 * Backend: controllers/driverPhoneController.ts (docs/DRIVER_PHONE_AUDIT_PLAN.md).
 */
import { api, ApiResponse } from '@/lib/api';

export type PhoneLevel = 'green' | 'amber' | 'red';
export type PushStatus = 'NoDevice' | 'Sent' | 'Delivered' | 'Failed' | 'Unknown';

export interface DriverPhoneStatusRow {
  driverId: string;
  level: PhoneLevel;
  reasons: string[];
  lastSeenAt: string | null;
  platform: string | null;
  app_version: string | null;
}

export interface DriverDevice {
  id: string;
  install_id: string | null;
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
  error_code: string | null;
  error_message: string | null;
  reason: string | null;
  attempts: number;
  sent_at: string;
  receipt_checked_at: string | null;
  device: { platform: string; device_model: string | null } | null;
}

export interface DriverNotificationTrail {
  id: string;
  title: string;
  message: string;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  createdAt: string;
  opened_at: string | null;
  read_at: string | null;
  is_read: boolean;
  /** Best outcome across the driver's phones; null = no push attempted (older notifications). */
  push: PushStatus | null;
  deliveries: PushDeliveryRow[];
  /** Trip trail only: who it was sent to. */
  driverId?: string | null;
  driverName?: string | null;
}

export interface DriverActivityRow {
  id: string;
  type: string;
  tripId: string | null;
  tripRef?: string | null;
  lat: number | null;
  lng: number | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}

export interface DriverPhoneDetails {
  status: { level: PhoneLevel; reasons: string[]; lastSeenAt: string | null };
  minVersion: string | null;
  latestVersion: string | null;
  devices: DriverDevice[];
  notifications: DriverNotificationTrail[];
  activity: DriverActivityRow[];
}

export interface TripDriverTrail {
  notifications: DriverNotificationTrail[];
  acknowledgements: Array<{ id: string; driverId: string; driverName: string; createdAt: string; lat: number | null; lng: number | null }>;
  activity: DriverActivityRow[];
}

export type AttentionKind = 'NotReady' | 'NotAcknowledged' | 'Silent' | 'PushFailed';

export interface AttentionItem {
  kind: AttentionKind;
  driverId: string;
  driverName: string;
  driverPhone: string | null;
  tripId: string | null;
  tripRef: string | null;
  since: string | null;
  level: PhoneLevel;
  detail: string;
  reasons: string[];
}

export const driverPhoneService = {
  async statusAll(): Promise<DriverPhoneStatusRow[]> {
    const res = await api.get<ApiResponse<DriverPhoneStatusRow[]>>('/drivers/phone-status');
    return res.data.data ?? [];
  },
  async details(driverId: string): Promise<DriverPhoneDetails> {
    const res = await api.get<ApiResponse<DriverPhoneDetails>>(`/drivers/${driverId}/phone`);
    return res.data.data;
  },
  async testPush(driverId: string): Promise<{ notificationId: string | null }> {
    const res = await api.post<ApiResponse<{ notificationId: string | null }>>(`/drivers/${driverId}/test-push`);
    return res.data.data;
  },
  async tripTrail(tripId: string): Promise<TripDriverTrail> {
    const res = await api.get<ApiResponse<TripDriverTrail>>(`/trips/${tripId}/driver-trail`);
    return res.data.data;
  },
  async attention(): Promise<AttentionItem[]> {
    const res = await api.get<ApiResponse<AttentionItem[]>>('/operator-inbox/attention');
    return res.data.data ?? [];
  },
  async setMinVersion(minVersion: string | null): Promise<{ driverAppMinVersion: string | null }> {
    const res = await api.put<ApiResponse<{ driverAppMinVersion: string | null }>>('/settings/driver-app-version', { minVersion });
    return res.data.data;
  },
};

// ── Display helpers ─────────────────────────────────────────────────────────

export const PHONE_LEVEL_LABEL: Record<PhoneLevel, string> = {
  green: 'Ready',
  amber: 'Check phone',
  red: 'Not ready',
};

export const PUSH_STATUS_LABEL: Record<PushStatus, string> = {
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

const PERMISSION_TEXT: Record<string, string> = {
  notif_permission: 'Notifications',
  location_permission: 'Location',
  location_services_on: 'Phone GPS',
};

/** One-line description of an activity row's metadata. */
export function activityDetail(a: DriverActivityRow): string | null {
  const m = a.metadata ?? {};
  switch (a.type) {
    case 'TripStatusChanged':
      return m.from && m.to ? `${m.from} → ${m.to}${m.workflow ? ` (${String(m.workflow).replace(/_/g, ' ').toLowerCase()})` : ''}` : null;
    case 'PermissionChanged':
      return Object.entries(m.changes ?? {})
        .map(([k, v]: [string, any]) => `${PERMISSION_TEXT[k] ?? k}: ${String(v.from).replace('_', ' ')} → ${String(v.to).replace('_', ' ')}`)
        .join(' · ');
    case 'PhotoUploaded':
      return [m.kind, m.operation].filter(Boolean).join(' · ') || null;
    case 'Emergency':
      return m.incident_type ?? null;
    case 'CameOnline':
      return m.offlineMinutes != null ? `after ${m.offlineMinutes} min offline` : null;
    case 'AppOpened':
      return [m.app_version && `app ${m.app_version}`, m.network_type].filter(Boolean).join(' · ') || null;
    default:
      return null;
  }
}
