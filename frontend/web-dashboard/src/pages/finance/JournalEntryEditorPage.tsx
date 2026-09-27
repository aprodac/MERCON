import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ArrowLeft, CheckCircle2, AlertCircle, Save, Send } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import ConfirmModal from '@/components/ui/ConfirmModal';

import { financeService, JournalLineDTO } from '@/services/financeService';
import type { JournalEntry, Account, AccountingPeriod } from '@mercon/shared-types';
import { FinancePageHeader, MoneyText, JournalLinesTable } from '@/components/finance/kit';
import { formatMoney } from '@/lib/finance';
import { Chip } from '@/components/ui/chip';

export default function JournalEntryEditorPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isEditMode = Boolean(id);

  // Form State
  const [entryDate, setEntryDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [periodId, setPeriodId] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [lines, setLines] = useState<JournalLineDTO[]>([
    { accountId: '', debit: 0, credit: 0, description: '' },
    { accountId: '', debit: 0, credit: 0, description: '' },
  ]);

  const [isDirty, setIsDirty] = useState(false);
  const [isPostConfirmOpen, setIsPostConfirmOpen] = useState(false);
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null);

  // Queries
  const { data: openPeriodsRes } = useQuery({
    queryKey: ['accounting-periods', 'Open'],
    queryFn: () => financeService.getAccountingPeriods({ status: 'Open' }),
  });

  const { data: accountsRes } = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: () => financeService.getAccounts({ include_inactive: false }),
  });

  // Fetch existing entry if in edit mode
  const { data: existingEntryRes, isLoading: isEntryLoading } = useQuery({
    queryKey: ['journal-entry', id],
    queryFn: () => financeService.getJournalEntryById(id!),
    enabled: isEditMode,
  });

  const openPeriods: AccountingPeriod[] = openPeriodsRes?.data || [];
  const postableAccounts: Account[] = (accountsRes?.data || []).filter((a: Account) => a.is_postable);

  // Load existing entry into form
  useEffect(() => {
    if (isEditMode && existingEntryRes?.data) {
      const entry: JournalEntry = existingEntryRes.data;
      if (entry.status !== 'Draft') {
        toast.info(`Journal entry ${entry.ref_id || ''} is ${entry.status} and cannot be edited.`);
        navigate(`/finance/journal-entries/${id}`, { replace: true });
        return;
      }

      setEntryDate(new Date(entry.entry_date).toISOString().split('T')[0]);
      setPeriodId(entry.periodId);
      setMemo(entry.memo || '');
      setLines(
        (entry.lines || []).map((l) => ({
          accountId: l.accountId,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.description || '',
        }))
      );
    }
  }, [isEditMode, existingEntryRes, id, navigate]);

  // Auto-pick period matching entryDate if periodId is not set
  useEffect(() => {
    if (!periodId && openPeriods.length > 0 && entryDate) {
      const eDate = new Date(entryDate);
      const matching = openPeriods.find((p) => {
        const s = new Date(p.start_date);
        const e = new Date(p.end_date);
        return eDate >= s && eDate <= e;
      });
      if (matching) setPeriodId(matching.id);
      else setPeriodId(openPeriods[0].id);
    }
  }, [entryDate, openPeriods, periodId]);

  // Account combobox options
  const accountOptions = useMemo(() => {
    return postableAccounts.map((acc) => ({
      value: acc.id,
      label: `${acc.account_code} - ${acc.name}`,
      keywords: `${acc.account_code} ${acc.name} ${acc.account_type}`,
      group: acc.account_type,
    }));
  }, [postableAccounts]);

  // Total debits & credits
  const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
  const diff = Math.abs(totalDebit - totalCredit);
  const isBalanced = totalDebit > 0 && diff < 0.001;
  const isFormValid =
    lines.length >= 2 &&
    lines.every((l) => Boolean(l.accountId)) &&
    Boolean(periodId) &&
    Boolean(entryDate);

  // Line change helper
  const handleLineChange = (index: number, field: keyof JournalLineDTO, value: any) => {
    setIsDirty(true);
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };

    // Auto-clear opposing side
    if (field === 'debit' && Number(value) > 0) {
      updated[index].credit = 0;
    }
    if (field === 'credit' && Number(value) > 0) {
      updated[index].debit = 0;
    }

    setLines(updated);
  };

  const handleAddLine = () => {
    setIsDirty(true);
    setLines([...lines, { accountId: '', debit: 0, credit: 0, description: '' }]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 2) {
      toast.error('Journal entry must have at least 2 lines');
      return;
    }
    setIsDirty(true);
    setLines(lines.filter((_, i) => i !== index));
  };

  // Balance remaining auto-fill helper
  const handleBalanceRemaining = (index: number) => {
    setIsDirty(true);
    const updated = [...lines];
    const currentDebitSum = lines.reduce((s, l, i) => (i === index ? s : s + (Number(l.debit) || 0)), 0);
    const currentCreditSum = lines.reduce((s, l, i) => (i === index ? s : s + (Number(l.credit) || 0)), 0);

    if (currentDebitSum > currentCreditSum) {
      // Need credit to balance
      updated[index].credit = parseFloat((currentDebitSum - currentCreditSum).toFixed(2));
      updated[index].debit = 0;
    } else if (currentCreditSum > currentDebitSum) {
      // Need debit to balance
      updated[index].debit = parseFloat((currentCreditSum - currentDebitSum).toFixed(2));
      updated[index].credit = 0;
    }
    setLines(updated);
  };

  // Mutations
  const createDraftMutation = useMutation({
    mutationFn: financeService.createDraftJournalEntry,
    onSuccess: (data) => {
      toast.success(`Draft journal entry ${data.ref_id || ''} created`);
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      setIsDirty(false);
      navigate(`/finance/journal-entries/${data.id}`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to create draft entry');
    },
  });

  const updateDraftMutation = useMutation({
    mutationFn: (data: any) => financeService.updateDraftJournalEntry(id!, data),
    onSuccess: (data) => {
      toast.success(`Draft journal entry ${data.ref_id || ''} updated`);
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entry', id] });
      setIsDirty(false);
      navigate(`/finance/journal-entries/${id}`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to update draft entry');
    },
  });

  const saveAndPostMutation = useMutation({
    mutationFn: async () => {
      // 1. Save (create or update)
      const payload = {
        entry_date: entryDate,
        periodId,
        memo,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.description || null,
        })),
      };

      let entryId = id;
      if (isEditMode && id) {
        await financeService.updateDraftJournalEntry(id, payload);
      } else {
        const created = await financeService.createDraftJournalEntry(payload);
        entryId = created.id;
      }

      // 2. Post
      const posted = await financeService.postJournalEntry(entryId!);
      return posted;
    },
    onSuccess: (posted) => {
      toast.success(`Journal entry ${posted.ref_id || ''} posted successfully`);
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      setIsDirty(false);
      setIsPostConfirmOpen(false);
      navigate(`/finance/journal-entries/${posted.id}`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to post entry');
    },
  });

  const handleSaveDraft = () => {
    if (!periodId) {
      toast.error('Please select an open accounting period');
      return;
    }
    if (lines.some((l) => !l.accountId)) {
      toast.error('Please select an account for every line');
      return;
    }

    const payload = {
      entry_date: entryDate,
      periodId,
      memo,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        description: l.description || null,
      })),
    };

    if (isEditMode) {
      updateDraftMutation.mutate(payload);
    } else {
      createDraftMutation.mutate(payload);
    }
  };

  const periodCoversDate = useMemo(() => {
    if (!periodId || !entryDate || openPeriods.length === 0) return true;
    const selectedP = openPeriods.find((p) => p.id === periodId);
    if (!selectedP) return true;
    const eDate = new Date(entryDate);
    const s = new Date(selectedP.start_date);
    const e = new Date(selectedP.end_date);
    return eDate >= s && eDate <= e;
  }, [entryDate, periodId, openPeriods]);

  if (isEditMode && isEntryLoading) {
    return (
      <DashboardLayout active="finance" title="Edit Journal Entry">
        <div className="p-8 max-w-5xl mx-auto space-y-4">
          <div className="h-8 w-48 bg-muted rounded-lg animate-pulse" />
          <div className="h-40 bg-muted rounded-xl animate-pulse" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout active="finance" title={isEditMode ? 'Edit Journal Entry' : 'New Journal Entry'}>
      <div className="p-6 space-y-6 max-w-6xl mx-auto pb-24">
        {/* Page Header */}
        <FinancePageHeader
          crumbs={[
            { label: 'Journal Entries', to: '/finance/journal-entries' },
            { label: isEditMode ? 'Edit Draft' : 'New Entry' },
          ]}
          title={isEditMode ? 'Edit Draft Entry' : 'New Journal Entry'}
          subtitle="Prepare double-entry general ledger postings."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/finance/journal-entries')}
              className="h-9 text-xs font-semibold"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Back to List
            </Button>
          }
        />

        {/* Header Card */}
        <div className="bg-card rounded-xl border border-border shadow-xs p-6 space-y-4">
          <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
            Entry Metadata
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">
                Entry Date <span className="text-rose-500">*</span>
              </label>
              <Input
                type="date"
                value={entryDate}
                onChange={(e) => {
                  setEntryDate(e.target.value);
                  setIsDirty(true);
                }}
                className="h-10 text-xs rounded-xl"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">
                Accounting Period <span className="text-rose-500">*</span>
              </label>
              <Select
                value={periodId}
                onValueChange={(val) => {
                  setPeriodId(val);
                  setIsDirty(true);
                }}
              >
                <SelectTrigger className="h-10 text-xs rounded-xl">
                  <SelectValue placeholder="Select open period" />
                </SelectTrigger>
                <SelectContent>
                  {openPeriods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} (Open)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!periodCoversDate && (
                <p className="text-[11px] text-amber-600 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  Entry date is outside selected period dates
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">
                Memo / Reference Description
              </label>
              <Input
                placeholder="e.g. Monthly Payroll Accrual"
                value={memo}
                onChange={(e) => {
                  setMemo(e.target.value);
                  setIsDirty(true);
                }}
                className="h-10 text-xs rounded-xl"
              />
            </div>
          </div>
        </div>

        {/* Lines Card — Spreadsheet Grid */}
        <div className="bg-card rounded-xl border border-border shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Double-Entry Line Items
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddLine}
              className="h-8 text-xs font-semibold text-[#FA634E] border-[#FA634E]/30 hover:bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Line
            </Button>
          </div>

          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-muted border-b border-border text-muted-foreground font-semibold">
                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                  <th className="py-2.5 px-3 w-5/12">Account (Code - Name) *</th>
                  <th className="py-2.5 px-3 w-3/12">Description</th>
                  <th className="py-2.5 px-3 w-2/12 text-right">Debit (SAR)</th>
                  <th className="py-2.5 px-3 w-2/12 text-right">Credit (SAR)</th>
                  <th className="py-2.5 px-3 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {lines.map((line, idx) => {
                  const isUnbalancedRow = Number(line.debit) === 0 && Number(line.credit) === 0;
                  const canShowBalanceBtn = isUnbalancedRow && Math.abs(totalDebit - totalCredit) > 0.001;

                  return (
                    <tr key={idx} className="hover:bg-muted/50 transition-colors">
                      <td className="py-2 px-3 text-center text-muted-foreground font-mono text-[11px]">
                        {idx + 1}
                      </td>

                      <td className="py-2 px-3">
                        <Combobox
                          options={accountOptions}
                          value={line.accountId}
                          onChange={(val) => handleLineChange(idx, 'accountId', val)}
                          placeholder="Select postable account..."
                          searchPlaceholder="Search account code or name..."
                          triggerClassName="h-9 rounded-lg"
                        />
                      </td>

                      <td className="py-2 px-3">
                        <Input
                          placeholder="Line note..."
                          value={line.description || ''}
                          onChange={(e) => handleLineChange(idx, 'description', e.target.value)}
                          className="h-9 text-xs rounded-lg"
                        />
                      </td>

                      <td className="py-2 px-3 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={line.debit || ''}
                          onChange={(e) => handleLineChange(idx, 'debit', parseFloat(e.target.value) || 0)}
                          className="h-9 text-xs text-right font-mono .fin-num rounded-lg"
                        />
                      </td>

                      <td className="py-2 px-3 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={line.credit || ''}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && idx === lines.length - 1) {
                              e.preventDefault();
                              handleAddLine();
                            }
                          }}
                          onChange={(e) => handleLineChange(idx, 'credit', parseFloat(e.target.value) || 0)}
                          className="h-9 text-xs text-right font-mono .fin-num rounded-lg"
                        />
                      </td>

                      <td className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canShowBalanceBtn && (
                            <Chip tone="positive" size="sm" asChild>
                              <button
                                type="button"
                                onClick={() => handleBalanceRemaining(idx)}
                                title="Fill remaining balance"
                              >
                                Balance remaining ({formatMoney(diff, { currency: 'SAR' })})
                              </button>
                            </Chip>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={lines.length <= 2}
                            onClick={() => handleRemoveLine(idx)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-600 disabled:opacity-30"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sticky Footer Bar */}
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-card/95 backdrop-blur-md border-t border-border p-4 shadow-lg">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Totals & Balance Indicator */}
            <div className="flex items-center gap-6 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-medium">Total Debit:</span>
                <MoneyText value={totalDebit} currency="SAR" className="font-bold text-foreground text-sm" />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-medium">Total Credit:</span>
                <MoneyText value={totalCredit} currency="SAR" className="font-bold text-foreground text-sm" />
              </div>

              <div>
                {isBalanced ? (
                  <Chip tone="positive" icon={CheckCircle2}>
                    Balanced ✓
                  </Chip>
                ) : (
                  <Chip tone="warning" icon={AlertCircle}>
                    Out by {formatMoney(diff, { currency: 'SAR' })}
                  </Chip>
                )}
              </div>
            </div>

            {/* Actions Right */}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate('/finance/journal-entries')}
                className="h-9 text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSaveDraft}
                disabled={createDraftMutation.isPending || updateDraftMutation.isPending}
                className="h-9 text-xs font-semibold border-border text-foreground hover:bg-muted"
              >
                <Save className="w-3.5 h-3.5 mr-1.5" />
                Save draft
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!isBalanced || !isFormValid || saveAndPostMutation.isPending}
                onClick={() => setIsPostConfirmOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-xs font-semibold px-4 shadow-xs disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                Save & post
              </Button>
            </div>
          </div>
        </div>

        {/* Post Confirmation Modal */}
        {isPostConfirmOpen && (
          <ConfirmModal
            isOpen={isPostConfirmOpen}
            onClose={() => setIsPostConfirmOpen(false)}
            onConfirm={() => saveAndPostMutation.mutate()}
            isLoading={saveAndPostMutation.isPending}
            title="Save & Post Journal Entry to General Ledger?"
            description="This posts to the general ledger and cannot be edited afterwards. Verify the double-entry lines below."
            confirmLabel="Save & Post Now"
            variant="default"
          >
            <div className="my-3">
              <JournalLinesTable
                lines={lines.map((l) => ({
                  id: l.accountId,
                  journalEntryId: '',
                  accountId: l.accountId,
                  account: postableAccounts.find((a) => a.id === l.accountId),
                  debit: l.debit,
                  credit: l.credit,
                  description: l.description,
                }))}
              />
            </div>
          </ConfirmModal>
        )}
      </div>
    </DashboardLayout>
  );
}
