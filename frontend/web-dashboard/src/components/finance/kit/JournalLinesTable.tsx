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
          'bg-muted/40 border border-border rounded-xl p-4 space-y-3 shadow-xs',
          className
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {title || 'Will Post to General Ledger'}
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset fin-num',
              isBalanced
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-600/20'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-600/20'
            )}
          >
            {isBalanced ? '✓ Balanced' : `Out by ${formatMoney(imbalance)}`}
          </span>
        </div>

        <div className="divide-y divide-border/60 text-xs">
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
                <div className="min-w-0 flex items-baseline gap-3">
                  {code && (
                    <span className="fin-num text-muted-foreground w-12 shrink-0">
                      {code}
                    </span>
                  )}
                  <div>
                    <div className="font-medium text-foreground truncate">
                      {name}
                    </div>
                    {line.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {line.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-right fin-num font-medium shrink-0">
                  {Number(line.debit) > 0 ? (
                    <span className="text-foreground">
                      Dr {formatMoney(line.debit)}
                    </span>
                  ) : Number(line.credit) > 0 ? (
                    <span className="text-muted-foreground">
                      Cr {formatMoney(line.credit)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
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
        'border border-border rounded-xl shadow-xs overflow-hidden bg-card',
        className
      )}
    >
      {title && (
        <div className="px-4 py-2.5 bg-muted/40 border-b border-border text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-muted/40 border-b border-border text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <th className="py-2.5 px-4 w-16">Code</th>
              <th className="py-2.5 px-4">Account</th>
              <th className="py-2.5 px-4 text-right w-36">Debit</th>
              <th className="py-2.5 px-4 text-right w-36">Credit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {lines.map((line, idx) => {
              const isCredit = (Number(line.credit) || 0) > 0;
              const code = line.account?.account_code || '';
              const name = line.account?.name || 'Account';

              return (
                <tr
                  key={line.id || idx}
                  className="hover:bg-muted/50 transition-colors h-9"
                >
                  <td className="py-2 px-4 fin-num text-muted-foreground w-16">
                    {code || '—'}
                  </td>
                  <td className={cn('py-2 px-4', isCredit ? 'pl-8' : '')}>
                    <div className="font-medium text-foreground">
                      {name}
                    </div>
                    {line.description && (
                      <div className="text-xs text-muted-foreground">
                        {line.description}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-4 text-right">
                    {Number(line.debit) > 0 ? (
                      <MoneyText value={line.debit} />
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="py-2 px-4 text-right">
                    {Number(line.credit) > 0 ? (
                      <MoneyText value={line.credit} tone="muted" />
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/40 border-t border-border font-semibold text-xs">
              <td colSpan={2} className="py-2.5 px-4 text-foreground flex items-center justify-between">
                <span>Totals ({currency})</span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset fin-num ml-2',
                    isBalanced
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-600/20'
                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-600/20'
                  )}
                >
                  {isBalanced ? '✓ Balanced' : `Out by ${formatMoney(imbalance)}`}
                </span>
              </td>
              <td className="py-2.5 px-4 text-right">
                <MoneyText value={totalDebit} size="md" />
              </td>
              <td className="py-2.5 px-4 text-right">
                <MoneyText value={totalCredit} size="md" />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

