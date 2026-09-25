import { Fragment } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChevronRight } from 'lucide-react';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { ScrollTableCard } from '@/components/finance/kit/ScrollTableCard';
import { TONE_CLASSES, toneDotVar } from '@/components/finance/kit/tones';
import type { NegativeFormat } from '@/components/finance/kit/StatementTable';
import type { CompareColumnMeta } from '@/lib/finance/pnlPeriodHelpers';
import type { PnlAccountItem, PnlClass, StructuredVerticalPnl } from '@/lib/finance/pnlStructure';
import { PNL_SECTION_META } from '@/lib/finance/pnlView';
import { formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

const ORDER: (PnlClass | 'gross' | 'operating')[] = ['operating_income', 'cost_of_sales', 'gross', 'operating_expense', 'operating', 'other_income', 'non_operating_expense'];
const cell = 'px-3 py-1.5 text-xs whitespace-nowrap';
const num = 'fin-num text-right';
const first = 'sticky left-0 z-[1] bg-inherit';

/**
 * Month-by-month P&L: net result per month as a chart, then every section and group across the
 * months with a total column. Groups open on click like the statement; accounts open their ledger.
 */
export function MonthlyPnlTable({
  v,
  months,
  expanded,
  onToggle,
  onAccount,
  showCodes,
  negativeFormat,
}: {
  /** Built with one compare column per month. */
  v: StructuredVerticalPnl;
  months: CompareColumnMeta[];
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onAccount: (item: PnlAccountItem, section: PnlClass) => void;
  showCodes: boolean;
  negativeFormat: NegativeFormat;
}) {
  const money = (n: number) => {
    if (Math.abs(n) < 0.005) return <span className="text-muted-foreground/60">—</span>;
    const text = formatMoney(Math.abs(n));
    if (n > 0) return text;
    return <span className={TONE_CLASSES.negative.fg}>{negativeFormat === 'parens' ? `(${text})` : `−${text}`}</span>;
  };
  const values = (perMonth: (key: string) => number, total: number, className?: string) => (
    <>
      {months.map((m) => (
        <td key={m.key} className={cn(cell, num, className)}>{money(perMonth(m.key))}</td>
      ))}
      <td className={cn(cell, num, 'border-l bg-muted/40 font-semibold', className)}>{money(total)}</td>
    </>
  );

  const chartData = months.map((m) => ({ label: m.label, net: Math.round((v.compareNetProfit?.[m.key] ?? 0) * 100) / 100 }));
  const chart: ChartConfig = { net: { label: 'Net result' } };

  return (
    <ScrollTableCard className="max-h-full flex-initial max-md:max-h-[75vh] print:max-h-none" containerClassName="print:overflow-visible">
      <div className="sticky left-0 border-b px-3 pb-1 pt-3">
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Net result by month</p>
        <ChartContainer config={chart} className="aspect-auto h-32 w-full">
          <BarChart data={chartData} margin={{ top: 4, left: 4, right: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} width={48} fontSize={11} tickFormatter={(n: number) => `${Math.round(n / 1000)}k`} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <ChartTooltip
              cursor={{ fill: 'var(--muted)' }}
              content={({ active, payload }) => {
                const p = active ? payload?.[0]?.payload : null;
                if (!p) return null;
                return (
                  <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-md">
                    <p className="text-muted-foreground">{p.label}</p>
                    <p className={cn('fin-num font-semibold', p.net < 0 ? TONE_CLASSES.negative.fg : TONE_CLASSES.positive.fg)}>
                      {p.net < 0 ? 'Loss ' : 'Profit '}
                      {formatMoney(Math.abs(p.net))}
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="net" radius={[3, 3, 3, 3]} maxBarSize={40}>
              {chartData.map((d) => (
                <Cell key={d.label} fill={toneDotVar(d.net < 0 ? 'negative' : 'positive')} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>

      <table className="w-full text-left" style={{ minWidth: `${280 + months.length * 110}px` }}>
        <thead className="sticky top-0 z-10 border-b bg-background shadow-xs">
          <tr className="bg-background">
            <th className={cn(cell, first, 'font-semibold')}>Account</th>
            {months.map((m) => (
              <th key={m.key} className={cn(cell, 'text-right font-semibold')}>{m.label}</th>
            ))}
            <th className={cn(cell, 'border-l bg-muted/40 text-right font-semibold')}>Total</th>
          </tr>
        </thead>
        <tbody>
          {ORDER.map((key) => {
            if (key === 'gross' || key === 'operating') {
              const label = key === 'gross' ? (v.grossProfit < 0 ? 'Gross loss' : 'Gross profit') : v.operatingProfit < 0 ? 'Operating loss' : 'Operating profit';
              const per = key === 'gross' ? v.compareGrossProfit : v.compareOperatingProfit;
              return (
                <tr key={key} className="border-y bg-muted font-semibold">
                  <td className={cn(cell, first, 'py-2')}>{label}</td>
                  {values((m) => per?.[m] ?? 0, key === 'gross' ? v.grossProfit : v.operatingProfit, 'py-2')}
                </tr>
              );
            }
            const sec = v.sections[key];
            if (sec.groups.length === 0 && key !== 'operating_income') return null;
            const meta = PNL_SECTION_META[key];
            const tone = TONE_CLASSES[meta.tone];
            return (
              <Fragment key={key}>
                <tr className={cn('border-y font-semibold', tone.bg, tone.border)}>
                  <td className={cn(cell, first, 'py-2', tone.fg)} title={meta.formal}>{meta.label}</td>
                  {values((m) => sec.compareTotals?.[m] ?? 0, sec.total, cn('py-2', tone.fg))}
                </tr>
                {sec.groups.map((g) => {
                  const gKey = `${key}/${g.key}`;
                  const single = g.items.length === 1;
                  const open = expanded.has(gKey);
                  return (
                    <Fragment key={gKey}>
                      <tr
                        onClick={() => (single ? onAccount(g.items[0], key) : onToggle(gKey))}
                        className="cursor-pointer border-b border-border/60 bg-card hover:bg-muted/50"
                      >
                        <td className={cn(cell, first, single ? 'pl-5' : '')}>
                          <span className="flex items-center gap-1.5">
                            {!single && <ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-90')} />}
                            {single && showCodes && g.items[0].code && <span className="w-10 text-muted-foreground tabular-nums">{g.items[0].code}</span>}
                            <span className="font-medium">{g.name}</span>
                          </span>
                        </td>
                        {values((m) => g.compareTotals?.[m] ?? 0, g.total)}
                      </tr>
                      {open &&
                        !single &&
                        g.items.map((i) => (
                          <tr key={i.id} onClick={() => onAccount(i, key)} className="cursor-pointer border-b border-border/60 bg-card text-muted-foreground hover:bg-muted/50">
                            <td className={cn(cell, first, 'pl-9')}>
                              {showCodes && i.code && <span className="mr-2 inline-block w-10 tabular-nums">{i.code}</span>}
                              {i.name}
                            </td>
                            {values((m) => i.compareAmounts?.[m] ?? 0, i.amount)}
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}
          <tr className={cn('sticky bottom-0 border-t-2 font-semibold', v.netProfit < 0 ? cn(TONE_CLASSES.negative.bg, TONE_CLASSES.negative.border) : cn(TONE_CLASSES.positive.bg, TONE_CLASSES.positive.border))}>
            <td className={cn(cell, first, 'py-2.5 text-[13px]', v.netProfit < 0 ? TONE_CLASSES.negative.fg : TONE_CLASSES.positive.fg)}>
              {v.netProfit < 0 ? 'Net loss' : 'Net profit'}
            </td>
            {values((m) => v.compareNetProfit?.[m] ?? 0, v.netProfit, 'py-2.5 text-[13px]')}
          </tr>
        </tbody>
      </table>
    </ScrollTableCard>
  );
}
