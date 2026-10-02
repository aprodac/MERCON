/**
 * The customer-wide tracking page: one link per customer showing every truck
 * of theirs that is on the road, about to load, or just delivered. Built for
 * monthly contracts (JD, iMile) where the customer bookmarks one page instead
 * of collecting a link per trip.
 *
 * Each truck is the same customer view as the trip page (`buildTripTracking`,
 * cached per trip), cut down to a card, with the trip's own tracking token so
 * the customer can open the full page. The same per-customer settings apply.
 */
import type { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import { newShareToken } from '../operatorInbox';
import {
  CUSTOMER_TRACKING_SELECT, TRACKING_META_SELECT, buildTripTracking, ensureTrackingLink, loadTrackingContext,
  optionsOf, type PublicTracking, type TrackingBrand, type TrackingCustomerSettings, type TrackingOptions, type TrackingTripMeta,
} from './customerTracking';

/** Scheduled trips show up this long before they're due to start. */
export const UPCOMING_WINDOW_MS = 24 * 60 * 60_000;
/** Delivered trips stay on the page this long after finishing. */
export const RECENTLY_DONE_MS = 12 * 60 * 60_000;
/** Cap on trucks per page — keeps the page and the routing behind it bounded. */
export const MAX_FLEET_TRUCKS = 40;
const FLEET_TTL_MS = 30_000;
const FLEET_CONCURRENCY = 4;

export interface FleetTruck {
  /** The trip's own tracking token — opens /t/:token. */
  token: string;
  ref: string | null;
  phase: PublicTracking['trip']['phase'];
  plate: string | null;
  type: string | null;
  driver_first_name: string | null;
  position: PublicTracking['position'];
  next_stop_name: string | null;
  last_stop_name: string | null;
  eta: { arrival: string; seconds: number } | null;
  eta_gap: PublicTracking['eta_gap'];
  punctuality: PublicTracking['punctuality'];
  delay: PublicTracking['delay'];
  progress_pct: number | null;
  stops_done: number;
  stops_total: number;
  planned_start: string | null;
  finished_at: string | null;
}

export interface CustomerFleetTracking {
  brand: TrackingBrand;
  timezone: string;
  options: TrackingOptions;
  customer: { name: string };
  trucks: FleetTruck[];
  generated_at: string;
}

/** Which of a customer's trips belong on the page right now. */
export function fleetTripFilter(customerId: string, now: Date) {
  return {
    customerId,
    deletedAt: null,
    OR: [
      { status: { in: ['Loading', 'InTransit', 'Delayed'] as never[] } },
      { status: 'Scheduled' as never, OR: [{ planned_start: null }, { planned_start: { lte: new Date(now.getTime() + UPCOMING_WINDOW_MS) } }] },
      { status: { in: ['Completed', 'Invoiced'] as never[] }, actual_end: { gte: new Date(now.getTime() - RECENTLY_DONE_MS) } },
    ],
  };
}

const PHASE_ORDER: Record<string, number> = { active: 0, planned: 1, done: 2, cancelled: 3 };

export function toFleetTruck(token: string, t: PublicTracking): FleetTruck {
  const next = t.next_stop_index != null ? t.stops[t.next_stop_index] : null;
  return {
    token,
    ref: t.trip.ref,
    phase: t.trip.phase,
    plate: t.vehicle.plate,
    type: t.vehicle.type,
    driver_first_name: t.driver_first_name,
    position: t.position,
    next_stop_name: next?.name ?? null,
    last_stop_name: t.stops.length ? t.stops[t.stops.length - 1].name : null,
    eta: t.eta ? { arrival: t.eta.arrival, seconds: t.eta.seconds } : null,
    eta_gap: t.eta_gap,
    punctuality: t.punctuality,
    delay: t.delay,
    progress_pct: t.progress?.pct ?? null,
    stops_done: t.stops.filter((s) => s.state === 'done').length,
    stops_total: t.stops.length,
    planned_start: t.trip.planned_start,
    finished_at: t.trip.finished_at,
  };
}

/** On the road first, then about to load (soonest first), then delivered. */
export function sortFleet(trucks: FleetTruck[]): FleetTruck[] {
  return [...trucks].sort((a, b) =>
    (PHASE_ORDER[a.phase] ?? 9) - (PHASE_ORDER[b.phase] ?? 9) ||
    (a.eta?.arrival ?? a.planned_start ?? '').localeCompare(b.eta?.arrival ?? b.planned_start ?? ''),
  );
}

const fleetCache = new Map<string, { at: number; data: CustomerFleetTracking }>();

export type FleetLookup =
  | { state: 'ok'; data: CustomerFleetTracking }
  | { state: 'not_found' | 'expired' | 'disabled' };

export async function loadCustomerFleetTracking(
  db: PrismaClient,
  token: string,
  opts: { now?: Date; countView?: boolean } = {},
): Promise<FleetLookup> {
  const now = opts.now ?? new Date();
  if (token.length < 16 || token.length > 64) return { state: 'not_found' };
  const link = await db.customerTrackingLink.findUnique({
    where: { token },
    select: { id: true, revokedAt: true, customer: { select: { id: true, name: true, deletedAt: true, ...CUSTOMER_TRACKING_SELECT } } },
  });
  if (!link || link.customer.deletedAt) return { state: 'not_found' };
  if (link.revokedAt) return { state: 'expired' };
  if (!link.customer.tracking_enabled) return { state: 'disabled' };

  if (opts.countView) {
    db.customerTrackingLink
      .update({ where: { id: link.id }, data: { open_count: { increment: 1 }, last_opened_at: now } })
      .catch((err) => logger.warn({ err }, '[tracking] could not record a customer page open'));
  }

  const cached = fleetCache.get(link.customer.id);
  if (cached && now.getTime() - cached.at < FLEET_TTL_MS) return { state: 'ok', data: cached.data };

  const [ctx, trips] = await Promise.all([
    loadTrackingContext(db),
    db.trip.findMany({
      where: fleetTripFilter(link.customer.id, now),
      select: { id: true, ...TRACKING_META_SELECT },
      orderBy: { planned_start: 'asc' },
      take: MAX_FLEET_TRUCKS,
    }),
  ]);

  // A few trucks at a time: each may need a road route, and the routing
  // provider shouldn't get forty requests at once on a cold cache.
  const trucks: FleetTruck[] = [];
  const queue = [...trips];
  const worker = async () => {
    for (let trip = queue.shift(); trip; trip = queue.shift()) {
      const [tracking, tripLink] = await Promise.all([
        buildTripTracking(db, trip.id, trip as unknown as TrackingTripMeta & { customer: TrackingCustomerSettings | null }, ctx, now),
        ensureTrackingLink(db, trip.id, { userId: null, now }),
      ]);
      if (tracking && tripLink?.token) trucks.push(toFleetTruck(tripLink.token, tracking));
    }
  };
  await Promise.all(Array.from({ length: FLEET_CONCURRENCY }, worker));

  const data: CustomerFleetTracking = {
    brand: ctx.brand,
    timezone: ctx.timezone,
    options: optionsOf(link.customer),
    customer: { name: link.customer.name },
    trucks: sortFleet(trucks),
    generated_at: now.toISOString(),
  };
  if (fleetCache.size > 200) fleetCache.clear();
  fleetCache.set(link.customer.id, { at: now.getTime(), data });
  return { state: 'ok', data };
}

export interface CustomerTrackingLinkInfo {
  enabled: boolean;
  token: string | null;
  created: boolean;
  open_count: number;
  last_opened_at: string | null;
}

/** The customer's page link, created on first ask; `renew` revokes the current one and issues a new one. */
export async function ensureCustomerTrackingLink(
  db: PrismaClient,
  customerId: string,
  opts: { userId: string | null; renew?: boolean; now?: Date },
): Promise<CustomerTrackingLinkInfo | null> {
  const now = opts.now ?? new Date();
  const customer = await db.customer.findFirst({ where: { id: customerId, deletedAt: null }, select: { tracking_enabled: true } });
  if (!customer) return null;
  if (!customer.tracking_enabled) return { enabled: false, token: null, created: false, open_count: 0, last_opened_at: null };

  if (opts.renew) {
    await db.customerTrackingLink.updateMany({ where: { customerId, revokedAt: null }, data: { revokedAt: now } });
  } else {
    const existing = await db.customerTrackingLink.findFirst({
      where: { customerId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { token: true, open_count: true, last_opened_at: true },
    });
    if (existing) {
      return { enabled: true, token: existing.token, created: false, open_count: existing.open_count, last_opened_at: existing.last_opened_at?.toISOString() ?? null };
    }
  }
  const row = await db.customerTrackingLink.create({
    data: { customerId, token: newShareToken(), created_by: opts.userId },
    select: { token: true },
  });
  return { enabled: true, token: row.token, created: true, open_count: 0, last_opened_at: null };
}
