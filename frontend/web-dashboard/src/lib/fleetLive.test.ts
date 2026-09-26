import { describe, expect, it } from 'vitest';
import type { LiveUnit } from '@/services/fleetLiveService';
import { buildEtaShareText, computeEta, formatDuration, formatKm, matchesFilter, matchesQuery, punctuality } from './fleetLive';

const NOW = Date.parse('2026-09-26T10:00:00Z');

function unit(over: Partial<LiveUnit> = {}): LiveUnit {
  return {
    key: 'v:1',
    vehicle: { id: '1', ref_id: 'VEH-1', plate_number: 'ABC 4521', asset_type: 'Flatbed', status: 'OnTrip', image_url: null, has_tracker: true },
    driver: { id: 'd', ref_id: null, name: 'Mohammed Ali', phone: '+966500000000', avatar_url: null },
    trip: {
      id: 't', ref_id: 'TRP-10482', status: 'InTransit', phase: 'active', customer_name: 'SABIC', planned_start: null, planned_end: null,
      stops: [
        { id: 's1', sequence: 1, type: 'Pickup', name: 'Riyadh yard', address: null, lat: 24.7, lng: 46.7, planned_arrival: null, actual_arrival: '2026-09-26T06:00:00Z', actual_departure: '2026-09-26T07:00:00Z' },
        { id: 's2', sequence: 2, type: 'Dropoff', name: 'Jubail port', address: null, lat: 27.0, lng: 49.6, planned_arrival: '2026-09-26T10:30:00Z', actual_arrival: null, actual_departure: null },
      ],
      next_stop_index: 1,
    },
    vehicle_gps: null,
    driver_gps: null,
    position: { lat: 26.9, lng: 49.5, speed_kph: 70, heading_deg: 30, accuracy_m: null, recorded_at: '2026-09-26T09:59:50Z', fresh: true, source: 'vehicle' },
    feed: 'vehicle',
    motion: 'moving',
    feeds_gap_m: null,
    ...over,
  };
}

describe('fleet live map helpers', () => {
  it('filters by trip phase and signal', () => {
    expect(matchesFilter(unit(), 'on_trip')).toBe(true);
    expect(matchesFilter(unit(), 'free')).toBe(false);
    expect(matchesFilter(unit({ trip: null }), 'free')).toBe(true);
    expect(matchesFilter(unit({ motion: 'stale' }), 'offline')).toBe(true);
    expect(matchesFilter(unit({ trip: { ...unit().trip!, phase: 'delayed' } }), 'delayed')).toBe(true);
  });

  it('searches plate, driver, trip and customer', () => {
    expect(matchesQuery(unit(), '4521')).toBe(true);
    expect(matchesQuery(unit(), 'mohammed')).toBe(true);
    expect(matchesQuery(unit(), 'trp-10482')).toBe(true);
    expect(matchesQuery(unit(), 'aramco')).toBe(false);
  });

  it('uses the road route for ETA and flags lateness against the planned arrival', () => {
    const eta = computeEta(unit(), { distanceMeters: 42_000, durationSeconds: 45 * 60 }, NOW)!;
    expect(eta.arrival!.toISOString()).toBe('2026-09-26T10:45:00.000Z');
    expect(eta.distanceKm).toBe(42);
    expect(eta.lateByMin).toBe(15);
    expect(punctuality(eta.lateByMin)).toEqual({ label: '15 min late', tone: 'bad' });
    expect(punctuality(3)).toEqual({ label: 'On time', tone: 'good' });
  });

  it('without a route there is no ETA, only a straight-line distance', () => {
    const eta = computeEta(unit(), null, NOW)!;
    expect(eta.arrival).toBeNull();
    expect(eta.distanceIsRoad).toBe(false);
    expect(eta.distanceKm).toBeGreaterThan(10);
  });

  it('builds a short ETA message for WhatsApp', () => {
    const eta = computeEta(unit(), { distanceMeters: 42_000, durationSeconds: 38 * 60 }, NOW);
    expect(buildEtaShareText(unit(), eta, () => '14:38')).toBe(
      '*TRP-10482 · ABC 4521*\nNext stop: Jubail port\nETA: 14:38 (in 38 min) · 42 km\nDriver: Mohammed Ali',
    );
  });

  it('formats distances and durations', () => {
    expect(formatKm(0.42)).toBe('420 m');
    expect(formatKm(4.25)).toBe('4.3 km');
    expect(formatDuration(95 * 60)).toBe('1 h 35 min');
  });
});

describe('map clarity helpers', () => {
  it('keeps the higher-priority label when two collide', async () => {
    const { pickLabels } = await import('./fleetLive');
    const kept = pickLabels([
      { key: 'free', x: 100, y: 100, priority: 10, width: 70 },
      { key: 'late', x: 110, y: 104, priority: 45, width: 70 },
      { key: 'far', x: 400, y: 300, priority: 10, width: 70 },
    ]);
    expect([...kept].sort()).toEqual(['far', 'late']);
  });

  it('merges stops at the same spot into one pin', async () => {
    const { groupStops } = await import('./fleetLive');
    const u = unit();
    u.trip!.stops.push({ ...u.trip!.stops[1], sequence: 3, name: 'Jubail port gate' });
    const groups = groupStops(u);
    expect(groups).toHaveLength(2);
    expect(groups[1].numbers).toEqual([2, 3]);
    expect(groups[1].isNext).toBe(true);
    expect(groups[0].done).toBe(true);
  });
});

describe('driver view direction', () => {
  it('measures compass bearings', async () => {
    const { bearingBetween } = await import('./fleetLive');
    expect(Math.round(bearingBetween({ lat: 24, lng: 46 }, { lat: 25, lng: 46 }))).toBe(0);
    expect(Math.round(bearingBetween({ lat: 24, lng: 46 }, { lat: 24, lng: 47 }))).toBe(90);
    expect(Math.round(bearingBetween({ lat: 24, lng: 46 }, { lat: 23, lng: 46 }))).toBe(180);
  });

  it('takes the road direction past the first wobbly metres', async () => {
    const { routeBearing } = await import('./fleetLive');
    // 10 m west (GPS wobble), then the road runs north.
    const coords: [number, number][] = [[46, 24], [45.9999, 24], [46, 24.01]];
    expect(Math.round(routeBearing(coords)!)).toBe(0);
    expect(routeBearing([[46, 24]])).toBeNull();
  });
});
