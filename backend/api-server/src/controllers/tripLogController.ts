/**
 * Office side of the trip log (shared-types tripLog): a customer-app trip's
 * driver sends screenshots without stops; here the office turns one entry into
 * a stop, or adds it to a stop the trip already has. The entry's screenshots
 * then sit on that stop, so Check times and the stop's photos work as usual.
 */
import { Request, Response } from 'express';
import { Prisma, StopType } from '@prisma/client';
import { tripLogEntries } from '@mercon/shared-types';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { isUuid } from '../utils/uuid';
import { resolveTripId } from './tripController';

/** Where a stop sits in time: when it was reached, else when it was planned. */
const whenOf = (s: { actual_arrival: Date | null; planned_arrival: Date | null }) =>
  (s.actual_arrival ?? s.planned_arrival)?.getTime() ?? null;

export const logEntryToStop = async (req: Request, res: Response) => {
  try {
    const raw = req.params.id as string;
    const entry = req.params.entry as string;
    const tripId = isUuid(raw) ? raw : await resolveTripId(raw);
    if (!tripId) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    const { action, stop_id, stop_type, name } = req.body as {
      action: 'new' | 'attach'; stop_id?: string; stop_type?: 'Pickup' | 'Dropoff'; name?: string;
    };

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
    if (!trip) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });

    const docs = await prisma.document.findMany({
      where: { entity_type: 'Trip', entity_id: tripId, deletedAt: null, ai_extracted_json: { path: ['log_entry'], equals: entry } },
      select: { id: true, file_url: true, createdAt: true, ai_extracted_json: true },
    });
    const [e] = tripLogEntries(docs);
    if (!e) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'That update is not on this trip' } });
    const at = new Date(e.at);

    const stopId = await prisma.$transaction(async (tx) => {
      let target: string;
      if (action === 'attach') {
        const stop = trip.stops.find((s) => s.id === stop_id);
        if (!stop) throw new Error('UNKNOWN_STOP');
        // Only fills an empty arrival — a time already set (or corrected) wins.
        await tx.tripStop.updateMany({ where: { id: stop.id, actual_arrival: null }, data: { actual_arrival: at } });
        target = stop.id;
      } else {
        // In time order: before the first stop that comes later than this entry.
        const later = trip.stops.findIndex((s) => { const w = whenOf(s); return w != null && w > at.getTime(); });
        const pos = later === -1 ? trip.stops.length : later;
        const created = await tx.tripStop.create({
          data: {
            tripId,
            stop_sequence: trip.stops.length + 1,
            leg_index: (trip.stops[pos] ?? trip.stops[trip.stops.length - 1])?.leg_index ?? 0,
            stop_type: stop_type === 'Pickup' ? StopType.Pickup : StopType.Dropoff,
            location_name: (name?.trim() || e.place || 'Stop').slice(0, 120),
            location_lat: e.gps?.lat ?? null,
            location_lng: e.gps?.lng ?? null,
            actual_arrival: at,
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
        await tx.document.update({ where: { id: d.id }, data: { ai_extracted_json: { ...meta, stop_id: target } as Prisma.InputJsonValue } });
      }
      return target;
    });

    res.json({ success: true, data: { stop_id: stopId } });
  } catch (error: any) {
    if (error?.message === 'UNKNOWN_STOP') {
      return res.status(400).json({ success: false, error: { code: 'UNKNOWN_STOP', message: 'That stop is not on this trip' } });
    }
    logger.error({ err: error }, 'logEntryToStop error:');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to make the stop' } });
  }
};
