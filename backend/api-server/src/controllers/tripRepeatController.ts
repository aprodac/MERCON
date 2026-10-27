import { Request, Response } from 'express';
import { z } from 'zod';
import { TripStatus } from '@prisma/client';
import { DISPATCH_RULES } from '@mercon/shared-types';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { createTrip, findScheduleClash } from './tripController';
import { deploymentTimezone, findSameDayTrips } from '../services/sameDayTrips';
import {
  REPEAT_MAX_SHIFT_MIN, REPEAT_MAX_TRIPS, copyTripBody, repeatBlocker, repeatSummary, shiftToDay,
  type RepeatClash, type RepeatResult, type SourceTrip,
} from '../services/repeatTrips';

export const repeatTripsBody = z.object({
  trip_ids: z.array(z.string().uuid()).min(1, 'Pick at least one trip').max(REPEAT_MAX_TRIPS),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date'),
  shift_minutes: z.coerce.number().int().min(-REPEAT_MAX_SHIFT_MIN).max(REPEAT_MAX_SHIFT_MIN).default(0),
  // Trips (by source id) whose clashes the operator has seen and wants created anyway.
  create_anyway_ids: z.array(z.string().uuid()).default([]),
});

const HOUR = 3_600_000;
const OPEN: TripStatus[] = [TripStatus.Scheduled, TripStatus.Loading, TripStatus.InTransit, TripStatus.Delayed, TripStatus.Draft];

/** What the existing guards say about booking this copy: double booking, rest hours, a second trip that day. */
async function clashesFor(body: ReturnType<typeof copyTripBody>, tz: string, batch: Set<string>): Promise<RepeatClash[]> {
  const out: RepeatClash[] = [];
  if (body.is_third_party) return out;
  const start = new Date(body.planned_start);
  const end = body.planned_end ? new Date(body.planned_end) : null;
  const driverIds = [body.driver_id, body.co_driver_id].filter((x): x is string => !!x);

  const overlap = await findScheduleClash({ tripId: null, start, end, driverIds, vehicleId: body.vehicle_id ?? null });
  if (overlap) out.push({ kind: 'double_booking', message: overlap.message });

  if (driverIds.length) {
    const prev = await prisma.trip.findFirst({
      where: {
        deletedAt: null, status: { in: OPEN }, planned_end: { lte: start, gt: new Date(start.getTime() - DISPATCH_RULES.minRestHours * HOUR) },
        OR: [{ driverId: { in: driverIds } }, { co_driver_id: { in: driverIds } }],
      },
      select: { ref_id: true, planned_end: true },
      orderBy: { planned_end: 'desc' },
    });
    if (prev?.planned_end) {
      const rest = Math.round(((start.getTime() - prev.planned_end.getTime()) / HOUR) * 10) / 10;
      out.push({ kind: 'rest', message: `Only ${rest} h rest after ${prev.ref_id ?? 'the driver’s previous trip'} (needs ${DISPATCH_RULES.minRestHours} h).` });
    }
    // A driver's other copies from this same run don't count as "already has a trip that day".
    const sameDay = (await findSameDayTrips([{ driverIds, plannedStart: body.planned_start }], tz))
      .map((c) => ({ ...c, trips: c.trips.filter((t) => !batch.has(t.id)) }))
      .filter((c) => c.trips.length);
    for (const c of sameDay) {
      out.push({ kind: 'same_day', message: `${c.driverName} already has ${c.trips.map((t) => t.ref_id ?? 'a trip').join(', ')} that day — this one waits until it's finished.` });
    }
  }
  return out;
}

/** Runs the ordinary create-trip handler and captures its answer. */
async function createVia(req: Request, body: unknown, allowScheduleClash: boolean): Promise<{ code: number; payload: any }> {
  let code = 200;
  let payload: any;
  const res: any = { status(c: number) { code = c; return res; }, json(p: unknown) { payload = p; return res; } };
  await createTrip({ user: (req as any).user, body, allowScheduleClash } as unknown as Request, res as Response);
  return { code, payload };
}

/**
 * POST /trips/repeat — copy trips onto another day at the same times of day.
 * Trips that clash (double booking, too little rest, a second trip that day)
 * come back as `clash` for the operator to confirm; resend those ids in
 * `create_anyway_ids` to create them regardless.
 */
export const repeatTrips = async (req: Request, res: Response) => {
  try {
    const { trip_ids, target_date, shift_minutes, create_anyway_ids } = req.body as z.infer<typeof repeatTripsBody>;
    const tz = await deploymentTimezone();
    const sources = await prisma.trip.findMany({
      where: { id: { in: trip_ids } },
      include: { stops: { where: { deletedAt: null } }, charges: true, subcontract: true },
    });
    const byId = new Map(sources.map((t) => [t.id, t]));
    const ordered = [...new Set(trip_ids)].map((id) => byId.get(id) ?? id)
      .sort((a, b) => (typeof a === 'string' ? 1 : 0) - (typeof b === 'string' ? 1 : 0)
        || (typeof a === 'string' || typeof b === 'string' ? 0 : (a.planned_start?.getTime() ?? 0) - (b.planned_start?.getTime() ?? 0)));

    const anyway = new Set(create_anyway_ids);
    const batch = new Set<string>();
    const results: RepeatResult[] = [];
    for (const t of ordered) {
      if (typeof t === 'string') { results.push({ trip_id: t, status: 'skipped', reason: 'The trip was not found' }); continue; }
      const blocked = repeatBlocker(t);
      if (blocked) { results.push({ trip_id: t.id, status: 'skipped', reason: blocked }); continue; }
      const body = copyTripBody(t as unknown as SourceTrip, { targetDay: target_date, shiftMin: shift_minutes, tz });
      if (new Date(body.planned_start).getTime() < Date.now() - 5 * 60_000) {
        results.push({ trip_id: t.id, status: 'skipped', reason: 'That time has already passed' });
        continue;
      }
      const force = anyway.has(t.id);
      if (!force) {
        const clashes = await clashesFor(body, tz, batch);
        if (clashes.length) { results.push({ trip_id: t.id, status: 'clash', clashes }); continue; }
      }
      const { code, payload } = await createVia(req, body, force);
      if (code === 201 && payload?.data?.id) {
        batch.add(payload.data.id);
        results.push({ trip_id: t.id, status: 'created', new_trip_id: payload.data.id, new_ref: payload.data.ref_id ?? null });
      } else {
        results.push({ trip_id: t.id, status: 'skipped', reason: payload?.error?.message || 'Could not create the trip' });
      }
    }
    res.json({ success: true, data: { results, summary: repeatSummary(results) } });
  } catch (err) {
    logger.error({ err }, 'repeatTrips error');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Could not repeat the trips' } });
  }
};

// Re-exported for tests.
export { shiftToDay };
