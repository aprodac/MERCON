import { describe, expect, it } from 'vitest';
import { costShares, formatPct, marginTone } from './tripProfit';

describe('trip profitability', () => {
  it('colours a margin by how healthy it is', () => {
    expect(marginTone(-10, -5)).toBe('negative');
    expect(marginTone(50, 5)).toBe('warning');
    expect(marginTone(300, 30)).toBe('positive');
    expect(marginTone(-300, null)).toBe('neutral');
  });

  it('splits revenue into costs and margin', () => {
    const s = costShares({ revenue: 1000, driverPay: 300, subcontract: 0, expenses: 100 });
    expect(s.driverPay).toBe(30);
    expect(s.expenses).toBe(10);
    expect(s.margin).toBe(60);
    expect(s.over).toBe(0);
  });

  it('scales costs to the bar and shows the overrun on a loss', () => {
    const s = costShares({ revenue: 100, driverPay: 150, subcontract: 0, expenses: 50 });
    expect(s.driverPay + s.expenses).toBeCloseTo(100);
    expect(s.over).toBe(100);
    expect(costShares({ revenue: 0, driverPay: 10, subcontract: 0, expenses: 0 }).over).toBe(0);
    expect(formatPct(null)).toBe('—');
    expect(formatPct(12.34)).toBe('12.3%');
  });
});
