import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Scale, Landmark, CheckCircle2, AlertCircle, Building2, Calendar, FileText } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusChip } from '@/lib/finance/chips';
import DataTable, { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

import { financeService, CreateReconciliationDTO } from '@/services/financeService';
import type { BankAccount, BankReconciliation, JournalEntry, JournalLine } from '@mercon/shared-types';

interface CandidateLine {
  lineId: string;
  journalEntryId: string;
  ref_id?: string | null;
  entry_date: string;
  memo?: string | null;
  description?: string | null;
  debit: number;
  credit: number;
}

export default function ReconciliationPage() {
  const queryClient = useQueryClient();

  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('');
  const [statementDate, setStatementDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [statementClosingBalance, setStatementClosingBalance] = useState<number | ''>('');
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());

  // Fetch all Bank Accounts
  const { data: bankAccountsRes, isLoading: isBankAccountsLoading } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: financeService.getBankAccounts,
  });

  const bankAccounts: BankAccount[] = bankAccountsRes?.data || [];

  // Currently selected Bank Account object
  const selectedBankAccount = useMemo(
    () => bankAccounts.find((b) => b.id === selectedBankAccountId) || null,
    [bankAccounts, selectedBankAccountId]
  );

  // Fetch candidate posted journal entries for the bank account's linked GL accountId
  const { data: journalEntriesRes, isLoading: isEntriesLoading } = useQuery({
    queryKey: ['journalEntries', selectedBankAccount?.accountId],
    queryFn: () =>
      selectedBankAccount?.accountId
        ? financeService.getJournalEntries({
            account_id: selectedBankAccount.accountId,
            status: 'Posted',
          })
        : null,
    enabled: Boolean(selectedBankAccount?.accountId),
  });

  // Extract unreconciled candidate lines
  const candidateLines: CandidateLine[] = useMemo(() => {
    if (!journalEntriesRes?.data || !selectedBankAccount) return [];
    const lines: CandidateLine[] = [];
    const entries: JournalEntry[] = journalEntriesRes.data;

    entries.forEach((entry) => {
      (entry.lines || []).forEach((l: any) => {
        if (l.accountId === selectedBankAccount.accountId && !l.reconciled) {
          lines.push({
            lineId: l.id,
            journalEntryId: entry.id,
            ref_id: entry.ref_id,
            entry_date: entry.entry_date,
            memo: entry.memo,
            description: l.description,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
          });
        }
      });
    });

    return lines.sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime());
  }, [journalEntriesRes, selectedBankAccount]);

  // Fetch past reconciliations for selected Bank Account
  const { data: pastReconciliationsRes, isLoading: isPastLoading } = useQuery({
    queryKey: ['reconciliations', selectedBankAccountId],
    queryFn: () =>
      selectedBankAccountId
        ? financeService.getReconciliations({ bankAccountId: selectedBankAccountId })
        : financeService.getReconciliations(),
    enabled: true,
  });

  const pastReconciliations: BankReconciliation[] = pastReconciliationsRes?.data || [];

  // Create Reconciliation Mutation
  const reconcileMutation = useMutation({
    mutationFn: financeService.createReconciliation,
    onSuccess: () => {
      toast.success('Bank Reconciliation completed successfully');
      queryClient.invalidateQueries({ queryKey: ['reconciliations'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      setSelectedLineIds(new Set());
      setStatementClosingBalance('');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to complete reconciliation';
      toast.error(msg);
    },
  });

  // Live calculations
  const selectedLinesList = useMemo(
    () => candidateLines.filter((l) => selectedLineIds.has(l.lineId)),
    [candidateLines, selectedLineIds]
  );

  const totalSelectedDebits = useMemo(
    () => selectedLinesList.reduce((sum, l) => sum + l.debit, 0),
    [selectedLinesList]
  );

  const totalSelectedCredits = useMemo(
    () => selectedLinesList.reduce((sum, l) => sum + l.credit, 0),
    [selectedLinesList]
  );

  // Net movement = Debits - Credits
  const netMovement = totalSelectedDebits - totalSelectedCredits;

  // Effective Opening Balance:
  // Carries forward statement_closing_balance from the most recent past reconciliation for this account.
  // If no past reconciliations exist, falls back to the account's initial opening_balance.
  const latestPastReconciliation = useMemo(() => {
    if (!selectedBankAccount) return null;
    const accountPast = pastReconciliations.filter(
      (r) => r.bankAccountId === selectedBankAccount.id
    );
    if (accountPast.length === 0) return null;
    return [...accountPast].sort(
      (a, b) => new Date(b.statement_date).getTime() - new Date(a.statement_date).getTime()
    )[0];
  }, [selectedBankAccount, pastReconciliations]);

  const effectiveOpeningBalance = useMemo(() => {
    if (!selectedBankAccount) return 0;
    if (latestPastReconciliation) {
      return Number(latestPastReconciliation.statement_closing_balance) || 0;
    }
    return Number(selectedBankAccount.opening_balance || 0);
  }, [selectedBankAccount, latestPastReconciliation]);

  // Calculated Ending Balance = Effective Opening + Net Movement
  const calculatedEndingBalance = effectiveOpeningBalance + netMovement;

  const targetStatementBalance =
    statementClosingBalance === '' ? 0 : Number(statementClosingBalance);

  // Variance = Statement Balance - Calculated Balance
  const variance = targetStatementBalance - calculatedEndingBalance;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLineIds(new Set(candidateLines.map((l) => l.lineId)));
    } else {
      setSelectedLineIds(new Set());
    }
  };

  const handleToggleLine = (lineId: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
  };

  const handleSubmitReconciliation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBankAccountId) {
      toast.error('Please select a Bank Account');
      return;
    }
    if (!statementDate) {
      toast.error('Please select a Statement Date');
      return;
    }
    if (statementClosingBalance === '') {
      toast.error('Please enter the Statement Closing Balance');
      return;
    }
    if (selectedLineIds.size === 0) {
      toast.error('Please select at least one transaction line to reconcile');
      return;
    }

    const payload: CreateReconciliationDTO = {
      bankAccountId: selectedBankAccountId,
      statement_date: statementDate,
      statement_closing_balance: Number(statementClosingBalance),
      journalLineIds: Array.from(selectedLineIds),
    };

    reconcileMutation.mutate(payload);
  };

  const pastColumns: Column<BankReconciliation>[] = [
    {
      header: 'Statement Date',
      accessor: (row) => (
        <div className="font-mono text-sm font-medium text-foreground">
          {new Date(row.statement_date).toLocaleDateString()}
        </div>
      ),
    },
    {
      header: 'Bank Account',
      accessor: (row) => (
        <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
          {row.bankAccount?.is_cash ? (
            <span className="text-amber-700">Cash Drawer</span>
          ) : (
            <span>{row.bankAccount?.bank_name || 'Bank Account'}</span>
          )}
          {row.bankAccount?.account && (
            <span className="font-mono text-[11px] text-muted-foreground">
              ({row.bankAccount.account.account_code})
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Statement Closing Balance',
      accessor: (row) => (
        <div className="font-mono font-bold text-right text-foreground">
          {Number(row.statement_closing_balance).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{' '}
          <span className="text-xs text-muted-foreground">SAR</span>
        </div>
      ),
    },
    {
      header: 'Reconciled Lines',
      accessor: (row) => (
        <Badge variant="outline" className="font-mono text-xs bg-muted">
          {((row as any)._count?.lines ?? (row.lines?.length || 0))} lines
        </Badge>
      ),
    },
    {
      header: 'Status',
      accessor: (row) => <StatusChip kind="reconciliation" status={row.status || 'Completed'} />,
    },
    {
      header: 'Reconciled At',
      accessor: (row) => (
        <div className="text-xs text-muted-foreground">
          {new Date(row.createdAt).toLocaleDateString()}
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout active="finance" title="Bank Reconciliation">
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Bank Reconciliation</h1>
          </div>
        </div>

        {/* Bank Account Selection Banner */}
        <div className="bg-card p-5 rounded-xl border border-border shadow-xs space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-1.5 md:col-span-1">
              <Label className="text-xs font-semibold text-foreground">
                Select Bank / Cash Account <span className="text-rose-500">*</span>
              </Label>
              <Select
                value={selectedBankAccountId}
                onValueChange={(val) => {
                  setSelectedBankAccountId(val);
                  setSelectedLineIds(new Set());
                }}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Choose Bank Account..." />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      <span className="font-medium">
                        {b.is_cash ? 'Cash Drawer' : b.bank_name || 'Bank Account'}
                      </span>
                      {b.account && (
                        <span className="text-xs text-muted-foreground ml-2 font-mono">
                          ({b.account.account_code} - {b.account.name})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedBankAccount && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Statement Date</Label>
                  <Input
                    type="date"
                    value={statementDate}
                    onChange={(e) => setStatementDate(e.target.value)}
                    className="h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">
                    Statement Closing Balance (SAR) <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 50000.00"
                    value={statementClosingBalance}
                    onChange={(e) =>
                      setStatementClosingBalance(
                        e.target.value === '' ? '' : parseFloat(e.target.value)
                      )
                    }
                    className="h-10 font-mono font-medium"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {selectedBankAccount ? (
          <>
            {/* Live Movement & Reconciliation Summary Card */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-card p-4 rounded-xl border border-border shadow-xs space-y-1">
                <span className="text-xs text-muted-foreground block">Opening Position</span>
                <div className="text-lg font-mono font-bold text-foreground">
                  {effectiveOpeningBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} SAR
                </div>
                {latestPastReconciliation ? (
                  <span className="text-[10px] text-emerald-600 font-medium block truncate">
                    Carried forward from {new Date(latestPastReconciliation.statement_date).toLocaleDateString()}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground font-medium block">
                    Initial account opening balance
                  </span>
                )}
              </div>

              <div className="bg-card p-4 rounded-xl border border-border shadow-xs space-y-1">
                <span className="text-xs text-muted-foreground">
                  Selected Lines Movement ({selectedLineIds.size})
                </span>
                <div className="text-lg font-mono font-bold text-blue-600">
                  {netMovement >= 0 ? `+${netMovement.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : netMovement.toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                  SAR
                </div>
              </div>

              <div className="bg-card p-4 rounded-xl border border-border shadow-xs space-y-1">
                <span className="text-xs text-muted-foreground">Calculated Ending Balance</span>
                <div className="text-lg font-mono font-bold text-foreground">
                  {calculatedEndingBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                  SAR
                </div>
              </div>

              <div
                className={`p-4 rounded-xl border shadow-xs space-y-1 ${
                  statementClosingBalance !== '' && Math.abs(variance) < 0.01
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 border-emerald-200 text-emerald-900'
                    : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">Variance / Difference</span>
                  {statementClosingBalance !== '' && Math.abs(variance) < 0.01 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                  )}
                </div>
                <div className="text-lg font-mono font-bold">
                  {statementClosingBalance === ''
                    ? 'Enter Statement Balance'
                    : `${variance.toLocaleString('en-US', { minimumFractionDigits: 2 })} SAR`}
                </div>
              </div>
            </div>

            {/* Candidate Unreconciled Journal Lines Checklist */}
            <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
              <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/50">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select_all"
                    checked={
                      candidateLines.length > 0 && selectedLineIds.size === candidateLines.length
                    }
                    onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                  />
                  <Label htmlFor="select_all" className="text-sm font-bold text-foreground cursor-pointer">
                    Unreconciled Posted Journal Lines ({candidateLines.length})
                  </Label>
                </div>

                <Button
                  onClick={handleSubmitReconciliation}
                  disabled={reconcileMutation.isPending || selectedLineIds.size === 0}
                  className="bg-[#FA634E] hover:bg-[#E54D38] text-white gap-2"
                >
                  <Scale className="w-4 h-4" />
                  <span>
                    {reconcileMutation.isPending
                      ? 'Reconciling...'
                      : `Reconcile Selected (${selectedLineIds.size})`}
                  </span>
                </Button>
              </div>

              {isEntriesLoading ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  Fetching candidate journal lines...
                </div>
              ) : candidateLines.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  All posted lines for this account are already reconciled.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted border-b border-border text-muted-foreground font-semibold uppercase tracking-wider">
                      <tr>
                        <th className="p-3 w-10 text-center">Select</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Journal Ref / Memo</th>
                        <th className="p-3">Line Description</th>
                        <th className="p-3 text-right">Debit</th>
                        <th className="p-3 text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {candidateLines.map((line) => {
                        const isChecked = selectedLineIds.has(line.lineId);
                        return (
                          <tr
                            key={line.lineId}
                            onClick={() => handleToggleLine(line.lineId)}
                            className={`hover:bg-muted cursor-pointer transition-colors ${
                              isChecked ? 'bg-blue-50/40' : ''
                            }`}
                          >
                            <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={() => handleToggleLine(line.lineId)}
                              />
                            </td>
                            <td className="p-3 font-mono text-foreground">
                              {new Date(line.entry_date).toLocaleDateString()}
                            </td>
                            <td className="p-3 font-medium text-foreground">
                              <div>{line.ref_id || '—'}</div>
                              {line.memo && (
                                <div className="text-[11px] text-muted-foreground font-normal">
                                  {line.memo}
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-foreground">{line.description || '—'}</td>
                            <td className="p-3 text-right font-mono font-medium text-emerald-700">
                              {line.debit > 0
                                ? line.debit.toLocaleString('en-US', { minimumFractionDigits: 2 })
                                : '—'}
                            </td>
                            <td className="p-3 text-right font-mono font-medium text-rose-700">
                              {line.credit > 0
                                ? line.credit.toLocaleString('en-US', { minimumFractionDigits: 2 })
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="p-12 text-center bg-card rounded-xl border border-border shadow-xs text-muted-foreground space-y-2">
            <Landmark className="w-10 h-10 text-gray-300 mx-auto" />
            <div className="text-base font-semibold text-foreground">No Bank Account Selected</div>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Select a Bank Account or Cash Drawer above to load unreconciled journal lines and perform statement reconciliation.
            </p>
          </div>
        )}

        {/* Historical Reconciliations Ledger */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            Past Reconciliations {selectedBankAccount ? `(${selectedBankAccount.bank_name || 'Cash'})` : ''}
          </h2>

          <div className="bg-card rounded-xl shadow-xs border border-border p-4">
            <DataTable
              data={pastReconciliations}
              columns={pastColumns}
              isLoading={isPastLoading}
              emptyMessage="No past reconciliations found."
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
