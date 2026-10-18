/**
 * Take a running trip back to an earlier step — the office's undo when the
 * driver tapped ahead by mistake (e.g. went through "delivered" and took the
 * delivery photos while still loading).
 *
 * A trip's progress is a fixed list of steps, each one a set of stop times the
 * driver app stamps (see tripLifecycle.stampWorkflowTransition):
 *
 *   0  Started the trip                      (no stop time — workflow GOING_TO_PICKUP)
 *   ·  Arrived at the pickup                 origin.actual_arrival
 *   ·  Loaded and left the pickup            origin.actual_departure
 *   ·  Stop at <place> done                  stop.actual_arrival + actual_departure (stamped together)
 *   ·  Arrived at the delivery               delivery.actual_arrival
 *   round trip:
 *   ·  Delivered — return loading started    delivery.actual_departure + return loading.actual_arrival
 *   ·  Loaded and left for the return        return loading.actual_departure
 *   ·  Return stops …, Arrived back at …     (as above, leg 1)
 *   last  Delivered — trip finished          final delivery.actual_departure (+ trip Completed)
 *
 * Going back to step k clears every time stamped by the steps after k, then
 * sets the trip's status and the driver app's workflow state to what they were
 * right after step k — so the driver's app lands on the screen for step k+1.
 * Photos uploaded after step k can move onto the step being redone (loading
 * photos that went in as delivery POD), be removed from the trip, or stay.
 */
import { DocType, TripStatus, type Prisma, type TripStop } from '@prisma/client';
import { getLegEndpoints, isRoundTrip } from '@mercon/shared-types';
import { prisma } from '../db';
import { markOnTrip, releaseDriversIfFree, releaseVehiclesIfFree } from './tripLifecycle';

type StopField = 'actual_arrival' | 'actual_departure';
type Role = 'pickup' | 'stop' | 'delivery';

export interface StepDef {
  key: string;
  label: string;
  /** What the driver does next once the trip is back right after this step. */
  next: string;
  marks: { stopId: string; field: StopField }[];
  /** Trip status and driver-app workflow state right after this step. */
  status: TripStatus;
  workflow: string | null;
  /** The stop and role of the step that follows — where photos taken later belong. */
  photoStop: { stopId: string; role: Role; leg: 0 | 1 } | null;
  /** The step that completes the trip. */
  completes?: boolean;
}

export interface ProgressStep {
  index: number;
  key: string;
  label: string;
  next: string;
  done: boolean;
  /** When the step was recorded (latest of its stop times). */
  at: string | null;
}

export interface TripProgressSteps {
  steps: ProgressStep[];
  /** Index of the last done step, -1 when the trip hasn't been started. */
  current: number;
  can_step_back: boolean;
  blocked_reason: string | null;
  /** For each step you could go back to: photos uploaded after it (they belong to undone steps). */
  photos_after: Record<number, number>;
}

export class StepBackError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const placeName = (s: Pick<TripStop, 'location_name'> | null | undefined) =>
  (s?.location_name || '').replace(/\[RETURN:.*?\]/gi, '').replace(/🔁\s*/g, '').split(',')[0].trim() || 'the stop';

type StopRow = TripStop;

