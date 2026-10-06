/**
 * The Links page (operator app): every customer link — trip links (/t/) and
 * customer-wide links (/c/) — with its status, who made it, its open history,
 * and the controls: expiry, label, what the page shows, revoke, replace.
 *
 * A trip link is a `trip_update_shares` row with update_key 'tracking'; a
 * customer link is a `customer_tracking_links` row. Both carry the same view
 * settings (LinkView). Revoked links are kept, so the history stays readable.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  LINK_VIEW_SELECT, TRACKING_AFTER_END_DAYS, TRACKING_UPDATE_KEY, ensureTrackingLink, optionsOf, placeName, routeLabel, trackingLinkState,
  type LinkView, type TrackingOptions,
} from './customerTracking';
import { ensureCustomerTrackingLink } from './customerFleetTracking';

export type LinkKind = 'trip' | 'customer';
export type LinkStatus = 'live' | 'expired' | 'revoked' | 'cancelled' | 'disabled';
export type LinkListStatus = 'live' | 'ended' | 'all';

/** Longest expiry ops can pick. */
export const MAX_EXPIRY_DAYS = 366;
/** "Expiring soon" on the page. */
export const EXPIRING_SOON_MS = 3 * 86_400_000;

const DAY_MS = 86_400_000;

const CUSTOMER_DEFAULTS_SELECT = {
  id: true, name: true, tracking_enabled: true, tracking_auto_link: true,
  tracking_show_deadline: true, tracking_show_delay_reason: true, tracking_show_photos: true,
} as const;

const TRIP_SHARE_SELECT = {
  id: true, token: true, label: true, createdAt: true, expiresAt: true, expiry_custom: true, revokedAt: true,
  open_count: true, first_opened_at: true, last_opened_at: true,
  sharedBy: { select: { id: true, name: true, username: true } },
  revoked_by: true,
  ...LINK_VIEW_SELECT,
  trip: {
    select: {
      id: true, ref_id: true, status: true, actual_end: true, updatedAt: true, deletedAt: true,
      customer: { select: CUSTOMER_DEFAULTS_SELECT },
      stops: { where: { deletedAt: null }, orderBy: { stop_sequence: 'asc' as const }, select: { location_name: true, location_address: true } },
    },
  },
} satisfies Prisma.TripUpdateShareSelect;

const CUSTOMER_LINK_SELECT = {
  id: true, token: true, label: true, createdAt: true, expiresAt: true, revokedAt: true,
  open_count: true, last_opened_at: true, created_by: true, revoked_by: true,
  ...LINK_VIEW_SELECT,
  customer: { select: { ...CUSTOMER_DEFAULTS_SELECT, deletedAt: true } },
} satisfies Prisma.CustomerTrackingLinkSelect;

type TripShareRow = Prisma.TripUpdateShareGetPayload<{ select: typeof TRIP_SHARE_SELECT }>;
type CustomerLinkRow = Prisma.CustomerTrackingLinkGetPayload<{ select: typeof CUSTOMER_LINK_SELECT }>;
type CustomerDefaults = Prisma.CustomerGetPayload<{ select: typeof CUSTOMER_DEFAULTS_SELECT }>;

export interface LinkPerson { id: string; name: string }

export interface LinkRow {
  kind: LinkKind;
  id: string;
  url: string;
  status: LinkStatus;
  label: string | null;
  customer: { id: string; name: string } | null;
  trip: { id: string; ref_id: string | null; status: string; route_label: string | null } | null;
  created_at: string;
  created_by: LinkPerson | null;
  /** When it stops working — the trip's finish rule included. Null: never (customer links). */
  expires_at: string | null;
  /** Ops picked the expiry (trip links; customer links: any expiry is ops' choice). */
  expiry_custom: boolean;
  expiring_soon: boolean;
  revoked_at: string | null;
  revoked_by: LinkPerson | null;
  open_count: number;
  first_opened_at: string | null;
  last_opened_at: string | null;
}

export interface LinkDetail extends LinkRow {
  /** The link's own settings (null = follow the customer). */
  view: LinkView;
  /** What the page shows right now, after the customer's settings. */
  effective: TrackingOptions;
  /** The customer's settings the first three follow when the link doesn't override them. */
  customer_defaults: { show_deadline: boolean; show_delay_reason: boolean; show_photos: boolean } | null;
  opens: Array<{ id: string; opened_at: string; device: string | null; city: string | null; country: string | null }>;
  summary: {
    logged: number;
    /** Opens counted before the history was kept. */
    earlier_opens: number;
    devices: number;
    places: Array<{ label: string; count: number }>;
  };
  /** The other links of the same trip / customer, newest first (replaced or ended ones). */
  history: LinkRow[];
}

