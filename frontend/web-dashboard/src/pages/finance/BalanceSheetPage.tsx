import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Printer, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import ExportModal, { type ExportColumn } from '@/components/ui/ExportModal';
import { AsOfControl, asOfPresetDate } from '@/components/finance/kit/AsOfControl';
import { ReportViewState } from '@/components/finance/kit/ReportViewState';
import { AccountLedgerSheet, type LedgerAccount } from '@/components/finance/ledger/AccountLedgerSheet';
import { BalanceEquation, SECTION_TONE } from '@/components/finance/balance-sheet/BalanceEquation';
import { StatementCustomize } from '@/components/finance/kit/StatementCustomize';
import { BiggestChanges, CompareModePicker, OnlyChangedToggle } from '@/components/finance/balance-sheet/CompareControls';
import { BS_SECTION_ICON, BalanceSheetStatement, type NegativeFormat, type StatementPart } from '@/components/finance/balance-sheet/BalanceSheetStatement';
import { financeService, type AgeingReportData } from '@/services/financeService';
import { settingsService } from '@/services/settingsService';
import {
  balanceSheetCompareDate,
  biggestChanges,
  buildBalanceSheetTree,
  onlyChangedSection,
  clearBsStoredOverrides,
  getStoredOverrides,
  type BsAccountRow,
  type BsCompareMode,
  type BsGroup,
  type BsSection,
  type BsSectionKey,
} from '@/lib/finance/bsStructure';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { addDays } from '@/lib/finance/ageing';

/** The account panel shows the last 90 days up to the as-of date. */
const LEDGER_WINDOW_DAYS = 90;


interface ExportRow {
  section: string;
  block: string;
  group: string;
  code: string;
  name: string;
  amount: number;
  compare: number | null;
}

/** Share of an ageing report that is past due, for the badge on Receivables / Payables. */
const overduePct = (r?: AgeingReportData) => {
  const total = r?.grand_total?.total ?? 0;
  return total > 0 ? ((total - (r?.grand_total?.current ?? 0)) / total) * 100 : 0;
};