export function buildSteps(stops: StopRow[]): StepDef[] {
  const sorted = [...stops].sort((a, b) => a.stop_sequence - b.stop_sequence);
  if (sorted.length === 0) return [];
  const round = isRoundTrip({ stops: sorted });
  const out = getLegEndpoints({ stops: sorted }, 0);
  const back = round ? getLegEndpoints({ stops: sorted }, 1) : null;
  const origin = (out.loading ?? sorted[0]) as StopRow;
  const delivery = (out.delivery ?? sorted[sorted.length - 1]) as StopRow;
  const outMids = (out.intermediates ?? []) as StopRow[];
  const retLoading = (back?.loading ?? null) as StopRow | null;
  const retDelivery = (back?.delivery ?? null) as StopRow | null;
  const retMids = (back?.intermediates ?? []) as StopRow[];
  const isRound = round && !!retLoading && !!retDelivery;

  const steps: StepDef[] = [];
  const firstMidOrDelivery = (mids: StopRow[], dest: StopRow, leg: 0 | 1) =>
    mids.length ? { stopId: mids[0].id, role: 'stop' as Role, leg } : { stopId: dest.id, role: 'delivery' as Role, leg };

  steps.push({
    key: 'started', label: 'Started the trip', next: `Arrive at ${placeName(origin)} for loading`,
    marks: [], status: TripStatus.Scheduled, workflow: 'GOING_TO_PICKUP',
    photoStop: { stopId: origin.id, role: 'pickup', leg: 0 },
  });
  steps.push({
    key: 'pickup_arrived', label: `Arrived at ${placeName(origin)} (loading)`, next: `Load and leave ${placeName(origin)}`,
    marks: [{ stopId: origin.id, field: 'actual_arrival' }], status: TripStatus.Loading, workflow: 'ARRIVED_AT_PICKUP',
    photoStop: { stopId: origin.id, role: 'pickup', leg: 0 },
  });
  steps.push({
    key: 'pickup_left', label: `Loaded and left ${placeName(origin)}`,
    next: outMids.length ? `Stop at ${placeName(outMids[0])}` : `Arrive at ${placeName(delivery)} for delivery`,
    marks: [{ stopId: origin.id, field: 'actual_departure' }], status: TripStatus.InTransit,
    workflow: outMids.length ? 'GOING_TO_STOP' : 'IN_TRANSIT',
    photoStop: firstMidOrDelivery(outMids, delivery, 0),
  });
  outMids.forEach((m, i) => {
    const more = i + 1 < outMids.length;
    steps.push({
      key: `stop_${m.id}`, label: `Stop at ${placeName(m)} done`,
      next: more ? `Stop at ${placeName(outMids[i + 1])}` : `Arrive at ${placeName(delivery)} for delivery`,
      marks: [{ stopId: m.id, field: 'actual_arrival' }, { stopId: m.id, field: 'actual_departure' }],
      status: TripStatus.InTransit, workflow: more ? `ARRIVED_AT_STOP_${i + 1}` : 'IN_TRANSIT',
      photoStop: more ? { stopId: outMids[i + 1].id, role: 'stop', leg: 0 } : { stopId: delivery.id, role: 'delivery', leg: 0 },
    });
  });
  steps.push({
    key: 'delivery_arrived', label: `Arrived at ${placeName(delivery)} (delivery)`,
    next: isRound ? `Unload at ${placeName(delivery)}, then return loading` : `Unload at ${placeName(delivery)} and finish`,
    marks: [{ stopId: delivery.id, field: 'actual_arrival' }], status: TripStatus.InTransit, workflow: 'ARRIVED_AT_DELIVERY',
    photoStop: { stopId: delivery.id, role: 'delivery', leg: 0 },
  });

  if (isRound && retLoading && retDelivery) {
    steps.push({
      key: 'return_loading', label: `Delivered at ${placeName(delivery)} — return loading started`,
      next: `Load and leave ${placeName(retLoading)} for the return`,
      marks: [{ stopId: delivery.id, field: 'actual_departure' }, { stopId: retLoading.id, field: 'actual_arrival' }],
      status: TripStatus.Loading, workflow: 'RETURN_LOADING',
      photoStop: { stopId: retLoading.id, role: 'pickup', leg: 1 },
    });
    steps.push({
      key: 'return_left', label: `Loaded and left ${placeName(retLoading)} (return)`,
      next: retMids.length ? `Stop at ${placeName(retMids[0])}` : `Arrive back at ${placeName(retDelivery)}`,
      marks: [{ stopId: retLoading.id, field: 'actual_departure' }], status: TripStatus.InTransit,
      workflow: retMids.length ? 'GOING_TO_RETURN_STOP' : 'IN_TRANSIT_RETURN',
      photoStop: firstMidOrDelivery(retMids, retDelivery, 1),
    });
    retMids.forEach((m, i) => {
      const more = i + 1 < retMids.length;
      steps.push({
        key: `stop_${m.id}`, label: `Return stop at ${placeName(m)} done`,
        next: more ? `Stop at ${placeName(retMids[i + 1])}` : `Arrive back at ${placeName(retDelivery)}`,
        marks: [{ stopId: m.id, field: 'actual_arrival' }, { stopId: m.id, field: 'actual_departure' }],
        status: TripStatus.InTransit, workflow: more ? `ARRIVED_AT_RETURN_STOP_${i + 1}` : 'IN_TRANSIT_RETURN',
        photoStop: more ? { stopId: retMids[i + 1].id, role: 'stop', leg: 1 } : { stopId: retDelivery.id, role: 'delivery', leg: 1 },
      });
    });
    steps.push({
      key: 'final_arrived', label: `Arrived back at ${placeName(retDelivery)}`, next: `Unload at ${placeName(retDelivery)} and finish`,
      marks: [{ stopId: retDelivery.id, field: 'actual_arrival' }], status: TripStatus.InTransit, workflow: 'ARRIVED_AT_FINAL_DELIVERY',
      photoStop: { stopId: retDelivery.id, role: 'delivery', leg: 1 },
    });
    steps.push({
      key: 'finished', label: `Unloaded at ${placeName(retDelivery)} — trip finished`, next: 'Nothing — the trip is finished',
      marks: [{ stopId: retDelivery.id, field: 'actual_departure' }], status: TripStatus.Completed, workflow: 'COMPLETED',
      photoStop: null, completes: true,
    });
  } else {
    steps.push({
      key: 'finished', label: `Delivered at ${placeName(delivery)} — trip finished`, next: 'Nothing — the trip is finished',
      marks: [{ stopId: delivery.id, field: 'actual_departure' }], status: TripStatus.Completed, workflow: 'COMPLETED',
      photoStop: null, completes: true,
    });
  }
  return steps;
}

