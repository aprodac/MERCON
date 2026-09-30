import { describe, expect, it } from 'vitest';
import { addMonths, monthName, paidPct } from './payoutMonths';

describe('payout months', () => {
  it('moves across years', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-09', -11)).toBe('2025-10');
  });
  it('names months', () => {
    expect(monthName('2026-09')).toBe('Sep 2026');
    expect(monthName('2026-09', true)).toBe('Sep');
  });
  it('shares paid', () => {
    expect(paidPct(50, 200)).toBe(25);
    expect(paidPct(10, 0)).toBe(0);
  });
});
