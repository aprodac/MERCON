import type { ReportLineItem } from '@/services/financeService';

export type AssetSubCategory =
  | 'Cash & bank'
  | 'Receivables'
  | 'Advances & prepayments'
  | 'Other current assets';

export type AssetCategory = 'Current assets' | 'Fixed assets' | 'Investments';
export type LiabilityCategory = 'Current liabilities' | 'Long-term liabilities';
export type EquityCategory = 'Capital account';

export type LiabilitySubCategory =
  | 'Payables'
  | 'Advances from customers'
  | 'Accruals & other';

export interface ClassifiedLineItem extends ReportLineItem {
  category: AssetCategory | LiabilityCategory | EquityCategory;
  subCategory?: AssetSubCategory | LiabilitySubCategory;
}

const LOCAL_STORAGE_KEY = 'mercon_bs_class_overrides';

export function getStoredOverrides(): Record<string, string> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveStoredOverrides(overrides: Record<string, string>): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // ignore
  }
}

export function clearBsStoredOverrides(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function classifyAssetAccount(
  item: ReportLineItem,
  overrides: Record<string, string> = {},
): { category: AssetCategory; subCategory?: AssetSubCategory } {
  const key = item.account_id || item.account_code || item.name;
  if (overrides[key]) {
    const ov = overrides[key];
    if (ov === 'Fixed assets') return { category: 'Fixed assets' };
    if (ov === 'Investments') return { category: 'Investments' };
    if (ov === 'Cash & bank') return { category: 'Current assets', subCategory: 'Cash & bank' };
    if (ov === 'Receivables') return { category: 'Current assets', subCategory: 'Receivables' };
    if (ov === 'Advances & prepayments')
      return { category: 'Current assets', subCategory: 'Advances & prepayments' };
    if (ov === 'Other current assets')
      return { category: 'Current assets', subCategory: 'Other current assets' };
  }

  const textToMatch = `${item.name} ${item.account_code || ''} ${item.parent_name || ''} ${item.parent_code || ''}`;

  if (/investment/i.test(textToMatch)) {
    return { category: 'Investments' };
  }
  if (item.is_bank_or_cash || /cash|bank|petty|al rajhi|snb|wio|stc pay/i.test(textToMatch)) {
    return { category: 'Current assets', subCategory: 'Cash & bank' };
  }
  if (/receivable/i.test(textToMatch)) {
    return { category: 'Current assets', subCategory: 'Receivables' };
  }
  if (/advance|prepaid|deposit/i.test(textToMatch)) {
    return { category: 'Current assets', subCategory: 'Advances & prepayments' };
  }
  if (/vehicle|truck|trailer|equipment|machinery|building|land|furniture|computer|fixed/i.test(textToMatch)) {
    return { category: 'Fixed assets' };
  }

  return { category: 'Current assets', subCategory: 'Other current assets' };
}

export function classifyLiabilityAccount(
  item: ReportLineItem,
  overrides: Record<string, string> = {},
): { category: LiabilityCategory; subCategory?: LiabilitySubCategory } {
  const key = item.account_id || item.account_code || item.name;
  if (overrides[key]) {
    const ov = overrides[key];
    if (ov === 'Long-term liabilities') return { category: 'Long-term liabilities' };
    if (ov === 'Payables') return { category: 'Current liabilities', subCategory: 'Payables' };
    if (ov === 'Advances from customers')
      return { category: 'Current liabilities', subCategory: 'Advances from customers' };
    if (ov === 'Accruals & other')
      return { category: 'Current liabilities', subCategory: 'Accruals & other' };
  }

  const textToMatch = `${item.name} ${item.account_code || ''} ${item.parent_name || ''} ${item.parent_code || ''}`;

  if (/customer advance|unearned|deferred/i.test(textToMatch)) {
    return { category: 'Current liabilities', subCategory: 'Advances from customers' };
  }
  if (/payable/i.test(textToMatch)) {
    return { category: 'Current liabilities', subCategory: 'Payables' };
  }
  if (/loan|long.?term|mortgage|financing/i.test(textToMatch)) {
    return { category: 'Long-term liabilities' };
  }

  return { category: 'Current liabilities', subCategory: 'Accruals & other' };
}

export function classifyEquityAccount(
  _item: ReportLineItem,
  _overrides: Record<string, string> = {},
): { category: EquityCategory } {
  return { category: 'Capital account' };
}