type TripRow = Prisma.TripGetPayload<{ include: { stops: true } }>;

export function stepState(trip: TripRow, steps: StepDef[]) {
  const byId = new Map(trip.stops.map((s) => [s.id, s]));
  const stampOf = (m: { stopId: string; field: StopField }) => byId.get(m.stopId)?.[m.field] ?? null;
  const started = !!trip.driver_workflow_state && trip.driver_workflow_state !== 'ASSIGNED'
    || trip.stops.some((s) => s.actual_arrival || s.actual_departure)
    || trip.status !== TripStatus.Scheduled && trip.status !== TripStatus.Draft;
  return steps.map((st, i) => {
    const times = st.marks.map(stampOf).filter((d): d is Date => !!d);
    const done = i === 0 ? started : st.completes ? trip.status === TripStatus.Completed || times.length > 0 : times.length > 0;
    const at = times.length ? new Date(Math.max(...times.map((d) => d.getTime()))) : i === 0 ? trip.actual_start ?? null : null;
    return { done, at };
  });
}

async function loadTrip(db: Prisma.TransactionClient | typeof prisma, tripId: string): Promise<TripRow> {
  const trip = await db.trip.findFirst({
    where: { id: tripId, deletedAt: null },
    include: { stops: { where: { deletedAt: null }, orderBy: { stop_sequence: 'asc' } } },
  });
  if (!trip) throw new StepBackError(404, 'NOT_FOUND', 'Trip not found');
  return trip;
}

function blockedReason(trip: TripRow, current: number): string | null {
  if (trip.status === TripStatus.Invoiced) return 'The trip is invoiced — cancel or credit the invoice first.';
  if (trip.status === TripStatus.Cancelled) return 'The trip is cancelled.';
  if (trip.status === TripStatus.Draft) return 'The trip is a draft.';
  if (current < 0) return 'The driver hasn’t started this trip yet.';
  return null;
}

