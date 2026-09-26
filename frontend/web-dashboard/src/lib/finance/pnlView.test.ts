import { describe, expect, it } from 'vitest';
import type { ReportLineItem } from '@/services/financeService';
import { buildStructuredVerticalPnl } from './pnlStructure';
import { pnlTwoColumnParts } from './pnlView';
import type { StmtItem } from './statementModel';

// Q3 2026 from the local demo data: a gross loss and a net loss
const q3Revenue: ReportLineItem[] = [{ account_id: '1', account_code: '4010', name: 'Freight Revenue', amount: 125005 }];
const q3Expenses: ReportLineItem[] = [
  { account_id: '2', account_code: '5020', name: 'Driver Salaries', parent_name: 'Cost of Services', parent_id: 'cos', amount: 174500 },
  { account_id: '3', account_code: '5030', name: 'Fuel', parent_name: 'Cost of Services', parent_id: 'cos', amount: 91425 },
  { account_id: '4', account_code: '5040', name: 'Tolls & Permits', parent_name: 'Cost of Services', parent_id: 'cos', amount: 24750 },
  { account_id: '5', account_code: '5050', name: 'Vehicle Maintenance', parent_name: 'Cost of Services', parent_id: 'cos', amount: 12000 },
  { account_id: '6', account_code: '5060', name: 'Subcontractor Haulage', parent_name: 'Cost of Services', parent_id: 'cos', amount: 9600 },
  { account_id: '7', account_code: '6010', name: 'Insurance', parent_name: 'Operating Expenses', parent_id: 'opx', amount: 71645 },
  { account_id: '8', account_code: '6020', name: 'Office Rent', parent_name: 'Operating Expenses', parent_id: 'opx', amount: 45000 },
  { account_id: '9', account_code: '6030', name: 'General & Admin', parent_name: 'Operating Expenses', parent_id: 'opx', amount: 16400 },
];

// A profitable period with other income and other costs
const goodRevenue: ReportLineItem[] = [
  { account_id: '1', account_code: '4000', name: 'Sales Revenue', amount: 500000 },
  { account_id: '4', account_code: '4200', name: 'Interest Income', amount: 5000 },
];
const goodExpenses: ReportLineItem[] = [
  { account_id: '2', account_code: '5000', name: 'Direct Cost of Revenue', amount: 200000 },
  { account_id: '3', account_code: '6000', name: 'Salaries & Rent', amount: 150000 },
  { account_id: '5', account_code: '7000', name: 'Bank Interest Expense', amount: 10000 },
];

const keys = (items: StmtItem[]) => items.map((i) => i.key);
const amountOf = (items: StmtItem[], key: string) => items.find((i) => i.key === key)?.amount;

const sideSum = (items: StmtItem[]) => items.reduce((t, i) => t + i.amount, 0);

describe('P&L two-column parts', () => {
  it('balances both parts when there is a loss, carrying the gross loss across', () => {
    const [trading, pl] = pnlTwoColumnParts(buildStructuredVerticalPnl(q3Revenue, q3Expenses));
    expect(trading.total.amount).toBe(312275);
    expect(sideSum(trading.left)).toBe(312275);
    expect(sideSum(trading.right)).toBe(312275);
    expect(keys(trading.right)).toEqual(['operating_income', 'gl-cd']);
    expect(pl.total.amount).toBe(320315);
    expect(sideSum(pl.left)).toBe(320315);
    expect(sideSum(pl.right)).toBe(320315);
    expect(keys(pl.left)).toEqual(['gl-bd', 'operating_expense']);
    const loss = pl.right.find((i) => i.key === 'nl');
    expect(loss?.kind === 'line' && [loss.label, loss.amount, loss.tone]).toEqual(['Net loss', 320315, 'negative']);
  });

  it('balances both parts when there is a profit, with other income and other costs', () => {
    const [trading, pl] = pnlTwoColumnParts(buildStructuredVerticalPnl(goodRevenue, goodExpenses));
    expect(sideSum(trading.left)).toBe(sideSum(trading.right));
    expect(amountOf(trading.left, 'gp-cd')).toBe(300000);
    expect(keys(pl.left)).toEqual(['operating_expense', 'non_operating_expense', 'np']);
    expect(keys(pl.right)).toEqual(['gp-bd', 'other_income']);
    expect(amountOf(pl.left, 'np')).toBe(145000);
    expect(sideSum(pl.left)).toBe(sideSum(pl.right));
    expect(pl.total.amount).toBe(305000);
  });

  it('carries the comparison period through sections, carried lines and totals', () => {
    const v = buildStructuredVerticalPnl(goodRevenue, goodExpenses, {}, { prev: { revenues: q3Revenue, expenses: q3Expenses } });
    const [trading, pl] = pnlTwoColumnParts(v, { compareKey: 'prev' });
    expect(trading.right.find((i) => i.key === 'operating_income')?.compare).toBe(125005);
    // Last time was a gross loss, so the gross profit line compares against zero profit
    expect(trading.left.find((i) => i.key === 'gp-cd')?.compare).toBe(0);
    expect(trading.total.compare).toBe(312275);
    expect(pl.total.compare).toBe(320315);
  });
});
