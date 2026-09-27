import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PenLine,
  Trash2,
  Lock,
  ExternalLink,
  ReceiptText,
  FileText,
  BadgeDollarSign,
  CreditCard,
  Wallet,
  HandCoins,
  ArrowRightLeft,
  Building2,
  Truck,
  Upload,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import ConfirmModal from '@/components/ui/ConfirmModal';

import { financeService } from '@/services/financeService';
import type { JournalEntry } from '@mercon/shared-types';
import {
  RecordLayout,
  DocStatusBar,
  StatusPill,
  JournalLinesTable,
  ActivityTimeline,
} from '@/components/finance/kit';
import { formatDate } from '@/lib/finance';

const SOURCE_CONFIG: Record<string, { icon: React.ElementType; label: string; link?: (id?: string | null) => string }> = {
  Manual: { icon: PenLine, label: 'Manual' },
  Invoice: { icon: ReceiptText, label: 'Invoice', link: () => `/finance/invoices` },
  InvoicePayment: { icon: BadgeDollarSign, label: 'Invoice payment', link: () => `/finance/invoices` },
  Bill: { icon: FileText, label: 'Bill', link: () => `/finance/bills` },
  BillPayment: { icon: CreditCard, label: 'Bill payment', link: () => `/finance/bills` },
  Expense: { icon: Wallet, label: 'Expense', link: () => `/finance/expenses` },
  Advance: { icon: HandCoins, label: 'Advance', link: () => `/finance/advances` },
  AdvanceApplication: { icon: ArrowRightLeft, label: 'Advance applied', link: () => `/finance/advances` },
  BankTransfer: { icon: Building2, label: 'Bank transfer', link: () => `/finance/bank-accounts` },
  TripSubcontract: { icon: Truck, label: 'Trip subcontract' },
  FiscalYearClosing: { icon: Lock, label: 'Year-end closing' },
  IMPORT: { icon: Upload, label: 'Import' },
};

function renderSourceBadge(sourceType?: string, sourceId?: string | null) {
  const config = SOURCE_CONFIG[sourceType || ''] || { icon: HelpCircle, label: sourceType || 'System' };
  const Icon = config.icon;
  const link = config.link?.(sourceId);

  const content = (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-muted text-foreground border border-border">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      {config.label}
    </span>
  );

  if (link) {
    return (
      <Link to={link} className="hover:opacity-80">
        {content}
      </Link>
    );
  }

  return content;
}

