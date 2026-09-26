import { describe, expect, it } from 'vitest';
import type { ReportLineItem } from '@/services/financeService';
import {
  balanceSheetCompareDate, balanceSheetRatios, biggestChanges, buildBalanceSheetTree, changePct, changeTone, onlyChangedSection, type BsSection,
} from './bsStructure';

const acc = (code: string, name: string, amount: number, extra: Partial<ReportLineItem> = {}): ReportLineItem => ({
  account_id: code, account_code: code, name, amount, ...extra,
});

const report = {
  assets: [
    acc('1010', 'Al Rajhi current', 198340, { is_bank_or_cash: true }),
    acc('1000', 'Cash on hand', 16750, { is_bank_or_cash: true }),
    acc('1200', 'Accounts receivable', 81920),
    acc('1300', 'Prepaid insurance', 12500),
    acc('1500', 'Trucks', 480000),
    acc('1510', 'Accumulated depreciation - trucks', -96000),
    acc('1700', 'Long term investment', 0),
  ],
  liabilities: [
    acc('2000', 'Accounts payable', 58400),
    acc('2100', 'VAT payable', 18750),
    acc('2150', 'Accrued salaries', 9860),
    acc('2300', 'Customer advances', 3000),
    acc('2500', 'Truck loan', 220000),
  ],
  equity: [
    acc('3000', "Owner's capital", 300000),
    acc('3100', 'Retained earnings', 45000),
    acc('', 'Current year earnings', 38500, { account_id: null, kind: 'current_year_earnings' }),
  ],
};

/** Every total equals the sum of what's shown beneath it. */
function expectConsistent(s: BsSection) {
  for (const b of s.blocks) {
    for (const g of b.groups) expect(g.amount).toBeCloseTo(g.accounts.reduce((t, a) => t + a.amount, 0), 2);
    expect(b.amount).toBeCloseTo(b.groups.reduce((t, g) => t + g.amount, 0), 2);
  }
  expect(s.amount).toBeCloseTo(s.blocks.reduce((t, b) => t + b.amount, 0), 2);
}

describe('balance sheet tree', () => {
  const tree = buildBalanceSheetTree(report, null);

  it('balances and adds up at every level', () => {
    expect(tree.totals.assets).toBe(693510);
    expect(tree.totals.liabilitiesAndEquity).toBe(693510);
    expect(tree.totals.difference).toBe(0);
    [tree.assets, tree.liabilities, tree.equity].forEach(expectConsistent);
  });

  it('shows long-term liabilities and fixed assets, one row per account', () => {
    expect(tree.liabilities.blocks.map((b) => b.label)).toEqual(['Current liabilities', 'Long-term liabilities']);
    expect(tree.liabilities.blocks[1].groups.map((g) => g.label)).toEqual(['Truck loan']);
    expect(tree.assets.blocks.find((b) => b.label === 'Fixed assets')?.amount).toBe(384000);
  });

  it('groups current accounts and drops zero balances unless asked', () => {
    const current = tree.assets.blocks[0];
    expect(current.groups.map((g) => [g.label, g.amount])).toEqual([
      ['Cash & bank', 215090],
      ['Receivables', 81920],
      ['Advances & prepayments', 12500],
    ]);
    expect(tree.assets.blocks.some((b) => b.label === 'Investments')).toBe(false);
    const withZero = buildBalanceSheetTree(report, null, { keepZero: true });
    expect(withZero.assets.blocks.find((b) => b.label === 'Investments')?.groups).toHaveLength(1);
  });

  it('works out the ratios', () => {
    const r = balanceSheetRatios(tree.totals);
    expect(tree.totals.currentLiabilities).toBe(90010);
    expect(r.workingCapital).toBe(219500);
    expect(r.currentRatio?.toFixed(2)).toBe('3.44');
    expect(r.quickRatio?.toFixed(2)).toBe('3.30');
    expect(r.debtToEquity?.toFixed(2)).toBe('0.81');
  });

  it('carries comparison amounts, including accounts that are now zero', () => {
    const prior = {
      assets: [acc('1010', 'Al Rajhi current', 150000, { is_bank_or_cash: true }), acc('1250', 'Old receivable', 5000)],
      liabilities: [],
      equity: [acc('3000', "Owner's capital", 300000)],
    };
    const t = buildBalanceSheetTree(report, prior);
    const cash = t.assets.blocks[0].groups[0];
    expect(cash.compare).toBe(150000);
    expect(cash.accounts.find((a) => a.key === '1000')?.compare).toBe(0);
    const receivables = t.assets.blocks[0].groups[1];
    expect(receivables.accounts.map((a) => [a.item.name, a.amount, a.compare])).toContainEqual(['Old receivable', 0, 5000]);
    expect(t.assets.compare).toBe(155000);
    [t.assets, t.liabilities, t.equity].forEach(expectConsistent);
  });
});

