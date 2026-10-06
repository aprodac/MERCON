/**
 * How the Activity tab sorts and shows the operator's notifications. Pure.
 * Types are the ones the API creates for staff: Emergency, Delay,
 * StaleScheduled, DriverNotReady, TripNotAcknowledged, DriverSilent,
 * Security and system, plus every step a driver takes on a trip
 * (TripUpdate, DriverDelay, TripPhoto, TripAcknowledged).
 */
import type { Href } from 'expo-router';
import {
  AlarmClock, Bell, Camera, CircleCheckBig, Clock3, FileText, MessageSquareWarning, Settings, ShieldAlert, Siren, Smartphone, Tag, Truck,
  WifiOff,
  type LucideIcon,
} from 'lucide-react-native';
import type { AppNotification } from '@mercon/mobile-shared/lib/notifications';

export type ActivityFilter = 'all' | 'unread' | 'trips' | 'drivers' | 'system';
type Category = Exclude<ActivityFilter, 'all' | 'unread'>;
type Tone = 'red' | 'amber' | 'gray';

const STYLE: Record<string, { icon: LucideIcon; tone: Tone; category: Category }> = {
  emergency: { icon: Siren, tone: 'red', category: 'trips' },
  delay: { icon: Clock3, tone: 'red', category: 'trips' },
  stalescheduled: { icon: AlarmClock, tone: 'amber', category: 'trips' },
  drivernotready: { icon: Smartphone, tone: 'amber', category: 'drivers' },
  tripnotacknowledged: { icon: MessageSquareWarning, tone: 'amber', category: 'drivers' },
  driversilent: { icon: WifiOff, tone: 'amber', category: 'drivers' },
  tripupdate: { icon: Truck, tone: 'gray', category: 'trips' },
  driverdelay: { icon: Clock3, tone: 'amber', category: 'trips' },
  tripphoto: { icon: Camera, tone: 'gray', category: 'trips' },
  tripacknowledged: { icon: CircleCheckBig, tone: 'gray', category: 'drivers' },
  security: { icon: ShieldAlert, tone: 'gray', category: 'system' },
  system: { icon: Settings, tone: 'gray', category: 'system' },
  document: { icon: FileText, tone: 'gray', category: 'system' },
  quotationexpiring: { icon: Tag, tone: 'amber', category: 'system' },
};

export function notificationStyle(n: AppNotification) {
  const type = (n.type || '').toLowerCase();
  const known = STYLE[type];
  if (known) return known;
  if (type.startsWith('trip') || n.entity_type === 'Trip') return { icon: Truck, tone: 'gray' as Tone, category: 'trips' as Category };
  return { icon: Bell, tone: 'gray' as Tone, category: 'system' as Category };
}

export const TONE: Record<Tone, { fg: string; bg: string }> = {
  red: { fg: '#D92D20', bg: '#FEF3F2' },
  amber: { fg: '#B54708', bg: '#FFFAEB' },
  gray: { fg: '#52525B', bg: '#F4F4F5' },
};

export const ACTIVITY_FILTERS: { value: ActivityFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'trips', label: 'Trips' },
  { value: 'drivers', label: 'Drivers' },
  { value: 'system', label: 'Account' },
];

export function matchesFilter(n: AppNotification, f: ActivityFilter): boolean {
  if (f === 'all') return true;
  if (f === 'unread') return !n.is_read;
  return notificationStyle(n).category === f;
}

/** The record a notification is about, if the app has a page for it. */
export function targetFor(n: AppNotification): Href | null {
  // Several quotations expiring at once: the Quotations page (its Needs attention strip).
  if (n.entity_type === 'QuotationList') return '/quotations';
  if (!n.entity_id) return null;
  // "Trip delayed" and "Driver app silent" are about where a truck is — open the
  // Fleet map on it (it falls back to the trip page when the truck isn't on the map).
  const type = (n.type ?? '').toLowerCase();
  if (n.entity_type === 'Trip' && (type === 'delay' || type === 'driversilent')) {
    return { pathname: '/fleet-map', params: { trip: n.entity_id } };
  }
  switch (n.entity_type) {
    case 'Trip':
      return { pathname: '/trip-details', params: { id: n.entity_id } };
    case 'Driver':
      return { pathname: '/driver-details', params: { id: n.entity_id } };
    case 'Vehicle':
      return { pathname: '/vehicle-details', params: { id: n.entity_id } };
    case 'Quotation':
      return { pathname: '/quotation-details', params: { id: n.entity_id } };
    default:
      return null;
  }
}

/** Title without a leading emoji ("🚨 Driver Emergency" → "Driver Emergency") — the icon already says it. */
export function cleanTitle(title: string): string {
  return title.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '').trim() || title;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Newest first, in Today / Yesterday / Earlier sections (empty ones left out). */
export function sectionsByDay(items: AppNotification[], now = Date.now()) {
  const today = dayKey(new Date(now));
  const yesterday = dayKey(new Date(now - 86_400_000));
  const buckets: Record<'Today' | 'Yesterday' | 'Earlier', AppNotification[]> = { Today: [], Yesterday: [], Earlier: [] };
  const sorted = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  for (const n of sorted) {
    const k = dayKey(new Date(n.createdAt));
    buckets[k === today ? 'Today' : k === yesterday ? 'Yesterday' : 'Earlier'].push(n);
  }
  return (Object.keys(buckets) as (keyof typeof buckets)[])
    .filter((title) => buckets[title].length > 0)
    .map((title) => ({ title, data: buckets[title] }));
}

/** "Just now", "12 min", "3 h" today; "09:40" yesterday; "3 Oct" before that. */
export function shortTime(iso: string, now = Date.now()): string {
  const t = new Date(iso);
  const ms = t.getTime();
  if (Number.isNaN(ms)) return '';
  const min = Math.floor((now - ms) / 60000);
  if (dayKey(t) === dayKey(new Date(now))) {
    if (min < 1) return 'Just now';
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)} h`;
  }
  if (dayKey(t) === dayKey(new Date(now - 86_400_000))) {
    return t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
