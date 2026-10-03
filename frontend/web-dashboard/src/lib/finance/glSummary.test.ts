import { describe, expect, it } from 'vitest';
import type { GeneralLedgerSummaryItem } from '@mercon/shared-types';
import { buildGlSummary, naturalAmount, parentKeys, typeTotals } from './glSummary';

const bal = (net: number) => ({ signed: Math.abs(net), side: (net >= 0 ? 'Dr' : 'Cr') as 'Dr' | 'Cr', net });

function item(p: Partial<GeneralLedgerSummaryItem> & { code: string; type: GeneralLedgerSummaryItem['type'] }, opening = 0, debit = 0, credit = 0, lines = 0): GeneralLedgerSummaryItem {
  return {
    account_id: `id-${p.code}`,
    name: `Account ${p.code}`,
    parent_id: null,
    parent_code: null,
    parent_name: null,
    ...p,
    opening: bal(opening),
    period_debit: debit,
    period_credit: credit,
    closing: bal(opening + debit - credit),
    line_count: lines,
  };
}

const bank = item({ code: '1010', type: 'Asset', name: 'Bank', parent_id: 'p-cash', parent_code: '1000', parent_name: 'Cash and bank' }, 1000, 500, 200, 3);
const cash = item({ code: '1020', type: 'Asset', name: 'Petty cash', parent_id: 'p-cash', parent_code: '1000', parent_name: 'Cash and bank' }, 50, 0, 0, 0);
const payable = item({ code: '2010', type: 'Liability', name: 'Accounts payable' }, -300, 100, 400, 2);
const sales = item({ code: '4010', type: 'Revenue', name: 'Freight revenue' }, 0, 0, 700, 4);
const fuel = item({ code: '5010', type: 'Expense', name: 'Fuel' }, 0, 800, 0, 5);
const items = [sales, cash, payable, bank, fuel];

describe('buildGlSummary', () => {
  it('groups accounts by type in statement order, and by parent within a type', () => {
    const m = buildGlSummary(items);
    expect(m.groups.map((g) => g.type)).toEqual(['Asset', 'Liability', 'Revenue', 'Expense']);
    const assets = m.groups[0];
    expect(assets.parents).toHaveLength(1);
    expect(assets.parents[0].accounts.map((a) => a.item.code)).toEqual(['1010', '1020']);
    expect(assets.parents[0]).toMatchObject({ opening: 1050, debit: 500, credit: 200, closing: 1350, lines: 3 });
    expect(m.groups[1].direct.map((a) => a.item.code)).toEqual(['2010']);
  });

  it('totals the period and reports whether debits equal credits', () => {
    const m = buildGlSummary(items);
    expect(m.totals).toMatchObject({ debit: 1400, credit: 1300, difference: 100, accounts: 5, activeAccounts: 4, lines: 14 });
  });

  it('filters by type, activity and search words, keeping the unfiltered totals', () => {
    expect(buildGlSummary(items, { type: 'Asset' }).shown).toBe(2);
    expect(buildGlSummary(items, { activeOnly: true }).shown).toBe(4);
    const found = buildGlSummary(items, { search: 'cash petty' });
    expect(found.shown).toBe(1);
    expect(found.groups[0].parents[0].accounts[0].item.code).toBe('1020');
    // Searching the parent's name finds its accounts
    expect(buildGlSummary(items, { search: 'cash and bank' }).shown).toBe(2);
    expect(found.totals.debit).toBe(1400);
  });

  it('sorts by activity or by balance size', () => {
    const byActivity = buildGlSummary(items, { type: 'Asset', sort: 'activity' });
    expect(byActivity.groups[0].parents[0].accounts[0].item.code).toBe('1010');
    const byBalance = buildGlSummary([item({ code: '1', type: 'Asset' }, 10), item({ code: '2', type: 'Asset' }, -900)], { sort: 'balance' });
    expect(byBalance.groups[0].direct.map((a) => a.item.code)).toEqual(['2', '1']);
  });

  it('lists every parent key for collapse all', () => {
    expect(parentKeys(buildGlSummary(items))).toEqual(['Asset:p-cash']);
  });
});

describe('typeTotals / naturalAmount', () => {
  it('reads credit-normal types with a positive sign', () => {
    const t = typeTotals(items);
    expect(naturalAmount(t.Liability.closing, 'Liability')).toBe(600);
    expect(naturalAmount(t.Revenue.movement, 'Revenue')).toBe(700);
    expect(naturalAmount(t.Expense.movement, 'Expense')).toBe(800);
    expect(t.Asset.accounts).toBe(2);
    expect(t.Equity.accounts).toBe(0);
  });
});
