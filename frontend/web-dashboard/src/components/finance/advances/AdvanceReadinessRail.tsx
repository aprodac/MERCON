import React from 'react';
import { Link } from 'react-router-dom';
import { Check, X, AlertCircle } from 'lucide-react';
import { JournalLinesTable } from '@/components/finance/kit';
import type { Account, AdvancePartyType, AdvanceDirection, AccountingPeriod, Settings } from '@mercon/shared-types';

interface ReadinessCheck {
  id: string;
  label: string;
  passed: boolean;
  errorMsg?: string;
  settingsLink?: boolean;
}

interface AdvanceReadinessRailProps {
  partyType: AdvancePartyType;
  direction: AdvanceDirection;
  amount: number;
  advanceDate: string;
  accountId: string;
  bankAccounts: any[];
  accounts: Account[];
  periods: AccountingPeriod[];
  settings?: Settings | null;
  apiError?: string | null;
}

export const AdvanceReadinessRail: React.FC<AdvanceReadinessRailProps> = ({
  partyType,
  direction,
  amount,
  advanceDate,
  accountId,
  bankAccounts,
  accounts,
  periods,
  settings,
  apiError,
}) => {
  // 1. Resolve configured default advance account ID from settings
  let defaultAdvAccountId: string | null | undefined = null;
  let defaultAdvAccountName = 'Default Advance Account';

  if (direction === 'Received' && partyType === 'Customer') {
    defaultAdvAccountId = settings?.defaultCustomerAdvanceAccountId;
    defaultAdvAccountName = 'Customer Advances Liability (2210)';
  } else if (direction === 'Paid') {
    if (partyType === 'Provider') {
      defaultAdvAccountId = settings?.defaultProviderAdvanceAccountId;
      defaultAdvAccountName = 'Provider Advances Asset (1310)';
    } else if (partyType === 'Employee') {
      defaultAdvAccountId = settings?.defaultEmployeeAdvanceAccountId;
      defaultAdvAccountName = 'Employee Advances Asset (1320)';
    }
  }

  const configuredAdvAccount = accounts.find((a) => a.id === defaultAdvAccountId);
  if (configuredAdvAccount) {
    defaultAdvAccountName = `${configuredAdvAccount.name} (${configuredAdvAccount.account_code})`;
  }

  // Selected Bank Account
  const selectedBankObj = accounts.find((a) => a.id === accountId);
  const selectedBankName = selectedBankObj
    ? `${selectedBankObj.name} (${selectedBankObj.account_code})`
    : 'Selected Bank / Cash Account';

  // 2. Readiness Checks
  const dateObj = new Date(advanceDate);
  const openPeriodCoversDate = periods.some(
    (p) =>
      p.status === 'Open' &&
      new Date(p.start_date) <= dateObj &&
      new Date(p.end_date) >= dateObj
  );

  const checks: ReadinessCheck[] = [
    {
      id: 'period',
      label: `Open period covers ${advanceDate}`,
      passed: openPeriodCoversDate,
      errorMsg: 'No open accounting period covers this date',
    },
    {
      id: 'settings',
      label: `Default ${partyType} advance account configured in Settings`,
      passed: Boolean(defaultAdvAccountId),
      errorMsg: 'Configure default advance account in Settings',
      settingsLink: true,
    },
    {
      id: 'bank',
      label: 'Bank or cash account selected',
      passed: Boolean(accountId),
      errorMsg: 'Select a deposit/payment account',
    },
    {
      id: 'amount',
      label: 'Amount is greater than 0.00 SAR',
      passed: amount > 0,
      errorMsg: 'Amount must be greater than 0',
    },
  ];

  const allPassed = checks.every((c) => c.passed);

  // 3. Generate Will Post Preview Lines
  const previewLines = React.useMemo(() => {
    if (amount <= 0 || !accountId || !defaultAdvAccountId) return [];

    const bankAcc = selectedBankObj || { account_code: '1010', name: 'Bank Account' };
    const advAcc = configuredAdvAccount || { account_code: 'ADV', name: defaultAdvAccountName };

    if (direction === 'Received') {
      // Dr Bank / Cr Customer Advance Liability
      return [
        { account: bankAcc as Account, debit: amount, credit: 0 },
        { account: advAcc as Account, debit: 0, credit: amount },
      ];
    } else {
      // Dr Provider/Employee Advance Asset / Cr Bank
      return [
        { account: advAcc as Account, debit: amount, credit: 0 },
        { account: bankAcc as Account, debit: 0, credit: amount },
      ];
    }
  }, [amount, accountId, defaultAdvAccountId, selectedBankObj, configuredAdvAccount, direction, defaultAdvAccountName]);

  return (
    <div className="w-full lg:w-[360px] shrink-0 space-y-4">
      {/* Readiness Checks Card */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Readiness Checks
        </h3>

        <div className="space-y-2">
          {checks.map((check) => (
            <div key={check.id} className="flex items-start gap-2.5 text-xs">
              <div
                className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                  check.passed
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                    : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                }`}
              >
                {check.passed ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : <X className="w-2.5 h-2.5 stroke-[3]" />}
              </div>
              <div className="flex-1">
                <span
                  className={
                    check.passed
                      ? 'text-slate-700 dark:text-slate-300 font-medium'
                      : 'text-rose-600 dark:text-rose-400 font-semibold'
                  }
                >
                  {check.passed ? check.label : check.errorMsg}
                </span>
                {!check.passed && check.settingsLink && (
                  <Link to="/settings" className="ml-1.5 text-brand underline font-bold hover:text-brand-dark">
                    Settings →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* API Error Box */}
        {apiError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            <div className="font-medium">{apiError}</div>
          </div>
        )}
      </div>

      {/* Will Post Preview Card */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Will Post (GL Preview)
        </h3>

        {previewLines.length > 0 ? (
          <JournalLinesTable lines={previewLines as any} variant="preview" />
        ) : (
          <div className="p-4 text-center text-xs text-slate-400 dark:text-slate-600 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            Complete form fields to preview entry.
          </div>
        )}
      </div>
    </div>
  );
};
