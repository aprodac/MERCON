/**
 * Who to offer on step 3, and why — the web wizard's rules
 * (useCreateTripForm driverOptions / vehicleOptions):
 *  - drivers keep the server ranking's order and groups (rankDrivers), with its
 *    "why" chips; only "can't take this trip" (clash, rest) blocks a driver.
 *    Still running another trip only warns (owner decision 2026-10-03).
 *  - trucks follow the class compatibility rules (preferred / allowed); a truck
 *    on another trip warns, one in the workshop or out of service is blocked.
 */
import { DISPATCH_RULES, DRIVER_GROUP_LABELS, normalizeTruckClass, truckClassOfVehicle, type DriverGroup } from '@mercon/shared-types';
import type { OperatorDriverOption, OperatorVehicleOption, RecommendedDriver, VehicleCompatibilityRule } from '../../../lib/operator';

export type ChipTone = 'neutral' | 'success' | 'warning' | 'accent';
export interface FactChip {
  label: string;
  tone: ChipTone;
}

export interface DriverChoice {
  driver: OperatorDriverOption;
  group: DriverGroup;
  groupLabel: string;
  blocked: boolean;
  /** "Free", "On a trip", "Booked", "Resting", "Unavailable". */
  statusLabel: string;
  chips: FactChip[];
  rec?: RecommendedDriver;
}

const toneOf = (t?: string): ChipTone => (t === 'good' ? 'success' : t === 'warn' ? 'warning' : 'neutral');

