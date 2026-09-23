import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, FileText, Trash2, Eye, BookOpen, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import KpiCard from '@/components/ui/KpiCard';
import DataTable, { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

import { financeService, CreateJournalEntryDTO, JournalLineDTO } from '@/services/financeService';
import type { JournalEntry, JournalEntryStatus, Account, AccountingPeriod } from '@mercon/shared-types';

const STATUS_BADGES: Record<JournalEntryStatus, string> = {
  Draft: 'bg-amber-50 text-amber-700 border-amber-200',
  Posted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Voided: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function JournalEntriesPage() {
  const queryClient = useQueryClient();

  const [selectedStatus, setSelectedStatus] = useState<JournalEntryStatus | 'all'>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 25;

  // Modals & Detail State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [viewingEntry, setViewingEntry] = useState<JournalEntry | null>(null);

  // Form State
  const [entryDate, setEntryDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [periodId, setPeriodId] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [lines, setLines] = useState<JournalLineDTO[]>([
    { accountId: '', debit: 0, credit: 0, description: '' },
    { accountId: '', debit: 0, credit: 0, description: '' },
  ]);

  // Queries
  const { data: entriesRes, isLoading } = useQuery({
    queryKey: ['journal-entries', selectedStatus, selectedPeriod, search, page],
    queryFn: () =>
      financeService.getJournalEntries({
        status: selectedStatus,
        period_id: selectedPeriod,
        search,
        page,
        per_page: perPage,
      }),
  });

  const { data: accountsRes } = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: () => financeService.getAccounts({ include_inactive: false }),
  });

  const { data: periodsRes } = useQuery({
    queryKey: ['accounting-periods', 'Open'],
    queryFn: () => financeService.getAccountingPeriods({ status: 'Open' }),
  });

  const entries: JournalEntry[] = entriesRes?.data || [];
  const pagination = entriesRes?.pagination || { page: 1, per_page: perPage, total: entries.length, total_pages: 1 };
  const postableAccounts: Account[] = (accountsRes?.data || []).filter((a: Account) => a.is_postable);
  const openPeriods: AccountingPeriod[] = periodsRes?.data || [];

  // Total debits / credits calculation
  const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
  const isBalanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.001;

  // Mutations
  const createDraftMutation = useMutation({
    mutationFn: financeService.createDraftJournalEntry,
    onSuccess: () => {
      toast.success('Draft journal entry created');
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      closeCreateModal();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to create draft entry');
    },
  });

  const postMutation = useMutation({
    mutationFn: financeService.postJournalEntry,
    onSuccess: () => {
      toast.success('Journal entry posted successfully');
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      setViewingEntry(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to post entry');
    },
  });

  const voidMutation = useMutation({
    mutationFn: ({ id, memo }: { id: string; memo?: string }) =>
      financeService.voidJournalEntry(id, memo),
    onSuccess: () => {
      toast.success('Journal entry voided and reversal posted');
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      setViewingEntry(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to void entry');
    },
  });

  const deleteDraftMutation = useMutation({
    mutationFn: financeService.deleteDraftJournalEntry,
    onSuccess: () => {
      toast.success('Draft journal entry deleted');
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to delete draft');
    },
  });

  const openCreateModal = () => {
    setEntryDate(new Date().toISOString().split('T')[0]);
    setPeriodId(openPeriods.length > 0 ? openPeriods[0].id : '');
    setMemo('');
    setLines([
      { accountId: '', debit: 0, credit: 0, description: '' },
      { accountId: '', debit: 0, credit: 0, description: '' },
    ]);
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
  };

  const handleAddLine = () => {
    setLines([...lines, { accountId: '', debit: 0, credit: 0, description: '' }]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 2) {
      toast.error('Journal entry must have at least 2 lines');
      return;
    }
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, field: keyof JournalLineDTO, value: any) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };

    // If typing debit > 0, set credit to 0
    if (field === 'debit' && Number(value) > 0) {
      updated[index].credit = 0;
    }
    // If typing credit > 0, set debit to 0
    if (field === 'credit' && Number(value) > 0) {
      updated[index].debit = 0;
    }

    setLines(updated);
  };

  const handleSaveDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!periodId) {
      toast.error('Please select an open accounting period');
      return;
    }
    if (lines.some((l) => !l.accountId)) {
      toast.error('Please select an account for every line');
      return;
    }

    createDraftMutation.mutate({
      entry_date: entryDate,
      periodId,
      memo,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        description: l.description,
      })),
    });
  };

  const kpis = {
    total: pagination.total,
    draft: entries.filter((e) => e.status === 'Draft').length,
    posted: entries.filter((e) => e.status === 'Posted').length,
    voided: entries.filter((e) => e.status === 'Voided').length,
  };

  const columns: Column<JournalEntry>[] = [
    {
      header: 'Ref ID',
      accessor: (entry) => <span className="font-mono font-bold text-[#3E3C3D]">{entry.ref_id || `JE-${entry.id.slice(0, 6)}`}</span>,
      mobilePriority: 'primary',
    },
    {
      header: 'Entry Date',
      accessor: (entry) => <span className="font-mono text-slate-600">{new Date(entry.entry_date).toLocaleDateString()}</span>,
      mobilePriority: 'secondary',
    },
    {
      header: 'Period',
      accessor: (entry) => <span className="font-medium text-slate-700">{entry.period?.name || '—'}</span>,
      mobilePriority: 'meta',
    },
    {
      header: 'Memo / Description',
      accessor: (entry) => <span className="text-slate-800 max-w-xs truncate block">{entry.memo || '—'}</span>,
      mobilePriority: 'primary',
    },
    {
      header: 'Lines',
      accessor: (entry) => <span className="text-slate-600 font-semibold">{entry.lines?.length || 0} line(s)</span>,
      mobilePriority: 'meta',
    },
    {
      header: 'Status',
      accessor: (entry) => <Badge className={`${STATUS_BADGES[entry.status]} border`}>{entry.status}</Badge>,
      mobilePriority: 'secondary',
    },
    {
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      accessor: (entry) => (
        <div className="space-x-1">
          <Button variant="ghost" size="sm" onClick={() => setViewingEntry(entry)} className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900">
            <Eye className="w-3.5 h-3.5 mr-1" />
            View
          </Button>
          {entry.status === 'Draft' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => postMutation.mutate(entry.id)}
                disabled={postMutation.isPending}
                className="h-7 px-2 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                Post
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm(`Delete draft entry ${entry.ref_id}?`)) deleteDraftMutation.mutate(entry.id);
                }}
                className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
          {entry.status === 'Posted' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const reason = prompt('Reason for voiding journal entry:');
                if (reason !== null) voidMutation.mutate({ id: entry.id, memo: reason });
              }}
              disabled={voidMutation.isPending}
              className="h-7 px-2 text-xs border-rose-200 text-rose-700 hover:bg-rose-50"
            >
              Void
            </Button>
          )}
        </div>
      ),
      mobilePriority: 'hidden',
    },
  ];

  const statusFilterElement = (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      <button
        onClick={() => {
          setSelectedStatus('all');
          setPage(1);
        }}
        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
          selectedStatus === 'all' ? 'bg-[#3E3C3D] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        }`}
      >
        All Statuses
      </button>
      {(['Draft', 'Posted', 'Voided'] as JournalEntryStatus[]).map((st) => (
        <button
          key={st}
          onClick={() => {
            setSelectedStatus(st);
            setPage(1);
          }}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            selectedStatus === st ? 'bg-[#FA634E] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {st}
        </button>
      ))}
    </div>
  );

  return (
    <DashboardLayout active="finance" title="Journal Entries">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#3E3C3D]">Journal Entries</h1>
            <p className="text-sm text-slate-500">General ledger transaction posting & double-entry engine</p>
          </div>
          <Button
            onClick={openCreateModal}
            className="bg-[#FA634E] hover:bg-[#e0523d] text-white shadow-sm font-medium"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Journal Entry
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 shrink-0">
          <KpiCard title="TOTAL ENTRIES" value={kpis.total} variant="slate" icon={BookOpen} description="Across all statuses" />
          <KpiCard title="DRAFT" value={kpis.draft} variant="amber" icon={FileText} description="This page — awaiting posting" />
          <KpiCard title="POSTED" value={kpis.posted} variant="emerald" icon={CheckCircle2} description="This page — in the ledger" />
          <KpiCard title="VOIDED" value={kpis.voided} variant="rose" icon={XCircle} description="This page — reversed" />
        </div>

        {/* Table */}
        <DataTable<JournalEntry>
          title="Journal Entries"
          columns={columns}
          data={entries}
          isLoading={isLoading}
          searchPlaceholder="Search reference or memo..."
          searchValue={search}
          onSearchChange={(val) => {
            setSearch(val);
            setPage(1);
          }}
          filterElement={statusFilterElement}
          enableSelection={false}
          getRowId={(entry) => entry.id}
          currentPage={pagination.page}
          totalPages={pagination.total_pages}
          totalRecords={pagination.total}
          onPageChange={setPage}
          emptyTitle="No Journal Entries"
          emptyMessage="No journal entries found matching criteria."
        />

        {/* Create Modal */}
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-[#3E3C3D]">
                New Journal Entry (Draft)
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSaveDraft} className="space-y-4 py-2">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">
                    Entry Date *
                  </label>
                  <Input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">
                    Accounting Period *
                  </label>
                  <Select value={periodId} onValueChange={setPeriodId}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                    <SelectContent>
                      {openPeriods.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">
                    Memo / Reference
                  </label>
                  <Input
                    placeholder="e.g. Monthly Accrual"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              {/* Lines Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-700">Line Items (Double-Entry)</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAddLine}
                    className="h-7 text-xs text-[#FA634E] hover:bg-rose-50"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Line
                  </Button>
                </div>
                <div className="p-3 space-y-2 max-h-60 overflow-y-auto">
                  {lines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="w-5/12">
                        <Select
                          value={line.accountId}
                          onValueChange={(val) => handleLineChange(idx, 'accountId', val)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select Account" />
                          </SelectTrigger>
                          <SelectContent>
                            {postableAccounts.map((acc) => (
                              <SelectItem key={acc.id} value={acc.id}>
                                {acc.account_code} - {acc.name} ({acc.account_type})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-2/12">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Debit"
                          value={line.debit || ''}
                          onChange={(e) => handleLineChange(idx, 'debit', parseFloat(e.target.value) || 0)}
                          className="h-8 text-xs text-right font-mono"
                        />
                      </div>
                      <div className="w-2/12">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Credit"
                          value={line.credit || ''}
                          onChange={(e) => handleLineChange(idx, 'credit', parseFloat(e.target.value) || 0)}
                          className="h-8 text-xs text-right font-mono"
                        />
                      </div>
                      <div className="w-3/12 flex items-center gap-1">
                        <Input
                          placeholder="Line note"
                          value={line.description || ''}
                          onChange={(e) => handleLineChange(idx, 'description', e.target.value)}
                          className="h-8 text-xs"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveLine(idx)}
                          className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Balancing Footer */}
                <div className="bg-slate-50 px-3 py-2 border-t border-slate-200 flex justify-between items-center text-xs font-semibold">
                  <span>Totals</span>
                  <div className="flex items-center space-x-4">
                    <span className="text-slate-600">
                      Debits: <strong className="font-mono text-slate-900">SAR {totalDebit.toFixed(2)}</strong>
                    </span>
                    <span className="text-slate-600">
                      Credits: <strong className="font-mono text-slate-900">SAR {totalCredit.toFixed(2)}</strong>
                    </span>
                    {isBalanced ? (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 border">
                        Balanced ✓
                      </Badge>
                    ) : (
                      <Badge className="bg-rose-50 text-rose-700 border-rose-200 border">
                        Unbalanced ⚠
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" size="sm" onClick={closeCreateModal}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-[#FA634E] hover:bg-[#e0523d] text-white"
                  disabled={createDraftMutation.isPending}
                >
                  Save as Draft
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* View Detail Modal */}
        <Dialog open={!!viewingEntry} onOpenChange={() => setViewingEntry(null)}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-[#3E3C3D]">
                Journal Entry {viewingEntry?.ref_id || viewingEntry?.id}
              </DialogTitle>
            </DialogHeader>
            {viewingEntry && (
              <div className="space-y-4 py-2 text-xs">
                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div>
                    <span className="text-slate-400 block font-medium">Status</span>
                    <Badge className={`${STATUS_BADGES[viewingEntry.status]} mt-0.5 border`}>
                      {viewingEntry.status}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Entry Date</span>
                    <span className="font-mono text-slate-800 font-bold">
                      {new Date(viewingEntry.entry_date).toLocaleDateString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Period</span>
                    <span className="text-slate-800 font-bold">{viewingEntry.period?.name || '—'}</span>
                  </div>
                </div>

                {viewingEntry.memo && (
                  <div>
                    <span className="text-slate-500 font-medium block mb-1">Memo</span>
                    <p className="text-slate-800 bg-slate-50 p-2.5 rounded border border-slate-200">
                      {viewingEntry.memo}
                    </p>
                  </div>
                )}

                {/* Lines Table */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                        <th className="p-2.5">Account</th>
                        <th className="p-2.5 text-right">Debit</th>
                        <th className="p-2.5 text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewingEntry.lines?.map((line) => (
                        <tr key={line.id}>
                          <td className="p-2.5">
                            <div className="font-medium text-slate-900">
                              {line.account?.account_code} - {line.account?.name}
                            </div>
                            {line.description && (
                              <div className="text-slate-400 text-[11px]">{line.description}</div>
                            )}
                          </td>
                          <td className="p-2.5 text-right font-mono text-slate-800">
                            {Number(line.debit) > 0 ? `SAR ${Number(line.debit).toFixed(2)}` : '—'}
                          </td>
                          <td className="p-2.5 text-right font-mono text-slate-800">
                            {Number(line.credit) > 0 ? `SAR ${Number(line.credit).toFixed(2)}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <DialogFooter className="pt-2">
                  <Button variant="outline" size="sm" onClick={() => setViewingEntry(null)}>
                    Close
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