export default function BalanceSheetPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const set = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const asOf = params.get('as_of') || asOfPresetDate('today');
  const compareMode = (params.get('compare') as BsCompareMode) || 'none';
  const showCodes = params.get('codes') === 'true';
  const keepZero = params.get('zero') === 'true';
  const negativeFormat: NegativeFormat = params.get('neg') === 'parens' ? 'parens' : 'minus';
  const customCompare = params.get('compare_to') || balanceSheetCompareDate(asOf, 'prev_month') || asOf;
  const compareDate = balanceSheetCompareDate(asOf, compareMode, customCompare);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [highlight, setHighlight] = useState<BsSectionKey | null>(null);
  const [account, setAccount] = useState<LedgerAccount | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>(() => getStoredOverrides());

  const report = useQuery({
    queryKey: ['finance-reports', 'balance-sheet', asOf],
    queryFn: () => financeService.getBalanceSheet({ as_of: asOf }),
  });
  const prior = useQuery({
    queryKey: ['finance-reports', 'balance-sheet', compareDate],
    queryFn: () => financeService.getBalanceSheet({ as_of: compareDate as string }),
    enabled: compareDate !== null,
  });
  // Same keys as the ageing pages' comparison queries, so the cache is shared
  const ar = useQuery({ queryKey: ['finance-reports', 'ar-ageing', asOf, 'due'], queryFn: () => financeService.getARAgeing({ as_of: asOf, basis: 'due' }) });
  const ap = useQuery({ queryKey: ['finance-reports', 'ap-ageing', asOf, 'due'], queryFn: () => financeService.getAPAgeing({ as_of: asOf, basis: 'due' }) });
  const { data: company } = useQuery({ queryKey: ['settings', 'public'], queryFn: () => settingsService.getPublic() });

  const comparing = compareDate !== null && Boolean(prior.data?.data);
  const tree = useMemo(
    () => (report.data?.data ? buildBalanceSheetTree(report.data.data, comparing ? prior.data!.data : null, { overrides, keepZero }) : null),
    [report.data, prior.data, comparing, overrides, keepZero],
  );

  const asOfLabel = formatDate(asOf);
  const onlyChanged = comparing && params.get('changed') === 'true';
  const changes = useMemo(() => (tree && comparing ? biggestChanges(tree) : []), [tree, comparing]);
  const shown = (sec: BsSection) => (onlyChanged ? onlyChangedSection(sec) : sec);
  const compareLabel = compareDate ? formatDate(compareDate) : undefined;

  // Clicking an equation term opens every group in that section, or closes them if all are open
  const toggleSection = (key: BsSectionKey) => {
    if (!tree) return;
    const keys = tree[key].blocks.flatMap((b) => b.groups.filter((g) => g.accounts.length > 1).map((g) => g.key));
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

  const toggleGroup = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const openAccount = (row: BsAccountRow) => {
    const { item } = row;
    const year = Number(asOf.slice(0, 4));
    if (item.kind === 'current_year_earnings') navigate(`/finance/profit-and-loss?date_from=${year}-01-01&date_to=${asOf}`);
    else if (item.kind === 'unclosed_prior_earnings') navigate(`/finance/profit-and-loss?date_from=${year - 1}-01-01&date_to=${year - 1}-12-31`);
    else if (item.account_id && tree) {
      // Where the account sits, for the side panel's colour and breadcrumb
      for (const s of [tree.assets, tree.liabilities, tree.equity]) {
        for (const b of s.blocks) {
          const g = b.groups.find((grp) => grp.accounts.some((a) => a.key === row.key));
          if (g) {
            const group = g.accounts.length === 1 && g.label === item.name ? b.label : g.label;
            setAccount({ id: item.account_id, code: item.account_code, name: item.name, tone: SECTION_TONE[s.key], icon: BS_SECTION_ICON[s.key], context: `${s.label} · ${group}` });
            return;
          }
        }
      }
    }
  };

  const badge = (g: BsGroup) => {
    const target =
      g.label === 'Receivables' ? { pct: overduePct(ar.data?.data), to: `/finance/ar-ageing?as_of=${asOf}` } : g.label === 'Payables' ? { pct: overduePct(ap.data?.data), to: `/finance/ap-ageing?as_of=${asOf}` } : null;
    if (!target || target.pct < 0.5) return null;
    return (
      <Link to={target.to} onClick={(e) => e.stopPropagation()} title="Open the ageing report" className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Chip tone={target.pct >= 40 ? 'negative' : 'warning'} size="sm">{Math.round(target.pct)}% overdue</Chip>
      </Link>
    );
  };

  const sides: [StatementPart, StatementPart] | null = tree
    ? [
        { title: 'Assets', sections: [shown(tree.assets)], totalLabel: 'Total assets', total: tree.totals.assets, compareTotal: tree.assets.compare },
        {
          title: 'Liabilities and equity',
          sections: [shown(tree.liabilities), shown(tree.equity)],
          totalLabel: 'Total liabilities and equity',
          total: tree.totals.liabilitiesAndEquity,
          compareTotal: comparing ? (tree.liabilities.compare ?? 0) + (tree.equity.compare ?? 0) : null,
        },
      ]
    : null;

  const exportRows: ExportRow[] = useMemo(
    () =>
      tree
        ? [tree.assets, tree.liabilities, tree.equity].flatMap((s) =>
            s.blocks.flatMap((b) =>
              b.groups.flatMap((g) =>
                g.accounts.map((a) => ({ section: s.label, block: b.label, group: g.label, code: a.item.account_code ?? '', name: a.item.name, amount: a.amount, compare: a.compare })),
              ),
            ),
          )
        : [],
    [tree],
  );
  const exportColumns: ExportColumn<ExportRow>[] = [
    { id: 'section', label: 'Section', accessor: (r) => r.section },
    { id: 'block', label: 'Category', accessor: (r) => r.block },
    { id: 'group', label: 'Group', accessor: (r) => r.group },
    { id: 'code', label: 'Account code', accessor: (r) => r.code },
    { id: 'name', label: 'Account', accessor: (r) => r.name },
    { id: 'amount', label: `${asOfLabel} (SAR)`, accessor: (r) => r.amount },
    ...(comparing ? [{ id: 'compare', label: `${compareLabel} (SAR)`, accessor: (r: ExportRow) => r.compare ?? 0 }] : []),
  ];

  return (
    <DashboardLayout active="finance" title="Balance Sheet" fixedViewport>
      <div className="mx-auto flex h-full w-full max-w-[1400px] min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 max-md:h-auto max-md:overflow-y-auto print:h-auto print:overflow-visible print:p-0">
        <div className="flex shrink-0 flex-wrap items-center gap-2 print:hidden">
          <AsOfControl value={asOf} onChange={(d) => set('as_of', d)} presets={['today', 'month', 'quarter', 'year']} />
          <CompareModePicker
            mode={compareMode}
            customDate={customCompare}
            onMode={(m) => set('compare', m === 'none' ? null : m)}
            onCustomDate={(d) => set('compare_to', d)}
          />
          {comparing && (
            <>
              <BiggestChanges changes={changes} onPick={(c) => openAccount(c.row)} />
              <OnlyChangedToggle pressed={onlyChanged} onPressedChange={(v) => set('changed', v ? 'true' : null)} />
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="icon" className="size-8" aria-label="Customize" title="Customize" onClick={() => setCustomizeOpen(true)}>
              <SlidersHorizontal className="size-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="size-8" aria-label="Print" title="Print" onClick={() => window.print()}>
              <Printer className="size-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!tree} onClick={() => setExportOpen(true)}>
              <Download className="size-3.5" /> Export
            </Button>
          </div>
        </div>

        <div className="hidden text-center print:block">
          <p className="text-xs text-muted-foreground">{company?.companyLegalName || company?.appName}</p>
          <h1 className="text-xl font-semibold">Balance sheet</h1>
          <p className="text-xs text-muted-foreground">As of {asOfLabel} · amounts in SAR{compareLabel ? ` · compared with ${compareLabel}` : ''}</p>
        </div>

        <ReportViewState
          isLoading={report.isLoading}
          isError={report.isError}
          onRetry={() => report.refetch()}
          isEmpty={false}
          emptyTitle=""
          emptyDescription=""
        >
          {tree && (
            <>
              <div className="shrink-0 print:hidden">
                <BalanceEquation tree={tree} compareLabel={compareLabel} onSection={toggleSection} />
              </div>
              {sides && (
                <BalanceSheetStatement
                  left={sides[0]}
                  right={sides[1]}
                  comparing={comparing}
                  compareLabel={compareLabel}
                  onlyChanged={onlyChanged}
                  expanded={expanded}
                  onToggle={toggleGroup}
                  onAccount={openAccount}
                  showCodes={showCodes}
                  negativeFormat={negativeFormat}
                  highlight={highlight}
                  renderGroupBadge={badge}
                  balanced={Math.abs(tree.totals.difference) < 0.005}
                />
              )}
              {report.data?.data?.using_snapshot && (
                <p className="shrink-0 text-[11px] text-muted-foreground print:hidden">Figures come from the closed-period snapshot for this date.</p>
              )}
            </>
          )}
        </ReportViewState>
      </div>

      <AccountLedgerSheet account={account} from={addDays(asOf, -(LEDGER_WINDOW_DAYS - 1))} to={asOf} onClose={() => setAccount(null)} />

      <StatementCustomize
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        showCodes={showCodes}
        onShowCodes={(v) => set('codes', v ? 'true' : null)}
        keepZero={keepZero}
        onKeepZero={(v) => set('zero', v ? 'true' : null)}
        negativeFormat={negativeFormat}
        onNegativeFormat={(v) => set('neg', v === 'parens' ? 'parens' : null)}
        overrideCount={Object.keys(overrides).length}
        onResetOverrides={() => {
          clearBsStoredOverrides();
          setOverrides({});
          toast.success('Classifications reset');
        }}
      />

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export balance sheet"
        subtitle={`As of ${asOfLabel} · assets ${formatMoney(tree?.totals.assets ?? 0)} · liabilities and equity ${formatMoney(tree?.totals.liabilitiesAndEquity ?? 0)}`}
        data={exportRows}
        columns={exportColumns}
        filename={`Balance_Sheet_${asOf}`}
      />
    </DashboardLayout>
  );
}
