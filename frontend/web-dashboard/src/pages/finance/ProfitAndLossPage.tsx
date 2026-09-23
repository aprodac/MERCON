import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  DollarSign,
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import ExportModal, { type ExportColumn } from '@/components/ui/ExportModal';

import { financeService, type ReportLineItem } from '@/services/financeService';

function formatMoney(amount: number): string {
  return (amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface ExportRow extends ReportLineItem {
  category: 'Revenue' | 'Expense';
}

export default function ProfitAndLossPage() {
  const navigate = useNavigate();
  const currentYearStart = `${new Date().getFullYear()}-01-01`;
  const todayIso = new Date().toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState<string>(currentYearStart);
  const [dateTo, setDateTo] = useState<string>(todayIso);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const { data: reportRes, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance-reports', 'profit-and-loss', dateFrom, dateTo],
    queryFn: () =>
      financeService.getProfitAndLoss({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
  });

  const report = reportRes?.data;
  const revenues = report?.revenues || [];
  const expenses = report?.expenses || [];
  const netProfit = report?.net_profit || 0;
  const isProfit = netProfit >= 0;

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const exportData = useMemo<ExportRow[]>(() => {
    const revRows: ExportRow[] = revenues.map((r) => ({ ...r, category: 'Revenue' }));
    const expRows: ExportRow[] = expenses.map((e) => ({ ...e, category: 'Expense' }));
    return [...revRows, ...expRows];
  }, [revenues, expenses]);

  const exportColumns: ExportColumn<ExportRow>[] = [
    { id: 'category', label: 'Category', accessor: (r) => r.category },
    { id: 'account_code', label: 'Account Code', accessor: (r) => r.account_code },
    { id: 'name', label: 'Account Name', accessor: (r) => r.name },
    { id: 'amount', label: 'Amount (SAR)', accessor: (r) => r.amount },
  ];

  return (
    <DashboardLayout active="finance" title="Profit & Loss Statement">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Sticky Header Bar */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-10 backdrop-blur-md bg-white/95">
          <h1 className="text-xl font-bold text-[#3E3C3D]">Profit & Loss Statement</h1>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                From:
              </label>
              <Input
                type="date"
                className="w-36 h-9 text-xs bg-white border-slate-200"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                To:
              </label>
              <Input
                type="date"
                className="w-36 h-9 text-xs bg-white border-slate-200"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-xs font-semibold text-slate-700 border-slate-200 gap-1.5"
              onClick={() => refetch()}
              title="Refresh Report"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Refresh</span>
            </Button>
            <Button
              size="sm"
              className="h-9 px-3 text-xs font-semibold bg-[#FA634E] hover:bg-[#e05440] text-white shadow-xs gap-1.5 cursor-pointer"
              onClick={() => setIsExportOpen(true)}
              disabled={isLoading || exportData.length === 0}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </Button>
          </div>
        </div>

        {/* Summary KPI Cards */}
        {report && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Revenue
                </p>
                <p className="text-xl font-bold text-emerald-700 mt-1 font-mono">
                  SAR {formatMoney(report.total_revenue)}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Expenses
                </p>
                <p className="text-xl font-bold text-rose-700 mt-1 font-mono">
                  SAR {formatMoney(report.total_expense)}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <TrendingDown className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Net {isProfit ? 'Profit' : 'Loss'}
                </p>
                <p
                  className={`text-xl font-bold mt-1 font-mono ${
                    isProfit ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  SAR {formatMoney(netProfit)}
                </p>
              </div>
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isProfit ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                }`}
              >
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-800 text-sm">
            Failed to load profit & loss statement. Please try again.
          </div>
        )}

        {/* Grouped Table Card */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200/80 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4 w-10"></th>
                    <th className="py-3 px-4 w-36">Account Code</th>
                    <th className="py-3 px-4">Account Name</th>
                    <th className="py-3 px-4 text-right w-44">Amount (SAR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* Group 1: Revenue */}
                  <tr
                    onClick={() => toggleGroup('revenue')}
                    className="bg-emerald-50/50 hover:bg-emerald-50/80 border-t border-b border-emerald-100 transition-colors cursor-pointer select-none font-semibold text-slate-800"
                  >
                    <td className="py-2.5 px-4 text-center">
                      {collapsedGroups['revenue'] ? (
                        <ChevronRight className="w-4 h-4 text-emerald-600 inline-block" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-emerald-600 inline-block" />
                      )}
                    </td>
                    <td colSpan={2} className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-emerald-950">Operating Revenue</span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full"
                        >
                          {revenues.length} {revenues.length === 1 ? 'account' : 'accounts'}
                        </Badge>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs font-bold text-emerald-800">
                      SAR {formatMoney(report?.total_revenue || 0)}
                    </td>
                  </tr>

                  {!collapsedGroups['revenue'] &&
                    (revenues.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-slate-400 text-xs italic">
                          No revenue items recorded for this period.
                        </td>
                      </tr>
                    ) : (
                      revenues.map((r) => (
                        <tr
                          key={r.account_code}
                          onClick={() =>
                            r.account_id && navigate(`/finance/general-ledger?account_id=${r.account_id}`)
                          }
                          className="hover:bg-orange-50/40 transition-colors group cursor-pointer"
                        >
                          <td className="py-2.5 px-4"></td>
                          <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-700 group-hover:text-[#FA634E]">
                            {r.account_code}
                          </td>
                          <td className="py-2.5 px-4 text-slate-900 font-medium group-hover:text-[#FA634E] flex items-center gap-1.5">
                            <span>{r.name}</span>
                            <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-[#FA634E] opacity-0 group-hover:opacity-100 transition-opacity" />
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-xs font-medium text-slate-900">
                            {formatMoney(r.amount)}
                          </td>
                        </tr>
                      ))
                    ))}

                  {/* Group 2: Expenses */}
                  <tr
                    onClick={() => toggleGroup('expenses')}
                    className="bg-rose-50/50 hover:bg-rose-50/80 border-t border-b border-rose-100 transition-colors cursor-pointer select-none font-semibold text-slate-800"
                  >
                    <td className="py-2.5 px-4 text-center">
                      {collapsedGroups['expenses'] ? (
                        <ChevronRight className="w-4 h-4 text-rose-600 inline-block" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-rose-600 inline-block" />
                      )}
                    </td>
                    <td colSpan={2} className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-rose-950">Operating Expenses</span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] bg-rose-100 text-rose-800 font-semibold px-2 py-0.5 rounded-full"
                        >
                          {expenses.length} {expenses.length === 1 ? 'account' : 'accounts'}
                        </Badge>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs font-bold text-rose-800">
                      SAR {formatMoney(report?.total_expense || 0)}
                    </td>
                  </tr>

                  {!collapsedGroups['expenses'] &&
                    (expenses.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-slate-400 text-xs italic">
                          No expense items recorded for this period.
                        </td>
                      </tr>
                    ) : (
                      expenses.map((e) => (
                        <tr
                          key={e.account_code}
                          onClick={() =>
                            e.account_id && navigate(`/finance/general-ledger?account_id=${e.account_id}`)
                          }
                          className="hover:bg-orange-50/40 transition-colors group cursor-pointer"
                        >
                          <td className="py-2.5 px-4"></td>
                          <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-700 group-hover:text-[#FA634E]">
                            {e.account_code}
                          </td>
                          <td className="py-2.5 px-4 text-slate-900 font-medium group-hover:text-[#FA634E] flex items-center gap-1.5">
                            <span>{e.name}</span>
                            <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-[#FA634E] opacity-0 group-hover:opacity-100 transition-opacity" />
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-xs font-medium text-slate-900">
                            {formatMoney(e.amount)}
                          </td>
                        </tr>
                      ))
                    ))}
                </tbody>

                {/* Grand Total Net Profit Footer */}
                {report && (
                  <tfoot>
                    <tr
                      className={`border-t-2 border-slate-300 font-bold text-sm ${
                        isProfit
                          ? 'bg-emerald-50/90 text-emerald-950'
                          : 'bg-rose-50/90 text-rose-950'
                      }`}
                    >
                      <td colSpan={3} className="py-3 px-4">
                        Net {isProfit ? 'Profit' : 'Loss'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-sm font-extrabold">
                        SAR {formatMoney(netProfit)}
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
      <ExportModal<ExportRow>
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title="Export Profit & Loss Statement"
        subtitle={`Period: ${dateFrom} to ${dateTo}`}
        fileNamePrefix="profit_and_loss"
        sheetName="Profit & Loss"
        filteredData={exportData}
        columns={exportColumns}
        formats={['xlsx', 'csv', 'pdf']}
      />
    </DashboardLayout>
  );
}
