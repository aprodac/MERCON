import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Printer, Ban, CheckCircle2, ArrowDownLeft, ArrowUpRight, ExternalLink, Info, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  RecordLayout,
  DocStatusBar,
  BalanceHeroCard,
  SidePanelTabs,
  JournalLinesTable,
  ActivityTimeline,
  StatusPill,
  MoneyText,
  FinanceEmptyState,
} from '@/components/finance/kit';
import type { ActivityItem } from '@/components/finance/kit';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

import { AdvanceApplySheet } from '@/components/finance/advances/AdvanceApplySheet';
import { AdvancePrintVoucher } from '@/components/finance/advances/AdvancePrintVoucher';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { financeService } from '@/services/financeService';
import type { Advance, JournalEntry } from '@mercon/shared-types';

export default function AdvanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isApplySheetOpen, setIsApplySheetOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isVoidDialogOpen, setIsVoidDialogOpen] = useState(false);
  const [sideTab, setSideTab] = useState<'journal' | 'timeline' | 'other'>('journal');

  // Fetch Advance Record
  const { data: advanceRes, isLoading, error } = useQuery({
    queryKey: ['advance', id],
    queryFn: () => (id ? financeService.getAdvanceById(id) : null),
    enabled: Boolean(id),
  });

  const advance = advanceRes?.data;

  // Fetch Other Advances for Party
  const { data: partyAdvancesRes } = useQuery({
    queryKey: ['advances', 'party', advance?.party_type, advance?.party_id],
    queryFn: () =>
      advance?.party_id
        ? financeService.getAdvances({ party_type: advance.party_type, party_id: advance.party_id })
        : null,
    enabled: Boolean(advance?.party_id),
  });

  const otherAdvances = (partyAdvancesRes?.data || []).filter((a: Advance) => a.id !== id);

  // Void Mutation
  const voidMutation = useMutation({
    mutationFn: () => financeService.voidAdvance(id!),
    onSuccess: () => {
      toast.success('Advance voided successfully');
      queryClient.invalidateQueries({ queryKey: ['advance', id] });
      queryClient.invalidateQueries({ queryKey: ['advances'] });
      setIsVoidDialogOpen(false);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to void advance';
      toast.error(msg);
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout active="finance" title="Advance Details">
        <div className="p-6 max-w-[1400px] mx-auto space-y-6">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-96 lg:col-span-2 rounded-xl" />
            <Skeleton className="h-96 rounded-xl" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !advance) {
    return (
      <DashboardLayout active="finance" title="Advance Not Found">
        <div className="p-6 max-w-[1400px] mx-auto">
          <FinanceEmptyState
            title="Advance not found"
            description="The requested advance record does not exist or has been removed."
            action={
              <Button onClick={() => navigate('/finance/advances')} variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Advances
              </Button>
            }
          />
        </div>
      </DashboardLayout>
    );
  }

  // Calculated values
  const total = Number(advance.amount || 0);
  const applied = Number(advance.applied_amount || 0);
  const remaining = Number(advance.remaining_amount || 0);
  const appliedPct = total > 0 ? Math.round((applied / total) * 100) : 0;
  const isUnapplied = applied === 0;

  const partyName = advance.party?.name || (advance.party_id ? `Party ID: ${advance.party_id}` : 'General / Not Linked');

  // Party link path
  let partyLink = '#';
  if (advance.party_type === 'Customer' && advance.party_id) partyLink = `/customers/${advance.party_id}`;
  if (advance.party_type === 'Provider' && advance.party_id) partyLink = `/third-party/${advance.party_id}`;
  if (advance.party_type === 'Employee' && advance.party_id) partyLink = `/drivers/${advance.party_id}`;

  // Apply check
  const canApply = (advance.party_type === 'Customer' && advance.direction === 'Received') ||
                   (advance.party_type === 'Provider' && advance.direction === 'Paid');

  // DocStatusBar steps
  const statusBarSteps = [
    { key: 'open', label: 'Open', timestamp: formatDate(advance.advance_date) },
    {
      key: 'partially',
      label: 'Partially applied',
      timestamp: advance.status === 'PartiallyApplied' || advance.status === 'FullyApplied' ? 'Applied' : undefined,
    },
    {
      key: 'fully',
      label: 'Fully applied',
      timestamp: advance.status === 'FullyApplied' ? 'Fully applied' : undefined,
    },
  ];

  const voidedSteps = [
    { key: 'open', label: 'Open', timestamp: formatDate(advance.advance_date) },
    { key: 'void', label: 'Void', timestamp: 'Voided' },
  ];

  // Activity Timeline Items
  const timelineItems: ActivityItem[] = [
    {
      id: 'created',
      title: 'Advance Created',
      meta: `${advance.direction === 'Received' ? 'Received' : 'Paid'} ${formatMoney(total, { currency: advance.currency })} via ${advance.account?.name || 'Bank Account'}`,
      at: formatDate(advance.advance_date),
      tone: 'brand',
    },
    ...(advance.applications || []).map((app) => ({
      id: app.id,
      title: `Applied to ${app.invoice?.ref_id || app.bill?.ref_id || 'Document'}`,
      meta: `Applied ${formatMoney(app.amount, { currency: advance.currency })} on ${formatDate(app.applied_date)}`,
      at: formatDate(app.applied_date),
      tone: 'positive' as const,
    })),
    ...(advance.status === 'Void'
      ? [
          {
            id: 'voided',
            title: 'Advance Voided',
            meta: 'Voided and reversing journal entry posted to general ledger.',
            at: formatDate(advance.updatedAt || advance.advance_date),
            tone: 'negative' as const,
          },
        ]
      : []),
  ];

  // Reversal Journal Lines Preview for Void AlertDialog
  const reversalPreviewLines = (advance.journalEntry?.lines || []).map((line) => ({
    account: line.account!,
    debit: line.credit,
    credit: line.debit,
  }));

  return (
    <DashboardLayout active="finance" title={`Advance ${advance.ref_id || advance.id.slice(0, 8)}`}>
      <div className="p-6 max-w-[1400px] mx-auto space-y-6">
        <RecordLayout
          crumbs={[
            { label: 'Advances', href: '/finance/advances' },
            { label: advance.ref_id || advance.id.slice(0, 8) },
          ]}
          title={
            <div className="flex items-center gap-2 flex-wrap">
              <span className="fin-num font-bold text-2xl text-foreground">
                {advance.ref_id || advance.id.slice(0, 8)}
              </span>
              <StatusPill kind="advance" status={advance.status} />
              {advance.direction === 'Received' ? (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 border-emerald-200/60 font-semibold">
                  <ArrowDownLeft className="w-3 h-3 text-emerald-600 mr-1" /> Money in
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 border-amber-200/60 font-semibold">
                  <ArrowUpRight className="w-3 h-3 text-amber-600 mr-1" /> Money out
                </Badge>
              )}
              <Badge variant="outline" className="bg-muted text-foreground border-transparent font-semibold">
                {advance.party_type}
              </Badge>
            </div>
          }
          subLine={`${partyName} · ${formatDate(advance.advance_date)} · via ${advance.account?.name || 'Bank Account'}`}
          statusBar={<DocStatusBar steps={advance.status === 'Void' ? voidedSteps : statusBarSteps} voided={advance.status === 'Void'} />}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPrintModalOpen(true)}
                className="gap-1.5 border-border dark:border-border text-foreground"
              >
                <Printer className="w-4 h-4" />
                <span>Print voucher</span>
              </Button>

              {canApply && remaining > 0 && advance.status !== 'Void' && (
                <Button
                  size="sm"
                  onClick={() => setIsApplySheetOpen(true)}
                  className="bg-[#FA634E] hover:bg-[#E54D38] text-white font-semibold"
                >
                  Apply credits…
                </Button>
              )}

              {isUnapplied && advance.status !== 'Void' && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setIsVoidDialogOpen(true)}
                      className="text-rose-600 dark:text-rose-400 font-semibold"
                    >
                      <Ban className="w-4 h-4 mr-2" /> Void advance
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          }
          main={
            <div className="space-y-6">
              {/* Employee Advance Info Alert */}
              {advance.party_type === 'Employee' && (
                <div className="p-4 rounded-xl bg-teal-500/10 dark:bg-teal-950/40 border border-teal-200/80 dark:border-teal-900/60 flex items-start gap-3">
                  <Info className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs text-teal-900 dark:text-teal-200">
                    <p className="font-semibold">
                      Employee advances can't be applied to customer invoices or provider bills.
                    </p>
                    <p>
                      Settle employee advances with a journal entry (e.g. a payroll deduction or cash repayment).
                    </p>
                    <Link
                      to="/finance/journal-entries/new"
                      className="inline-flex items-center gap-1 font-bold text-teal-700 dark:text-teal-300 underline hover:text-teal-800"
                    >
                      Create settlement journal entry →
                    </Link>
                  </div>
                </div>
              )}

              {/* Hero Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <BalanceHeroCard
                  label="Remaining Balance"
                  amount={remaining}
                  currency={advance.currency || 'SAR'}
                  appliedPct={appliedPct}
                  appliedAmount={applied}
                  totalAmount={total}
                  footerLeft={`Status: ${advance.status}`}
                  footerRight={`${appliedPct}% applied`}
                />

                {/* Details Card */}
                <div className="p-5 rounded-xl border border-border dark:border-border bg-card space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                    Advance Context
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Party:</span>
                      {advance.party_id ? (
                        <Link to={partyLink} className="font-semibold text-[#FA634E] hover:underline flex items-center gap-1">
                          {partyName} <ExternalLink className="w-3 h-3" />
                        </Link>
                      ) : (
                        <span className="font-semibold text-foreground">{partyName}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Advance Date:</span>
                      <span className="font-semibold text-foreground">{formatDate(advance.advance_date)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Bank / Cash Account:</span>
                      <span className="font-semibold text-foreground">
                        {advance.account ? `${advance.account.name} (${advance.account.account_code})` : '—'}
                      </span>
                    </div>
                    {advance.memo && (
                      <div className="flex items-start justify-between">
                        <span className="text-muted-foreground">Memo:</span>
                        <span className="font-medium text-foreground max-w-xs text-right">{advance.memo}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Applications Card */}
              <div className="p-5 rounded-xl border border-border dark:border-border bg-card space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground">
                    Document Applications ({advance.applications?.length || 0})
                  </h3>
                  {canApply && remaining > 0 && advance.status !== 'Void' && (
                    <Button size="sm" onClick={() => setIsApplySheetOpen(true)} className="h-7 text-xs bg-[#FA634E] hover:bg-[#E54D38] text-white">
                      Apply credits…
                    </Button>
                  )}
                </div>

                {advance.applications && advance.applications.length > 0 ? (
                  <div className="border border-border dark:border-border rounded-xl overflow-hidden divide-y divide-border/60 dark:divide-border/60">
                    {advance.applications.map((app) => {
                      const docRef = app.invoice?.ref_id || app.bill?.ref_id || app.invoiceId || app.billId || 'Document';
                      const docListPath = app.invoiceId ? `/finance/invoices?search=${docRef}` : `/finance/bills?search=${docRef}`;

                      return (
                        <div key={app.id} className="p-3.5 bg-card flex items-center justify-between text-xs hover:bg-muted dark:hover:bg-slate-800/50 transition-colors">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] font-semibold">
                                {app.invoiceId ? 'Invoice' : 'Bill'}
                              </Badge>
                              <Link to={docListPath} className="fin-num font-semibold text-[#FA634E] hover:underline flex items-center gap-1">
                                {docRef} <ExternalLink className="w-3 h-3" />
                              </Link>
                            </div>
                            <span className="text-muted-foreground text-[11px]">Applied on {formatDate(app.applied_date)}</span>
                          </div>

                          <div className="flex items-center gap-4">
                            <MoneyText value={app.amount} className="font-bold text-foreground font-mono" />
                            {app.journalEntryId && (
                              <Link
                                to={`/finance/journal-entries/${app.journalEntryId}`}
                                className="text-[11px] font-mono text-muted-foreground hover:text-[#FA634E] hover:underline"
                              >
                                {app.journalEntry?.ref_id || 'Contra JE'} →
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <FinanceEmptyState
                    title="No applications recorded"
                    description={canApply ? "This advance has unapplied credits ready to be allocated against open documents." : "This advance has not been applied to any documents."}
                    action={
                      canApply && remaining > 0 && advance.status !== 'Void' ? (
                        <Button size="sm" onClick={() => setIsApplySheetOpen(true)} className="bg-[#FA634E] hover:bg-[#E54D38] text-white">
                          Apply credits now
                        </Button>
                      ) : undefined
                    }
                  />
                )}
              </div>
            </div>
          }
          side={
            <SidePanelTabs
              tabs={[
                { key: 'journal', label: 'Journal' },
                { key: 'timeline', label: 'Timeline' },
                { key: 'other', label: `Party Advances (${otherAdvances.length})` },
              ]}
              value={sideTab}
              onChange={(val) => setSideTab(val as 'journal' | 'timeline' | 'other')}
            >
              {sideTab === 'journal' && (
                <div className="space-y-4">
                  {advance.journalEntry && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">
                          Initial Advance JE
                        </span>
                        <Link
                          to={`/finance/journal-entries/${advance.journalEntry.id}`}
                          className="text-xs font-mono text-[#FA634E] hover:underline"
                        >
                          {advance.journalEntry.ref_id} →
                        </Link>
                      </div>
                      <JournalLinesTable lines={advance.journalEntry.lines || []} />
                    </div>
                  )}

                  {(advance.applications || []).map((app) => (
                    <div key={app.id} className="space-y-2 pt-2 border-t border-border dark:border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">
                          Application Contra JE
                        </span>
                        {app.journalEntryId && (
                          <Link
                            to={`/finance/journal-entries/${app.journalEntryId}`}
                            className="text-xs font-mono text-[#FA634E] hover:underline"
                          >
                            {app.journalEntry?.ref_id || 'View JE'} →
                          </Link>
                        )}
                      </div>
                      {app.journalEntry?.lines && <JournalLinesTable lines={app.journalEntry.lines} />}
                    </div>
                  ))}
                </div>
              )}

              {sideTab === 'timeline' && (
                <ActivityTimeline items={timelineItems} />
              )}

              {sideTab === 'other' && (
                <div className="space-y-2">
                  {otherAdvances.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-4 text-center">
                      No other advances with this party.
                    </div>
                  ) : (
                    otherAdvances.map((other) => (
                      <div
                        key={other.id}
                        onClick={() => navigate(`/finance/advances/${other.id}`)}
                        className="p-3 rounded-xl border border-border dark:border-border hover:border-border dark:hover:border-border bg-card cursor-pointer transition-colors space-y-1"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="fin-num font-semibold text-foreground">
                            {other.ref_id || other.id.slice(0, 8)}
                          </span>
                          <StatusPill kind="advance" status={other.status} />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                          <span>{formatDate(other.advance_date)}</span>
                          <span>Rem: <MoneyText value={other.remaining_amount} className="font-semibold text-foreground" /></span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </SidePanelTabs>
          }
        />

        {/* Apply Sheet */}
        <AdvanceApplySheet
          open={isApplySheetOpen}
          onOpenChange={setIsApplySheetOpen}
          advance={advance}
        />

        {/* Print Voucher Modal */}
        {isPrintModalOpen && (
          <AdvancePrintVoucher
            advance={advance}
            onClose={() => setIsPrintModalOpen(false)}
          />
        )}

        {/* Void Confirmation AlertDialog */}
        <AlertDialog open={isVoidDialogOpen} onOpenChange={setIsVoidDialogOpen}>
          <AlertDialogContent className="sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <Ban className="w-5 h-5" /> Void Advance {advance.ref_id || advance.id.slice(0, 8)}?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-muted-foreground space-y-2">
                <span>
                  This action is permanent. Voiding this advance will post a reversing journal entry to the general ledger to restore account balances.
                </span>
                {reversalPreviewLines.length > 0 && (
                  <div className="pt-2">
                    <span className="font-bold text-foreground block mb-1">
                      Reversing Journal Entry Preview:
                    </span>
                    <JournalLinesTable lines={reversalPreviewLines as any} variant="preview" />
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => voidMutation.mutate()}
                disabled={voidMutation.isPending}
                className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
              >
                {voidMutation.isPending ? 'Voiding...' : 'Confirm Void'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