// ── Shaping ──────────────────────────────────────────────────────────────────

/** When a trip link stops working: its expiry, or TRACKING_AFTER_END_DAYS after the finish, whichever is first. */
export function tripLinkEnds(
  share: { expiresAt: Date; expiry_custom: boolean },
  trip: { status: string; actual_end: Date | null; updatedAt: Date } | null,
): Date {
  if (share.expiry_custom || !trip || (trip.status !== 'Completed' && trip.status !== 'Invoiced')) return share.expiresAt;
  const end = new Date((trip.actual_end ?? trip.updatedAt).getTime() + TRACKING_AFTER_END_DAYS * DAY_MS);
  return end < share.expiresAt ? end : share.expiresAt;
}

function tripStatus(row: TripShareRow, now: Date): LinkStatus {
  if (row.revokedAt) return 'revoked';
  const trip = row.trip && !row.trip.deletedAt ? row.trip : null;
  const state = trackingLinkState(row, trip, now);
  return state === 'ok' ? 'live' : state === 'not_found' ? 'expired' : state;
}

function customerStatus(row: CustomerLinkRow, now: Date): LinkStatus {
  if (row.revokedAt) return 'revoked';
  if (row.customer.deletedAt || (row.expiresAt && row.expiresAt <= now)) return 'expired';
  if (!row.customer.tracking_enabled) return 'disabled';
  return 'live';
}

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

function stopsLabel(stops: Array<{ location_name: string | null; location_address: string | null }>): string | null {
  const names = stops
    .map((s) => s.location_name?.trim() || s.location_address?.split(',')[0]?.trim() || '')
    .filter(Boolean)
    .map(placeName);
  return routeLabel(names);
}

type People = Map<string, LinkPerson>;

async function loadPeople(db: PrismaClient, ids: Array<string | null | undefined>): Promise<People> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return new Map();
  const users = await db.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true, username: true } });
  return new Map(users.map((u) => [u.id, { id: u.id, name: u.name?.trim() || u.username }]));
}

function tripRow(row: TripShareRow, base: string, people: People, now: Date): LinkRow {
  const status = tripStatus(row, now);
  const ends = row.trip ? tripLinkEnds(row, row.trip) : row.expiresAt;
  return {
    kind: 'trip',
    id: row.id,
    url: `${base}/t/${row.token}`,
    status,
    label: row.label,
    customer: row.trip?.customer ? { id: row.trip.customer.id, name: row.trip.customer.name } : null,
    trip: row.trip ? { id: row.trip.id, ref_id: row.trip.ref_id, status: row.trip.status, route_label: stopsLabel(row.trip.stops) } : null,
    created_at: row.createdAt.toISOString(),
    created_by: row.sharedBy ? { id: row.sharedBy.id, name: row.sharedBy.name?.trim() || row.sharedBy.username } : null,
    expires_at: ends.toISOString(),
    expiry_custom: row.expiry_custom,
    expiring_soon: status === 'live' && ends.getTime() - now.getTime() < EXPIRING_SOON_MS,
    revoked_at: iso(row.revokedAt),
    revoked_by: row.revoked_by ? people.get(row.revoked_by) ?? null : null,
    open_count: row.open_count,
    first_opened_at: iso(row.first_opened_at),
    last_opened_at: iso(row.last_opened_at),
  };
}

function customerRow(row: CustomerLinkRow, base: string, people: People, now: Date): LinkRow {
  const status = customerStatus(row, now);
  return {
    kind: 'customer',
    id: row.id,
    url: `${base}/c/${row.token}`,
    status,
    label: row.label,
    customer: { id: row.customer.id, name: row.customer.name },
    trip: null,
    created_at: row.createdAt.toISOString(),
    created_by: row.created_by ? people.get(row.created_by) ?? null : null,
    expires_at: iso(row.expiresAt),
    expiry_custom: !!row.expiresAt,
    expiring_soon: status === 'live' && !!row.expiresAt && row.expiresAt.getTime() - now.getTime() < EXPIRING_SOON_MS,
    revoked_at: iso(row.revokedAt),
    revoked_by: row.revoked_by ? people.get(row.revoked_by) ?? null : null,
    open_count: row.open_count,
    first_opened_at: null,
    last_opened_at: iso(row.last_opened_at),
  };
}