/** "Sun 5 Oct 14:00" in the deployment timezone. */
export function fmtClash(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function driverChoices(
  drivers: OperatorDriverOption[],
  recommended: RecommendedDriver[],
  opts: { tz: string; origin?: string; destination?: string; keepId?: string },
): DriverChoice[] {
  const rank = new Map(recommended.map((r, i) => [r.driverId, i]));
  const recOf = new Map(recommended.map((r) => [r.driverId, r]));
  const bestLabel = opts.origin && opts.destination ? `Best for ${opts.origin} → ${opts.destination}` : DRIVER_GROUP_LABELS.best;
  const unavailableLabel = `${DRIVER_GROUP_LABELS.unavailable} · needs ${DISPATCH_RULES.minRestHours} h rest and ${DISPATCH_RULES.bufferHours} h between trips`;

  return drivers
    .filter((d) => d.id && !`${d.first_name || ''} ${d.last_name || ''}`.toLowerCase().includes('audit'))
    .map((d): DriverChoice => {
      const rec = recOf.get(d.id);
      // Not ranked (the ranking didn't answer): offered, never blocked.
      const group: DriverGroup = rec?.group ?? 'other';
      const unavailable = group === 'unavailable';
      const openTrips = rec?.openTrips ?? [];
      const chips: FactChip[] = [];
      if (unavailable && rec?.unavailabilityReason) {
        chips.push({ label: rec.clashStart ? `Booked ${fmtClash(rec.clashStart, opts.tz)}` : rec.unavailabilityReason, tone: 'warning' });
      }
      if (!unavailable && openTrips.length) {
        const first = openTrips[0];
        chips.push({
          label: `Still on ${first.ref ?? 'a trip'} (${first.status === 'InTransit' ? 'In transit' : first.status})${openTrips.length > 1 ? ` +${openTrips.length - 1}` : ''}`,
          tone: 'warning',
        });
      }
      (rec?.reasons ?? []).forEach((r) => chips.push({ label: r.text, tone: toneOf(r.tone) }));
      const reason = rec?.unavailabilityReason || '';
      return {
        driver: d,
        group,
        groupLabel: group === 'best' ? bestLabel : group === 'unavailable' ? unavailableLabel : DRIVER_GROUP_LABELS[group],
        blocked: unavailable && d.id !== opts.keepId,
        statusLabel: unavailable ? (reason.startsWith('Only') ? 'Resting' : reason.startsWith('Already') ? 'Booked' : 'Unavailable') : openTrips.length ? 'On a trip' : 'Free',
        chips,
        rec,
      };
    })
    .sort((a, b) => (rank.get(a.driver.id) ?? 1e6) - (rank.get(b.driver.id) ?? 1e6) || `${a.driver.first_name}`.localeCompare(`${b.driver.first_name}`));
}

/** Up to three drivers to offer straight away: the best matches, else the first free ranked ones. */
export function topPicks(choices: DriverChoice[]): { picks: DriverChoice[]; best: boolean } {
  const ranked = choices.filter((c) => c.rec && !c.blocked);
  const best = ranked.filter((c) => c.group === 'best');
  return best.length ? { picks: best.slice(0, 3), best: true } : { picks: ranked.slice(0, 3), best: false };
}

export interface TruckChoice {
  vehicle: OperatorVehicleOption;
  cls: string;
  group: string;
  blocked: boolean;
  chips: FactChip[];
}

const GROUP_ORDER = ['Recommended', 'Preferred', 'Allowed alternatives', 'Other classes', 'Available trucks'];

export function truckChoices(
  vehicles: OperatorVehicleOption[],
  opts: { tripClass: string; rules: VehicleCompatibilityRule[]; usualTruckId?: string | null; driverName?: string; selectedId?: string },
): TruckChoice[] {
  const want = normalizeTruckClass(opts.tripClass);
  const rule = opts.rules.find((r) => r.isActive !== false && normalizeTruckClass(r.serviceVehicleClassCode) === want && r.allowedVehicleClassCodes?.length);
  const allowed = new Set((rule?.allowedVehicleClassCodes ?? []).map((c) => normalizeTruckClass(c)));
  const preferred = new Set((rule?.preferredVehicleClassCodes ?? []).map((c) => normalizeTruckClass(c)));

  // With a rule, only trucks it allows are offered (plus the one already chosen); none allowed → show all.
  let list = rule ? vehicles.filter((v) => v.id === opts.selectedId || allowed.has(normalizeTruckClass(truckClassOfVehicle(v)))) : vehicles;
  const fallback = Boolean(rule) && list.length === 0;
  if (fallback) list = vehicles;

  const out = list.map((v): TruckChoice => {
    const cls = truckClassOfVehicle(v);
    const norm = normalizeTruckClass(cls);
    const isUsual = Boolean(opts.usualTruckId && opts.usualTruckId === v.id);
    const fits = rule ? allowed.has(norm) : norm === want;
    let group: string;
    if (fallback) group = 'Available trucks';
    else if (isUsual && fits) group = 'Recommended';
    else if (rule ? preferred.has(norm) : norm === want) group = 'Preferred';
    else if (rule && allowed.has(norm)) group = 'Allowed alternatives';
    else group = 'Other classes';

    const status = (v.status || 'Available').toString();
    const free = status.toLowerCase() === 'available';
    const onTrip = status === 'OnTrip';
    const isSelected = v.id === opts.selectedId;
    const chips: FactChip[] = [];
    if (onTrip && !isSelected) chips.push({ label: 'On another trip', tone: 'warning' });
    if (!free && !onTrip) chips.push({ label: status === 'Maintenance' ? 'In the workshop' : status === 'Inactive' ? 'Out of service' : status, tone: 'neutral' });
    if (isUsual) chips.push({ label: `Usual truck${opts.driverName ? ` for ${opts.driverName}` : ''}`, tone: 'success' });
    else if (group === 'Allowed alternatives') chips.push({ label: 'Allowed alternative', tone: 'neutral' });
    return { vehicle: v, cls, group, blocked: !free && !onTrip && !isSelected, chips };
  });
  return out.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || (a.vehicle.plate_number || '').localeCompare(b.vehicle.plate_number || ''));
}

/** The group heading shown in the truck picker. */
export const truckGroupLabel = (group: string, tripClass: string) => (group === 'Preferred' ? `${tripClass} trucks` : group);
