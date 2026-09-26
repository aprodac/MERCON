/**
 * The operator's "Needs action" list: everything on the fleet that someone has
 * to do something about, most urgent first, each with the one action that
 * handles it. Pure — built from the live map, trips, driver photo updates,
 * document expiries, screenshot reviews, invoices and emergency notifications.
 * Same rules as the web's Operator Inbox (components/dashboard/inbox).
 */
import type { AppNotification } from '@mercon/mobile-shared/lib/notifications';
import type { DriverUpdate, ExpiryItem, LiveUnit, OperatorInvoice, OperatorTripDocument } from '../../../lib/operator';

export type Urgency = 'now' | 'today' | 'watch';
export type ActionGroup = 'trips' | 'whatsapp' | 'documents' | 'money';

export type ActionKind =
  | 'emergency'
  | 'delayed'
  | 'late-start'
  | 'unassigned'
  | 'gps-quiet'
  | 'gps-mismatch'
  | 'photos'
  | 'time-check'
  | 'expiry'
  | 'overdue-invoice';

/** What the card's buttons do; the screen turns these into navigation / calls. */
export type ActionIntent =
  | { type: 'call'; phone: string }
  | { type: 'whatsapp'; phone: string | null; text: string }
  | { type: 'trip'; tripId: string; tab?: 'details' | 'updates' | 'stops'; share?: 'status' | 'delay'; assign?: 'driver' | 'truck' }
  | { type: 'handled'; notificationId: string }
  | { type: 'driver'; id: string }
  | { type: 'vehicle'; id: string }
  | { type: 'invoices' };

export interface ActionButton {
  label: string;
  intent: ActionIntent;
}

export interface ActionItem {
  key: string;
  kind: ActionKind;
  urgency: Urgency;
  group: ActionGroup;
  title: string;
  detail: string;
  /** When it happened / is due — for "12 min ago", "in 2 h". */
  at: string | null;
  tripId: string | null;
  primary: ActionButton;
  secondary?: ActionButton;
  /** Small thumbnails (driver photos). */
  media?: { id: string; url: string; kind: 'photo' | 'video' }[];
}

export interface ActionSources {
  units: LiveUnit[];
  unassigned: {
    id: string;
    ref_id: string | null;
    planned_start: string | null;
    customer?: { name: string } | null;
    driver?: unknown;
    vehicle?: unknown;
    is_third_party?: boolean;
    status: string;
  }[];
  updates: DriverUpdate[];
  expiries: ExpiryItem[];
  reviews: (OperatorTripDocument & { entity_id?: string })[];
  invoices: OperatorInvoice[];
  notifications: AppNotification[];
  now?: number;
}

/** GPS silence on a running trip worth flagging (same as the web). */
export const QUIET_MINUTES = 30;
/** Unassigned trips starting within this window show up. */
const UNASSIGNED_WINDOW_H = 48;
/** A scheduled trip this late to start is flagged. */
const LATE_START_GRACE_MIN = 15;
/** Documents expiring within this many days show up (the rest wait). */
const EXPIRY_DAYS = 7;

const URGENCY_RANK: Record<Urgency, number> = { now: 0, today: 1, watch: 2 };
/** Within one urgency level: the most serious kind first. */
const KIND_RANK: Record<ActionKind, number> = {
  emergency: 0, delayed: 1, 'late-start': 2, 'gps-quiet': 3, unassigned: 4, photos: 5, 'time-check': 6, expiry: 7, 'gps-mismatch': 8, 'overdue-invoice': 9,
};

const minutesSince = (iso: string | null | undefined, now: number) =>
  iso ? (now - new Date(iso).getTime()) / 60000 : Infinity;

