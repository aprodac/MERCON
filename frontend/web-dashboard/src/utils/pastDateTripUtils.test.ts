import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDateTimeInPast, isDateInPast } from './pastDateTripUtils';
import { dutyShiftMinutes, estimateRouteTravelTime, resolveCityCoords, STOP_DWELL_MINUTES } from '@/services/travelTimeService';

describe('past time in the deployment timezone', () => {
  afterEach(() => vi.useRealTimers());

  it('judges a Saudi pickup time in Saudi time, not the browser zone', () => {
    // 10:26 UTC = 13:26 Riyadh = 15:56 India.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T10:26:00Z'));
    expect(isDateTimeInPast('2026-09-30', '14:00', 'Asia/Riyadh')).toBe(false);
    expect(isDateTimeInPast('2026-09-30', '13:00', 'Asia/Riyadh')).toBe(true);
  });

  it('uses the zone to decide what "today" is', () => {
    // 22:30 UTC on the 30th is already the 1st in Riyadh.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T22:30:00Z'));
    expect(isDateInPast('2026-09-30', 'Asia/Riyadh')).toBe(true);
    expect(isDateInPast('2026-10-01', 'Asia/Riyadh')).toBe(false);
  });
});

describe('travel time helpers', () => {
  it('reads the shift length of duty line types', () => {
    expect(dutyShiftMinutes('10 Hours Duty')).toBe(600);
    expect(dutyShiftMinutes('12_HRS')).toBe(720);
    expect(dutyShiftMinutes('Single Trip')).toBeNull();
    expect(dutyShiftMinutes('Round Trip')).toBeNull();
  });

  it('resolves names written with an apostrophe', () => {
    expect(resolveCityCoords("At Ta'if")).toEqual(resolveCityCoords('Taif'));
  });

  it('adds every leg and a stop allowance for intermediate stops', async () => {
    const direct = await estimateRouteTravelTime([{ name: 'Riyadh' }, { name: 'Jeddah' }]);
    const via = await estimateRouteTravelTime([{ name: 'Riyadh' }, { name: 'Taif' }, { name: 'Makkah' }, { name: 'Jeddah' }]);
    expect(direct!.stopOffsetsMinutes).toEqual([]);
    expect(via!.stopOffsetsMinutes).toHaveLength(2);
    expect(via!.stopOffsetsMinutes[1]).toBeGreaterThan(via!.stopOffsetsMinutes[0] + STOP_DWELL_MINUTES);
    expect(via!.durationMinutes).toBeGreaterThan(direct!.durationMinutes + 2 * STOP_DWELL_MINUTES - 60);
    expect(via!.durationMinutes).toBeGreaterThan(via!.stopOffsetsMinutes[1]);
  });
});
