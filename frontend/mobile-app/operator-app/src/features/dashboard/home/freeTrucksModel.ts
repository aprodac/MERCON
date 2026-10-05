/**
 * Home's "Free trucks": every active truck not on a running trip and not in
 * the workshop, grouped by class (3-4 TON, 5 TON …, the same classes Create
 * Trip uses), with what a dispatcher needs before booking it. Pure.
 */
import { truckClassOfVehicle } from '@mercon/shared-types';
import type { ExpiryItem, LiveUnit, OperatorVehicleOption } from '../../../lib/operator';
import { onTrip } from '../../fleet/fleetModel';

/** A document expiring within this many days shows on the card. */
const DOC_DAYS = 14;

export interface FreeTruck {
  unit: LiveUnit;
  vehicle: NonNullable<LiveUnit['vehicle']>;
  truckClass: string;
  capacityKg: number | null;
  /** A scheduled trip this truck already has (it's free until then). */
  nextTripAt: string | null;
  /** GPS reported in the last few minutes. */
  gpsLive: boolean;
  /** The soonest-expiring truck document, when one is close. */
  doc: { label: string; days: number } | null;
}

export interface TruckClassCount {
  truckClass: string;
  free: number;
  total: number;
}

const BUSY_STATUSES = ['Maintenance', 'Inactive'];

export function freeTrucks(units: LiveUnit[], details: OperatorVehicleOption[], expiries: ExpiryItem[]) {
  const byId = new Map(details.map((v) => [v.id, v]));
  const trucks = units.filter((u) => u.vehicle);
  const classOf = (u: LiveUnit) => {
    const d = byId.get(u.vehicle!.id);
    return truckClassOfVehicle({ capacity_kg: d?.capacity_kg ?? null, asset_type: d?.asset_type ?? u.vehicle!.asset_type }) || 'Other';
  };

  const free: FreeTruck[] = trucks
    .filter((u) => !onTrip(u) && !BUSY_STATUSES.includes(u.vehicle!.status))
    .map((u) => {
      const v = u.vehicle!;
      const docs = expiries
        .filter((e) => e.entity_type === 'Vehicle' && e.entity_id === v.id && e.days <= DOC_DAYS)
        .sort((a, b) => a.days - b.days);
      return {
        unit: u,
        vehicle: v,
        truckClass: classOf(u),
        capacityKg: byId.get(v.id)?.capacity_kg ?? null,
        nextTripAt: u.trip?.phase === 'upcoming' ? u.trip.planned_start : null,
        gpsLive: !!u.position?.fresh,
        doc: docs[0] ? { label: docs[0].label, days: docs[0].days } : null,
      };
    })
    // Ready first: a driver, then nothing booked, then no document trouble.
    .sort((a, b) =>
      Number(!a.unit.driver) - Number(!b.unit.driver)
      || Number(!!a.nextTripAt) - Number(!!b.nextTripAt)
      || Number(!!a.doc && a.doc.days < 0) - Number(!!b.doc && b.doc.days < 0)
      || a.vehicle.plate_number.localeCompare(b.vehicle.plate_number));

  const counts = new Map<string, TruckClassCount>();
  for (const u of trucks) {
    const c = classOf(u);
    const row = counts.get(c) ?? { truckClass: c, free: 0, total: 0 };
    row.total += 1;
    counts.set(c, row);
  }
  for (const t of free) counts.get(t.truckClass)!.free += 1;
  const classes = [...counts.values()].sort((a, b) => a.truckClass.localeCompare(b.truckClass, undefined, { numeric: true }));

  return { free, classes, total: trucks.length };
}
