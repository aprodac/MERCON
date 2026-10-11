/** Words, colours and times for the Customer links screens — no React here. */
import type { Tone } from '@/features/trips/details/tripDetailsModel';
import type { LinkDetail, LinkRow, LinkStatus, LinkView } from './linksApi';

const DAY = 86_400_000;

export const STATUS_CHIP: Record<LinkStatus, { label: string; tone: Tone }> = {
  live: { label: 'Live', tone: 'green' },
  expired: { label: 'Expired', tone: 'gray' },
  revoked: { label: 'Turned off', tone: 'red' },
  cancelled: { label: 'Trip cancelled', tone: 'gray' },
  disabled: { label: 'Tracking off', tone: 'amber' },
};

/** What the row is about: the trip's route, or the customer's all-trucks page. */
export function linkTitle(l: LinkRow): string {
  if (l.kind === 'customer') return 'All trucks page';
  return l.trip?.route_label || l.trip?.ref_id || 'Trip link';
}

export function linkSubtitle(l: LinkRow): string {
  return [l.kind === 'trip' ? l.trip?.ref_id : null, l.customer?.name].filter(Boolean).join(' · ');
}

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "6 Oct, 14:05" — the year only when it isn't this year. */
export function when(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", else the date. */
export function ago(iso: string, now = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < DAY) return `${Math.floor(ms / 3_600_000)} h ago`;
  if (ms < 7 * DAY) { const d = Math.floor(ms / DAY); return `${d} day${d === 1 ? '' : 's'} ago`; }
  return when(iso, now);
}

/** "in 3 h", "in 2 days", "in 5 weeks". */
export function until(iso: string, now = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return 'now';
  if (ms < 3_600_000) return `in ${Math.max(1, Math.round(ms / 60_000))} min`;
  if (ms < DAY) return `in ${Math.round(ms / 3_600_000)} h`;
  const days = Math.round(ms / DAY);
  if (days < 45) return `in ${days} day${days === 1 ? '' : 's'}`;
  return `in ${Math.round(days / 30)} months`;
}

export function opensLine(l: LinkRow, now = Date.now()): string {
  if (!l.open_count) return 'Not opened yet';
  return `Opened ${l.open_count}×${l.last_opened_at ? ` · last ${ago(l.last_opened_at, now)}` : ''}`;
}

/** One line about the link's lifetime, for rows and the header. */
export function lifeLine(l: LinkRow, now = Date.now()): string {
  if (l.status === 'revoked') return `Turned off${l.revoked_at ? ` ${ago(l.revoked_at, now)}` : ''}${l.revoked_by ? ` by ${l.revoked_by.name}` : ''}`;
  if (l.status === 'cancelled') return 'The trip was cancelled — the link shows nothing';
  if (l.status === 'disabled') return 'Tracking is off for this customer';
  if (!l.expires_at) return 'Never expires';
  if (l.status === 'expired') return `Expired ${ago(l.expires_at, now)}`;
  return `Expires ${until(l.expires_at, now)} · ${when(l.expires_at, now)}`;
}

/** Expiry choices. `days: null` = back to the default. */
export const EXPIRY_PRESETS: { label: string; days: number | null }[] = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
  { label: '6 months', days: 182 },
];

export const expiryFromDays = (days: number, now = Date.now()) => new Date(now + days * DAY).toISOString();

export function defaultExpiryText(l: LinkRow): string {
  return l.kind === 'trip'
    ? 'Follows the trip — stops 7 days after delivery'
    : 'Never expires';
}

/** The page's switches, in the order they appear. */
export type ViewKey = keyof LinkView;
export const VIEW_ROWS: { key: ViewKey; title: string; text: string; followsCustomer: boolean }[] = [
  { key: 'show_position', title: 'Truck on the map', text: 'Off: only status, stops and arrival time — not where the truck is.', followsCustomer: false },
  { key: 'show_driver', title: 'Driver', text: 'First name and photo.', followsCustomer: false },
  { key: 'show_plate', title: 'Truck plate', text: 'Plate number and truck photo.', followsCustomer: false },
  { key: 'show_deadline', title: 'Planned arrival', text: '“On time” / “late by” against the planned times.', followsCustomer: true },
  { key: 'show_delay_reason', title: 'Delay reason', text: 'The reason category, never the driver’s own words.', followsCustomer: true },
  { key: 'show_photos', title: 'Photos', text: 'Loading and delivery photos (POD) of finished stops.', followsCustomer: true },
];

/** How many things this link hides that a default link would show. */
export function hiddenCount(d: LinkDetail): number {
  return VIEW_ROWS.filter((r) => !d.effective[r.key]).length;
}

export function placeOf(o: { city: string | null; country: string | null }): string | null {
  if (o.city && o.country) return `${o.city}, ${o.country}`;
  return o.city || o.country || null;
}

export const isPhone = (device: string | null) => !!device && /iPhone|Android|iPad/i.test(device);
