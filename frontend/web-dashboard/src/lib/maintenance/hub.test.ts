import { describe, expect, it } from 'vitest';
import { daysIn, dueWording, intervalWording, stayTone, workSummary } from './hub';

const now = new Date('2026-09-30T12:00:00Z');

describe('maintenance hub', () => {
  it('counts days in the workshop', () => {
    expect(daysIn('2026-09-24T08:00:00Z', null, now)).toBe(7);
    expect(daysIn('2026-09-30T08:00:00Z', null, now)).toBe(1);
    expect(daysIn('2026-09-20T08:00:00Z', '2026-09-22T08:00:00Z', now)).toBe(2);
  });

  it('colours a stay by length or a missed return date', () => {
    expect(stayTone(1, null, now)).toBe('neutral');
    expect(stayTone(3, null, now)).toBe('warning');
    expect(stayTone(6, null, now)).toBe('negative');
    expect(stayTone(2, '2026-09-29T00:00:00Z', now)).toBe('negative');
  });

  it('summarises the work from the parts', () => {
    expect(workSummary({ items: [{ kind: 'part', description: 'Brake pads', quantity: 4, unit_price: 1 }, { kind: 'labour', description: 'Labour', quantity: 1, unit_price: 1 }], work_done: null, system: 'brakes' })).toBe('Brake pads');
    expect(workSummary({ items: ['A', 'B', 'C'].map((d) => ({ kind: 'part' as const, description: d, quantity: 1, unit_price: 1 })), work_done: null, system: null })).toBe('A, B +1');
    expect(workSummary({ items: [], work_done: 'Oil change', system: null })).toBe('Oil change');
    expect(workSummary({ items: [], work_done: null, system: 'air_system' })).toBe('air system');
  });

  it('words due and intervals', () => {
    expect(dueWording({ status: 'overdue', remainingKm: -2400, remainingDays: 12 })).toBe('2,400 km over · 12 days left');
    expect(dueWording({ status: 'due_soon', remainingKm: null, remainingDays: 5 })).toBe('5 days left');
    expect(dueWording({ status: 'never', remainingKm: null, remainingDays: null })).toMatch(/Never done/);
    expect(intervalWording({ interval_km: 10000, interval_days: 180 })).toBe('Every 10,000 km or 180 days');
  });
});