async function tripPhotos(db: Prisma.TransactionClient | typeof prisma, tripId: string) {
  return db.document.findMany({
    where: { entity_type: 'Trip', entity_id: tripId, deletedAt: null, doc_type: { in: [DocType.POD, DocType.Waybill] } },
    select: { id: true, createdAt: true, ai_extracted_json: true },
  });
}

/**
 * Photos taken after going back to `index` — they belong to the steps being undone. Photos already
 * on the stop being redone (the real loading photos when going back to "at loading") are not
 * touched; delay videos stay where they are.
 */
const photosAfter = <P extends { createdAt: Date; ai_extracted_json: unknown }>(photos: P[], at: Date | null, redoStopId: string | null): P[] =>
  photos.filter((p) => {
    const meta = (p.ai_extracted_json ?? {}) as { operation?: unknown; stop_id?: unknown };
    if (String(meta.operation ?? '').includes('delay')) return false;
    if (redoStopId && meta.stop_id === redoStopId) return false;
    return !at || p.createdAt > at;
  });

/** The stop the driver redoes after going back to step `index` (-1 = not started → the pickup). */
const redoStopOf = (steps: StepDef[], index: number) => (index >= 0 ? steps[index]?.photoStop : steps[0]?.photoStop) ?? null;

export async function getTripProgressSteps(tripId: string): Promise<TripProgressSteps> {
  const trip = await loadTrip(prisma, tripId);
  const steps = buildSteps(trip.stops);
  const state = stepState(trip, steps);
  let current = -1;
  state.forEach((s, i) => { if (s.done) current = i; });
  const photos = await tripPhotos(prisma, tripId);
  const photos_after: Record<number, number> = {};
  for (let i = -1; i < current; i++) photos_after[i] = photosAfter(photos, i >= 0 ? state[i].at : null, redoStopOf(steps, i)?.stopId ?? null).length;
  const blocked = blockedReason(trip, current);
  return {
    steps: steps.map((st, i) => ({ index: i, key: st.key, label: st.label, next: st.next, done: state[i].done, at: state[i].at?.toISOString() ?? null })),
    current,
    can_step_back: !blocked,
    blocked_reason: blocked,
    photos_after,
  };
}

export type PhotoChoice = 'move' | 'remove' | 'keep';

export interface StepBackResult {
  trip_id: string;
  from: { index: number; label: string };
  to: { index: number; label: string; next: string };
  cleared: number;
  /** `removed_at`: the tag on removed photos — POST /trips/:id/step-back/restore-photos brings them back. */
  photos: { choice: PhotoChoice; count: number; moved_to: string | null; removed_at?: string | null };
  driver_id: string | null;
}

