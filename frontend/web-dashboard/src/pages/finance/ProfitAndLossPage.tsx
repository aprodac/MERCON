import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { CalendarRange, Columns2, Download, Printer, SlidersHorizontal, TrendingUp, Truck, Building2, Coins, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ExportModal, { type ExportColumn } from '@/components/ui/ExportModal';
import { PeriodControl } from '@/components/finance/kit/PeriodControl';
import { SegmentedControl } from '@/components/finance/kit/SegmentedControl';
import { ReportViewState } from '@/components/finance/kit/ReportViewState';
import type { NegativeFormat } from '@/components/finance/kit/StatementTable';
import { TwoColumnStatement } from '@/components/finance/kit/TwoColumnStatement';
import { StatementCustomize } from '@/components/finance/kit/StatementCustomize';
import { AccountLedgerSheet, type LedgerAccount } from '@/components/finance/ledger/AccountLedgerSheet';
import { ProfitFlow } from '@/components/finance/pnl/ProfitFlow';
import { MonthlyPnlTable } from '@/components/finance/pnl/MonthlyPnlTable';
import { financeService, type ReportLineItem } from '@/services/financeService';
import { settingsService } from '@/services/settingsService';
import { buildStructuredVerticalPnl, clearPnlStoredOverrides, type PnlAccountItem, type PnlClass } from '@/lib/finance/pnlStructure';
import { resolveCompareColumns, resolvePeriodPreset, type CompareOption, type PeriodPreset } from '@/lib/finance/pnlPeriodHelpers';
import { PNL_SECTION_META, pnlTwoColumnParts } from '@/lib/finance/pnlView';
import { shareOf } from '@/lib/finance/statementModel';
import { formatDate, formatMoney } from '@/lib/finance/format';

type View = 'two_column' | 'monthly';
type PnlCompare = Extract<CompareOption, 'none' | 'previous_period' | 'same_period_last_year'>;

const OVERRIDES_KEY = 'mercon_pnl_classification_v1';
const SECTION_ICON = { operating_income: TrendingUp, cost_of_sales: Truck, operating_expense: Building2, other_income: Coins, non_operating_expense: ReceiptText };

function loadOverrides(): Record<string, PnlClass> {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

interface ExportRow {
  section: string;
  group: string;
  code: string;
  name: string;
  amount: number;
  share: number | null;
  compare: number | null;
}

export default function ProfitAndLossPage() {
  const [params, setParams] = useSearchParams();
  const set = (updates: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        Object.entries(updates).forEach(([k, val]) => (val === null || val === '' ? next.delete(k) : next.set(k, val)));
        return next;
      },
      { replace: true },
    );

  const rawView = params.get('view');
  const view: View = rawView === 'monthly' ? 'monthly' : 'two_column';
  const preset = (params.get('preset') as PeriodPreset) || 'this_quarter';
  const presetDates = resolvePeriodPreset(preset === 'custom' ? 'this_quarter' : preset);
  const dateFrom = params.get('date_from') || presetDates.from;
  const dateTo = params.get('date_to') || presetDates.to;
  const rawCompare = params.get('compare');
  const compareMode: PnlCompare = rawCompare === 'previous_period' || rawCompare === 'same_period_last_year' ? rawCompare : 'none';
  const showCodes = params.get('codes') === 'true';
  const keepZero = params.get('zero') === 'true';
  const negativeFormat: NegativeFormat = params.get('neg') === 'parens' ? 'parens' : 'minus';

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [highlight, setHighlight] = useState<string | null>(null);
  const [account, setAccount] = useState<LedgerAccount | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, PnlClass>>(loadOverrides);

  // Comparison period (two-column view) and one column per month (month-by-month view)
  const compareCol = view === 'two_column' && compareMode !== 'none' ? resolveCompareColumns(dateFrom, dateTo, compareMode)[0] ?? null : null;
  const months = useMemo(() => (view === 'monthly' ? resolveCompareColumns(dateFrom, dateTo, 'monthly') : []), [view, dateFrom, dateTo]);

  const main = useQuery({
    queryKey: ['finance-reports', 'pnl', dateFrom, dateTo],
    queryFn: () => financeService.getProfitAndLoss({ date_from: dateFrom, date_to: dateTo }),
  });
  const extraCols = compareCol ? [compareCol] : months;
  const extra = useQueries({
    queries: extraCols.map((c) => ({
      queryKey: ['finance-reports', 'pnl', c.from, c.to],
      queryFn: () => financeService.getProfitAndLoss({ date_from: c.from, date_to: c.to }),
    })),
  });
  const { data: company } = useQuery({ queryKey: ['settings', 'public'], queryFn: () => settingsService.getPublic() });

  const extraReady = extra.every((q) => q.data?.data);
  const v = useMemo(() => {
    const data = main.data?.data;
    if (!data) return null;
    const cols: Record<string, { revenues: ReportLineItem[]; expenses: ReportLineItem[] }> = {};
    if (extraReady) extraCols.forEach((c, i) => (cols[c.key] = { revenues: extra[i].data!.data.revenues, expenses: extra[i].data!.data.expenses }));
    return buildStructuredVerticalPnl(data.revenues, data.expenses, overrides, Object.keys(cols).length ? cols : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [main.data, extraReady, extra.map((q) => q.dataUpdatedAt).join(), overrides, compareCol?.key, months.length]);

  const comparing = Boolean(compareCol && extraReady);
  const compareKey = comparing ? compareCol!.key : null;
  const compareLabel = compareCol ? `${formatDate(compareCol.from)} – ${formatDate(compareCol.to)}` : undefined;

  const parts = useMemo(() => (v && view === 'two_column' ? pnlTwoColumnParts(v, { compareKey, keepZero }) : []), [v, view, compareKey, keepZero]);

  // Account id → where it sits, for the ledger panel's colour and context
  const placement = useMemo(() => {
    const map = new Map<string, { section: PnlClass; group: string }>();
    if (v) (Object.keys(v.sections) as PnlClass[]).forEach((k) => v.sections[k].groups.forEach((g) => g.items.forEach((i) => map.set(i.id, { section: k, group: g.name }))));
    return map;
  }, [v]);

  const openAccount = (item: PnlAccountItem) => {
    const where = placement.get(item.id);
    if (!item.account_id || !where) return;
    const meta = PNL_SECTION_META[where.section];
    setAccount({
      id: item.account_id,
      code: item.code,
      name: item.name,
      tone: meta.tone,
      icon: SECTION_ICON[where.section],
      context: where.group === item.name ? meta.label : `${meta.label} · ${where.group}`,
    });
  };

  const toggleGroup = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Clicking a flow step opens every group in that section, or closes them if all are open
  const toggleSection = (key: PnlClass) => {
    if (!v) return;
    const keys = v.sections[key].groups.filter((g) => g.items.length > 1).map((g) => `${key}/${g.key}`);
    setExpanded((prev) => {
      const next = new Set(prev);
      const allOpen = keys.length > 0 && keys.every((k) => next.has(k));
      keys.forEach((k) => (allOpen ? next.delete(k) : next.add(k)));
      return next;
    });
    setHighlight(key);
    document.getElementById(`stmt-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    window.setTimeout(() => setHighlight((h) => (h === key ? null : h)), 1400);
  };

  const exportRows: ExportRow[] = useMemo(() => {
    if (!v) return [];
    return (['operating_income', 'cost_of_sales', 'operating_expense', 'other_income', 'non_operating_expense'] as PnlClass[]).flatMap((k) =>
      v.sections[k].groups.flatMap((g) =>
        g.items.map((i) => ({
          section: PNL_SECTION_META[k].label,
          group: g.name,
          code: i.code ?? '',
          name: i.name,
          amount: i.amount,
          share: shareOf(i.amount, v.operatingIncomeTotal),
          compare: compareKey ? i.compareAmounts?.[compareKey] ?? 0 : null,
        })),
      ),
    );
  }, [v, compareKey]);
  const exportColumns: ExportColumn<ExportRow>[] = [
    { id: 'section', label: 'Section', accessor: (r) => r.section },
    { id: 'group', label: 'Group', accessor: (r) => r.group },
    { id: 'code', label: 'Account code', accessor: (r) => r.code },
    { id: 'name', label: 'Account', accessor: (r) => r.name },
    { id: 'amount', label: 'Amount (SAR)', accessor: (r) => r.amount },
    { id: 'share', label: '% of revenue', accessor: (r) => (r.share === null ? '' : r.share.toFixed(1)) },
    ...(compareKey ? [{ id: 'compare', label: `${compareLabel} (SAR)`, accessor: (r: ExportRow) => r.compare ?? 0 }] : []),
  ];

  return (
    <DashboardLayout active="finance" title="Profit & Loss" fixedViewport>
      <div className="mx-auto flex h-full w-full max-w-[1400px] min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 max-md:h-auto max-md:overflow-y-auto print:h-auto print:overflow-visible print:p-0">
        <div className="flex shrink-0 flex-wrap items-center gap-2 print:hidden">
          <Tabs value={view} onValueChange={(val) => set({ view: val === 'monthly' ? 'monthly' : null })}>
            <TabsList className="h-8">
              <TabsTrigger value="two_column" className="gap-1.5 text-xs"><Columns2 className="size-3.5" /> Statement</TabsTrigger>
              <TabsTrigger value="monthly" className="gap-1.5 text-xs"><CalendarRange className="size-3.5" /> Month by month</TabsTrigger>
            </TabsList>
          </Tabs>
          <PeriodControl preset={preset} from={dateFrom} to={dateTo} onChange={(p) => set({ preset: p.preset, date_from: p.from, date_to: p.to })} />
          {view === 'two_column' && (
            <SegmentedControl
              aria-label="Compare with"
              value={compareMode}
              onChange={(m) => set({ compare: m === 'none' ? null : m })}
              options={[
                { value: 'none', label: 'No comparison' },
                { value: 'previous_period', label: 'Previous period' },
                { value: 'same_period_last_year', label: 'Same period last year' },
              ]}
            />
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="icon" className="size-8" aria-label="Customize" title="Customize" onClick={() => setCustomizeOpen(true)}>
              <SlidersHorizontal className="size-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="size-8" aria-label="Print" title="Print" onClick={() => window.print()}>
              <Printer className="size-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!v} onClick={() => setExportOpen(true)}>
              <Download className="size-3.5" /> Export
            </Button>
          </div>
        </div>

        <div className="hidden text-center print:block">
          <p className="text-xs text-muted-foreground">{company?.companyLegalName || company?.appName}</p>
          <h1 className="text-xl font-semibold">Profit and loss</h1>
          <p className="text-xs text-muted-foreground">
            {formatDate(dateFrom)} – {formatDate(dateTo)} · amounts in SAR{compareLabel ? ` · compared with ${compareLabel}` : ''}
          </p>
        </div>

        <ReportViewState
          isLoading={main.isLoading}
          isError={main.isError}
          onRetry={() => main.refetch()}
          isEmpty={Boolean(main.data?.data && main.data.data.revenues.length === 0 && main.data.data.expenses.length === 0)}
          emptyTitle={`Nothing posted between ${formatDate(dateFrom)} and ${formatDate(dateTo)}`}
          emptyDescription="Pick another period, or post invoices, bills and expenses to see them here."
        >
          {v && (
            <>
              <div className="shrink-0 print:hidden">
                <ProfitFlow v={v} compareKey={compareKey} compareLabel={compareLabel} onSection={toggleSection} />
              </div>

              {view === 'two_column' && (
                <TwoColumnStatement
                  parts={parts.map((p) => ({
                    key: p.key,
                    title: p.title,
                    hint: p.hint,
                    left: { title: 'Costs', items: p.left, footer: p.total },
                    right: { title: 'Income', items: p.right, footer: p.total },
                  }))}
                  comparing={comparing}
                  compareLabel={compareLabel}
                  expanded={expanded}
                  onToggle={toggleGroup}
                  onLine={(line) => openAccount(line.ref as PnlAccountItem)}
                  showCodes={showCodes}
                  negativeFormat={negativeFormat}
                  highlight={highlight}
                  sectionIcons={SECTION_ICON}
                />
              )}

              {view === 'monthly' &&
                (extraReady ? (
                  <MonthlyPnlTable
                    v={v}
                    months={months}
                    expanded={expanded}
                    onToggle={toggleGroup}
                    onAccount={(item) => openAccount(item)}
                    showCodes={showCodes}
                    negativeFormat={negativeFormat}
                  />
                ) : (
                  <p className="shrink-0 text-xs text-muted-foreground">Loading {months.length} months…</p>
                ))}
            </>
          )}
        </ReportViewState>
      </div>

      <AccountLedgerSheet account={account} from={dateFrom} to={dateTo} onClose={() => setAccount(null)} />

      <StatementCustomize
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        showCodes={showCodes}
        onShowCodes={(val) => set({ codes: val ? 'true' : null })}
        keepZero={keepZero}
        onKeepZero={(val) => set({ zero: val ? 'true' : null })}
        negativeFormat={negativeFormat}
        onNegativeFormat={(val) => set({ neg: val === 'parens' ? 'parens' : null })}
        overrideCount={Object.keys(overrides).length}
        onResetOverrides={() => {
          clearPnlStoredOverrides();
          setOverrides({});
          toast.success('Groupings reset');
        }}
      />

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export profit and loss"
        subtitle={`${formatDate(dateFrom)} – ${formatDate(dateTo)} · revenue ${formatMoney(v?.operatingIncomeTotal ?? 0)} · ${(v?.netProfit ?? 0) < 0 ? 'net loss' : 'net profit'} ${formatMoney(Math.abs(v?.netProfit ?? 0))}`}
        data={exportRows}
        columns={exportColumns}
        filename={`Profit_Loss_${dateFrom}_${dateTo}`}
      />
    </DashboardLayout>
  );
}
