/**
 * Puts one trip-log send (shared-types tripLog) on a stop: added to a stop the
 * trip already has, or made into a new stop in time order. Used by the office
 * (tripLogController.logEntryToStop) and by the driver on a customer-app trip
 * (mobileTripLog.driverPlaceLogEntry — "this screenshot is at <stop>", or an
 * unplanned stop the office didn't set).
 */
import { DocStatus, Prisma, StopType } from '@prisma/client';
import { tripLogEntries } from '@mercon/shared-types';
import { prisma } from '../db';

export class PlaceLogError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export interface PlaceLogInput {
  action: 'new' | 'attach';
  stop_id?: string;
  stop_type?: 'Pickup' | 'Dropoff';
  name?: string;
  /** Times read off the screenshots, confirmed by the operator. */
  arrive_at?: string;
  depart_at?: string;
  needs_check?: boolean;
  /** Who placed it — the office user (marks a confirmed read as checked), or null. */
  verifiedBy?: string | null;
  /** The driver placed it: kept as "to check" for the office, and tagged so. */
  byDriver?: boolean;
}

/** Where a stop sits in time: when it was reached, else when it was planned. */
const whenOf = (s: { actual_arrival: Date | null; planned_arrival: Date | null }) =>
  (s.actual_arrival ?? s.planned_arrival)?.getTime() ?? null;

export async function placeLogEntry(tripId: string, entry: string, input: PlaceLogInput): Promise<string> {
  const { action, stop_id, stop_type, name, arrive_at, depart_at, needs_check, verifiedBy = null, byDriver = false } = input;
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, deletedAt: null },
    select: {
      id: true,
      stops: {
        where: { deletedAt: null },
        orderBy: { stop_sequence: 'asc' },
        select: { id: true, stop_sequence: true, leg_index: true, actual_arrival: true, planned_arrival: true },
      },
    },
  });
  if (!trip) throw new PlaceLogError(404, 'NOT_FOUND', 'Trip not found');

  const docs = await prisma.document.findMany({
    where: { entity_type: 'Trip', entity_id: tripId, deletedAt: null, ai_extracted_json: { path: ['log_entry'], equals: entry } },
    select: { id: true, file_url: true, createdAt: true, ai_extracted_json: true },
  });
  const [e] = tripLogEntries(docs);
  if (!e) throw new PlaceLogError(404, 'NOT_FOUND', 'That update is not on this trip');
  const at = new Date(e.at);
  const arrival = arrive_at ? new Date(arrive_at) : null;
  const departure = depart_at ? new Date(depart_at) : null;
  if (arrival && departure && departure < arrival) throw new PlaceLogError(400, 'DEPARTURE_BEFORE_ARRIVAL', 'Left is before arrived');
  const placedAt = arrival ?? at;

  return prisma.$transaction(async (tx) => {
    let target: string;
    if (action === 'attach') {
      const stop = trip.stops.find((s) => s.id === stop_id);
      if (!stop) throw new PlaceLogError(400, 'UNKNOWN_STOP', 'That stop is not on this trip');
      if (arrival || departure) {
        // The operator confirmed these times: they are what gets saved.
        await tx.tripStop.update({ where: { id: stop.id }, data: { ...(arrival ? { actual_arrival: arrival } : {}), ...(departure ? { actual_departure: departure } : {}) } });
      } else {
        // Only fills an empty arrival — a time already set (or corrected) wins.
        await tx.tripStop.updateMany({ where: { id: stop.id, actual_arrival: null }, data: { actual_arrival: at } });
      }
      target = stop.id;
    } else {
      // The driver adds the stop they are at: right before the next stop not reached yet (planned
      // times are often already past). The office places a send in time order: before the first
      // stop that comes later than it.
      const lastReached = trip.stops.reduce((n, s, i) => (s.actual_arrival ? i : n), -1);
      const later = trip.stops.findIndex((s) => { const w = whenOf(s); return w != null && w > placedAt.getTime(); });
      const pos = byDriver ? lastReached + 1 : later === -1 ? trip.stops.length : later;
      const created = await tx.tripStop.create({
        data: {
          tripId,
          stop_sequence: trip.stops.length + 1,
          leg_index: (trip.stops[pos] ?? trip.stops[trip.stops.length - 1])?.leg_index ?? 0,
          stop_type: stop_type === 'Pickup' ? StopType.Pickup : StopType.Dropoff,
          location_name: (name?.trim() || e.place || 'Stop').slice(0, 120),
          location_lat: e.gps?.lat ?? null,
          location_lng: e.gps?.lng ?? null,
          actual_arrival: placedAt,
          ...(departure ? { actual_departure: departure } : {}),
        },
        select: { id: true },
      });
      const order = [...trip.stops.slice(0, pos).map((s) => s.id), created.id, ...trip.stops.slice(pos).map((s) => s.id)];
      for (const [i, sid] of order.entries()) {
        await tx.tripStop.update({ where: { id: sid }, data: { stop_sequence: i + 1 } });
      }
      target = created.id;
    }
    for (const d of e.docs) {
      const meta = (d.ai_extracted_json ?? {}) as Record<string, unknown>;
      await tx.document.update({
        where: { id: d.id },
        data: {
          ai_extracted_json: { ...meta, stop_id: target, ...(byDriver ? { placed_by: 'driver', ...(action === 'new' ? { added_by_driver: true } : {}) } : {}) } as Prisma.InputJsonValue,
          // A sure read, confirmed by the operator, is a checked time; an unsure one stays "to confirm".
          ...((arrival || departure) && !needs_check && !byDriver ? { status: DocStatus.Verified, verified_by: verifiedBy } : {}),
        },
      });
    }
    return target;
  });
}
