import { describe, expect, it } from 'vitest';
import type { LiveUnit } from '@/services/fleetLiveService';
import type { Trip } from '@/services/tripService';
import { lookupCity, parsePlaceQuery, rankTrucksForTrip, tripsOnRoute, unitsNear } from './placeSearch';

const RIYADH = { lat: 24.7136, lng: 46.6753 };
const JEDDAH = { lat: 21.5433, lng: 39.1728 };

function unit(key: string, pos: { lat: number; lng: number } | null, p: Partial<LiveUnit> = {}): LiveUnit {
  return {
    key,
    vehicle: { id: key, ref_id: null, plate_number: key, asset_type: 'Trailer', status: 'Available', image_url: null, has_tracker: true },
    driver: { id: `d-${key}`, ref_id: null, name: `Driver ${key}`, phone: null, avatar_url: null, status: 'Available' },
    trip: null,
    vehicle_gps: null,
    driver_gps: null,
    position: pos ? { ...pos, speed_kph: 0, heading_deg: null, accuracy_m: null, recorded_at: new Date().toISOString(), fresh: true, source: 'vehicle' } : null,
    feed: 'vehicle',
    motion: 'idle',
    feeds_gap_m: null,
    ...p,
  };
}

const stop = (lat: number, lng: number) => ({ location_lat: lat, location_lng: lng }) as NonNullable<Trip['stops']>[number];
const trip = (id: string, stops: { lat: number; lng: number }[]) => ({ id, stops: stops.map((s) => stop(s.lat, s.lng)) }) as Trip;

describe('parsePlaceQuery', () => {
  it('reads routes in the ways people type them', () => {
    expect(parsePlaceQuery('riyadh to jiddah')).toEqual({ kind: 'route', from: 'riyadh', to: 'jiddah' });
    expect(parsePlaceQuery('From Dammam to Riyadh')).toEqual({ kind: 'route', from: 'Dammam', to: 'Riyadh' });
    expect(parsePlaceQuery('riyadh → jeddah')).toEqual({ kind: 'route', from: 'riyadh', to: 'jeddah' });
    expect(parsePlaceQuery('riyadh - jeddah')).toEqual({ kind: 'route', from: 'riyadh', to: 'jeddah' });
  });

  it('reads near searches', () => {
    expect(parsePlaceQuery('near dammam')).toEqual({ kind: 'near', place: 'dammam' });
    expect(parsePlaceQuery('trucks near Jubail port')).toEqual({ kind: 'near', place: 'Jubail port' });
  });

  it('leaves ordinary searches alone', () => {
    expect(parsePlaceQuery('TRP-1041')).toEqual({ kind: 'text' });
    expect(parsePlaceQuery('in transit')).toEqual({ kind: 'text' });
    expect(parsePlaceQuery('4521 KSA')).toEqual({ kind: 'text' });
  });
});

describe('lookupCity', () => {
  it('forgives spellings and typos', () => {
    expect(lookupCity('jiddah')?.label).toBe('Jeddah');
    expect(lookupCity('Riyadh')?.label).toBe('Riyadh');
    expect(lookupCity('riyadth')?.label).toBe('Riyadh');
    expect(lookupCity('al kharj')?.label).toBe('Al Kharj');
    expect(lookupCity('Khamis Mushait')?.label).toBe('Khamis Mushait');
  });

  it('returns null for things that are not cities', () => {
    expect(lookupCity('almarai')).toBeNull();
    expect(lookupCity('xy')).toBeNull();
  });
});

describe('unitsNear', () => {
  it('keeps trucks inside the radius, closest first', () => {
    const near = unitsNear([unit('far', JEDDAH), unit('b', { lat: 24.9, lng: 46.7 }), unit('a', { lat: 24.72, lng: 46.68 }), unit('none', null)], RIYADH, 50);
    expect(near.map((n) => n.unit.key)).toEqual(['a', 'b']);
  });
});

describe('tripsOnRoute', () => {
  it('respects direction', () => {
    const out = [trip('r2j', [RIYADH, JEDDAH]), trip('j2r', [JEDDAH, RIYADH])];
    expect(tripsOnRoute(out, RIYADH, JEDDAH, 50).map((t) => t.id)).toEqual(['r2j']);
  });
});

describe('rankTrucksForTrip', () => {
  const t = { id: 't', driver: null } as Pick<Trip, 'id' | 'driver'>;

  it('ranks free trucks by distance and skips busy ones', () => {
    const units = [
      unit('far', { lat: 25.5, lng: 46.7 }),
      unit('close', { lat: 24.75, lng: 46.7 }),
      unit('busy', RIYADH, { vehicle: { id: 'busy', ref_id: null, plate_number: 'busy', asset_type: 'x', status: 'OnTrip', image_url: null, has_tracker: true } }),
    ];
    expect(rankTrucksForTrip(t, RIYADH, units).map((c) => c.unit.key)).toEqual(['close', 'far']);
  });

  it('blocks a truck whose standing driver is busy, and ranks it last', () => {
    const busyDriver = unit('closest', RIYADH, { driver: { id: 'd', ref_id: null, name: 'Sami', phone: null, avatar_url: null, status: 'OnTrip' } });
    const out = rankTrucksForTrip(t, RIYADH, [busyDriver, unit('ok', { lat: 24.9, lng: 46.7 })]);
    expect(out.map((c) => c.unit.key)).toEqual(['ok', 'closest']);
    expect(out[1].blocker).toBe('Sami is on a trip');
  });

  it("uses the trip's own driver when it has one", () => {
    const withDriver = { id: 't', driver: { id: 'x', first_name: 'Omar', last_name: 'H' } } as Pick<Trip, 'id' | 'driver'>;
    const out = rankTrucksForTrip(withDriver, RIYADH, [unit('a', RIYADH, { driver: null })]);
    expect(out[0].driver).toEqual({ id: 'x', name: 'Omar H' });
    expect(out[0].blocker).toBeNull();
  });

  it("nudges the driver's preferred truck up", () => {
    const out = rankTrucksForTrip(t, RIYADH, [unit('a', { lat: 24.8, lng: 46.7 }), unit('pref', { lat: 24.85, lng: 46.7 })], new Map([['pref', 'PRIMARY']]));
    expect(out[0].unit.key).toBe('pref');
  });
});
