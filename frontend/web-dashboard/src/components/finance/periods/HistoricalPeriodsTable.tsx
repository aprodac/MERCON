import { useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ExportModal from '@/components/ui/ExportModal';
import { StatusPill } from '@/components/finance/kit';
import { formatDate } from '@/lib/finance';
import { PeriodRow, ACCOUNTING_PERIODS_EXPORT_COLUMNS } from './types';

interface HistoricalPeriodsTableProps {
  periods: PeriodRow[];
  selectedPeriodId: string | null;
  onSelectPeriod: (periodId: string, year: number) => void;
}

export function HistoricalPeriodsTable({
  periods,
  selectedPeriodId,
  onSelectPeriod,
}: HistoricalPeriodsTableProps) {
  const [isAllPeriodsCollapsed, setIsAllPeriodsCollapsed] = useState(true);
  const [isExportOpen, setIsExportOpen] = useState(false);

  return (
    <>
      <div className="bg-card rounded-xl border border-border dark:border-border shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setIsAllPeriodsCollapsed(!isAllPeriodsCollapsed)}
          className="w-full px-6 py-4 flex items-center justify-between text-left bg-muted/50 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-[#3E3C3D] dark:text-white">
              All accounting periods ({periods.length})
            </span>
            <Badge variant="outline" className="text-[10px] rounded-md fin-num">
              Historical ledger
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setIsExportOpen(true);
              }}
              className="h-7 text-xs font-semibold rounded-lg"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              Export
            </Button>

            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform ${
                isAllPeriodsCollapsed ? 'rotate-180' : ''
              }`}
            />
          </div>
        </button>

        {!isAllPeriodsCollapsed && (
          <div className="divide-y divide-border/60 dark:divide-border/60 border-t border-border dark:border-border">
            <div className="bg-[#FAFAFB] px-6 py-2.5 grid grid-cols-12 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              <div className="col-span-3">Period Name</div>
              <div className="col-span-3">Date Range</div>
              <div className="col-span-2 text-center">JEs Count</div>
              <div className="col-span-2 text-center">Status</div>
              <div className="col-span-2 text-right">Closed At</div>
            </div>

            {periods.map((p) => {
              const isSel = selectedPeriodId === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => {
                    const year = new Date(p.start_date).getFullYear();
                    onSelectPeriod(p.id, year);
                  }}
                  className={`px-6 py-3 grid grid-cols-12 items-center text-xs hover:bg-muted dark:hover:bg-slate-800/50 cursor-pointer transition-colors ${
                    isSel ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20/40 dark:bg-rose-950/20 font-semibold' : ''
                  }`}
                >
                  <div className="col-span-3 font-bold text-foreground dark:text-white flex items-center gap-2">
                    <span>{p.name}</span>
                    {isSel && <span className="w-1.5 h-1.5 rounded-full bg-[#FA634E]" />}
                  </div>

                  <div className="col-span-3 fin-num text-muted-foreground dark:text-muted-foreground">
                    {formatDate(p.start_date)} – {formatDate(p.end_date)}
                  </div>

                  <div className="col-span-2 text-center fin-num font-semibold text-foreground">
                    {p._count?.journalEntries || 0}
                  </div>

                  <div className="col-span-2 text-center">
                    <StatusPill kind="period" status={p.status} />
                  </div>

                  <div className="col-span-2 text-right fin-num text-muted-foreground text-[11px]">
                    {p.closed_at ? formatDate(p.closed_at) : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title="Export Accounting Periods"
        description="Choose export format and settings."
        fileNamePrefix="accounting_periods"
        sheetName="Accounting Periods"
        subtitle="MERCON Logistics Accounting Periods"
        filteredData={periods}
        columns={ACCOUNTING_PERIODS_EXPORT_COLUMNS}
        formats={['xlsx', 'csv']}
      />
    </>
  );
}
