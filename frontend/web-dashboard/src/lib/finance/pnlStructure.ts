import type { ReportLineItem } from '@/services/financeService';

export type RevenueClass = 'operating_income' | 'other_income';
export type ExpenseClass = 'cost_of_sales' | 'operating_expense' | 'non_operating_expense';
export type PnlClass = RevenueClass | ExpenseClass;

export const PNL_CLASS_LABELS: Record<PnlClass, string> = {
  operating_income: 'Operating Income',
  other_income: 'Other Income / Non-Operating Income',
  cost_of_sales: 'Cost of Sales',
  operating_expense: 'Operating Expenses',
  non_operating_expense: 'Non-Operating Expenses',
};

export function getDefaultPnlClass(
  accountName?: string | null,
  parentName?: string | null,
  isRevenue: boolean = false,
): PnlClass {
  const combined = `${parentName || ''} ${accountName || ''}`.trim();
  if (isRevenue) {
    if (/other income|interest income|gain/i.test(combined)) {
      return 'other_income';
    }
    return 'operating_income';
  } else {
    if (/cost of (sales|services|goods|revenue)|direct/i.test(combined)) {
      return 'cost_of_sales';
    }
    if (/interest|finance cost|loss on|non.?operating/i.test(combined)) {
      return 'non_operating_expense';
    }
    return 'operating_expense';
  }
}

export function clearPnlStoredOverrides(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem('mercon_pnl_classification_v1');
    }
  } catch {
    // ignore
  }
}

export interface PnlAccountItem extends ReportLineItem {
  id: string; // account_id || account_code
  code?: string;
  name: string;
  amount: number;
  compareAmounts?: Record<string, number>;
}

export interface PnlGroupRow {
  key: string;
  name: string;
  code?: string;
  items: PnlAccountItem[];
  total: number;
  compareTotals?: Record<string, number>;
  isSingleAccount?: boolean;
}

export interface PnlSection {
  key: PnlClass;
  name: string;
  groups: PnlGroupRow[];
  total: number;
  compareTotals?: Record<string, number>;
}

export interface StructuredVerticalPnl {
  sections: Record<PnlClass, PnlSection>;
  operatingIncomeTotal: number;
  costOfSalesTotal: number;
  grossProfit: number;
  operatingExpenseTotal: number;
  operatingProfit: number;
  otherIncomeTotal: number;
  nonOperatingExpenseTotal: number;
  netProfit: number;
  compareGrossProfit?: Record<string, number>;
  compareOperatingProfit?: Record<string, number>;
  compareNetProfit?: Record<string, number>;
}

export interface TFormatItem {
  key: string;
  label: string;
  code?: string;
  accountId?: string;
  amount: number;
  isHeader?: boolean;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  groups?: PnlGroupRow[];
}

export interface StructuredTFormatPnl {
  trading: {
    dr: TFormatItem[];
    cr: TFormatItem[];
    drTotal: number;
    crTotal: number;
    grossProfit: number;
    isLoss: boolean;
  };
  pnl: {
    dr: TFormatItem[];
    cr: TFormatItem[];
    drTotal: number;
    crTotal: number;
    netProfit: number;
    isLoss: boolean;
  };
}

