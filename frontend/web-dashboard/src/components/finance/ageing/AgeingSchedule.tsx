import { Fragment, useState, type ReactNode } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { ScrollTableCard } from '@/components/finance/kit/ScrollTableCard';
import type { AgeingDocument, ScheduleWeek } from '@/lib/finance/ageing';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';
import { TONE_CLASSES } from './tones';

const th = 'h-9 px-3 text-xs font-semibold text-foreground whitespace-nowrap';
const td = 'px-3 py-2 text-xs align-middle';

/** "Overdue", "25 Sep – 1 Oct", "After 6 Nov". */
function weekName(w: ScheduleWeek, short = false) {
  if (w.key === 'overdue') return 'Overdue';
  if (w.key === 'later') return `After ${formatDate(w.start).slice(0, -5)}`;
  const start = formatDate(w.start).slice(0, -5);
  return short ? start : `${start} – ${formatDate(w.end).slice(0, -5)}`;
}

/**
 * Forward schedule in one card: a chart of money in / out per week with the running cash line,
 * then one row per week (overdue → 6 weeks → later) that expands to its documents.
 */
export function AgeingSchedule({
  inflows,
  outflows,
  cash,
  startCash,
  inflowLabel = 'In',
  outflowLabel = 'Out',
  renderWeekAction,
  headerAction,
}: {
  inflows: ScheduleWeek[] | null;
  outflows: ScheduleWeek[] | null;
  cash: number[];
  startCash: number;
  inflowLabel?: string;
  outflowLabel?: string;
  renderWeekAction?: (week: ScheduleWeek) => ReactNode;
  headerAction?: ReactNode;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const base = inflows ?? outflows ?? [];
  const lowPoint = cash.findIndex((c) => c < 0);

  const data = base.map((w, i) => ({
    label: weekName(w, true),
    inflow: inflows?.[i]?.total ?? 0,
    outflow: outflows ? -(outflows[i]?.total ?? 0) : 0,
    cash: cash[i] ?? 0,
  }));
  const config: ChartConfig = {
    inflow: { label: inflowLabel, color: 'var(--chip-positive-dot)' },
    outflow: { label: outflowLabel, color: 'var(--chip-orange-dot)' },
    cash: { label: 'Cash after', color: 'var(--foreground)' },
  };

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const columns = 3 + (inflows ? 1 : 0) + (outflows ? 1 : 0) + (renderWeekAction ? 1 : 0);

  return (
    <ScrollTableCard
      className="max-h-full flex-initial max-md:max-h-[75vh]"
      toolbar={
        <>
          <p className="text-xs text-muted-foreground">
            Starting from <span className="fin-num font-medium text-foreground">SAR {formatMoney(startCash)}</span> in bank and cash
            {lowPoint >= 0 && <span className={TONE_CLASSES.negative.fg}> · cash goes below zero in {weekName(base[lowPoint])}</span>}
          </p>
          {headerAction}
        </>
      }
    >
      <div className="min-w-[560px] border-b px-3 pb-2 pt-3">
        <ChartContainer config={config} className="aspect-auto h-44 w-full">
          <ComposedChart data={data} margin={{ left: 4, right: 8, top: 4 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} width={48} fontSize={11} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => `${config[name as string]?.label ?? name}: SAR ${formatMoney(Math.abs(Number(v)))}`} />} />
            {inflows && <Bar dataKey="inflow" fill="var(--color-inflow)" radius={[3, 3, 0, 0]} maxBarSize={36} />}
            {outflows && <Bar dataKey="outflow" fill="var(--color-outflow)" radius={[0, 0, 3, 3]} maxBarSize={36} />}
            <Line dataKey="cash" type="monotone" stroke="var(--color-cash)" strokeWidth={2} dot={{ r: 2.5 }} />
          </ComposedChart>
        </ChartContainer>
      </div>

      <table className="w-full min-w-[560px] text-left">
        <thead className="sticky top-0 z-10 border-b bg-background shadow-xs">
          <tr>
            <th className={cn(th, 'w-8')} />
            <th className={th}>Week</th>
            {inflows && <th className={cn(th, 'text-right')}>{inflowLabel}</th>}
            {outflows && <th className={cn(th, 'text-right')}>{outflowLabel}</th>}
            <th className={cn(th, 'text-right')}>Cash after</th>
            {renderWeekAction && <th className={cn(th, 'w-28')} />}
          </tr>
        </thead>
        <tbody>
          {base.map((w, i) => {
            const docsIn = inflows?.[i]?.docs ?? [];
            const docsOut = outflows?.[i]?.docs ?? [];
            const count = docsIn.length + docsOut.length;
            const isOpen = open.has(w.key);
            const rows: { d: AgeingDocument; dir: 'in' | 'out' }[] = [
              ...docsIn.map((d) => ({ d, dir: 'in' as const })),
              ...docsOut.map((d) => ({ d, dir: 'out' as const })),
            ];
            return (
              <Fragment key={w.key}>
                <tr className={cn('border-b transition-colors hover:bg-muted/40', (cash[i] ?? 0) < 0 && TONE_CLASSES.negative.bg)}>
                  <td className={td}>
                    {count > 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Hide' : 'Show'} documents for ${weekName(w)}`}
                        onClick={() => toggle(w.key)}
                      >
                        <ChevronRight className={cn('size-4 transition-transform', isOpen && 'rotate-90')} />
                      </Button>
                    )}
                  </td>
                  <td className={td}>
                    <span className={cn('font-medium', w.key === 'overdue' && count > 0 ? TONE_CLASSES.warning.fg : 'text-foreground')}>{weekName(w)}</span>
                    <span className="ml-2 text-[11px] text-muted-foreground">{count === 0 ? 'nothing due' : `${count} due`}</span>
                  </td>
                  {inflows && (
                    <td className={cn(td, 'fin-num text-right', docsIn.length ? TONE_CLASSES.positive.fg : 'text-muted-foreground')}>
                      {docsIn.length ? `+${formatMoney(inflows[i].total)}` : '—'}
                    </td>
                  )}
                  {outflows && (
                    <td className={cn(td, 'fin-num text-right', docsOut.length ? TONE_CLASSES.orange.fg : 'text-muted-foreground')}>
                      {docsOut.length ? `−${formatMoney(outflows[i].total)}` : '—'}
                    </td>
                  )}
                  <td className={cn(td, 'fin-num text-right font-semibold', (cash[i] ?? 0) < 0 ? TONE_CLASSES.negative.fg : 'text-foreground')}>
                    {formatMoney(cash[i] ?? 0)}
                  </td>
                  {renderWeekAction && <td className={cn(td, 'text-right')}>{renderWeekAction(w)}</td>}
                </tr>
                {isOpen &&
                  rows.map(({ d, dir }) => (
                    <tr key={`${dir}-${d.id}`} className="border-b bg-muted/30 text-muted-foreground">
                      <td />
                      <td className={cn(td, 'pl-5')}>
                        <span className="font-medium text-foreground">{d.ref_id ?? d.id.slice(0, 8)}</span> · {d.party_name} · due{' '}
                        {formatDate(d.due_date ?? d.doc_date)}
                        {d.days_overdue > 0 && ` · ${d.days_overdue} days overdue`}
                      </td>
                      {inflows && <td className={cn(td, 'fin-num text-right')}>{dir === 'in' ? formatMoney(d.balance) : ''}</td>}
                      {outflows && <td className={cn(td, 'fin-num text-right')}>{dir === 'out' ? formatMoney(d.balance) : ''}</td>}
                      <td />
                      {renderWeekAction && <td />}
                    </tr>
                  ))}
              </Fragment>
            );
          })}
          {base.length === 0 && (
            <tr>
              <td colSpan={columns} className="py-10 text-center text-xs text-muted-foreground">Nothing scheduled.</td>
            </tr>
          )}
        </tbody>
      </table>
    </ScrollTableCard>
  );
}
