import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Lock,
  Clock,
  Check,
  X,
  AlertCircle,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { StatusPill } from '@/components/finance/kit';
import { formatDate } from '@/lib/finance';
import type { PeriodRow, PeriodChecklist } from './types';

interface PeriodChecklistCardProps {
  selectedPeriod: PeriodRow;
  checklist: PeriodChecklist;
  reopenedAuditLog: any;
  isAdmin: boolean;
  selectedStartDateStr: string;
  selectedEndDateStr: string;
  isClosePending: boolean;
  onClosePeriodClick: () => void;
  onOpenReopenSheet: () => void;
  onOpenLockModal: () => void;
}

export function PeriodChecklistCard({
  selectedPeriod,
  checklist,
  reopenedAuditLog,
  isAdmin,
  selectedStartDateStr,
  selectedEndDateStr,
  isClosePending,
  onClosePeriodClick,
  onOpenReopenSheet,
  onOpenLockModal,
}: PeriodChecklistCardProps) {
  const navigate = useNavigate();

  return (
    <div className="lg:col-span-8 bg-card rounded-xl border border-border dark:border-border shadow-xs p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border dark:border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-[#3E3C3D] dark:text-white">
              Close checklist · {selectedPeriod.name}
            </h2>
            <StatusPill kind="period" status={selectedPeriod.status} />
          </div>
          <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-1">
            Verify account balances and operational checks before closing this month.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 bg-muted px-3.5 py-2 rounded-xl border border-border dark:border-border">
          <span className="text-xs font-bold text-foreground">
            {checklist.checksPassedCount} of 6 passed
          </span>
          <div className="w-20 h-2 bg-muted dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                checklist.checksPassedCount === 6 ? 'bg-emerald-500' : 'bg-[#FA634E]'
              }`}
              style={{ width: `${(checklist.checksPassedCount / 6) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {reopenedAuditLog && (
        <div className="bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800 p-3 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
          <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>Reopened on {formatDate(reopenedAuditLog.createdAt)}</strong>
            <span className="mx-1">·</span>
            <span>Reason: &quot;{(reopenedAuditLog.metadata as any)?.reason}&quot;</span>
          </div>
        </div>
      )}

      {/* Checklist Rows */}
      <div className="divide-y divide-border/60 dark:divide-border/60">
        {/* Row a: Draft JEs (BLOCKER) */}
        <div className="py-3.5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {checklist.check1_blocker ? (
              <span className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            ) : (
              <span className="w-6 h-6 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 flex items-center justify-center shrink-0 mt-0.5">
                <X className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            )}
            <div>
              <div className="text-xs font-bold text-foreground flex items-center gap-2">
                <span>Draft journal entries</span>
                {!checklist.check1_blocker && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 text-rose-800 uppercase tracking-wider">
                    BLOCKER
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground dark:text-muted-foreground mt-0.5">
                {checklist.draftJeCount > 0
                  ? `${checklist.draftJeCount} unposted draft journal entry(ies) exist in this period.`
                  : 'No draft journal entries in this period.'}
              </div>
            </div>
          </div>

          {checklist.draftJeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/finance/journal-entries?period_id=${selectedPeriod.id}&status=Draft`)}
              className="h-7 text-xs font-semibold text-[#FA634E] hover:text-[#e0523d] hover:bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 shrink-0"
            >
              Review drafts →
            </Button>
          )}
        </div>

        {/* Row b: Draft Invoices (WARNING) */}
        <div className="py-3.5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {checklist.check2_warning ? (
              <span className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            ) : (
              <span className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 flex items-center justify-center shrink-0 mt-0.5">
                <AlertCircle className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            )}
            <div>
              <div className="text-xs font-bold text-foreground">
                Draft invoices in period
              </div>
              <div className="text-xs text-muted-foreground dark:text-muted-foreground mt-0.5">
                {checklist.draftInvoiceCount > 0
                  ? `${checklist.draftInvoiceCount} draft invoice(s) dated in this period.`
                  : 'No draft invoices dated in this period.'}
              </div>
            </div>
          </div>

          {checklist.draftInvoiceCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/finance/invoices?status=Draft&date_from=${selectedStartDateStr}&date_to=${selectedEndDateStr}`)}
              className="h-7 text-xs font-semibold text-amber-700 hover:bg-amber-500/10 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 shrink-0"
            >
              Review invoices →
            </Button>
          )}
        </div>

        {/* Row c: Draft Bills (WARNING) */}
        <div className="py-3.5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {checklist.check3_warning ? (
              <span className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            ) : (
              <span className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 flex items-center justify-center shrink-0 mt-0.5">
                <AlertCircle className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            )}
            <div>
              <div className="text-xs font-bold text-foreground">
                Draft bills in period
              </div>
              <div className="text-xs text-muted-foreground dark:text-muted-foreground mt-0.5">
                {checklist.draftBillCount > 0
                  ? `${checklist.draftBillCount} draft bill(s) dated in this period.`
                  : 'No draft bills dated in this period.'}
              </div>
            </div>
          </div>

          {checklist.draftBillCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/finance/bills?status=Draft&date_from=${selectedStartDateStr}&date_to=${selectedEndDateStr}`)}
              className="h-7 text-xs font-semibold text-amber-700 hover:bg-amber-500/10 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 shrink-0"
            >
              Review bills →
            </Button>
          )}
        </div>

        {/* Row d: Bank Accounts Reconciled (WARNING) */}
        <div className="py-3.5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {checklist.check4_warning ? (
              <span className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            ) : (
              <span className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 flex items-center justify-center shrink-0 mt-0.5">
                <AlertCircle className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            )}
            <div>
              <div className="text-xs font-bold text-foreground">
                Bank accounts reconciliation
              </div>
              <div className="text-xs text-muted-foreground dark:text-muted-foreground mt-0.5">
                {checklist.unreconciledAccountNames.length > 0
                  ? `${checklist.unreconciledAccountNames.join(', ')} not reconciled past period end.`
                  : 'All active bank accounts reconciled through period end.'}
              </div>
            </div>
          </div>

          {checklist.unreconciledAccountNames.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/finance/reconciliation')}
              className="h-7 text-xs font-semibold text-amber-700 hover:bg-amber-500/10 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 shrink-0"
            >
              Reconcile →
            </Button>
          )}
        </div>

        {/* Row e: Trial Balance Check (CHECK) */}
        <div className="py-3.5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {checklist.check5_check ? (
              <span className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            ) : (
              <span className="w-6 h-6 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 flex items-center justify-center shrink-0 mt-0.5">
                <X className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            )}
            <div>
              <div className="text-xs font-bold text-foreground">
                Trial balance health
              </div>
              <div className="text-xs text-muted-foreground dark:text-muted-foreground mt-0.5">
                {checklist.check5_check
                  ? 'Trial balance is fully balanced for this period.'
                  : 'Trial balance has debit/credit imbalance.'}
              </div>
            </div>
          </div>
        </div>

        {/* Row f: Previous Period Closed (WARNING) */}
        <div className="py-3.5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {checklist.check6_warning ? (
              <span className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            ) : (
              <span className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 flex items-center justify-center shrink-0 mt-0.5">
                <AlertCircle className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            )}
            <div>
              <div className="text-xs font-bold text-foreground">
                Sequential period close order
              </div>
              <div className="text-xs text-muted-foreground dark:text-muted-foreground mt-0.5">
                {checklist.prevPeriod
                  ? checklist.isPrevPeriodClosed
                    ? `Previous period (${checklist.prevPeriod.name}) is closed.`
                    : `Previous period (${checklist.prevPeriod.name}) is still open.`
                  : 'No earlier period defined.'}
              </div>
            </div>
          </div>
        </div>

        {/* Row g: Overdue Invoices (INFO ONLY) */}
        <div className="py-3.5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center shrink-0 mt-0.5">
              <Info className="w-3.5 h-3.5 stroke-[2.5]" />
            </span>
            <div>
              <div className="text-xs font-bold text-foreground">
                Overdue invoices at period end
              </div>
              <div className="text-xs text-muted-foreground dark:text-muted-foreground mt-0.5">
                {checklist.overdueInvoiceCount > 0
                  ? `${checklist.overdueInvoiceCount} invoice(s) overdue.`
                  : 'No overdue invoices.'}
              </div>
            </div>
          </div>

          {checklist.overdueInvoiceCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/finance/invoices?status=overdue')}
              className="h-7 text-xs font-semibold text-muted-foreground hover:bg-muted shrink-0"
            >
              View overdue →
            </Button>
          )}
        </div>
      </div>

      {/* Checklist Card Footer by Status */}
      <div className="border-t border-border dark:border-border pt-4 mt-2">
        {!isAdmin ? (
          <div className="text-xs text-muted-foreground italic flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Only Admins can close, reopen or lock periods.</span>
          </div>
        ) : selectedPeriod.status === 'Open' ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground dark:text-muted-foreground">
              Closing takes a snapshot of every account balance and stops new postings in this period.
            </p>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    onClick={onClosePeriodClick}
                    disabled={!checklist.check1_blocker || isClosePending}
                    className="bg-[#FA634E] hover:bg-[#e0523d] text-white text-xs font-semibold h-9 px-4 rounded-xl shadow-xs"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    Close {selectedPeriod.name}
                  </Button>
                </TooltipTrigger>
                {!checklist.check1_blocker && (
                  <TooltipContent side="top">
                    <p className="text-xs">Cannot close period while unposted draft journal entries exist.</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        ) : selectedPeriod.status === 'Closed' ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">
              Closed period · Account balances snapshotted.
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenReopenSheet}
                className="h-9 text-xs font-semibold rounded-xl"
              >
                Reopen period
              </Button>

              <Button
                size="sm"
                onClick={onOpenLockModal}
                className="bg-card text-foreground border border-border hover:bg-[#2D2B2C] text-white text-xs font-semibold h-9 px-3.5 rounded-xl shadow-xs"
              >
                <Lock className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                Lock permanently
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground dark:text-muted-foreground font-medium flex items-center gap-2 bg-muted p-3 rounded-xl border border-border dark:border-border">
            <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>Locked periods are permanent and cannot be reopened.</span>
          </div>
        )}
      </div>
    </div>
  );
}