/** Go back to step `toIndex` (-1 = before the driver started). */
export async function stepBackTrip(tripId: string, toIndex: number, photoChoice: PhotoChoice, userId: string | null): Promise<StepBackResult> {
  return prisma.$transaction(async (tx) => {
    const trip = await loadTrip(tx, tripId);
    const steps = buildSteps(trip.stops);
    const state = stepState(trip, steps);
    let current = -1;
    state.forEach((s, i) => { if (s.done) current = i; });

    const blocked = blockedReason(trip, current);
    if (blocked) throw new StepBackError(409, 'CANNOT_STEP_BACK', blocked);
    if (!Number.isInteger(toIndex) || toIndex < -1 || toIndex >= current) {
      throw new StepBackError(400, 'VALIDATION_ERROR', 'Pick a step before where the trip is now');
    }

    // 1. Clear every stop time the undone steps stamped.
    let cleared = 0;
    for (const st of steps.slice(toIndex + 1, current + 1)) {
      for (const m of st.marks) {
        const r = await tx.tripStop.updateMany({ where: { id: m.stopId, tripId, [m.field]: { not: null } }, data: { [m.field]: null } });
        cleared += r.count;
      }
    }

    // 2. Trip status + driver-app state as they were right after the target step.
    const target = toIndex >= 0 ? steps[toIndex] : null;
    let status: TripStatus = target ? target.status : TripStatus.Scheduled;
    // Delayed is the office's flag on a running trip — keep it while still on the road.
    if (trip.status === TripStatus.Delayed && (status === TripStatus.Loading || status === TripStatus.InTransit)) status = TripStatus.Delayed;
    const leftPickup = toIndex >= 2; // "Loaded and left" sets actual_start
    await tx.trip.update({
      where: { id: tripId },
      data: {
        status,
        driver_workflow_state: target ? target.workflow : null,
        actual_start: leftPickup ? trip.actual_start : null,
        // Reopened: the end time and "extra charges answered" are asked again on completion.
        ...(trip.status === TripStatus.Completed ? { actual_end: null, is_post_trip_settled: false } : {}),
        updated_by: userId ?? undefined,
      },
    });

    // 3. Driver and truck: on the road again, or free if back before the trip started moving.
    if (status === TripStatus.Scheduled) {
      await releaseDriversIfFree(tx, [trip.driverId, trip.co_driver_id], [tripId]);
      await releaseVehiclesIfFree(tx, [trip.vehicleId], [tripId]);
    } else {
      await markOnTrip(tx, trip);
    }

    // 4. Photos taken during the undone steps.
    const stepAt = new Date().toISOString();
    const redo = redoStopOf(steps, toIndex);
    const photos = photosAfter(await tripPhotos(tx, tripId), target ? state[toIndex].at : null, redo?.stopId ?? null);
    let movedTo: string | null = null;
    if (photos.length && photoChoice === 'move' && redo) {
      const stop = trip.stops.find((s) => s.id === redo.stopId);
      movedTo = placeName(stop);
      const docType = redo.role === 'delivery' ? DocType.POD : DocType.Waybill;
      const operation = redo.role === 'delivery' ? 'delivery' : redo.role === 'stop' ? 'intermediate' : redo.leg === 1 ? 'return_loading' : 'pickup';
      for (const p of photos) {
        const meta = (p.ai_extracted_json ?? {}) as Record<string, unknown>;
        await tx.document.update({
          where: { id: p.id },
          data: {
            doc_type: docType,
            ai_extracted_json: { ...meta, stop_id: redo.stopId, leg_index: redo.leg, operation, moved_by_step_back: { from_stop_id: meta.stop_id ?? null, at: new Date().toISOString() } } as Prisma.InputJsonValue,
            updated_by: userId ?? undefined,
          },
        });
      }
    } else if (photos.length && photoChoice === 'remove') {
      // Soft-deleted and tagged with this step-back, so "Restore" can bring exactly these back.
      for (const p of photos) {
        const meta = (p.ai_extracted_json ?? {}) as Record<string, unknown>;
        await tx.document.update({
          where: { id: p.id },
          data: {
            deletedAt: new Date(stepAt),
            deleted_by: userId ?? undefined,
            ai_extracted_json: { ...meta, removed_by_step_back: { at: stepAt } } as Prisma.InputJsonValue,
          },
        });
      }
    }

    return {
      trip_id: tripId,
      from: { index: current, label: steps[current].label },
      to: { index: toIndex, label: target ? target.label : 'Not started', next: target ? target.next : 'Start the trip' },
      cleared,
      photos: { choice: photos.length ? photoChoice : 'keep', count: photos.length, moved_to: movedTo, removed_at: photos.length && photoChoice === 'remove' ? stepAt : null },
      driver_id: trip.driverId,
    };
  });
}

export interface StepForwardResult {
  trip_id: string;
  from: { index: number; label: string };
  to: { index: number; label: string; next: string };
  driver_id: string | null;
}

/**
 * The office moves the trip on one step for the driver (TestFlight feedback:
 * "operator can also undo the step of driver and also make it next step").
 * The exact reverse of a step-back: stamps now on the stop times that step
 * records, and sets the status and driver-app state it leaves behind. The
 * step that finishes the trip is not done here — Confirm delivery does that,
 * since it also makes the invoice.
 */
/**
 * Mark the trip's next step done for the driver — or, with `toIndex`, every
 * step up to that one (TestFlight: "mark next should reach any step"). Never
 * the step that finishes the trip: that stays with Confirm delivery.
 */
