import { Fragment } from 'react';
import { Card } from '@/components/ui/card';
import { HeadlineTerm } from '@/components/finance/kit/HeadlineTerm';
import type { PnlClass, StructuredVerticalPnl } from '@/lib/finance/pnlStructure';
import { PNL_SECTION_META } from '@/lib/finance/pnlView';
import { shareOf } from '@/lib/finance/statementModel';

const pct = (n: number | null) => (n === null ? '' : `${n.toFixed(1)}%`);

interface Step {
  key: string;
  op: '−' | '=' | '±' | null;
  section?: PnlClass;
  label: string;
  amount: number;
  compare: number | null;
  note: string;
  kind: 'money' | 'result' | 'final';
}

/**
 * The profit flow as the page header: Revenue − Direct costs = Gross profit − Overheads = Net result,
 * each cost with its share of revenue and each result with its margin. Clicking a section step
 * opens or closes that section in the statement.
 */
export function ProfitFlow({
  v,
  compareKey,
  compareLabel,
  onSection,
}: {
  v: StructuredVerticalPnl;
  compareKey: string | null;
  compareLabel?: string;
  onSection: (key: PnlClass) => void;
}) {
  const revenue = v.operatingIncomeTotal;
  const c = (totals: Record<string, number> | undefined) => (compareKey === null ? null : totals?.[compareKey] ?? 0);
  const other = v.otherIncomeTotal - v.nonOperatingExpenseTotal;
  const hasOther = Math.abs(v.otherIncomeTotal) >= 0.005 || Math.abs(v.nonOperatingExpenseTotal) >= 0.005;
  const otherCompare =
    compareKey === null ? null : (v.sections.other_income.compareTotals?.[compareKey] ?? 0) - (v.sections.non_operating_expense.compareTotals?.[compareKey] ?? 0);

  const steps: Step[] = [
    { key: 'rev', op: null, section: 'operating_income', label: 'Revenue', amount: revenue, compare: c(v.sections.operating_income.compareTotals), note: '', kind: 'money' },
    { key: 'cos', op: '−', section: 'cost_of_sales', label: 'Direct costs', amount: v.costOfSalesTotal, compare: c(v.sections.cost_of_sales.compareTotals), note: `${pct(shareOf(v.costOfSalesTotal, revenue))} of revenue`, kind: 'money' },
    { key: 'gross', op: '=', label: v.grossProfit < 0 ? 'Gross loss' : 'Gross profit', amount: v.grossProfit, compare: c(v.compareGrossProfit), note: `${pct(shareOf(v.grossProfit, revenue))} margin`, kind: 'result' },
    { key: 'opex', op: '−', section: 'operating_expense', label: 'Overheads', amount: v.operatingExpenseTotal, compare: c(v.sections.operating_expense.compareTotals), note: `${pct(shareOf(v.operatingExpenseTotal, revenue))} of revenue`, kind: 'money' },
    ...(hasOther
      ? [{ key: 'other', op: '±' as const, label: 'Other items', amount: other, compare: otherCompare, note: 'other income less other costs', kind: 'result' as const }]
      : []),
    { key: 'net', op: '=', label: v.netProfit < 0 ? 'Net loss' : 'Net profit', amount: v.netProfit, compare: c(v.compareNetProfit), note: `${pct(shareOf(v.netProfit, revenue))} margin`, kind: 'final' },
  ];

  return (
    <Card className="flex shrink-0 flex-row items-center gap-1 overflow-x-auto rounded-xl p-2.5 shadow-xs">
      {steps.map((s) => {
        const meta = s.section ? PNL_SECTION_META[s.section] : null;
        return (
          <Fragment key={s.key}>
            {s.op && <span className="shrink-0 px-0.5 text-lg font-light text-muted-foreground">{s.op}</span>}
            <HeadlineTerm
              label={s.label}
              amount={s.amount}
              tone={s.kind === 'final' ? (s.amount < 0 ? 'negative' : 'positive') : meta?.tone ?? 'neutral'}
              sense={meta?.sense ?? 'up-good'}
              compare={s.compare}
              compareLabel={compareLabel}
              note={s.note || undefined}
              outlined={s.kind === 'result'}
              className="min-w-36"
              title={meta ? `${meta.formal} — click to show or hide its accounts` : undefined}
              onClick={s.section ? () => onSection(s.section as PnlClass) : undefined}
            />
          </Fragment>
        );
      })}
    </Card>
  );
}
