import { useQuery } from '@tanstack/react-query';
import type { SummaryFigure } from '@/components/finance/kit/FigurePopover';
import { financeService, type AgeingRow } from '@/services/financeService';
import { addDays, collectionHealth, daysSalesOutstanding, overdueAmountOf, type AgeingDocument } from '@/lib/finance/ageing';
import { formatMoney } from '@/lib/finance/format';

const DSO_WINDOW = 90;

/** Collection health as two headline figures (overdue share, DSO), each with its breakdown. */
export function useCollectionHealthFigures(rows: AgeingRow[], docs: AgeingDocument[], priorRows: AgeingRow[], asOf: string): SummaryFigure[] {
  const health = collectionHealth(rows, docs);

  const from = addDays(asOf, -(DSO_WINDOW - 1));
  const { data: pnl } = useQuery({
    queryKey: ['finance-reports', 'profit-and-loss', from, asOf],
    queryFn: () => financeService.getProfitAndLoss({ date_from: from, date_to: asOf }),
  });
  const revenue = pnl?.data?.total_revenue ?? null;
  const dso = revenue === null ? null : daysSalesOutstanding(health.total, revenue, DSO_WINDOW);

  // Prior reports carry bucket totals only, which is enough for the overdue share
  const priorTotal = priorRows.reduce((s, r) => s + r.total, 0);
  const priorPct = priorTotal > 0 ? (priorRows.reduce((s, r) => s + overdueAmountOf(r), 0) / priorTotal) * 100 : null;

  const overdueTone = health.overduePct >= 40 ? 'negative' : health.overduePct >= 20 ? 'warning' : undefined;

  return [
    {
      id: 'overdue',
      label: 'Overdue',
      value: `${health.overduePct.toFixed(1)}%`,
      tone: overdueTone,
      breakdown: [
        { label: 'Overdue amount', value: `SAR ${formatMoney(health.overdue)}`, tone: overdueTone },
        ...(priorPct === null ? [] : [{ label: '30 days ago', value: `${priorPct.toFixed(1)}%` }]),
        { label: 'Avg days overdue (by amount)', value: health.weightedDaysOverdue === null ? '—' : health.weightedDaysOverdue.toFixed(1) },
        ...(health.topParty
          ? [{ label: `Largest: ${health.topParty.name}`, value: `${health.topParty.share.toFixed(1)}%`, tone: health.topParty.share >= 40 ? ('warning' as const) : undefined }]
          : []),
      ],
      explain:
        'Share of open receivables past due. Under 20% is healthy, 40% or more needs action. Average days overdue weights each late invoice by its balance. A single customer above 40% of receivables is a concentration risk.',
    },
    {
      id: 'dso',
      label: 'DSO',
      value: dso === null ? '—' : `${dso} days`,
      breakdown: [
        { label: 'Open receivables', value: `SAR ${formatMoney(health.total)}` },
        { label: `Revenue, last ${DSO_WINDOW} days`, value: revenue === null ? '—' : `SAR ${formatMoney(revenue)}` },
      ],
      explain: `Days sales outstanding: how many days of sales are still unpaid. Open receivables ÷ average daily revenue over the last ${DSO_WINDOW} days.`,
    },
  ];
}
