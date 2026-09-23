import { Link } from 'react-router-dom';
import { ChevronRight, ArrowRight } from 'lucide-react';
import { StatusPill, MoneyText, ActivityTimeline } from '@/components/finance/kit';
import { formatDate } from '@/lib/finance';
import type { PeriodRow } from './types';

interface PeriodDetailsCardProps {
  selectedPeriod: PeriodRow;
  periodJeBreakdown: { posted: number; draft: number; voided: number; total: number };
  periodFinSummary: { revenue: number; expenses: number; netResult: number };
  activityLogs: any[];
  isActivityLoading: boolean;
}

export function PeriodDetailsCard({
  selectedPeriod,
  periodJeBreakdown,
  periodFinSummary,
  activityLogs,
  isActivityLoading,
}: PeriodDetailsCardProps) {
  return (
    <div className="lg:col-span-4 space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 space-y-5">
        <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#3E3C3D] dark:text-white">
              Period details
            </h3>
            <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
              {formatDate(selectedPeriod.start_date)} – {formatDate(selectedPeriod.end_date)}
            </div>
          </div>
          <StatusPill kind="period" status={selectedPeriod.status} />
        </div>

        {/* Mini Status Trail */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#757583]">
            Lifecycle state
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/70 font-semibold">
              Created
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span
              className={`px-2 py-1 rounded-lg border font-semibold ${
                selectedPeriod.status === 'Closed' || selectedPeriod.status === 'Locked'
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800'
              }`}
            >
              Closed
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span
              className={`px-2 py-1 rounded-lg border font-semibold ${
                selectedPeriod.status === 'Locked'
                  ? 'bg-[#3E3C3D] text-white border-transparent'
                  : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800'
              }`}
            >
              Locked
            </span>
          </div>
        </div>

        {/* Entry Counts Breakdown */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200/60 dark:border-slate-700 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#757583]">
            Journal entries in period
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200/70 dark:border-slate-800">
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                {periodJeBreakdown.posted}
              </div>
              <div className="text-[10px] text-slate-500 font-medium">Posted</div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200/70 dark:border-slate-800">
              <div className="text-xs font-bold text-amber-700 dark:text-amber-400 font-mono">
                {periodJeBreakdown.draft}
              </div>
              <div className="text-[10px] text-slate-500 font-medium">Draft</div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200/70 dark:border-slate-800">
              <div className="text-xs font-bold text-slate-500 font-mono">
                {periodJeBreakdown.voided}
              </div>
              <div className="text-[10px] text-slate-500 font-medium">Voided</div>
            </div>
          </div>
        </div>

        {/* Financial Result for Period */}
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#757583]">
            Period result
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
              <span>Revenue</span>
              <MoneyText value={periodFinSummary.revenue} currency="SAR" className="font-semibold text-slate-900 dark:text-slate-100" />
            </div>
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
              <span>Expenses</span>
              <MoneyText value={periodFinSummary.expenses} currency="SAR" className="font-semibold text-slate-900 dark:text-slate-100" />
            </div>
            <div className="flex justify-between items-center pt-1.5 border-t border-slate-100 dark:border-slate-800 font-bold">
              <span className="text-slate-900 dark:text-white">Net result</span>
              <MoneyText
                value={periodFinSummary.netResult}
                currency="SAR"
                tone={periodFinSummary.netResult >= 0 ? 'positive' : 'negative'}
                className="text-xs"
              />
            </div>
          </div>
        </div>

        {/* Quick Navigation Links */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
          <Link
            to={`/finance/reports/trial-balance?period_id=${selectedPeriod.id}`}
            className="flex items-center justify-between text-xs text-[#FA634E] hover:underline font-semibold py-1"
          >
            <span>Trial balance for this period</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            to={`/finance/journal-entries?period_id=${selectedPeriod.id}`}
            className="flex items-center justify-between text-xs text-[#FA634E] hover:underline font-semibold py-1"
          >
            <span>Journal entries in this period</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Activity Feed */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#757583]">
            Activity timeline
          </div>
          <ActivityTimeline items={activityLogs} isLoading={isActivityLoading} />
        </div>
      </div>
    </div>
  );
}
