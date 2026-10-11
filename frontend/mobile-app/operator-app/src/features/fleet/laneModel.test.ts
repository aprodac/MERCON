/**
 * Lane search rules. Run: npx tsx src/features/fleet/laneModel.test.ts
 */
import { bookedOnLane, freeTrucksAt, lanesOnRoad, parseLaneQuery, LANE_KM } from './laneModel';
import type { LiveUnit } from '../../lib/operator';

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) { failed++; console.error(`✗ ${name}`, detail ?? ''); } else console.log(`✓ ${name}`);
}

const RUH = { lat: 24.7136, lng: 46.6753 };
const JED = { lat: 21.4858, lng: 39.1925 };
const DMM = { lat: 26.4207, lng: 50.0888 };

// ── Parsing ──
const lane = (q: string) => {
  const r = parseLaneQuery(q);
  return r?.kind === 'lane' ? `${r.from.label}>${r.to.label}` : r?.kind ?? null;
};
check('riyadh to jeddah', lane('riyadh to jeddah') === 'Riyadh>Jeddah', lane('riyadh to jeddah'));
check('ruh → jed', lane('ruh → jed') === 'Riyadh>Jeddah', lane('ruh → jed'));
check('riyadh -> jidda', lane('riyadh -> jidda') === 'Riyadh>Jeddah', lane('riyadh -> jidda'));
check('riyadh - jeddah', lane('riyadh - jeddah') === 'Riyadh>Jeddah', lane('riyadh - jeddah'));
check('from dammam to jubail', lane('from dammam to jubail') === 'Dammam>Jubail', lane('from dammam to jubail'));
check('typo: riyadh to jedah', lane('Riyadh to Jedah') === 'Riyadh>Jeddah', lane('Riyadh to Jedah'));
check('reverse order kept', lane('jeddah to riyadh') === 'Jeddah>Riyadh', lane('jeddah to riyadh'));
check('same city is not a lane', parseLaneQuery('riyadh to riyadh') === null);
check('plate stays a text search', parseLaneQuery('1234 ABC') === null);
check('trip ref stays a text search', parseLaneQuery('TRP-0012') === null);
check('customer with a dash stays a text search', parseLaneQuery('Al Rajhi - Riyadh') === null, parseLaneQuery('Al Rajhi - Riyadh'));
const unknown = parseLaneQuery('riyadh to jxddxh');
check('unknown end reported', unknown?.kind === 'unknown' && unknown.text === 'jxddxh', unknown);
check('nonsense end: no suggestion', (() => { const r = parseLaneQuery('riyadh to qqqqqqqq'); return r?.kind === 'unknown' && r.suggestion === null; })());
check('unknown end gets a suggestion', unknown?.kind === 'unknown' && unknown.suggestion === 'Jeddah', unknown);

// ── Matching ──
type Stop = NonNullable<LiveUnit['trip']>['stops'][number];
const stop = (id: string, p: { lat: number; lng: number }): Stop => ({
  id, sequence: 0, type: 'Pickup', name: id, address: null, lat: p.lat, lng: p.lng, planned_arrival: null, actual_arrival: null, actual_departure: null,
});
const unit = (key: string, pos: { lat: number; lng: number } | null, trip: { phase: 'upcoming' | 'active' | 'delayed'; stops: Stop[] } | null, status = 'Available'): LiveUnit => ({
  key,
  vehicle: { id: `v-${key}`, ref_id: null, plate_number: key, asset_type: 'Truck', status, image_url: null, has_tracker: true },
  driver: { id: `d-${key}`, ref_id: null, name: `Driver ${key}`, phone: null, avatar_url: null, status: 'Available' },
  trip: trip ? { id: `t-${key}`, ref_id: key, status: 'InTransit', phase: trip.phase, customer_name: null, planned_start: null, planned_end: null, stops: trip.stops, next_stop_index: 1 } : null,
  vehicle_gps: null, driver_gps: null,
  position: pos ? { ...pos, recorded_at: new Date().toISOString(), fresh: true, source: 'vehicle' } : null,
});
const midway = { lat: (RUH.lat + JED.lat) / 2, lng: (RUH.lng + JED.lng) / 2 };
const units = [
  unit('A', midway, { phase: 'active', stops: [stop('a1', RUH), stop('a2', JED)] }, 'OnTrip'),
  unit('B', midway, { phase: 'active', stops: [stop('b1', JED), stop('b2', RUH)] }, 'OnTrip'),
  unit('C', RUH, { phase: 'delayed', stops: [stop('c1', DMM), stop('c2', RUH), stop('c3', JED)] }, 'OnTrip'),
  unit('FREE1', { lat: RUH.lat + 0.1, lng: RUH.lng }, null),
  unit('FREE2', { lat: RUH.lat + 0.3, lng: RUH.lng }, null),
  unit('FAR', DMM, null),
];
const running = lanesOnRoad(units, RUH, JED, LANE_KM).map((r) => r.unit.key);
check('running trip on lane found', running.includes('A'), running);
check('reverse trip not on lane', !running.includes('B'), running);
check('multi-stop with A before B counts', running.includes('C'), running);
const a = lanesOnRoad(units, RUH, JED, LANE_KM).find((r) => r.unit.key === 'A');
check('progress about half way', !!a && a.progress != null && Math.abs(a.progress - 0.5) < 0.05, a?.progress);

const free = freeTrucksAt(units, RUH, LANE_KM);
check('free trucks near A, closest first', free.inRange.map((c) => c.unit.key).join(',') === 'FREE1,FREE2', free.inRange.map((c) => c.unit.key));
check('busy trucks left out', !free.inRange.some((c) => c.unit.key === 'A'));
const none = freeTrucksAt(units, JED, LANE_KM);
check('nothing near Jeddah → nearest anywhere', none.inRange.length === 0 && none.nearest.length > 0, none);

const booked = bookedOnLane([
  { id: '1', stops: [{ location_lat: RUH.lat, location_lng: RUH.lng }, { location_lat: JED.lat, location_lng: JED.lng }] },
  { id: '2', stops: [{ location_lat: JED.lat, location_lng: JED.lng }, { location_lat: RUH.lat, location_lng: RUH.lng }] },
  { id: '3', stops: [{ location: { lat: RUH.lat, lng: RUH.lng } }, { location: { lat: JED.lat, lng: JED.lng } }] },
  { id: '4', stops: [{ location_lat: null, location_lng: null }, { location_lat: JED.lat, location_lng: JED.lng }] },
  { id: '5', stops: null },
], RUH, JED, LANE_KM).map((t) => t.id);
check('booked: lane, saved-location coords, not reverse / no coords', booked.join(',') === '1,3', booked);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