// ── List ─────────────────────────────────────────────────────────────────────

/** Trip links that still open (same rules as trackingLinkState, as a query). */
export function liveTripWhere(now: Date): Prisma.TripUpdateShareWhereInput {
  const cutoff = new Date(now.getTime() - TRACKING_AFTER_END_DAYS * DAY_MS);
  return {
    revokedAt: null,
    expiresAt: { gt: now },
    trip: {
      deletedAt: null,
      status: { not: 'Cancelled' },
      customer: { tracking_enabled: true },
    },
    OR: [
      { expiry_custom: true },
      { trip: { status: { notIn: ['Completed', 'Invoiced'] } } },
      { trip: { actual_end: { gt: cutoff } } },
      { trip: { actual_end: null, updatedAt: { gt: cutoff } } },
    ],
  };
}

export function liveCustomerWhere(now: Date): Prisma.CustomerTrackingLinkWhereInput {
  return {
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    customer: { deletedAt: null, tracking_enabled: true },
  };
}

export interface ListQuery {
  kind?: LinkKind | 'all';
  status?: LinkListStatus;
  q?: string;
  customer_id?: string;
  trip_id?: string;
  /** created_at of the last row already shown — the next page starts after it. */
  before?: string;
  limit?: number;
}

export async function listTrackingLinks(db: PrismaClient, query: ListQuery, base: string, now = new Date()) {
  const limit = Math.min(Math.max(query.limit ?? 40, 1), 100);
  const status = query.status ?? 'live';
  const before = query.before ? new Date(query.before) : null;
  const q = query.q?.trim();
  const kind = query.trip_id ? 'trip' : query.kind ?? 'all';

  const tripWhere: Prisma.TripUpdateShareWhereInput = {
    AND: [
      { update_key: TRACKING_UPDATE_KEY },
      status === 'live' ? liveTripWhere(now) : status === 'ended' ? { NOT: liveTripWhere(now) } : {},
      before ? { createdAt: { lt: before } } : {},
      query.customer_id ? { trip: { customerId: query.customer_id } } : {},
      query.trip_id ? { tripId: query.trip_id } : {},
      q ? {
        OR: [
          { label: { contains: q, mode: 'insensitive' } },
          { trip: { ref_id: { contains: q, mode: 'insensitive' } } },
          { trip: { customer: { name: { contains: q, mode: 'insensitive' } } } },
          { trip: { vehicle: { plate_number: { contains: q, mode: 'insensitive' } } } },
        ],
      } : {},
    ],
  };
  const customerWhere: Prisma.CustomerTrackingLinkWhereInput = {
    AND: [
      status === 'live' ? liveCustomerWhere(now) : status === 'ended' ? { NOT: liveCustomerWhere(now) } : {},
      before ? { createdAt: { lt: before } } : {},
      query.customer_id ? { customerId: query.customer_id } : {},
      q ? {
        OR: [
          { label: { contains: q, mode: 'insensitive' } },
          { customer: { name: { contains: q, mode: 'insensitive' } } },
        ],
      } : {},
    ],
  };

  const [trips, customers, liveTrips, liveCustomers] = await Promise.all([
    kind === 'customer' ? [] : db.tripUpdateShare.findMany({ where: tripWhere, orderBy: { createdAt: 'desc' }, take: limit + 1, select: TRIP_SHARE_SELECT }),
    kind === 'trip' ? [] : db.customerTrackingLink.findMany({ where: customerWhere, orderBy: { createdAt: 'desc' }, take: limit + 1, select: CUSTOMER_LINK_SELECT }),
    db.tripUpdateShare.count({ where: { update_key: TRACKING_UPDATE_KEY, ...liveTripWhere(now) } }),
    db.customerTrackingLink.count({ where: liveCustomerWhere(now) }),
  ]);

  const people = await loadPeople(db, [
    ...trips.map((t) => t.revoked_by),
    ...customers.flatMap((c) => [c.created_by, c.revoked_by]),
  ]);
  const merged = [
    ...trips.map((t) => tripRow(t, base, people, now)),
    ...customers.map((c) => customerRow(c, base, people, now)),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const links = merged.slice(0, limit);
  return {
    links,
    has_more: merged.length > limit,
    counts: { live_trip: liveTrips, live_customer: liveCustomers },
  };
}

// ── Detail ───────────────────────────────────────────────────────────────────

const OPENS_SHOWN = 200;

function defaultsOf(c: CustomerDefaults | null | undefined) {
  return c ? { show_deadline: c.tracking_show_deadline, show_delay_reason: c.tracking_show_delay_reason, show_photos: c.tracking_show_photos } : null;
}

function viewOf(row: LinkView): LinkView {
  return {
    show_deadline: row.show_deadline, show_delay_reason: row.show_delay_reason, show_photos: row.show_photos,
    show_driver: row.show_driver, show_plate: row.show_plate, show_position: row.show_position,
  };
}

export function placeLabel(city: string | null, country: string | null): string | null {
  if (city && country) return `${city}, ${country}`;
  return city || country || null;
}

async function opensOf(db: PrismaClient, where: Prisma.TrackingLinkOpenWhereInput, counted: number) {
  const [rows, logged, devices, places] = await Promise.all([
    db.trackingLinkOpen.findMany({
      where, orderBy: { opened_at: 'desc' }, take: OPENS_SHOWN,
      select: { id: true, opened_at: true, device: true, city: true, country: true },
    }),
    db.trackingLinkOpen.count({ where }),
    db.trackingLinkOpen.groupBy({ by: ['device'], where }),
    db.trackingLinkOpen.groupBy({ by: ['city', 'country'], where, _count: { _all: true } }),
  ]);
  return {
    opens: rows.map((r) => ({ id: r.id, opened_at: r.opened_at.toISOString(), device: r.device, city: r.city, country: r.country })),
    summary: {
      logged,
      earlier_opens: Math.max(0, counted - logged),
      devices: devices.filter((d) => d.device).length,
      places: places
        .map((p) => ({ label: placeLabel(p.city, p.country), count: p._count._all }))
        .filter((p): p is { label: string; count: number } => !!p.label)
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
    },
  };
}

export async function getTrackingLink(db: PrismaClient, kind: LinkKind, id: string, base: string, now = new Date()): Promise<LinkDetail | null> {
  if (kind === 'trip') {
    const row = await db.tripUpdateShare.findFirst({ where: { id, update_key: TRACKING_UPDATE_KEY }, select: TRIP_SHARE_SELECT });
    if (!row) return null;
    const [others, opens] = await Promise.all([
      db.tripUpdateShare.findMany({
        where: { tripId: row.trip.id, update_key: TRACKING_UPDATE_KEY, id: { not: id } },
        orderBy: { createdAt: 'desc' }, take: 20, select: TRIP_SHARE_SELECT,
      }),
      opensOf(db, { tripShareId: id }, row.open_count),
    ]);
    const people = await loadPeople(db, [row.revoked_by, ...others.map((o) => o.revoked_by)]);
    const customer = row.trip.customer;
    return {
      ...tripRow(row, base, people, now),
      view: viewOf(row),
      effective: optionsOf(customer, row),
      customer_defaults: defaultsOf(customer),
      ...opens,
      history: others.map((o) => tripRow(o, base, people, now)),
    };
  }
  const row = await db.customerTrackingLink.findUnique({ where: { id }, select: CUSTOMER_LINK_SELECT });
  if (!row) return null;
  const [others, opens] = await Promise.all([
    db.customerTrackingLink.findMany({
      where: { customerId: row.customer.id, id: { not: id } },
      orderBy: { createdAt: 'desc' }, take: 20, select: CUSTOMER_LINK_SELECT,
    }),
    opensOf(db, { customerLinkId: id }, row.open_count),
  ]);
  const people = await loadPeople(db, [row.created_by, row.revoked_by, ...others.flatMap((o) => [o.created_by, o.revoked_by])]);
  return {
    ...customerRow(row, base, people, now),
    view: viewOf(row),
    effective: optionsOf(row.customer, row),
    customer_defaults: defaultsOf(row.customer),
    ...opens,
    history: others.map((o) => customerRow(o, base, people, now)),
  };
}

// ── Changes ──────────────────────────────────────────────────────────────────

export interface LinkChanges {
  label?: string | null;
  /**
   * ISO time the link stops working. Null: back to the default — a trip link
   * then follows the trip (90 days, and 7 days after the finish); a customer
   * link never expires.
   */
  expires_at?: string | null;
  view?: Partial<LinkView>;
}

export class LinkChangeError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function updateTrackingLink(db: PrismaClient, kind: LinkKind, id: string, changes: LinkChanges, now = new Date()) {
  const data: Record<string, unknown> = {};
  if (changes.label !== undefined) data.label = changes.label?.trim() ? changes.label.trim().slice(0, 120) : null;
  if (changes.view) {
    for (const key of ['show_deadline', 'show_delay_reason', 'show_photos'] as const) {
      if (changes.view[key] !== undefined) data[key] = changes.view[key];
    }
    for (const key of ['show_driver', 'show_plate', 'show_position'] as const) {
      if (changes.view[key] !== undefined && changes.view[key] !== null) data[key] = changes.view[key];
    }
  }
  let expiry: Date | null | undefined;
  if (changes.expires_at !== undefined) {
    expiry = changes.expires_at === null ? null : new Date(changes.expires_at);
    if (expiry && Number.isNaN(expiry.getTime())) throw new LinkChangeError('Invalid expiry date');
    if (expiry && expiry.getTime() <= now.getTime() + 60_000) throw new LinkChangeError('Pick a time in the future — use “Turn off now” to stop the link.');
    if (expiry && expiry.getTime() > now.getTime() + MAX_EXPIRY_DAYS * DAY_MS) throw new LinkChangeError(`The longest expiry is ${MAX_EXPIRY_DAYS} days.`);
  }

  if (kind === 'trip') {
    const row = await db.tripUpdateShare.findFirst({ where: { id, update_key: TRACKING_UPDATE_KEY }, select: { id: true, revokedAt: true, createdAt: true } });
    if (!row) throw new LinkChangeError('Link not found', 404);
    if (row.revokedAt) throw new LinkChangeError('This link was turned off — make a new link instead.', 409);
    if (expiry !== undefined) {
      if (expiry) Object.assign(data, { expiresAt: expiry, expiry_custom: true });
      else Object.assign(data, { expiresAt: new Date(Math.max(row.createdAt.getTime(), now.getTime()) + 90 * DAY_MS), expiry_custom: false });
    }
    await db.tripUpdateShare.update({ where: { id }, data });
    return;
  }
  const row = await db.customerTrackingLink.findUnique({ where: { id }, select: { id: true, revokedAt: true } });
  if (!row) throw new LinkChangeError('Link not found', 404);
  if (row.revokedAt) throw new LinkChangeError('This link was turned off — make a new link instead.', 409);
  if (expiry !== undefined) data.expiresAt = expiry;
  await db.customerTrackingLink.update({ where: { id }, data });
}

/** Turns the link off now. Anyone holding it sees "this link has expired". */
export async function revokeTrackingLink(db: PrismaClient, kind: LinkKind, id: string, userId: string | null, now = new Date()): Promise<boolean> {
  const data = { revokedAt: now, revoked_by: userId };
  if (kind === 'trip') {
    const r = await db.tripUpdateShare.updateMany({ where: { id, update_key: TRACKING_UPDATE_KEY, revokedAt: null }, data });
    return r.count > 0;
  }
  const r = await db.customerTrackingLink.updateMany({ where: { id, revokedAt: null }, data });
  return r.count > 0;
}

/**
 * A new link in place of this one (same trip / customer): the old one stops
 * working, the new one keeps its label, expiry choice and view settings.
 * Returns the new link's id, or null when tracking is off for the customer.
 */
export async function replaceTrackingLink(db: PrismaClient, kind: LinkKind, id: string, userId: string | null, now = new Date()): Promise<string | null> {
  if (kind === 'trip') {
    const row = await db.tripUpdateShare.findFirst({ where: { id, update_key: TRACKING_UPDATE_KEY }, select: { tripId: true } });
    if (!row) throw new LinkChangeError('Link not found', 404);
    const link = await ensureTrackingLink(db, row.tripId, { userId, renew: true, now });
    if (!link?.token) return null;
    const created = await db.tripUpdateShare.findUnique({ where: { token: link.token }, select: { id: true } });
    return created?.id ?? null;
  }
  const row = await db.customerTrackingLink.findUnique({ where: { id }, select: { customerId: true } });
  if (!row) throw new LinkChangeError('Link not found', 404);
  const link = await ensureCustomerTrackingLink(db, row.customerId, { userId, renew: true, now });
  if (!link?.token) return null;
  const created = await db.customerTrackingLink.findUnique({ where: { token: link.token }, select: { id: true } });
  return created?.id ?? null;
}
