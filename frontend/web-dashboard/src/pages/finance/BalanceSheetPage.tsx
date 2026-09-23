import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  RefreshCw,
  Info,
  CheckCircle2,
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
  category: 'Assets' | 'Liabilities' | 'Equity';
}

export default function BalanceSheetPage() {
  const navigate = useNavigate();
  const todayIso = new Date().toISOString().slice(0, 10);
  const [asOf, setAsOf] = useState<string>(todayIso);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const { data: reportRes, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance-reports', 'balance-sheet', asOf],
    queryFn: () =>
      financeService.getBalanceSheet({
        as_of: asOf || undefined,
      }),
  });

  const report = reportRes?.data;
  const assets = report?.assets || [];
  const liabilities = report?.liabilities || [];
  const equity = report?.equity || [];

  const totalAssets = report?.total_assets || 0;
  const totalLiabilities = report?.total_liabilities || 0;
  const totalEquity = report?.total_equity || 0;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const imbalanceDiff = Math.abs(totalAssets - totalLiabilitiesAndEquity);

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const exportData = useMemo<ExportRow[]>(() => {
    const assetRows: ExportRow[] = assets.map((a) => ({ ...a, category: 'Assets' }));
    const liabRows: ExportRow[] = liabilities.map((l) => ({ ...l, category: 'Liabilities' }));
    const eqRows: ExportRow[] = equity.map((e) => ({ ...e, category: 'Equity' }));
    return [...assetRows, ...liabRows, ...eqRows];
  }, [assets, liabilities, equity]);

  const exportColumns: ExportColumn<ExportRow>[] = [
    { id: 'category', label: 'Category', accessor: (r) => r.category },
    { id: 'account_code', label: 'Account Code', accessor: (r) => r.account_code },
    { id: 'name', label: 'Account Name', accessor: (r) => r.name },
    { id: 'amount', label: 'Amount (SAR)', accessor: (r) => r.amount },
  ];

  return (
    <DashboardLayout active="finance" title="Balance Sheet">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Sticky Header Bar */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-10 backdrop-blur-md bg-white/95">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[#3E3C3D]">Balance Sheet</h1>
            {report && (
              <Badge
                variant="outline"
                className={
                  report.using_snapshot
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold'
                    : 'bg-slate-100 text-slate-700 border-slate-200 font-semibold'
                }
              >
                {report.using_snapshot ? 'Using period-close snapshot' : 'Calculated live from ledger'}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                As Of Date:
              </label>
              <Input
                type="date"
                className="w-40 h-9 text-xs bg-white border-slate-200"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
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

        {/* Informational Balance Note */}
        {report && !report.is_balanced && (
          <div className="bg-blue-50/70 border border-blue-200 text-blue-900 rounded-xl p-4 flex items-start gap-3 shadow-sm">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-medium text-blue-950 text-xs">
                Total Assets vs. Liabilities + Equity differs by SAR {formatMoney(imbalanceDiff)} —
                expected until fiscal year-end closing entries exist; Trial Balance is the
                authoritative check.
              </p>
            </div>
          </div>
        )}

        {report && report.is_balanced && (
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-3 text-emerald-800 flex items-center gap-2.5 text-xs font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Balance Sheet is fully balanced — Total Assets equal Total Liabilities + Equity exactly (SAR{' '}
              {formatMoney(totalAssets)}).
            </span>
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-800 text-sm">
            Failed to load balance sheet. Please try again.
          </div>
        )}

        {/* Summary Banner */}
        {report && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Assets
                </p>
                <p className="text-xl font-bold text-slate-900 mt-1 font-mono">
                  SAR {formatMoney(totalAssets)}
                </p>
              </div>
              <Badge className="bg-blue-50 text-blue-700 border-blue-200 font-semibold">Assets</Badge>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Liabilities + Equity
                </p>
                <p className="text-xl font-bold text-slate-900 mt-1 font-mono">
                  SAR {formatMoney(totalLiabilitiesAndEquity)}
                </p>
              </div>
              <Badge className="bg-purple-50 text-purple-700 border-purple-200 font-semibold">
                Liabilities & Equity
              </Badge>
            </div>
          </div>
        )}

        {/* Grouped Presentation Table Card */}
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
                  {/* Group 1: Assets */}
                  <tr
                    onClick={() => toggleGroup('assets')}
                    className="bg-blue-50/50 hover:bg-blue-50/80 border-t border-b border-blue-100 transition-colors cursor-pointer select-none font-semibold text-slate-800"
                  >
                    <td className="py-2.5 px-4 text-center">
                      {collapsedGroups['assets'] ? (
                        <ChevronRight className="w-4 h-4 text-blue-600 inline-block" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-blue-600 inline-block" />
                      )}
                    </td>
                    <td colSpan={2} className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-blue-950">Assets</span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-full"
                        >
                          {assets.length} {assets.length === 1 ? 'account' : 'accounts'}
                        </Badge>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs font-bold text-blue-900">
                      SAR {formatMoney(totalAssets)}
                    </td>
                  </tr>

                  {!collapsedGroups['assets'] &&
                    (assets.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-slate-400 text-xs italic">
                          No asset accounts recorded.
                        </td>
                      </tr>
                    ) : (
                      assets.map((a) => (
                        <tr
                          key={a.account_code}
                          onClick={() =>
                            navigate(
                              `/finance/general-ledger?account_id=${encodeURIComponent(
                                a.account_code
                              )}`
                            )
                          }
                          className="hover:bg-orange-50/40 transition-colors group cursor-pointer"
                        >
                          <td className="py-2.5 px-4"></td>
                          <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-700 group-hover:text-[#FA634E]">
                            {a.account_code}
                          </td>
                          <td className="py-2.5 px-4 text-slate-900 font-medium group-hover:text-[#FA634E] flex items-center gap-1.5">
                            <span>{a.name}</span>
                            <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-[#FA634E] opacity-0 group-hover:opacity-100 transition-opacity" />
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-xs font-medium text-slate-900">
                            {formatMoney(a.amount)}
                          </td>
                        </tr>
                      ))
                    ))}

                  {/* Group 2: Liabilities */}
                  <tr
                    onClick={() => toggleGroup('liabilities')}
                    className="bg-amber-50/50 hover:bg-amber-50/80 border-t border-b border-amber-100 transition-colors cursor-pointer select-none font-semibold text-slate-800"
                  >
                    <td className="py-2.5 px-4 text-center">
                      {collapsedGroups['liabilities'] ? (
                        <ChevronRight className="w-4 h-4 text-amber-600 inline-block" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-amber-600 inline-block" />
                      )}
                    </td>
                    <td colSpan={2} className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-amber-950">Liabilities</span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full"
                        >
                          {liabilities.length} {liabilities.length === 1 ? 'account' : 'accounts'}
                        </Badge>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs font-bold text-amber-900">
                      SAR {formatMoney(totalLiabilities)}
                    </td>
                  </tr>

                  {!collapsedGroups['liabilities'] &&
                    (liabilities.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-slate-400 text-xs italic">
                          No liability accounts recorded.
                        </td>
                      </tr>
                    ) : (
                      liabilities.map((l) => (
                        <tr
                          key={l.account_code}
                          onClick={() =>
                            navigate(
                              `/finance/general-ledger?account_id=${encodeURIComponent(
                                l.account_code
                              )}`
                            )
                          }
                          className="hover:bg-orange-50/40 transition-colors group cursor-pointer"
                        >
                          <td className="py-2.5 px-4"></td>
                          <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-700 group-hover:text-[#FA634E]">
                            {l.account_code}
                          </td>
                          <td className="py-2.5 px-4 text-slate-900 font-medium group-hover:text-[#FA634E] flex items-center gap-1.5">
                            <span>{l.name}</span>
                            <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-[#FA634E] opacity-0 group-hover:opacity-100 transition-opacity" />
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-xs font-medium text-slate-900">
                            {formatMoney(l.amount)}
                          </td>
                        </tr>
                      ))
                    ))}

                  {/* Group 3: Equity */}
                  <tr
                    onClick={() => toggleGroup('equity')}
                    className="bg-purple-50/50 hover:bg-purple-50/80 border-t border-b border-purple-100 transition-colors cursor-pointer select-none font-semibold text-slate-800"
                  >
                    <td className="py-2.5 px-4 text-center">
                      {collapsedGroups['equity'] ? (
                        <ChevronRight className="w-4 h-4 text-purple-600 inline-block" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-purple-600 inline-block" />
                      )}
                    </td>
                    <td colSpan={2} className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-purple-950">Equity</span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] bg-purple-100 text-purple-800 font-semibold px-2 py-0.5 rounded-full"
                        >
                          {equity.length} {equity.length === 1 ? 'account' : 'accounts'}
                        </Badge>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs font-bold text-purple-900">
                      SAR {formatMoney(totalEquity)}
                    </td>
                  </tr>

                  {!collapsedGroups['equity'] &&
                    (equity.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-slate-400 text-xs italic">
                          No equity accounts recorded.
                        </td>
                      </tr>
                    ) : (
                      equity.map((eq) => (
                        <tr
                          key={eq.account_code}
                          onClick={() =>
                            navigate(
                              `/finance/general-ledger?account_id=${encodeURIComponent(
                                eq.account_code
                              )}`
                            )
                          }
                          className="hover:bg-orange-50/40 transition-colors group cursor-pointer"
                        >
                          <td className="py-2.5 px-4"></td>
                          <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-700 group-hover:text-[#FA634E]">
                            {eq.account_code}
                          </td>
                          <td className="py-2.5 px-4 text-slate-900 font-medium group-hover:text-[#FA634E] flex items-center gap-1.5">
                            <span>{eq.name}</span>
                            <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-[#FA634E] opacity-0 group-hover:opacity-100 transition-opacity" />
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-xs font-medium text-slate-900">
                            {formatMoney(eq.amount)}
                          </td>
                        </tr>
                      ))
                    ))}
                </tbody>

                {/* Grand Total Footer */}
                {report && (
                  <tfoot>
                    <tr className="bg-slate-100/90 border-t-2 border-slate-300 font-bold text-slate-900 text-sm">
                      <td colSpan={3} className="py-3 px-4">
                        Total Liabilities + Equity
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-sm font-extrabold">
                        SAR {formatMoney(totalLiabilitiesAndEquity)}
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
        title="Export Balance Sheet"
        subtitle={`As of Date: ${asOf}`}
        fileNamePrefix="balance_sheet"
        sheetName="Balance Sheet"
        filteredData={exportData}
        columns={exportColumns}
        formats={['xlsx', 'csv', 'pdf']}
      />
    </DashboardLayout>
  );
}
