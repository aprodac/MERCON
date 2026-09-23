import React from 'react';
import { MoneyText } from './MoneyText';
import { formatMoney } from '@/lib/finance';
import { cn } from '@/lib/utils';

export interface JournalLineItem {
  id?: string;
  account?: {
    account_code?: string;
    name?: string;
    account_type?: string;
  };
  accountId?: string;
  debit?: number | string | null;
  credit?: number | string | null;
  description?: string | null;
}

export interface JournalLinesTableProps {
  lines?: JournalLineItem[] | null;
  title?: React.ReactNode;
  variant?: 'posted' | 'preview';
  currency?: string;
  className?: string;
}

export function JournalLinesTable({
  lines: rawLines,
  title,
  variant = 'posted',
  currency = 'SAR',
  className,
}: JournalLinesTableProps) {
  const lines = rawLines || [];
  const totalDebit = lines.reduce(
    (acc, l) => acc + (l.debit ? Number(l.debit) || 0 : 0),
    0
  );
  const totalCredit = lines.reduce(
    (acc, l) => acc + (l.credit ? Number(l.credit) || 0 : 0),
    0
  );
  const isBalanced =
    totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01;
  const imbalance = Math.abs(totalDebit - totalCredit);

  if (variant === 'preview') {
    return (
      <div
        className={cn(
          'bg-[#F7F8FA] dark:bg-slate-900/50 border border-black/[0.06] dark:border-slate-800 rounded-[14px] p-4 space-y-3',
          className
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#757583] dark:text-slate-400">
            {title || 'Will Post to General Ledger'}
          </span>
          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-[10.5px] font-bold fin-num',
              isBalanced
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
            )}
          >
            {isBalanced ? '✓ Balanced' : `Out by ${formatMoney(imbalance)}`}
          </span>
        </div>

        <div className="divide-y divide-black/[0.04] dark:divide-slate-800/60 text-[12.5px]">
          {lines.map((line, idx) => {
            const isCredit = (Number(line.credit) || 0) > 0;
            const code = line.account?.account_code || '';
            const name = line.account?.name || 'Account';

            return (
              <div
                key={idx}
                className={cn(
                  'py-2 flex items-center justify-between gap-4',
                  isCredit ? 'pl-4' : ''
                )}
              >
                <div className="min-w-0">
                  <div className="font-medium text-[#111111] dark:text-slate-200 truncate">
                    {code && (
                      <span className="fin-num text-[#757583] dark:text-slate-400 mr-1.5">
                        {code}
                      </span>
                    )}
                    <span>{name}</span>
                  </div>
                  {line.description && (
                    <p className="text-[11px] text-[#757583] dark:text-slate-400 truncate">
                      {line.description}
                    </p>
                  )}
                </div>

                <div className="text-right font-mono font-medium shrink-0">
                  {Number(line.debit) > 0 ? (
                    <span className="text-[#111111] dark:text-slate-100">
                      Dr {formatMoney(line.debit)}
                    </span>
                  ) : Number(line.credit) > 0 ? (
                    <span className="text-[#6E6E80] dark:text-slate-400">
                      Cr {formatMoney(line.credit)}
                    </span>
                  ) : (
                    <span className="text-[#6E6E80]/40">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'border border-black/[0.06] dark:border-slate-800 rounded-[14px] overflow-hidden bg-white dark:bg-slate-900',
        className
      )}
    >
      {title && (
        <div className="px-4 py-3 bg-[#FAFAFB] dark:bg-slate-800/40 border-b border-black/[0.06] dark:border-slate-800 text-xs font-bold uppercase tracking-wider text-[#757583] dark:text-slate-400">
          {title}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px] border-collapse">
          <thead>
            <tr className="bg-[#FAFAFB] dark:bg-slate-800/40 border-b border-black/[0.06] dark:border-slate-800 text-[10px] font-bold uppercase tracking-[0.1em] text-[#757583] dark:text-slate-400">
              <th className="py-2.5 px-4">Account</th>
              <th className="py-2.5 px-4 text-right w-36">Debit</th>
              <th className="py-2.5 px-4 text-right w-36">Credit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.04] dark:divide-slate-800/60">
            {lines.map((line, idx) => {
              const isCredit = (Number(line.credit) || 0) > 0;
              const code = line.account?.account_code || '';
              const name = line.account?.name || 'Account';

              return (
                <tr
                  key={line.id || idx}
                  className="hover:bg-[#FAFAFB] dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className={cn('py-2.5 px-4', isCredit ? 'pl-8' : '')}>
                    <div className="font-medium text-[#111111] dark:text-slate-200">
                      {code && (
                        <span className="fin-num text-[#757583] dark:text-slate-400 mr-2">
                          {code}
                        </span>
                      )}
                      <span>{name}</span>
                    </div>
                    {line.description && (
                      <div className="text-[11.5px] text-[#757583] dark:text-slate-400">
                        {line.description}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {Number(line.debit) > 0 ? (
                      <MoneyText value={line.debit} />
                    ) : (
                      <span className="text-[#6E6E80]/40">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {Number(line.credit) > 0 ? (
                      <MoneyText value={line.credit} tone="muted" />
                    ) : (
                      <span className="text-[#6E6E80]/40">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[#F7F8FA] dark:bg-slate-900/50 border-t border-black/[0.06] dark:border-slate-800 font-semibold text-xs">
              <td className="py-3 px-4 text-[#111111] dark:text-slate-200 flex items-center justify-between">
                <span>Totals ({currency})</span>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10.5px] font-bold fin-num ml-2',
                    isBalanced
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                  )}
                >
                  {isBalanced ? '✓ Balanced' : `Out by ${formatMoney(imbalance)}`}
                </span>
              </td>
              <td className="py-3 px-4 text-right">
                <MoneyText value={totalDebit} size="md" />
              </td>
              <td className="py-3 px-4 text-right">
                <MoneyText value={totalCredit} size="md" />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