describe('balance sheet compare dates', () => {
  it('picks the previous month end and the same month end last year', () => {
    expect(balanceSheetCompareDate('2026-09-25', 'prev_month')).toBe('2026-08-31');
    expect(balanceSheetCompareDate('2026-03-10', 'prev_month')).toBe('2026-02-28');
    expect(balanceSheetCompareDate('2026-01-15', 'prev_month')).toBe('2025-12-31');
    expect(balanceSheetCompareDate('2026-09-25', 'prev_year')).toBe('2025-09-30');
    expect(balanceSheetCompareDate('2026-09-25', 'none')).toBeNull();
    expect(balanceSheetCompareDate('2026-09-25', 'custom', '2026-06-30')).toBe('2026-06-30');
    expect(balanceSheetCompareDate('2026-09-25', 'custom', 'nonsense')).toBeNull();
  });
});

describe('balance sheet comparison', () => {
  const prior = {
    assets: [acc('1010', 'Al Rajhi current', 161090, { is_bank_or_cash: true }), acc('1000', 'Cash on hand', 16750, { is_bank_or_cash: true }), acc('1200', 'Accounts receivable', 93400)],
    liabilities: [acc('2000', 'Accounts payable', 45275)],
    equity: [acc('3000', "Owner's capital", 300000)],
  };
  const tree = buildBalanceSheetTree(report, prior);

  it('reads more liabilities as bad news and more assets or equity as good', () => {
    expect(changeTone('assets', 37250)).toBe('positive');
    expect(changeTone('assets', -11480)).toBe('negative');
    expect(changeTone('liabilities', 13125)).toBe('negative');
    expect(changeTone('liabilities', -500)).toBe('positive');
    expect(changeTone('equity', 12645)).toBe('positive');
    expect(changeTone('assets', 0)).toBeNull();
  });

  it('works out percentage change, skipping a zero base', () => {
    expect(changePct(249590, 212340)?.toFixed(1)).toBe('17.5');
    expect(changePct(5000, 0)).toBeNull();
    expect(changePct(5000, null)).toBeNull();
  });

  it('hides unchanged accounts but keeps the true totals', () => {
    const assets = onlyChangedSection(tree.assets);
    const names = assets.blocks.flatMap((b) => b.groups.flatMap((g) => g.accounts.map((a) => a.item.name)));
    expect(names).toContain('Al Rajhi current');
    expect(names).not.toContain('Cash on hand');
    expect(assets.amount).toBe(tree.assets.amount);
  });

  it('ranks the biggest movements first', () => {
    const top = biggestChanges(tree, 3);
    expect(top.map((c) => [c.row.item.name, c.delta])).toEqual([
      ['Trucks', 480000],
      ['Truck loan', 220000],
      ['Accumulated depreciation - trucks', -96000],
    ]);
    expect(top.every((c) => Math.abs(c.delta) > 0)).toBe(true);
  });
});
