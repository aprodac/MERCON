import { describe, expect, it } from 'vitest';
import type { LiveUnit } from '@/services/fleetLiveService';
import type { Trip, TripStop } from '@/services/tripService';
import {
  TRIP_TRANSITIONS, attentionReasons, groupSchedule, matchesTripQuery, needsConfirm, nextStatuses, sortActive,
} from './liveOps';

const NOW = new Date('2026-09-26T10:00:00Z').getTime();
const H = 3600_000;

function stop(p: Partial<TripStop> = {}): TripStop {
  return {
    id: Math.random().toString(36).slice(2),
    stop_sequence: 1,
    stop_type: 'Pickup',
    location_lat: 24.7,
    location_lng: 46.7,
    location_name: 'Riyadh DC',
    location_address: null,
    locationId: null,
    planned_arrival: null,
    actual_arrival: null,
    actual_departure: null,
    delay_reason: null,
    delay_note: null,
    delay_logged_by: null,
    delay_logged_at: null,
    ...p,
  };
}

function trip(p: Partial<Trip> = {}): Trip {
  return {
    id: Math.random().toString(36).slice(2),
    ref_id: 'TRP-1',
    status: 'Scheduled',
    planned_start: null,
    actual_start: null,
    planned_end: null,
    actual_end: null,
    planned_distance: null,
    createdAt: '2026-09-20T00:00:00Z',
    updatedAt: '2026-09-20T00:00:00Z',
    driver: { id: 'd', ref_id: 'D1', first_name: 'Sami', last_name: 'Ali', phone_primary: '+966500000000' },
    vehicle: { id: 'v', ref_id: 'V1', plate_number: 'ABC 123', asset_type: 'Truck', capacity_kg: 1, icces_device_id: null },
    stops: [],
    ...p,
  };
}

const liveUnit = (p: Partial<LiveUnit> = {}): LiveUnit => ({
  key: 'u', vehicle: null, driver: null, trip: null, vehicle_gps: null, driver_gps: null,
  position: { lat: 1, lng: 1, speed_kph: 50, heading_deg: 0, accuracy_m: 5, recorded_at: new Date(NOW).toISOString(), fresh: true, source: 'vehicle' },
  feed: 'vehicle', motion: 'moving', feeds_gap_m: null, ...p,
});

describe('nextStatuses', () => {
  it('only offers moves the backend allows, split into forward and back', () => {
    const { forward, back, cancel } = nextStatuses('InTransit');
    expect(forward).toEqual(['Delayed', 'Completed']);
    expect(back).toEqual(['Draft', 'Scheduled', 'Loading']);
    expect(cancel).toBe(true);
    for (const s of [...forward, ...back]) expect(TRIP_TRANSITIONS.InTransit).toContain(s);
  });

  it('offers nothing for an unknown status', () => {
    expect(nextStatuses('Weird')).toEqual({ forward: [], back: [], cancel: false });
  });
});

describe('needsConfirm', () => {
  it('asks before cancelling, completing, drafting or reopening', () => {
    expect(needsConfirm('InTransit', 'Cancelled')).toBe(true);
    expect(needsConfirm('InTransit', 'Completed')).toBe(true);
    expect(needsConfirm('Scheduled', 'Draft')).toBe(true);
    expect(needsConfirm('Completed', 'InTransit')).toBe(true);
    expect(needsConfirm('Scheduled', 'Loading')).toBe(false);
  });
});

describe('attentionReasons', () => {
  it('flags a scheduled trip whose start has passed', () => {
    expect(attentionReasons(trip({ planned_start: new Date(NOW - H).toISOString() }), null, NOW)).toContain('late_start');
  });

  it('flags an active trip overdue at its next stop and with no GPS', () => {
    const t = trip({
      status: 'InTransit',
      stops: [stop({ actual_arrival: '2026-09-26T08:00:00Z' }), stop({ stop_sequence: 2, planned_arrival: new Date(NOW - 30 * 60_000).toISOString() })],
    });
    expect(attentionReasons(t, null, NOW)).toEqual(['overdue_stop', 'no_gps']);
    expect(attentionReasons(t, liveUnit(), NOW)).toEqual(['overdue_stop']);
  });

  it('flags a missing truck only when the trip is soon', () => {
    const soon = trip({ vehicle: null, planned_start: new Date(NOW + 2 * H).toISOString() });
    const later = trip({ vehicle: null, planned_start: new Date(NOW + 72 * H).toISOString() });
    expect(attentionReasons(soon, null, NOW)).toContain('unassigned');
    expect(attentionReasons(later, null, NOW)).not.toContain('unassigned');
  });

  it('never asks a third-party trip for our driver or GPS', () => {
    const t = trip({ status: 'InTransit', driver: null, vehicle: null, is_third_party: true });
    expect(attentionReasons(t, null, NOW)).toEqual([]);
  });
});

describe('groupSchedule', () => {
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  it('puts late starts first, then days in order, drafts last', () => {
    const groups = groupSchedule(
      [
        trip({ ref_id: 'draft', status: 'Draft' }),
        trip({ ref_id: 'tomorrow', planned_start: new Date(NOW + 24 * H).toISOString() }),
        trip({ ref_id: 'late', planned_start: new Date(NOW - H).toISOString() }),
        trip({ ref_id: 'today', planned_start: new Date(NOW + H).toISOString() }),
      ],
      dayKey,
      (k) => k,
      NOW,
    );
    expect(groups.map((g) => g.label)).toEqual(['Late to start', 'Today', 'Tomorrow', 'Drafts']);
    expect(groups.map((g) => g.trips[0].ref_id)).toEqual(['late', 'today', 'tomorrow', 'draft']);
  });
});

describe('sortActive', () => {
  it('puts delayed trips first, then the soonest due', () => {
    const a = trip({ ref_id: 'a', status: 'InTransit', stops: [stop({ planned_arrival: '2026-09-26T12:00:00Z' })] });
    const b = trip({ ref_id: 'b', status: 'InTransit', stops: [stop({ planned_arrival: '2026-09-26T11:00:00Z' })] });
    const c = trip({ ref_id: 'c', status: 'Delayed' });
    expect(sortActive([a, b, c]).map((t) => t.ref_id)).toEqual(['c', 'b', 'a']);
  });
});

describe('matchesTripQuery', () => {
  it('matches every word across ref, driver, plate and stops', () => {
    const t = trip({ ref_id: 'TRP-77', stops: [stop({ location_name: 'Jeddah Port' })] });
    expect(matchesTripQuery(t, 'sami jeddah')).toBe(true);
    expect(matchesTripQuery(t, 'abc 123')).toBe(true);
    expect(matchesTripQuery(t, 'dammam')).toBe(false);
  });
});