export async function stepForwardTrip(tripId: string, userId: string | null, toIndex?: number): Promise<StepForwardResult> {
  return prisma.$transaction(async (tx) => {
    const trip = await loadTrip(tx, tripId);
    const steps = buildSteps(trip.stops);
    const state = stepState(trip, steps);
    let current = -1;
    state.forEach((s, i) => { if (s.done) current = i; });

    if (trip.status === TripStatus.Invoiced || trip.status === TripStatus.Cancelled || trip.status === TripStatus.Completed) {
      throw new StepBackError(409, 'CANNOT_STEP_FORWARD', `The trip is ${trip.status === TripStatus.Cancelled ? 'cancelled' : 'already finished'}.`);
    }
    if (trip.status === TripStatus.Draft) throw new StepBackError(409, 'CANNOT_STEP_FORWARD', 'The trip is a draft — schedule it first.');
    const to = toIndex ?? current + 1;
    if (to <= current) throw new StepBackError(409, 'CANNOT_STEP_FORWARD', 'That step is already done — use Go back to undo steps.');
    const next = steps[to];
    if (!next) throw new StepBackError(409, 'CANNOT_STEP_FORWARD', 'The trip has no further step.');
    if (next.completes) throw new StepBackError(409, 'USE_CONFIRM_DELIVERY', 'The last step finishes the trip — use Confirm delivery.');

    const now = new Date();
    for (const st of steps.slice(current + 1, to + 1)) {
      for (const m of st.marks) {
        await tx.tripStop.updateMany({ where: { id: m.stopId, tripId, [m.field]: null }, data: { [m.field]: now } });
      }
    }
    let status: TripStatus = next.status;
    // Delayed is the office's flag on a running trip — keep it while still on the road.
    if (trip.status === TripStatus.Delayed && (status === TripStatus.Loading || status === TripStatus.InTransit)) status = TripStatus.Delayed;
    await tx.trip.update({
      where: { id: tripId },
      data: {
        status,
        driver_workflow_state: next.workflow,
        // "Loaded and left" is when the trip started moving.
        ...(steps.slice(current + 1, to + 1).some((st) => st.key === 'pickup_left') && !trip.actual_start ? { actual_start: now } : {}),
        updated_by: userId ?? undefined,
      },
    });
    if (status !== TripStatus.Scheduled) await markOnTrip(tx, trip);

    return {
      trip_id: tripId,
      from: { index: current, label: current >= 0 ? steps[current].label : 'Not started' },
      to: { index: to, label: next.label, next: next.next },
      driver_id: trip.driverId,
    };
  });
}

/** Bring back the photos a step-back removed (tagged with its time). Returns how many came back. */
export async function restoreStepBackPhotos(tripId: string, removedAt: string, userId: string | null): Promise<number> {
  const docs = await prisma.document.findMany({
    where: {
      entity_type: 'Trip',
      entity_id: tripId,
      deletedAt: { not: null },
      ai_extracted_json: { path: ['removed_by_step_back', 'at'], equals: removedAt },
    },
    select: { id: true, ai_extracted_json: true },
  });
  for (const d of docs) {
    const { removed_by_step_back: _gone, ...meta } = (d.ai_extracted_json ?? {}) as Record<string, unknown>;
    await prisma.document.update({
      where: { id: d.id },
      data: { deletedAt: null, deleted_by: null, updated_by: userId ?? undefined, ai_extracted_json: meta as Prisma.InputJsonValue },
    });
  }
  return docs.length;
}

/** How many photos removed by that step-back are still removed (0 once restored). */
export async function countStepBackRemoved(tripId: string, removedAt: string): Promise<number> {
  return prisma.document.count({
    where: {
      entity_type: 'Trip',
      entity_id: tripId,
      deletedAt: { not: null },
      ai_extracted_json: { path: ['removed_by_step_back', 'at'], equals: removedAt },
    },
  });
}