export function buildStructuredVerticalPnl(
  revenues: ReportLineItem[],
  expenses: ReportLineItem[],
  customClassifications: Record<string, PnlClass> = {},
  compareItemsMap?: Record<string, { revenues: ReportLineItem[]; expenses: ReportLineItem[] }>,
): StructuredVerticalPnl {
  const sectionsData: Record<PnlClass, Map<string, PnlGroupRow>> = {
    operating_income: new Map(),
    other_income: new Map(),
    cost_of_sales: new Map(),
    operating_expense: new Map(),
    non_operating_expense: new Map(),
  };

  const processItems = (items: ReportLineItem[], isRevenue: boolean, periodKey?: string) => {
    for (const item of items) {
      const entityKey = String(item.parent_id || (item.parent_name ? `parent-${item.parent_name}` : item.account_id || item.account_code || item.name || 'unassigned'));
      const entityName = item.parent_name || item.name || 'Unassigned';
      const entityCode = item.parent_code || undefined;

      const customCls = customClassifications[entityKey];
      const pnlClass: PnlClass = customCls || getDefaultPnlClass(item.name, item.parent_name, isRevenue);

      const sectionMap = sectionsData[pnlClass];
      let group = sectionMap.get(entityKey);

      if (!group) {
        group = {
          key: entityKey,
          name: entityName,
          code: entityCode,
          items: [],
          total: 0,
          compareTotals: {},
        };
        sectionMap.set(entityKey, group);
      }

      const grp = group;

      if (!periodKey) {
        // Primary period item
        let accItem = grp.items.find((i) => i.account_code === item.account_code);
        if (!accItem) {
          accItem = {
            id: item.account_id || item.account_code || item.name || 'item',
            account_id: item.account_id || undefined,
            account_code: item.account_code || '',
            code: item.account_code || '',
            name: item.name || '',
            amount: item.amount,
            compareAmounts: {},
          };
          grp.items.push(accItem);
        } else {
          accItem.amount += item.amount;
        }
        grp.total += item.amount;
      } else {
        // Compare period item
        if (!grp.compareTotals) grp.compareTotals = {};
        grp.compareTotals[periodKey] = (grp.compareTotals[periodKey] || 0) + item.amount;
        let accItem = grp.items.find((i) => i.account_code === item.account_code);
        if (!accItem) {
          accItem = {
            id: item.account_id || item.account_code || item.name || 'item',
            account_id: item.account_id || undefined,
            account_code: item.account_code || '',
            code: item.account_code || '',
            name: item.name || '',
            amount: 0,
            compareAmounts: {},
          };
          grp.items.push(accItem);
        }
        if (!accItem.compareAmounts) accItem.compareAmounts = {};
        accItem.compareAmounts[periodKey] = (accItem.compareAmounts[periodKey] || 0) + item.amount;
      }
    }
  };

  // Primary period
  processItems(revenues, true);
  processItems(expenses, false);

  // Compare periods if provided
  if (compareItemsMap) {
    for (const [colKey, colData] of Object.entries(compareItemsMap)) {
      processItems(colData.revenues, true, colKey);
      processItems(colData.expenses, false, colKey);
    }
  }

  const sections: Record<PnlClass, PnlSection> = {
    operating_income: { key: 'operating_income', name: PNL_CLASS_LABELS.operating_income, groups: [], total: 0, compareTotals: {} },
    other_income: { key: 'other_income', name: PNL_CLASS_LABELS.other_income, groups: [], total: 0, compareTotals: {} },
    cost_of_sales: { key: 'cost_of_sales', name: PNL_CLASS_LABELS.cost_of_sales, groups: [], total: 0, compareTotals: {} },
    operating_expense: { key: 'operating_expense', name: PNL_CLASS_LABELS.operating_expense, groups: [], total: 0, compareTotals: {} },
    non_operating_expense: { key: 'non_operating_expense', name: PNL_CLASS_LABELS.non_operating_expense, groups: [], total: 0, compareTotals: {} },
  };

  const compareCols = compareItemsMap ? Object.keys(compareItemsMap) : [];

  (Object.keys(sectionsData) as PnlClass[]).forEach((cls) => {
    const groupList = Array.from(sectionsData[cls].values());
    groupList.sort((a, b) => String(a.code || a.name || '').localeCompare(String(b.code || b.name || '')));

    let secTotal = 0;
    const secCompareTotals: Record<string, number> = {};

    groupList.forEach((g) => {
      g.items.sort((a, b) => String(a.code || a.name || '').localeCompare(String(b.code || b.name || '')));
      secTotal += g.total;
      compareCols.forEach((col) => {
        secCompareTotals[col] = (secCompareTotals[col] || 0) + (g.compareTotals?.[col] || 0);
      });
      // Flag single account groups
      g.isSingleAccount =
        g.items.length === 1 &&
        (!g.items[0].parent_id ||
          g.name === g.items[0].name ||
          g.code === g.items[0].account_code ||
          g.key === g.items[0].account_id ||
          g.key === g.items[0].account_code);
    });

    sections[cls] = {
      key: cls,
      name: PNL_CLASS_LABELS[cls],
      groups: groupList,
      total: secTotal,
      compareTotals: secCompareTotals,
    };
  });

  const operatingIncomeTotal = sections.operating_income.total;
  const costOfSalesTotal = sections.cost_of_sales.total;
  const grossProfit = operatingIncomeTotal - costOfSalesTotal;

  const operatingExpenseTotal = sections.operating_expense.total;
  const operatingProfit = grossProfit - operatingExpenseTotal;

  const otherIncomeTotal = sections.other_income.total;
  const nonOperatingExpenseTotal = sections.non_operating_expense.total;
  const netProfit = operatingProfit + otherIncomeTotal - nonOperatingExpenseTotal;

  const compareGrossProfit: Record<string, number> = {};
  const compareOperatingProfit: Record<string, number> = {};
  const compareNetProfit: Record<string, number> = {};

  compareCols.forEach((col) => {
    const opInc = sections.operating_income.compareTotals?.[col] || 0;
    const cogs = sections.cost_of_sales.compareTotals?.[col] || 0;
    const gp = opInc - cogs;
    const opExp = sections.operating_expense.compareTotals?.[col] || 0;
    const opProf = gp - opExp;
    const othInc = sections.other_income.compareTotals?.[col] || 0;
    const nonOpExp = sections.non_operating_expense.compareTotals?.[col] || 0;
    const netProf = opProf + othInc - nonOpExp;

    compareGrossProfit[col] = gp;
    compareOperatingProfit[col] = opProf;
    compareNetProfit[col] = netProf;
  });

  return {
    sections,
    operatingIncomeTotal,
    costOfSalesTotal,
    grossProfit,
    operatingExpenseTotal,
    operatingProfit,
    otherIncomeTotal,
    nonOperatingExpenseTotal,
    netProfit,
    compareGrossProfit,
    compareOperatingProfit,
    compareNetProfit,
  };
}

