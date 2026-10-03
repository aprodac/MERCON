import { describe, expect, it } from 'vitest';

import type { MonthlyBoardCompany, MonthlyBoardTrip } from '@/services/tripService';
import {
  buildBookings,
  buildGroups,
  dayCellState,
  displayPlace,
  driverDayKey,
  isDoubleBooked,
  isOverdue,
  otherBookings,
  slotOf,
  totalsOf,
} from './monthlyGrid';

const trip = (over: Partial<MonthlyBoardTrip>): MonthlyBoardTrip => ({
  id: 't1',
  ref_id: 'TRP-1',
  status: 'Scheduled',
  date: '2026-10-05',
  planned_start: null,
  planned_end: null,
  actual_start: null,
  actual_end: null,
  date_is_inferred: false,
  driver: { id: 'd1', ref_id: null, name: 'Faisal', phone_primary: null },
  vehicle: { id: 'v1', ref_id: null, plate_number: 'ABC 1', asset_type: 'Truck' },
  vehicle_type: 'Trailer',
  rate_category: 'Single Trip',
  billing_type: 'Monthly',
  billing_amount: 1000,
  currency: 'SAR',
  rate_card: null,
  origin: 'RUH — Riyadh',
  destination: 'JED — Jeddah',
  ...over,
} as MonthlyBoardTrip);

const company = (id: string, trips: MonthlyBoardTrip[]): MonthlyBoardCompany => ({
  customer: { id, name: `Co ${id}`, contact_phone: '' },
  total_trips: trips.length,
  total_billed: 0,
  unassigned_trips: 0,
  drivers: [],
  vehicles: [],
  categories: [],
  days: [...new Set(trips.map((t) => t.date))].map((date) => ({ date, trips: trips.filter((t) => t.date === date) })),
});

const TODAY = '2026-10-03';

describe('monthly grid', () => {
  it('flags past trips that never started as overdue, not finished or future ones', () => {
    expect(isOverdue(trip({ date: '2026-10-01', status: 'Scheduled' }), TODAY)).toBe(true);
    expect(isOverdue(trip({ date: '2026-10-01', status: 'Draft' }), TODAY)).toBe(true);
    expect(isOverdue(trip({ date: '2026-10-01', status: 'Completed' }), TODAY)).toBe(false);
    expect(isOverdue(trip({ date: '2026-10-01', status: 'InTransit' }), TODAY)).toBe(false);
    expect(isOverdue(trip({ date: TODAY, status: 'Scheduled' }), TODAY)).toBe(false);
  });

  it('counts overdue, gaps and money, ignoring cancelled trips', () => {
    const t = totalsOf(
      [
        trip({ id: 'a', date: '2026-10-01', status: 'Completed' }),
        trip({ id: 'b', date: '2026-10-02', status: 'Scheduled' }),
        trip({ id: 'c', date: '2026-10-04', driver: null }),
        trip({ id: 'd', date: '2026-10-09', vehicle: null }),
        trip({ id: 'e', date: '2026-10-02', status: 'Cancelled' }),
      ],
      TODAY,
      '2026-10-05',
    );
    expect(t).toEqual({ total: 4, done: 1, gapsSoon: 1, gaps: 2, overdue: 1, earned: 1000, expected: 4000 });
  });

  it('shows the state that most needs attention when a day has several trips', () => {
    expect(dayCellState([trip({ status: 'Completed' }), trip({ driver: null })])).toBe('gap');
    expect(dayCellState([trip({ status: 'Completed' }), trip({ status: 'Cancelled' })])).toBe('done');
  });

  it('detects a driver on two trips the same day across companies', () => {
    const a = trip({ id: 'a' });
    const b = trip({ id: 'b', vehicle: { id: 'v2', ref_id: null, plate_number: 'X', asset_type: 'Truck' } });
    const other = trip({ id: 'c', date: '2026-10-06' });
    const cancelled = trip({ id: 'z', status: 'Cancelled' });
    const index = buildBookings([company('1', [a, other]), company('2', [b, cancelled])]);

    expect(isDoubleBooked(index, '1', a)).toBe(true);
    expect(isDoubleBooked(index, '1', other)).toBe(false);
    expect(otherBookings(index, driverDayKey('d1', a.date), slotOf('1', a)).map((x) => x.tripId)).toEqual(['b']);
  });

  it('does not flag several runs of the same line on one day', () => {
    const runs = [trip({ id: 'a' }), trip({ id: 'b' }), trip({ id: 'c' })];
    const index = buildBookings([company('1', runs)]);
    expect(runs.some((t) => isDoubleBooked(index, '1', t))).toBe(false);
  });

  it('uses planned times when both trips have them', () => {
    const at = (id: string, start: string, end: string, origin = 'RUH — Riyadh') =>
      trip({ id, origin, planned_start: `2026-10-05T${start}:00Z`, planned_end: `2026-10-05T${end}:00Z` });
    const morning = at('a', '06:00', '09:00');
    const overlap = at('b', '08:00', '11:00');
    const afternoon = at('c', '13:00', '16:00', 'DMM — Dammam');
    const index = buildBookings([company('1', [morning, afternoon]), company('2', [overlap])]);

    expect(isDoubleBooked(index, '1', morning)).toBe(true);
    // Different route but no overlap in time: fine.
    expect(isDoubleBooked(index, '1', afternoon)).toBe(false);
  });

  it('title-cases lowercase place names only', () => {
    expect(displayPlace('khamis mushayt')).toBe('Khamis Mushayt');
    expect(displayPlace('JED DC')).toBe('JED DC');
  });

  it('groups a company month by route, truck class, line type and rate', () => {
    const groups = buildGroups(
      company('1', [
        trip({ id: 'a' }),
        trip({ id: 'b', date: '2026-10-06' }),
        trip({ id: 'c', billing_amount: 1200 }),
      ]),
    );
    expect(groups.map((g) => g.trips.length)).toEqual([2, 1]);
    expect(groups[0].origin).toBe('Riyadh');
  });
});