export default function JournalEntryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isPostConfirmOpen, setIsPostConfirmOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isVoidConfirmOpen, setIsVoidConfirmOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  // Fetch Journal Entry
  const { data: entryRes, isLoading, isError, error } = useQuery({
    queryKey: ['journal-entry', id],
    queryFn: () => financeService.getJournalEntryById(id!),
    enabled: Boolean(id),
  });

  // Fetch Activity Log
  const { data: activityRes, isLoading: isActivityLoading } = useQuery({
    queryKey: ['journal-entry-activity', id],
    queryFn: () => financeService.getJournalEntryActivity(id!),
    enabled: Boolean(id),
  });

  const entry: JournalEntry | null = entryRes?.data || null;

  // Mutations
  const postMutation = useMutation({
    mutationFn: () => financeService.postJournalEntry(id!),
    onSuccess: (data) => {
      toast.success(`Journal entry ${data.ref_id || ''} posted successfully`);
      queryClient.invalidateQueries({ queryKey: ['journal-entry', id] });
      queryClient.invalidateQueries({ queryKey: ['journal-entry-activity', id] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      setIsPostConfirmOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to post entry');
    },
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) => financeService.voidJournalEntry(id!, reason),
    onSuccess: (res) => {
      toast.success('Journal entry voided and reversal posted');
      queryClient.invalidateQueries({ queryKey: ['journal-entry', id] });
      queryClient.invalidateQueries({ queryKey: ['journal-entry-activity', id] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      setIsVoidConfirmOpen(false);
      setVoidReason('');
      if (res.reversal?.id) {
        toast.info(`Reversal entry ${res.reversal.ref_id || ''} created`);
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to void entry');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => financeService.deleteDraftJournalEntry(id!),
    onSuccess: () => {
      toast.success('Draft entry deleted');
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      navigate('/finance/journal-entries');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to delete draft');
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout active="finance" title="Journal Entry Details">
        <div className="p-8 max-w-6xl mx-auto space-y-4">
          <div className="h-8 w-64 bg-muted rounded-lg animate-pulse" />
          <div className="h-32 bg-muted rounded-xl animate-pulse" />
          <div className="h-96 bg-card rounded-xl animate-pulse border border-border" />
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !entry) {
    return (
      <DashboardLayout active="finance" title="Journal Entry Details">
        <div className="p-12 max-w-xl mx-auto text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-xl font-bold text-foreground">Journal Entry Not Found</h2>
          <p className="text-xs text-muted-foreground">
            {(error as any)?.response?.data?.error?.message || 'The requested journal entry does not exist or has been deleted.'}
          </p>
          <Button onClick={() => navigate('/finance/journal-entries')} variant="outline" size="sm">
            Back to Journal Entries
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  // Determine DocStatusBar steps
  const statusSteps =
    entry.status === 'Voided'
      ? [
          { label: 'Draft', timestamp: entry.createdAt ? formatDate(entry.createdAt, 'MMM d, yyyy') : undefined },
          { label: 'Posted', timestamp: entry.posted_at ? formatDate(entry.posted_at, 'MMM d, yyyy') : undefined },
          { label: 'Voided' },
        ]
      : [
          { label: 'Draft', timestamp: entry.createdAt ? formatDate(entry.createdAt, 'MMM d, yyyy') : undefined },
          { label: 'Posted', timestamp: entry.posted_at ? formatDate(entry.posted_at, 'MMM d, yyyy') : undefined },
        ];

  const currentStepIndex = entry.status === 'Draft' ? 0 : entry.status === 'Posted' ? 1 : 2;

  const isClosedPeriod = entry.period?.status !== 'Open';

  return (
    <DashboardLayout active="finance" title={`JE - ${entry.ref_id || entry.id}`}>
      <div className="p-6 max-w-7xl mx-auto">
        <RecordLayout
          crumbs={[
            { label: 'Journal Entries', to: '/finance/journal-entries' },
            { label: entry.ref_id || `JE-${entry.id.slice(0, 6)}` },
          ]}
          title={
            <div className="flex items-center gap-3">
              <span className="font-mono text-2xl font-bold text-foreground .fin-num">
                {entry.ref_id || `JE-${entry.id.slice(0, 6)}`}
              </span>
              <StatusPill kind="journal" status={entry.status} />
              {renderSourceBadge(entry.source_type, entry.source_id)}
            </div>
          }
          subLine={
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Date: <strong className="text-foreground">{formatDate(entry.entry_date, 'MMM d, yyyy')}</strong></span>
              <span>·</span>
              <span>Period: <strong className="text-foreground">{entry.period?.name || '—'}</strong></span>
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              {entry.status === 'Draft' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/finance/journal-entries/${id}/edit`)}
                    className="h-9 text-xs font-semibold"
                  >
                    <PenLine className="w-3.5 h-3.5 mr-1.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setIsPostConfirmOpen(true)}
                    disabled={isClosedPeriod}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-xs font-semibold px-4 shadow-xs"
                  >
                    Post Entry
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsDeleteConfirmOpen(true)}
                    className="h-9 text-xs text-muted-foreground hover:text-rose-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}

              {entry.status === 'Posted' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsVoidConfirmOpen(true)}
                  className="h-9 text-xs border-rose-200 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 font-semibold"
                >
                  Void Entry
                </Button>
              )}
            </div>
          }
          statusBar={<DocStatusBar steps={statusSteps} currentStepIndex={currentStepIndex} />}
          main={
            <div className="bg-card rounded-xl border border-border shadow-xs p-6 space-y-6">
              {/* Detail Strip */}
              <div className="bg-[var(--fin-surface-sunken)] p-4 rounded-[14px] border border-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground block font-medium mb-1">Entry Date</span>
                  <span className="font-mono font-bold text-foreground">
                    {formatDate(entry.entry_date, 'MMM d, yyyy')}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block font-medium mb-1">Accounting Period</span>
                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                    <span>{entry.period?.name || '—'}</span>
                    {entry.period && (
                      <span className={`px-1.5 py-0.2 rounded text-[10px] ${
                        entry.period.status === 'Open' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 text-emerald-700' : 'bg-slate-200 text-foreground'
                      }`}>
                        {entry.period.status}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground block font-medium mb-1">Source</span>
                  <span className="font-medium text-foreground">{entry.source_type || 'Manual'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block font-medium mb-1">Reference ID</span>
                  <span className="font-mono font-bold text-foreground">{entry.ref_id || '—'}</span>
                </div>
                <div className="sm:col-span-2 lg:col-span-1">
                  <span className="text-muted-foreground block font-medium mb-1">Memo / Description</span>
                  <span className="font-medium text-foreground truncate block">{entry.memo || '—'}</span>
                </div>
              </div>

              {/* Journal Lines Table */}
              <div>
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">
                  General Ledger Lines
                </h3>
                <JournalLinesTable lines={entry.lines} />
              </div>
            </div>
          }
          side={
            <div className="space-y-5">
              {/* Linked Card */}
              <div className="bg-card rounded-xl border border-border shadow-xs p-5 space-y-4">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Linked Context
                </h3>

                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-muted-foreground block font-medium mb-1">Source Document</span>
                    {entry.source_type !== 'Manual' ? (
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted border border-border">
                        <div className="font-semibold text-foreground flex items-center gap-2">
                          {renderSourceBadge(entry.source_type, entry.source_id)}
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Manual journal entry</span>
                    )}
                  </div>

                  {(entry.reversalOf || entry.reversedBy) && (
                    <div className="space-y-2 pt-2 border-t border-border">
                      <span className="text-muted-foreground block font-medium">Reversal Relation</span>
                      {entry.reversalOf && (
                        <Link
                          to={`/finance/journal-entries/${entry.reversalOf.id}`}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-purple-50/60 border border-purple-200 text-purple-900 font-semibold hover:bg-purple-100/60 transition-colors"
                        >
                          <span>Reversal of {entry.reversalOf.ref_id || 'JE'}</span>
                          <ExternalLink className="w-3.5 h-3.5 text-purple-600" />
                        </Link>
                      )}
                      {entry.reversedBy && (
                        <Link
                          to={`/finance/journal-entries/${entry.reversedBy.id}`}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-purple-50/60 border border-purple-200 text-purple-900 font-semibold hover:bg-purple-100/60 transition-colors"
                        >
                          <span>Reversed by {entry.reversedBy.ref_id || 'JE'}</span>
                          <ExternalLink className="w-3.5 h-3.5 text-purple-600" />
                        </Link>
                      )}
                    </div>
                  )}

                  <div className="pt-2 border-t border-border">
                    <span className="text-muted-foreground block font-medium mb-1">Accounting Period</span>
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted border border-border">
                      <span className="font-semibold text-foreground">{entry.period?.name || '—'}</span>
                      {isClosedPeriod && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                          <Lock className="w-3 h-3" /> Closed
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Activity Timeline Card */}
              <div className="bg-card rounded-xl border border-border shadow-xs p-5 space-y-4">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Audit Activity
                </h3>
                <ActivityTimeline items={activityRes?.data || []} isLoading={isActivityLoading} />
              </div>
            </div>
          }
        />

        {/* Post Modal */}
        <ConfirmModal
          isOpen={isPostConfirmOpen}
          onClose={() => setIsPostConfirmOpen(false)}
          onConfirm={() => postMutation.mutate()}
          isLoading={postMutation.isPending}
          title={`Post Journal Entry ${entry.ref_id || ''}?`}
          description="This posts to the general ledger and cannot be edited afterwards."
          confirmLabel="Post to General Ledger"
          variant="default"
        >
          <div className="my-3">
            <JournalLinesTable lines={entry.lines} />
          </div>
        </ConfirmModal>

        {/* Delete Modal */}
        <ConfirmModal
          isOpen={isDeleteConfirmOpen}
          onClose={() => setIsDeleteConfirmOpen(false)}
          onConfirm={() => deleteMutation.mutate()}
          isLoading={deleteMutation.isPending}
          title={`Delete Draft Entry ${entry.ref_id || ''}?`}
          description="Are you sure you want to permanently delete this draft entry? This action cannot be undone."
          confirmLabel="Delete Draft"
          variant="destructive"
        />

        {/* Void Modal */}
        <ConfirmModal
          isOpen={isVoidConfirmOpen}
          onClose={() => {
            setIsVoidConfirmOpen(false);
            setVoidReason('');
          }}
          onConfirm={() => voidMutation.mutate(voidReason)}
          isLoading={voidMutation.isPending}
          title={`Void Journal Entry ${entry.ref_id || ''}?`}
          description="Voiding will create an automated reversing journal entry with swapped debit and credit lines."
          confirmLabel="Void & Post Reversal"
          variant="destructive"
        >
          <div className="my-3 space-y-2">
            <label className="text-xs font-semibold text-foreground block">Reason for voiding (optional):</label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Reason memo for reversal record..."
              rows={2}
              className="w-full text-xs p-2.5 rounded-lg border border-border focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
          </div>
        </ConfirmModal>
      </div>
    </DashboardLayout>
  );
}
