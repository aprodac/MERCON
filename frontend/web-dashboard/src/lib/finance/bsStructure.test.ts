import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyAssetAccount,
  classifyLiabilityAccount,
  classifyEquityAccount,
  getStoredOverrides,
  saveStoredOverrides,
  clearBsStoredOverrides,
} from './bsStructure';

describe('Balance Sheet Account Structure & Classification', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('classifies asset accounts into correct subcategories by default rules', () => {
    // Bank/cash asset
    const bankAcc = classifyAssetAccount({
      account_code: '1010',
      name: 'Al Rajhi Current Account',
      is_bank_or_cash: true,
      amount: 150000,
    });
    expect(bankAcc).toEqual({ category: 'Current assets', subCategory: 'Cash & bank' });

    // Receivables
    const recAcc = classifyAssetAccount({
      account_code: '1200',
      name: 'Accounts Receivable - Trade',
      amount: 80000,
    });
    expect(recAcc).toEqual({ category: 'Current assets', subCategory: 'Receivables' });

    // Advances & Prepayments
    const prepayAcc = classifyAssetAccount({
      account_code: '1300',
      name: 'Prepaid Rent & Provider Advances',
      amount: 5000,
    });
    expect(prepayAcc).toEqual({ category: 'Current assets', subCategory: 'Advances & prepayments' });

    // Fixed assets
    const fixedAcc = classifyAssetAccount({
      account_code: '1510',
      name: 'Heavy Freight Trucks & Vehicles',
      amount: 1200000,
    });
    expect(fixedAcc).toEqual({ category: 'Fixed assets' });

    // Investments
    const investAcc = classifyAssetAccount({
      account_code: '1600',
      name: 'Short-term Treasury Investments',
      amount: 250000,
    });
    expect(investAcc).toEqual({ category: 'Investments' });

    // Other current assets
    const otherAsset = classifyAssetAccount({
      account_code: '1400',
      name: 'Miscellaneous Security Deposit',
      amount: 1000,
    });
    expect(otherAsset).toEqual({ category: 'Current assets', subCategory: 'Advances & prepayments' });
  });

  it('classifies liability accounts into correct subcategories by default rules', () => {
    // Payables
    const payAcc = classifyLiabilityAccount({
      account_code: '2010',
      name: 'Accounts Payable - Vendors',
      amount: 64325,
    });
    expect(payAcc).toEqual({ category: 'Current liabilities', subCategory: 'Payables' });

    // Advances from customers
    const custAdvAcc = classifyLiabilityAccount({
      account_code: '2110',
      name: 'Customer Advance Unearned Revenue',
      amount: 3000,
    });
    expect(custAdvAcc).toEqual({
      category: 'Current liabilities',
      subCategory: 'Advances from customers',
    });

    // Long term liabilities
    const loanAcc = classifyLiabilityAccount({
      account_code: '2500',
      name: 'Long-term Bank Loan / Mortgage',
      amount: 500000,
    });
    expect(loanAcc).toEqual({ category: 'Long-term liabilities' });

    // Accruals & other
    const accrualAcc = classifyLiabilityAccount({
      account_code: '2200',
      name: 'Accrued Payroll & VAT',
      amount: 12000,
    });
    expect(accrualAcc).toEqual({ category: 'Current liabilities', subCategory: 'Accruals & other' });
  });

  it('classifies equity accounts to Capital account', () => {
    const ownerEquity = classifyEquityAccount({
      account_code: '3010',
      name: "Owner's Capital",
      amount: 1755000,
    });
    expect(ownerEquity).toEqual({ category: 'Capital account' });

    const currentEarnings = classifyEquityAccount({
      kind: 'current_year_earnings',
      name: 'Current Year Earnings',
      amount: -320315,
    });
    expect(currentEarnings).toEqual({ category: 'Capital account' });
  });

  it('respects per-account overrides in localStorage and clears correctly', () => {
    const overrides = {
      '1099': 'Fixed assets',
    };
    saveStoredOverrides(overrides);
    expect(getStoredOverrides()).toEqual(overrides);

    const overriddenAsset = classifyAssetAccount(
      { account_code: '1099', name: 'Custom Asset Account', amount: 5000 },
      overrides,
    );
    expect(overriddenAsset).toEqual({ category: 'Fixed assets' });

    clearBsStoredOverrides();
    expect(getStoredOverrides()).toEqual({});
  });

  it('classifies is_bank_or_cash accounts strictly to Cash & bank', () => {
    const res = classifyAssetAccount({
      account_code: '1015',
      name: 'Unspecified Account',
      is_bank_or_cash: true,
      amount: 50000,
    });
    expect(res).toEqual({ category: 'Current assets', subCategory: 'Cash & bank' });
  });
});
