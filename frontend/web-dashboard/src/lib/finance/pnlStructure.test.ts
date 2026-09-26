import { describe, it, expect } from 'vitest';
import {
  getDefaultPnlClass,
  buildStructuredVerticalPnl,
  buildStructuredTFormatPnl,
} from './pnlStructure';
import type { ReportLineItem } from '@/services/financeService';

describe('pnlStructure', () => {
  describe('getDefaultPnlClass', () => {
    it('correctly classifies revenue accounts by name regex', () => {
      expect(getDefaultPnlClass('Freight Revenue', null, true)).toBe('operating_income');
      expect(getDefaultPnlClass('Interest Income', null, true)).toBe('other_income');
      expect(getDefaultPnlClass('Gain on Disposal', null, true)).toBe('other_income');
    });

    it('correctly classifies expense accounts by name regex', () => {
      expect(getDefaultPnlClass('Cost of Services', null, false)).toBe('cost_of_sales');
      expect(getDefaultPnlClass('Direct Expenses', null, false)).toBe('cost_of_sales');
      expect(getDefaultPnlClass('Fuel Expense', null, false)).toBe('cost_of_sales');
      expect(getDefaultPnlClass('Office Rent', null, false)).toBe('operating_expense');
      expect(getDefaultPnlClass('Bank Finance Cost', null, false)).toBe('non_operating_expense');
      expect(getDefaultPnlClass('Loss on Disposal', null, false)).toBe('non_operating_expense');
    });

    it('uses parent account name when present', () => {
      expect(getDefaultPnlClass('Subcontractor Trip Cost', 'Cost of Sales Group', false)).toBe('cost_of_sales');
      expect(getDefaultPnlClass('Office Rent', 'Operating Expenses Group', false)).toBe('operating_expense');
    });
  });

  describe('buildStructuredVerticalPnl & buildStructuredTFormatPnl', () => {
    it('builds Q3 demo figures matching exact test specifications', () => {
      // Demo numbers from prompt verification criteria:
      // Operating Income: 125,005.00 (Freight Revenue 125,005.00)
      // Cost of Sales: 312,275.00 (Driver Salaries 174,500 · Fuel 91,425 · Tolls & Permits 24,750 · Vehicle Maintenance 12,000 · Subcontractor Haulage 9,600)
      // Operating Expenses: 133,045.00 (Insurance 71,645 · Office Rent 45,000 · General & Admin 16,400)
      const revenues: ReportLineItem[] = [
        { account_id: '1', account_code: '4010', name: 'Freight Revenue', amount: 125005 },
      ];

      const expenses: ReportLineItem[] = [
        // Cost of Services lines with parent_name "Cost of Services"
        { account_id: '2', account_code: '5020', name: 'Driver Salaries', parent_name: 'Cost of Services', amount: 174500 },
        { account_id: '3', account_code: '5030', name: 'Fuel', parent_name: 'Cost of Services', amount: 91425 },
        { account_id: '4', account_code: '5040', name: 'Tolls & Permits', parent_name: 'Cost of Services', amount: 24750 },
        { account_id: '5', account_code: '5050', name: 'Vehicle Maintenance', parent_name: 'Cost of Services', amount: 12000 },
        { account_id: '6', account_code: '5060', name: 'Subcontractor Haulage', parent_name: 'Cost of Services', amount: 9600 },
        // Operating expenses lines
        { account_id: '7', account_code: '6010', name: 'Insurance', parent_name: 'Operating Expenses', amount: 71645 },
        { account_id: '8', account_code: '6020', name: 'Office Rent', parent_name: 'Operating Expenses', amount: 45000 },
        { account_id: '9', account_code: '6030', name: 'General & Admin', parent_name: 'Operating Expenses', amount: 16400 },
      ];

      const vertical = buildStructuredVerticalPnl(revenues, expenses);

      expect(vertical.operatingIncomeTotal).toBe(125005);
      expect(vertical.costOfSalesTotal).toBe(312275);
      expect(vertical.grossProfit).toBe(-187270);
      expect(vertical.operatingExpenseTotal).toBe(133045);
      expect(vertical.operatingProfit).toBe(-320315);
      expect(vertical.netProfit).toBe(-320315);

      const tFormat = buildStructuredTFormatPnl(vertical);

      // Trading Part: Left = Cost of Sales 312,275.00; Right = Operating Income 125,005.00 + Gross Loss c/o 187,270.00 = 312,275.00
      expect(tFormat.trading.drTotal).toBe(312275);
      expect(tFormat.trading.crTotal).toBe(312275);
      expect(tFormat.trading.isLoss).toBe(true);

      // P&L Part: Left = Gross Loss b/f 187,270.00 + Operating Expenses 133,045.00 = 320,315.00; Right = By Net Loss 320,315.00
      expect(tFormat.pnl.drTotal).toBe(320315);
      expect(tFormat.pnl.crTotal).toBe(320315);
      expect(tFormat.pnl.isLoss).toBe(true);
    });

    it('asserts T-format Dr and Cr sides always balance for net profit cases', () => {
      const revenues: ReportLineItem[] = [
        { account_id: '1', account_code: '4000', name: 'Sales Revenue', amount: 500000 },
        { account_id: '4', account_code: '4200', name: 'Interest Income', amount: 5000 },
      ];

      const expenses: ReportLineItem[] = [
        { account_id: '2', account_code: '5000', name: 'Direct Cost of Revenue', amount: 200000 },
        { account_id: '3', account_code: '6000', name: 'Salaries & Rent', amount: 150000 },
        { account_id: '5', account_code: '7000', name: 'Bank Interest Expense', amount: 10000 },
      ];

      const vertical = buildStructuredVerticalPnl(revenues, expenses);
      expect(vertical.grossProfit).toBe(300000);
      expect(vertical.operatingProfit).toBe(150000);
      expect(vertical.netProfit).toBe(145000);

      const tFormat = buildStructuredTFormatPnl(vertical);

      expect(tFormat.trading.drTotal).toBe(500000);
      expect(tFormat.trading.crTotal).toBe(500000);
      expect(tFormat.pnl.drTotal).toBe(tFormat.pnl.crTotal);
    });

    it('correctly flags single-account groups and handles no-parent lines without synthetic duplication', () => {
      const revenues: ReportLineItem[] = [
        { account_id: '1', account_code: '4010', name: 'Freight Revenue', amount: 100000 },
      ];
      const expenses: ReportLineItem[] = [
        { account_id: '2', account_code: '5020', name: 'Driver Salaries', parent_name: 'Cost of Services', amount: 50000 },
      ];

      const vertical = buildStructuredVerticalPnl(revenues, expenses);
      const incGroup = vertical.sections.operating_income.groups[0];
      const expGroup = vertical.sections.cost_of_sales.groups[0];

      expect(incGroup.isSingleAccount).toBe(true);
      expect(expGroup.isSingleAccount).toBe(true);
      expect(incGroup.items.length).toBe(1);
      expect(expGroup.items.length).toBe(1);
    });
  });
});
