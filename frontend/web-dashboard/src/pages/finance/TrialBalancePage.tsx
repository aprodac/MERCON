import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import ExportModal, { type ExportColumn } from '@/components/ui/ExportModal';

import { financeService, type TrialBalanceItem } from '@/services/financeService';
import type { AccountingPeriod } from '@mercon/shared-types';

function formatMoney(amount: number): string {
  return (amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const TYPE_ORDER: Record<string, number> = {
  ASSET: 1,
  LIABILITY: 2,
  EQUITY: 3,
  REVENUE: 4,
  EXPENSE: 5,
};

const TYPE_LABELS: Record<string, string> = {
  ASSET: 'Assets',
  LIABILITY: 'Liabilities',
  EQUITY: 'Equity',
  REVENUE: 'Revenue',
  EXPENSE: 'Expenses',
};

const TYPE_BADGE_STYLES: Record<string, string> = {
  ASSET: 'bg-blue-50 text-blue-700 border-blue-200',
  LIABILITY: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 text-amber-700 border-amber-200',
  EQUITY: 'bg-purple-50 text-purple-700 border-purple-200',
  REVENUE: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 text-emerald-700 border-emerald-200',
  EXPENSE: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 text-rose-700 border-rose-200',
};

export default function TrialBalancePage() {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const { data: periodsRes } = useQuery({
    queryKey: ['accounting-periods', 'all'],
    queryFn: () => financeService.getAccountingPeriods(),
  });

  const { data: reportRes, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance-reports', 'trial-balance', selectedPeriod],
    queryFn: () =>
      financeService.getTrialBalance({
        period_id: selectedPeriod === 'all' ? undefined : selectedPeriod,
      }),
  });

  const periods: AccountingPeriod[] = periodsRes?.data || [];
  const report = reportRes?.data;
  const items = report?.items || [];

  const groupedItems = useMemo(() => {
    const map = new Map<string, {
      type: string;
      label: string;
      items: TrialBalanceItem[];
      totalDebit: number;
      totalCredit: number;
      totalBalance: number;
    }>();

    items.forEach((item) => {
      const typeKey = (item.account_type || 'OTHER').toUpperCase();
      const label = TYPE_LABELS[typeKey] || typeKey;
      if (!map.has(typeKey)) {
        map.set(typeKey, {
          type: typeKey,
          label,
          items: [],
          totalDebit: 0,
          totalCredit: 0,
          totalBalance: 0,
        });
      }
      const group = map.get(typeKey)!;
      group.items.push(item);
      group.totalDebit += item.debit || 0;
      group.totalCredit += item.credit || 0;
      group.totalBalance += item.balance || 0;
    });

    return Array.from(map.values()).sort((a, b) => {
      const orderA = TYPE_ORDER[a.type] || 99;
      const orderB = TYPE_ORDER[b.type] || 99;
      return orderA - orderB;
    });
  }, [items]);

  const toggleGroup = (typeKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [typeKey]: !prev[typeKey],
    }));
  };

  const exportColumns: ExportColumn<TrialBalanceItem>[] = [
    { id: 'account_code', label: 'Account Code', accessor: (r) => r.account_code },
    { id: 'name', label: 'Account Name', accessor: (r) => r.name },
    { id: 'account_type', label: 'Type', accessor: (r) => r.account_type },
    { id: 'debit', label: 'Debit (SAR)', accessor: (r) => r.debit },
    { id: 'credit', label: 'Credit (SAR)', accessor: (r) => r.credit },
    { id: 'balance', label: 'Balance (SAR)', accessor: (r) => r.balance },
  ];

  const selectedPeriodName = useMemo(() => {
    if (selectedPeriod === 'all') return 'All Periods';
    const found = periods.find((p) => p.id === selectedPeriod);
    return found ? found.name : 'Selected Period';
  }, [selectedPeriod, periods]);

  return (
    <DashboardLayout active="finance" title="Trial Balance" fixedViewport>
      <div className="p-4 flex flex-col flex-1 min-h-0 gap-3 overflow-hidden h-full max-md:overflow-y-auto max-md:h-auto max-w-7xl mx-auto w-full">
        {/* Sticky Header Bar */}
        <div className="bg-card rounded-xl border border-border p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-10 backdrop-blur-md bg-card/95">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[#3E3C3D]">Trial Balance</h1>
            {report && (
              <Badge
                variant="outline"
                className={
                  report.is_balanced
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 text-emerald-700 border-emerald-200 font-semibold'
                    : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 text-rose-700 border-rose-200 font-semibold'
                }
              >
                {report.is_balanced ? 'Balanced' : 'Out of Balance'}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Period:
              </label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-[180px] h-9 text-xs bg-card border-border">
                  <SelectValue placeholder="All Periods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Periods</SelectItem>
                  {periods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-xs font-semibold text-foreground border-border gap-1.5"
              onClick={() => refetch()}
              title="Refresh Report"
            >
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Refresh</span>
            </Button>

            <Button
              size="sm"
              className="h-9 px-3 text-xs font-semibold bg-[#FA634E] hover:bg-[#e05440] text-white shadow-xs gap-1.5 cursor-pointer"
              onClick={() => setIsExportOpen(true)}
              disabled={isLoading || items.length === 0}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </Button>
          </div>
        </div>

        {/* Status Banners */}
        {report && !report.is_balanced && (
          <div className="bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 border border-rose-200 rounded-xl p-4 text-rose-900 flex items-start gap-3 shadow-xs">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-rose-800">
                CRITICAL: Trial Balance is Out of Balance!
              </p>
              <p className="text-rose-700 text-xs">
                Total Debits (SAR {formatMoney(report.total_debit)}) do not equal Total Credits (SAR{' '}
                {formatMoney(report.total_credit)}). Discrepancy of SAR{' '}
                {formatMoney(Math.abs(report.total_debit - report.total_credit))}.
              </p>
            </div>
          </div>
        )}

        {report && report.is_balanced && (
          <div className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 border border-emerald-200/80 rounded-xl p-3 text-emerald-800 flex items-center gap-2.5 text-xs font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Trial Balance is fully balanced — Total Debits match Total Credits exactly (SAR{' '}
              {formatMoney(report.total_debit)}).
            </span>
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 border border-rose-200 rounded-xl p-4 text-rose-800 text-sm">
            Failed to load trial balance report. Please try again.
          </div>
        )}

        {/* Main Grouped Presentation Table Card */}
        <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-muted/90 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="py-3 px-4 w-10"></th>
                    <th className="py-3 px-4 w-32">Account Code</th>
                    <th className="py-3 px-4">Account Name</th>
                    <th className="py-3 px-4 w-32 text-center">Type</th>
                    <th className="py-3 px-4 text-right w-36">Debit (SAR)</th>
                    <th className="py-3 px-4 text-right w-36">Credit (SAR)</th>
                    <th className="py-3 px-4 text-right w-36">Balance (SAR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground text-sm">
                        No transactions recorded for the selected period.
                      </td>
                    </tr>
                  ) : (
                    groupedItems.map((group) => {
                      const isCollapsed = !!collapsedGroups[group.type];
                      return (
                        <tr key={`group-${group.type}`} className="contents">
                          {/* Group Header Row */}
                          <tr
                            onClick={() => toggleGroup(group.type)}
                            className="bg-muted/70 hover:bg-muted/80 border-t border-b border-border transition-colors cursor-pointer select-none font-semibold text-foreground"
                          >
                            <td className="py-2.5 px-4 text-center">
                              {isCollapsed ? (
                                <ChevronRight className="w-4 h-4 text-muted-foreground inline-block" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-muted-foreground inline-block" />
                              )}
                            </td>
                            <td colSpan={2} className="py-2.5 px-4">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground">{group.label}</span>
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] bg-muted/60 text-foreground font-semibold px-2 py-0.5 rounded-full"
                                >
                                  {group.items.length} {group.items.length === 1 ? 'account' : 'accounts'}
                                </Badge>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${TYPE_BADGE_STYLES[group.type] || 'bg-muted text-foreground'}`}
                              >
                                {group.type}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-xs font-bold text-foreground">
                              {group.totalDebit > 0 ? formatMoney(group.totalDebit) : '—'}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-xs font-bold text-foreground">
                              {group.totalCredit > 0 ? formatMoney(group.totalCredit) : '—'}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-xs font-bold text-foreground">
                              {formatMoney(group.totalBalance)}
                            </td>
                          </tr>

                          {/* Account Rows inside Group */}
                          {!isCollapsed &&
                            group.items.map((item) => (
                              <tr
                                key={item.account_code}
                                onClick={() =>
                                  item.account_id && navigate(`/finance/general-ledger?account_id=${item.account_id}`)
                                }
                                className="hover:bg-muted/50 transition-colors group cursor-pointer"
                              >
                                <td className="py-2.5 px-4"></td>
                                <td className="py-2.5 px-4 font-mono text-xs font-semibold text-foreground group-hover:text-[#FA634E]">
                                  {item.account_code}
                                </td>
                                <td className="py-2.5 px-4 text-foreground font-medium group-hover:text-[#FA634E] flex items-center gap-1.5">
                                  <span>{item.name}</span>
                                  <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-[#FA634E] opacity-0 group-hover:opacity-100 transition-opacity" />
                                </td>
                                <td className="py-2.5 px-4 text-center text-xs text-muted-foreground">
                                  {item.account_type}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono text-xs text-foreground">
                                  {item.debit > 0 ? formatMoney(item.debit) : '—'}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono text-xs text-foreground">
                                  {item.credit > 0 ? formatMoney(item.credit) : '—'}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono text-xs font-semibold text-foreground">
                                  {formatMoney(item.balance)}
                                </td>
                              </tr>
                            ))}
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {/* Grand Total Footer */}
                {report && items.length > 0 && (
                  <tfoot>
                    <tr className="bg-muted/90 border-t-2 border-border font-bold text-foreground text-sm">
                      <td colSpan={4} className="py-3 px-4">
                        Grand Total
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-bold text-foreground">
                        SAR {formatMoney(report.total_debit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-bold text-foreground">
                        SAR {formatMoney(report.total_credit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-bold text-foreground">
                        —
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Export Modal Wiring */}
      <ExportModal<TrialBalanceItem>
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title="Export Trial Balance"
        subtitle={`Period: ${selectedPeriodName}`}
        fileNamePrefix="trial_balance"
        sheetName="Trial Balance"
        filteredData={items}
        columns={exportColumns}
        formats={['xlsx', 'csv', 'pdf']}
      />
    </DashboardLayout>
  );
}
