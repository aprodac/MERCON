import { describe, expect, it } from 'vitest';
import { categoryTone, changePercent, expenseRef, linkKind, monthLabel, share } from './expenseMeta';

describe('expense helpers', () => {
  it('colours known categories and falls back to neutral for custom ones', () => {
    expect(categoryTone('Fuel')).toBe('warning');
    expect(categoryTone('Camel feed')).toBe('neutral');
    expect(categoryTone(null)).toBe('neutral');
  });

  it('says what an expense is charged to', () => {
    expect(linkKind({ vehicleId: 'v', driverId: 'd', tripId: 't' })).toBe('trip');
    expect(linkKind({ vehicleId: 'v', driverId: 'd' })).toBe('vehicle');
    expect(linkKind({ vehicleId: null, driverId: 'd' })).toBe('driver');
    expect(linkKind({ vehicleId: null, driverId: null })).toBe('overhead');
  });

  it('compares with the previous period only when there is one', () => {
    expect(changePercent(120, 100)).toBeCloseTo(20);
    expect(changePercent(80, 100)).toBeCloseTo(-20);
    expect(changePercent(80, 0)).toBeNull();
    expect(changePercent(80, null)).toBeNull();
    expect(share(25, 100)).toBe(25);
    expect(share(25, 0)).toBe(0);
  });

  it('labels months and refs', () => {
    expect(monthLabel('2026-09')).toBe('Sep 2026');
    expect(monthLabel('2026-01', true)).toBe('Jan');
    expect(expenseRef({ ref_id: null, id: 'abcdef12-0000' })).toBe('EXP-ABCDE');
  });
});