export function buildStructuredTFormatPnl(
  verticalPnl: StructuredVerticalPnl,
): StructuredTFormatPnl {
  const {
    sections,
    operatingIncomeTotal,
    costOfSalesTotal,
    grossProfit,
    operatingExpenseTotal,
    otherIncomeTotal,
    nonOperatingExpenseTotal,
    netProfit,
  } = verticalPnl;

  const cogsGroups = sections.cost_of_sales.groups;
  const opIncGroups = sections.operating_income.groups;
  const opExpGroups = sections.operating_expense.groups;
  const nonOpExpGroups = sections.non_operating_expense.groups;
  const othIncGroups = sections.other_income.groups;

  const isGrossLoss = grossProfit < 0;
  const grossLossAmount = isGrossLoss ? Math.abs(grossProfit) : 0;
  const grossProfitAmount = !isGrossLoss ? grossProfit : 0;

  const tradingTargetTotal = Math.max(operatingIncomeTotal, costOfSalesTotal);

  // Trading Part Dr (Left)
  const tradingDr: TFormatItem[] = [];
  if (cogsGroups.length > 0) {
    tradingDr.push({
      key: 'to_cogs',
      label: 'To Cost of Sales',
      amount: costOfSalesTotal,
      isHeader: true,
      groups: cogsGroups,
    });
  }
  if (!isGrossLoss && grossProfitAmount > 0) {
    tradingDr.push({
      key: 'to_gross_profit_co',
      label: 'To Gross Profit c/o',
      amount: grossProfitAmount,
      isHeader: true,
    });
  }

  // Trading Part Cr (Right)
  const tradingCr: TFormatItem[] = [];
  if (opIncGroups.length > 0) {
    tradingCr.push({
      key: 'by_op_inc',
      label: 'By Operating Income',
      amount: operatingIncomeTotal,
      isHeader: true,
      groups: opIncGroups,
    });
  }
  if (isGrossLoss && grossLossAmount > 0) {
    tradingCr.push({
      key: 'by_gross_loss_co',
      label: 'By Gross Loss c/o',
      amount: grossLossAmount,
      isHeader: true,
    });
  }

  // P&L Part
  const isNetLoss = netProfit < 0;
  const netLossAmount = isNetLoss ? Math.abs(netProfit) : 0;
  const netProfitAmount = !isNetLoss ? netProfit : 0;

  const pnlDr: TFormatItem[] = [];
  const pnlCr: TFormatItem[] = [];

  if (isGrossLoss && grossLossAmount > 0) {
    pnlDr.push({
      key: 'to_gross_loss_bf',
      label: 'To Gross Loss b/f',
      amount: grossLossAmount,
      isHeader: true,
    });
  } else if (!isGrossLoss && grossProfitAmount > 0) {
    pnlCr.push({
      key: 'by_gross_profit_bf',
      label: 'By Gross Profit b/f',
      amount: grossProfitAmount,
      isHeader: true,
    });
  }

  if (opExpGroups.length > 0) {
    pnlDr.push({
      key: 'to_op_exp',
      label: 'To Operating Expenses',
      amount: operatingExpenseTotal,
      isHeader: true,
      groups: opExpGroups,
    });
  }

  if (nonOpExpGroups.length > 0) {
    pnlDr.push({
      key: 'to_non_op_exp',
      label: 'To Non-Operating Expenses',
      amount: nonOperatingExpenseTotal,
      isHeader: true,
      groups: nonOpExpGroups,
    });
  }

  if (othIncGroups.length > 0) {
    pnlCr.push({
      key: 'by_oth_inc',
      label: 'By Other Income',
      amount: otherIncomeTotal,
      isHeader: true,
      groups: othIncGroups,
    });
  }

  if (!isNetLoss && netProfitAmount >= 0) {
    pnlDr.push({
      key: 'to_net_profit',
      label: 'To Net Profit',
      amount: netProfitAmount,
      isHeader: true,
    });
  } else if (isNetLoss && netLossAmount > 0) {
    pnlCr.push({
      key: 'by_net_loss',
      label: 'By Net Loss',
      amount: netLossAmount,
      isHeader: true,
    });
  }

  const pnlDrTotal = pnlDr.reduce((sum, item) => sum + item.amount, 0);
  const pnlCrTotal = pnlCr.reduce((sum, item) => sum + item.amount, 0);

  return {
    trading: {
      dr: tradingDr,
      cr: tradingCr,
      drTotal: tradingTargetTotal,
      crTotal: tradingTargetTotal,
      grossProfit,
      isLoss: isGrossLoss,
    },
    pnl: {
      dr: pnlDr,
      cr: pnlCr,
      drTotal: pnlDrTotal,
      crTotal: pnlCrTotal,
      netProfit,
      isLoss: isNetLoss,
    },
  };
}
