/**
 * Moving the other trips of one Create Trip (a month plan, a bulk booking) by
 * the same amount as the trip just edited — so a wrong date is fixed once,
 * not trip by trip.
 *
 * Trips aren't linked in the database; the ones one Create Trip made share the
 * customer and driver and were created within the same minute or two. Only
 * not-started ones (Draft / Scheduled) are offered.
 */
import { Alert } from 'react-native';
import { isLateToStart } from '@mercon/shared-types';
import { api, getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { operatorService, type OperatorTrip, type OperatorTripDetail, type UpdateTripRouteInput } from '../../../lib/operator';
import { sortedStops } from '../details/tripDetailsModel';

const MADE_TOGETHER_MS = 2 * 60_000;

/** The other not-started trips made by the same Create Trip as `trip`. */
type TripKey = { id: string; createdAt?: string | null; driver?: { id?: string } | null; customer?: { id?: string } | null };

export async function tripsMadeWith(trip: TripKey): Promise<OperatorTrip[]> {
  const driverId = trip.driver?.id;
  const customerId = trip.customer?.id;
  if (!driverId || !customerId || !trip.createdAt) return [];
  const { data } = await api.get('/trips', {
    params: { customer_id: customerId, driver_id: driverId, status: 'Draft,Scheduled', per_page: 200 },
  });
  const made = Date.parse(trip.createdAt);
  return ((data.data ?? []) as OperatorTrip[]).filter(
    (t) => t.id !== trip.id && t.createdAt && Math.abs(Date.parse(t.createdAt) - made) <= MADE_TOGETHER_MS && t.planned_start,
  );
}

const shift = (iso: string | null | undefined, ms: number) => (iso ? new Date(Date.parse(iso) + ms).toISOString() : undefined);

/** One trip, every time on it moved by `deltaMs` — places untouched. */
function movedRoute(t: OperatorTripDetail, deltaMs: number): UpdateTripRouteInput {
  const stops = sortedStops(t);
  return {
    planned_start: shift(t.planned_start, deltaMs),
    planned_end: shift(t.planned_end, deltaMs),
    isRound: stops.some((st) => (st.leg_index ?? 0) > 0),
    stops: stops.map((st) => ({
      stop_type: st.stop_type,
      leg_index: st.leg_index ?? 0,
      location_id: (st as unknown as { locationId?: string | null }).locationId ?? null,
      location_name: st.location_name ?? st.location?.name ?? '',
      lat: Number.isFinite(st.location_lat) ? st.location_lat : null,
      lng: Number.isFinite(st.location_lng) ? st.location_lng : null,
      planned_arrival: shift(st.planned_arrival, deltaMs) ?? null,
    })),
  };
}

export interface MoveResult {
  moved: number;
  failed: { ref: string; reason: string }[];
}

/**
 * Moves each trip by `deltaMs`. Later trips first when moving forward (earlier
 * first when moving back) so the plan never clashes with itself on the way.
 */
export async function moveTrips(
  trips: OperatorTrip[],
  deltaMs: number,
  /** The trip being edited, saved with the form's own payload in its turn. */
  edited?: { trip: { id: string; ref_id: string | null; planned_start?: string | null }; payload: UpdateTripRouteInput },
): Promise<MoveResult & { editedSaved: boolean; editedError?: unknown }> {
  type Item = { id: string; ref: string; start: number; payload?: UpdateTripRouteInput };
  const items: Item[] = trips.map((t) => ({ id: t.id, ref: t.ref_id ?? t.id.slice(0, 8), start: Date.parse(t.planned_start!) }));
  if (edited) items.push({ id: edited.trip.id, ref: edited.trip.ref_id ?? 'this trip', start: Date.parse(edited.trip.planned_start ?? '') || 0, payload: edited.payload });
  items.sort((a, b) => (a.start - b.start) * (deltaMs > 0 ? -1 : 1));
  const result: MoveResult & { editedSaved: boolean; editedError?: unknown } = { moved: 0, failed: [], editedSaved: false };
  for (const it of items) {
    try {
      const payload = it.payload ?? movedRoute(await operatorService.tripById(it.id), deltaMs);
      await operatorService.updateTripRoute(it.id, payload);
      if (it.payload) result.editedSaved = true;
      else result.moved++;
    } catch (e) {
      if (it.payload) result.editedError = e;
      else result.failed.push({ ref: it.ref, reason: getApiErrorMessage(e) });
    }
  }
  return result;
}

/** "1 day later", "2 days earlier", "3 h later". */
export function deltaText(ms: number): string {
  const later = ms > 0 ? 'later' : 'earlier';
  const abs = Math.abs(ms);
  const days = abs / 86_400_000;
  if (Number.isInteger(days)) return `${days} ${days === 1 ? 'day' : 'days'} ${later}`;
  const hours = Math.round(abs / 3_600_000);
  if (hours < 24) return `${hours} h ${later}`;
  return `${Math.floor(days)} d ${hours % 24} h ${later}`;
}

/** Soft-deletes trips (POST /trips/bulk-delete); invoiced or paid ones are kept and named. */
export async function deleteTrips(ids: string[]): Promise<{ deleted: number; kept: string[] }> {
  const { data } = await api.post('/trips/bulk-delete', { ids });
  const d = data?.data ?? {};
  return { deleted: Number(d.deletedCount ?? 0), kept: (d.skippedTrips ?? []).map((t: { ref_id?: string | null }) => t.ref_id ?? 'a trip') };
}

/** The warning before deleting a delivered trip — the API then tells the other Admins / Operators. */
export const COMPLETED_DELETE_WARNING =
  'This trip was delivered: the driver\u2019s photos and proof of delivery, its times and charges go with it, and the other operators get a notification.';

/**
 * A trip can be deleted from the app: not running (cancel it instead) and not invoiced.
 * A Delayed trip that hasn't reached its first stop ("Starting late") isn't running yet,
 * so it can be deleted too (TestFlight 31 Oct, build 141: "Starting late trips can't be
 * deleted" → "Make it possible").
 */
export const canDeleteTrip = (trip: Parameters<typeof isLateToStart>[0] & { status?: string | null }) =>
  ['Draft', 'Scheduled', 'Cancelled', 'Completed'].includes(trip?.status ?? '') || isLateToStart(trip);

/**
 * Asks, then deletes a trip — and, when other not-started trips were created
 * together with it (a month plan), offers to delete those too.
 */
export async function askDeleteTrip(
  trip: TripKey & { ref_id: string | null; status?: string | null },
  hooks: { busy?: (on: boolean) => void; deleted: () => void },
): Promise<void> {
  const others = await tripsMadeWith(trip).catch(() => [] as OperatorTrip[]);
  const remove = async (ids: string[]) => {
    hooks.busy?.(true);
    try {
      const r = await deleteTrips(ids);
      if (r.kept.length) Alert.alert(`Deleted ${r.deleted} of ${ids.length}`, `Kept because they are invoiced or paid: ${r.kept.join(', ')}`);
      hooks.deleted();
    } catch (e) {
      Alert.alert('Could not delete', getApiErrorMessage(e));
    } finally {
      hooks.busy?.(false);
    }
  };
  const what = trip.status === 'Completed'
    ? `${COMPLETED_DELETE_WARNING} Admins can restore it from Trash.`
    : 'It disappears from the trip lists, the driver app and the customer link. Admins can restore it from Trash.';
  Alert.alert(
    trip.status === 'Completed' ? `Delete completed trip ${trip.ref_id ?? ''}?`.replace(' ?', '?') : `Delete ${trip.ref_id ?? 'this trip'}?`,
    others.length
      ? `${what}\n\n${others.length} other not-started ${others.length === 1 ? 'trip was' : 'trips were'} created together with it (same customer and driver).`
      : what,
    [
      { text: 'Keep', style: 'cancel' },
      ...(others.length ? [{ text: `Delete all ${others.length + 1}`, style: 'destructive' as const, onPress: () => remove([trip.id, ...others.map((o) => o.id)]) }] : []),
      { text: others.length ? 'Only this trip' : 'Delete', style: 'destructive' as const, onPress: () => remove([trip.id]) },
    ],
  );
}