export function durationText(min: number): string {
  if (!Number.isFinite(min)) return '';
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h${m % 60 && h < 10 ? ` ${m % 60} min` : ''}`;
  return `${Math.round(h / 24)} days`;
}

const unitName = (u: LiveUnit) => u.vehicle?.plate_number ?? u.driver?.name ?? '';

function nextStopName(u: LiveUnit): string | null {
  const t = u.trip;
  if (!t || t.next_stop_index == null) return null;
  return t.stops[t.next_stop_index]?.name ?? null;
}

const STAGE_TITLE: Record<string, string> = {
  loaded: 'Loading photos',
  arrived: 'Arrival photos',
  stop: 'Stop photos',
  delivered: 'Proof of delivery',
  delay: 'Delay photos',
  other: 'Photos',
};

export function buildActions(src: ActionSources): ActionItem[] {
  const now = src.now ?? Date.now();
  const out: ActionItem[] = [];
  const unitByTrip = new Map(src.units.filter((u) => u.trip).map((u) => [u.trip!.id, u]));

  // 1 · Emergencies raised by a driver, until someone marks them handled.
  for (const n of src.notifications) {
    if (n.type !== 'Emergency' || n.is_read) continue;
    const tripId = n.entity_type === 'Trip' ? n.entity_id ?? null : null;
    const unit = tripId ? unitByTrip.get(tripId) : undefined;
    const phone = unit?.driver?.phone ?? null;
    out.push({
      key: `emergency-${n.id}`,
      kind: 'emergency',
      urgency: 'now',
      group: 'trips',
      title: n.title || 'Emergency reported',
      detail: n.message,
      at: n.createdAt,
      tripId,
      primary: phone ? { label: 'Call', intent: { type: 'call', phone } } : tripId ? { label: 'Open', intent: { type: 'trip', tripId } } : { label: 'Handled', intent: { type: 'handled', notificationId: n.id } },
      secondary: { label: 'Handled', intent: { type: 'handled', notificationId: n.id } },
    });
  }

  for (const u of src.units) {
    const t = u.trip;
    if (!t) continue;
    const name = unitName(u);
    const phone = u.driver?.phone ?? null;
    const next = nextStopName(u);
    const who = [t.ref_id, t.customer_name].filter(Boolean).join(' · ');

    // 2 · Delayed trips — tell the customer.
    if (t.phase === 'delayed') {
      const due = t.next_stop_index != null ? t.stops[t.next_stop_index]?.planned_arrival ?? null : null;
      out.push({
        key: `delay-${t.id}`,
        kind: 'delayed',
        urgency: 'now',
        group: 'trips',
        title: `${t.ref_id ?? 'Trip'} is delayed`,
        detail: [name, next ? `heading to ${next}` : null, t.customer_name].filter(Boolean).join(' · '),
        at: due,
        tripId: t.id,
        primary: { label: 'Notify', intent: { type: 'trip', tripId: t.id, tab: 'updates', share: 'delay' } },
        secondary: phone ? { label: 'Call', intent: { type: 'call', phone } } : undefined,
      });
    }

    // 3 · Should have started but hasn't.
    if (t.phase === 'upcoming' && t.planned_start && minutesSince(t.planned_start, now) > LATE_START_GRACE_MIN) {
      out.push({
        key: `late-${t.id}`,
        kind: 'late-start',
        urgency: 'now',
        group: 'trips',
        title: `${t.ref_id ?? 'Trip'} hasn't started`,
        detail: [`${durationText(minutesSince(t.planned_start, now))} past its start`, name, t.customer_name].filter(Boolean).join(' · '),
        at: t.planned_start,
        tripId: t.id,
        primary: phone ? { label: 'Call', intent: { type: 'call', phone } } : { label: 'Open', intent: { type: 'trip', tripId: t.id } },
      });
    }

    // 5 · Truck gone quiet on a running trip.
    const quiet = minutesSince(u.position?.recorded_at, now);
    if (t.phase !== 'upcoming' && quiet > QUIET_MINUTES) {
      out.push({
        key: `quiet-${t.id}`,
        kind: 'gps-quiet',
        urgency: 'now',
        group: 'trips',
        title: `${name || t.ref_id} has no GPS${Number.isFinite(quiet) ? '' : ' at all'}`,
        detail: [who, u.driver?.name ? `driver ${u.driver.name}` : null].filter(Boolean).join(' · '),
        at: u.position?.recorded_at ?? null,
        tripId: t.id,
        primary: phone ? { label: 'Call', intent: { type: 'call', phone } } : { label: 'Open', intent: { type: 'trip', tripId: t.id } },
      });
    }

    if (u.feeds_gap_m != null && u.feeds_gap_m > 1000) {
      out.push({
        key: `gap-${t.id}`,
        kind: 'gps-mismatch',
        urgency: 'watch',
        group: 'trips',
        title: `${name}: tracker and phone disagree`,
        detail: `${(u.feeds_gap_m / 1000).toFixed(1)} km apart · ${t.ref_id ?? ''}`,
        at: null,
        tripId: t.id,
        primary: phone ? { label: 'Call', intent: { type: 'call', phone } } : { label: 'Open', intent: { type: 'trip', tripId: t.id } },
      });
    }
  }

  // 4 · Starting soon with no driver or truck.
  const soon = now + UNASSIGNED_WINDOW_H * 3600_000;
  for (const t of src.unassigned) {
    if (t.is_third_party || ['Completed', 'Cancelled', 'Invoiced'].includes(t.status)) continue;
    const missing = [!t.driver ? 'driver' : null, !t.vehicle ? 'truck' : null].filter(Boolean) as ('driver' | 'truck')[];
    if (missing.length === 0) continue;
    const start = t.planned_start ? new Date(t.planned_start).getTime() : null;
    if (start != null && start > soon) continue;
    const overdue = start != null && start < now;
    out.push({
      key: `unassigned-${t.id}`,
      kind: 'unassigned',
      urgency: overdue || (start != null && start - now < 6 * 3600_000) ? 'now' : 'today',
      group: 'trips',
      title: `${t.ref_id ?? 'Trip'} has no ${missing.join(' or ')}`,
      detail: [t.customer?.name, start == null ? 'no start time' : overdue ? 'should have started' : `starts in ${durationText((start - now) / 60000)}`].filter(Boolean).join(' · '),
      at: t.planned_start,
      tripId: t.id,
      primary: { label: 'Assign', intent: { type: 'trip', tripId: t.id, assign: missing[0] } },
    });
  }

  // 6 · Driver photos nobody has sent to the customer yet.
  for (const u of src.updates) {
    if (u.unsent_count <= 0) continue;
    const unsent = u.items.filter((m) => !u.sent_ids.includes(m.id));
    out.push({
      key: `photos-${u.key}`,
      kind: 'photos',
      urgency: u.stage === 'delivered' || u.stage === 'delay' ? 'today' : 'watch',
      group: 'whatsapp',
      title: `${STAGE_TITLE[u.stage] ?? 'Photos'} to send`,
      detail: [u.trip.ref_id, u.stop?.name ?? u.customer?.name, `${u.unsent_count} new`].filter(Boolean).join(' · '),
      at: u.latest_at,
      tripId: u.trip.id,
      primary: { label: 'Send', intent: { type: 'trip', tripId: u.trip.id, tab: 'updates' } },
      media: unsent.slice(0, 4).map((m) => ({ id: m.id, url: m.url, kind: m.kind })),
    });
  }

  // 7 · External-app screenshots whose time must be confirmed.
  const reviewsByTrip = new Map<string, number>();
  for (const d of src.reviews) {
    if (d.ai_extracted_json?.source !== 'external_app_screenshot' || !d.entity_id) continue;
    reviewsByTrip.set(d.entity_id, (reviewsByTrip.get(d.entity_id) ?? 0) + 1);
  }
  for (const [tripId, count] of reviewsByTrip) {
    const u = unitByTrip.get(tripId);
    out.push({
      key: `review-${tripId}`,
      kind: 'time-check',
      urgency: 'today',
      group: 'trips',
      title: `${count} screenshot time${count > 1 ? 's' : ''} to confirm`,
      detail: [u?.trip?.ref_id, u?.trip?.customer_name, u ? unitName(u) : null].filter(Boolean).join(' · ') || 'Driver uses the customer’s app',
      at: null,
      tripId,
      primary: { label: 'Confirm', intent: { type: 'trip', tripId, tab: 'stops' } },
    });
  }

  // 9 · Documents expired / expiring within a week.
  for (const e of src.expiries) {
    if (e.days > EXPIRY_DAYS) continue;
    const expired = e.days < 0;
    const when = expired ? `expired ${Math.abs(e.days)} day${Math.abs(e.days) === 1 ? '' : 's'} ago` : e.days === 0 ? 'expires today' : `expires in ${e.days} day${e.days === 1 ? '' : 's'}`;
    const remind = e.contact
      ? `Hi ${e.contact.name}, your ${e.label} for ${e.entity_name} ${expired ? 'has expired' : `expires on ${new Date(e.expiry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}. Please renew it and send us the new copy.`
      : '';
    out.push({
      key: `expiry-${e.key}`,
      kind: 'expiry',
      urgency: expired || e.on_trip_ref ? 'today' : 'watch',
      group: 'documents',
      title: `${e.entity_name} · ${e.label}`,
      detail: [when, e.on_trip_ref ? `on trip ${e.on_trip_ref}` : null].filter(Boolean).join(' · '),
      at: e.expiry_date,
      tripId: null,
      primary: e.contact
        ? { label: 'Remind', intent: { type: 'whatsapp', phone: e.contact.phone, text: remind } }
        : e.entity_type === 'Vehicle' ? { label: 'Open', intent: { type: 'vehicle', id: e.entity_id } } : { label: 'Open', intent: { type: 'driver', id: e.entity_id } },
    });
  }

  // 10 · Overdue invoices.
  for (const inv of src.invoices) {
    if (!['Issued', 'PartiallyPaid', 'Overdue'].includes(inv.status) || !inv.due_date) continue;
    const late = minutesSince(inv.due_date, now) / 1440;
    if (late < 1) continue;
    out.push({
      key: `invoice-${inv.id}`,
      kind: 'overdue-invoice',
      urgency: 'watch',
      group: 'money',
      title: `${inv.ref_id ?? 'Invoice'} is ${Math.floor(late)} day${Math.floor(late) === 1 ? '' : 's'} overdue`,
      detail: [inv.customer?.name, `${inv.currency || 'SAR'} ${Math.round(Number(inv.total_amount) || 0).toLocaleString('en-US')}`].filter(Boolean).join(' · '),
      at: inv.due_date,
      tripId: null,
      primary: { label: 'Open', intent: { type: 'invoices' } },
    });
  }

  return out.sort((a, b) => {
    const u = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (u !== 0) return u;
    const k = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (k !== 0) return k;
    // Then newest first; items without a time last.
    const ta = a.at ? new Date(a.at).getTime() : 0;
    const tb = b.at ? new Date(b.at).getTime() : 0;
    return tb - ta;
  });
}

/** Today's trips for the timeline: running first, then the next to start today. */
export function todaysTrips(units: LiveUnit[], tz: string, now = Date.now()) {
  const dayOf = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  const today = dayOf(now);
  return units
    .filter((u) => u.trip && (u.trip.phase !== 'upcoming' || (u.trip.planned_start && dayOf(new Date(u.trip.planned_start).getTime()) === today)))
    .map((u) => u.trip!)
    .sort((a, b) => {
      const ra = a.phase === 'upcoming' ? 1 : 0;
      const rb = b.phase === 'upcoming' ? 1 : 0;
      if (ra !== rb) return ra - rb;
      return new Date(a.planned_start ?? 0).getTime() - new Date(b.planned_start ?? 0).getTime();
    })
    .map((t) => ({ trip: t, unit: units.find((u) => u.trip?.id === t.id)! }));
}

/** The small time on a row, worded for its kind: "42h late", "in 3h", "10m ago", "expired 2d". */
export function whenLabel(item: ActionItem, now = Date.now()): { text: string; hot: boolean } | null {
  if (!item.at) return null;
  const diffMin = (now - new Date(item.at).getTime()) / 60000;
  if (!Number.isFinite(diffMin)) return null;
  const d = durationText(Math.abs(diffMin)).replace(' days', 'd').replace(' h', 'h').replace(' min', 'm');
  switch (item.kind) {
    case 'delayed':
    case 'late-start':
      return diffMin > 0 ? { text: `${d} late`, hot: true } : { text: `due in ${d}`, hot: false };
    case 'unassigned':
      return diffMin > 0 ? { text: `${d} overdue`, hot: true } : { text: `in ${d}`, hot: diffMin > -360 };
    case 'expiry':
      return diffMin > 0 ? { text: `expired ${d}`, hot: true } : { text: `in ${d}`, hot: false };
    case 'overdue-invoice':
      return { text: `${d} overdue`, hot: false };
    case 'gps-quiet':
      return { text: `${d} silent`, hot: true };
    default:
      return diffMin < 1 ? { text: 'now', hot: false } : { text: `${d} ago`, hot: false };
  }
}
