import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import type { ExpenseLink, ExpenseSummary } from '@/services/expenseService';
import { categoryTone, changePercent, LINK_KINDS, LINK_LABEL, LINK_TONE, monthLabel, share, type LinkKind } from '@/lib/expenses/expenseMeta';
import { formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

const MAX_CATEGORIES = 5;
const col = 'min-w-0 space-y-2.5 p-4';
const heading = 'text-[11px] font-medium text-muted-foreground';
const pressable = 'rounded-md outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring';

/**
 * The expenses page header: spend and its trend, what is still to pay, how it splits between
 * trucks, drivers and overhead, and the biggest categories. Every figure filters the list.
 */
export function ExpenseInsights({
  summary,
  isLoading,
  comparedWith,
  status,
  linked,
  category,
  onStatus,
  onLinked,
  onCategory,
  onMonth,
}: {
  summary: ExpenseSummary | undefined;
  isLoading: boolean;
  /** "previous 30 days" etc.; shown with the change. */
  comparedWith: string;
  status: string | null;
  linked: ExpenseLink | null;
  category: string | null;
  onStatus: (s: 'Pending' | null) => void;
  onLinked: (l: ExpenseLink | null) => void;
  onCategory: (c: string | null) => void;
  onMonth: (month: string) => void;
}) {
  if (isLoading && !summary) {
    return (
      <Card className="grid shrink-0 gap-0 rounded-xl py-0 shadow-xs lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2 p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </Card>
    );
  }
  const s = summary ?? { count: 0, total: 0, paid: 0, pending: 0, pending_count: 0, by_category: [], by_month: [], linked: { trip: 0, vehicle: 0, driver: 0, overhead: 0 }, top_payees: [], previous_total: null };
  const change = changePercent(s.total, s.previous_total);
  const maxMonth = Math.max(...s.by_month.map((m) => m.amount), 0);
  const cats = s.by_category.slice(0, MAX_CATEGORIES);
  const otherCats = s.by_category.slice(MAX_CATEGORIES).reduce((sum, c) => sum + c.amount, 0);
  const links: LinkKind[] = LINK_KINDS;

  return (
    <Card className="grid shrink-0 gap-0 divide-border/60 rounded-xl py-0 shadow-xs max-lg:divide-y lg:grid-cols-[1fr_1fr_1.2fr] lg:divide-x">
      {/* Spend and trend */}
      <div className={col}>
        <p className={heading}>Spent in period</p>
        <div className="flex items-baseline gap-2">
          <p className="fin-num text-2xl font-semibold leading-none text-foreground">
            <span className="mr-1 text-xs font-medium text-muted-foreground">SAR</span>
            {formatMoney(s.total)}
          </p>
          {change !== null && (
            <span
              className={cn('fin-num text-xs font-medium', Math.abs(change) < 0.05 ? 'text-muted-foreground' : change > 0 ? TONE_CLASSES.negative.fg : TONE_CLASSES.positive.fg)}
              title={`Compared with ${comparedWith}: SAR ${formatMoney(s.previous_total)}`}
            >
              {change > 0 ? '▲' : change < 0 ? '▼' : ''} {Math.abs(change).toFixed(1)}%
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {s.count} {s.count === 1 ? 'expense' : 'expenses'}
          {change !== null && ` · vs ${comparedWith}`}
        </p>
        {s.by_month.length > 1 && (
          <div className="flex h-10 items-end gap-0.5" role="list" aria-label="Spend by month">
            {s.by_month.map((m) => (
              <button
                key={m.month}
                type="button"
                role="listitem"
                title={`${monthLabel(m.month)}: SAR ${formatMoney(m.amount)} (${m.count})`}
                aria-label={`${monthLabel(m.month)}: SAR ${formatMoney(m.amount)}. Show only this month.`}
                onClick={() => onMonth(m.month)}
                className="group flex h-full min-w-0 flex-1 items-end outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn('block w-full rounded-sm bg-muted-foreground/25 transition-colors group-hover:bg-brand/70', m.amount > 0 ? '' : 'bg-muted')}
                  style={{ height: `${maxMonth > 0 ? Math.max(6, (m.amount / maxMonth) * 100) : 6}%` }}
                />
              </button>
            ))}
          </div>
        )}
        {s.by_month.length > 1 && (
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{monthLabel(s.by_month[0].month, true)}</span>
            <span>{monthLabel(s.by_month[s.by_month.length - 1].month, true)}</span>
          </div>
        )}
      </div>

      {/* To pay, and where it goes */}
      <div className={col}>
        <button
          type="button"
          onClick={() => onStatus(status === 'Pending' ? null : 'Pending')}
          className={cn(pressable, '-m-1.5 block w-[calc(100%+0.75rem)] p-1.5 text-left', status === 'Pending' && 'bg-muted')}
          title={status === 'Pending' ? 'Show all expenses' : 'Show only expenses still to pay'}
        >
          <p className={heading}>Still to pay</p>
          <p className={cn('fin-num text-xl font-semibold leading-tight', s.pending > 0.005 ? TONE_CLASSES.warning.fg : 'text-foreground')}>
            <span className="mr-1 text-xs font-medium text-muted-foreground">SAR</span>
            {formatMoney(s.pending)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {s.pending_count > 0 ? `${s.pending_count} pending ${s.pending_count === 1 ? 'expense' : 'expenses'}` : 'Nothing outstanding'}
          </p>
        </button>
        <div className="space-y-1.5 pt-1">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            {links.map((k) => (
              <span key={k} className={TONE_CLASSES[LINK_TONE[k]].dot} style={{ width: `${share(s.linked[k], s.total)}%` }} />
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1">
            {links.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onLinked(linked === k ? null : k)}
                className={cn(pressable, 'min-w-0 px-1 py-0.5 text-left', linked === k && 'bg-muted')}
                title={`Show only ${LINK_LABEL[k].toLowerCase()} costs`}
              >
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className={cn('size-1.5 rounded-full', TONE_CLASSES[LINK_TONE[k]].dot)} />
                  {LINK_LABEL[k]}
                </span>
                <span className="fin-num block truncate text-xs font-medium text-foreground">{formatMoney(s.linked[k])}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className={col}>
        <p className={heading}>By category</p>
        {cats.length === 0 ? (
          <p className="text-xs text-muted-foreground">No expenses in this period.</p>
        ) : (
          <>
            <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              {cats.map((c) => (
                <span key={c.category} className={TONE_CLASSES[categoryTone(c.category)].dot} style={{ width: `${share(c.amount, s.total)}%` }} />
              ))}
            </div>
            <ul className="space-y-0.5">
              {cats.map((c) => (
                <li key={c.category}>
                  <button
                    type="button"
                    onClick={() => onCategory(category === c.category ? null : c.category)}
                    className={cn(pressable, 'grid w-full grid-cols-[minmax(0,1fr)_auto_2.5rem] items-center gap-2 px-1 py-0.5 text-left text-xs', category === c.category && 'bg-muted')}
                    title={`Show only ${c.category}`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className={cn('size-1.5 shrink-0 rounded-full', TONE_CLASSES[categoryTone(c.category)].dot)} />
                      <span className="truncate text-foreground">{c.category}</span>
                    </span>
                    <span className="fin-num font-medium text-foreground">{formatMoney(c.amount)}</span>
                    <span className="fin-num text-right text-muted-foreground">{share(c.amount, s.total).toFixed(0)}%</span>
                  </button>
                </li>
              ))}
              {otherCats > 0.005 && (
                <li className="grid grid-cols-[minmax(0,1fr)_auto_2.5rem] gap-2 px-1 text-xs text-muted-foreground">
                  <span>{s.by_category.length - MAX_CATEGORIES} more</span>
                  <span className="fin-num">{formatMoney(otherCats)}</span>
                  <span className="fin-num text-right">{share(otherCats, s.total).toFixed(0)}%</span>
                </li>
              )}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}
