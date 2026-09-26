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
      <div className="bg-card rounded-xl border border-border dark:border-border shadow-xs p-5 space-y-5">
        <div className="border-b border-border dark:border-border pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#3E3C3D] dark:text-white">
              Period details
            </h3>
            <div className="text-xs fin-num text-muted-foreground dark:text-muted-foreground mt-0.5">
              {formatDate(selectedPeriod.start_date)} – {formatDate(selectedPeriod.end_date)}
            </div>
          </div>
          <StatusPill kind="period" status={selectedPeriod.status} />
        </div>

        {/* Mini Status Trail */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
            Lifecycle state
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 border border-emerald-200/70 font-semibold">
              Created
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            <span
              className={`px-2 py-1 rounded-lg border font-semibold ${
                selectedPeriod.status === 'Closed' || selectedPeriod.status === 'Locked'
                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 text-amber-800 border-amber-200'
                  : 'bg-muted text-muted-foreground border-border '
              }`}
            >
              Closed
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            <span
              className={`px-2 py-1 rounded-lg border font-semibold ${
                selectedPeriod.status === 'Locked'
                  ? 'bg-card text-foreground border border-border text-white border-transparent'
                  : 'bg-muted text-muted-foreground border-border '
              }`}
            >
              Locked
            </span>
          </div>
        </div>

        {/* Entry Counts Breakdown */}
        <div className="bg-muted p-3.5 rounded-xl border border-border dark:border-border space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
            Journal entries in period
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-card p-2 rounded-lg border border-border dark:border-border">
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 fin-num">
                {periodJeBreakdown.posted}
              </div>
              <div className="text-[10px] text-muted-foreground font-medium">Posted</div>
            </div>
            <div className="bg-card p-2 rounded-lg border border-border dark:border-border">
              <div className="text-xs font-bold text-amber-700 dark:text-amber-400 fin-num">
                {periodJeBreakdown.draft}
              </div>
              <div className="text-[10px] text-muted-foreground font-medium">Draft</div>
            </div>
            <div className="bg-card p-2 rounded-lg border border-border dark:border-border">
              <div className="text-xs font-bold text-muted-foreground fin-num">
                {periodJeBreakdown.voided}
              </div>
              <div className="text-[10px] text-muted-foreground font-medium">Voided</div>
            </div>
          </div>
        </div>

        {/* Financial Result for Period */}
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
            Period result
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-center text-muted-foreground dark:text-muted-foreground">
              <span>Revenue</span>
              <MoneyText value={periodFinSummary.revenue} currency="SAR" className="font-semibold text-foreground" />
            </div>
            <div className="flex justify-between items-center text-muted-foreground dark:text-muted-foreground">
              <span>Expenses</span>
              <MoneyText value={periodFinSummary.expenses} currency="SAR" className="font-semibold text-foreground" />
            </div>
            <div className="flex justify-between items-center pt-1.5 border-t border-border dark:border-border font-bold">
              <span className="text-foreground dark:text-white">Net result</span>
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
        <div className="pt-2 border-t border-border dark:border-border space-y-1">
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
        <div className="pt-3 border-t border-border dark:border-border space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
            Activity timeline
          </div>
          <ActivityTimeline items={activityLogs} isLoading={isActivityLoading} />
        </div>
      </div>
    </div>
  );
}
