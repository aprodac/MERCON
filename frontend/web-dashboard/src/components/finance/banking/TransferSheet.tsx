import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Building2, Wallet, AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import { toast } from 'sonner';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { JournalLinesTable } from '@/components/finance/kit';
import { formatMoney } from '@/lib/finance';
import { financeService } from '@/services/financeService';
import type { BankAccount, AccountingPeriod } from '@mercon/shared-types';

interface TransferSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFromBankAccountId?: string;
  initialToBankAccountId?: string;
}

// Stable tint background per bank name hash
export function getBankTint(bankName?: string | null, isCash?: boolean) {
  if (isCash) {
    return {
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      text: 'text-emerald-700 dark:text-emerald-300',
      border: 'border-emerald-200 dark:border-emerald-800',
      ring: 'ring-emerald-500',
    };
  }
  const name = bankName || 'Bank';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const TINTS = [
    { bg: 'bg-sky-50 dark:bg-sky-950/40', text: 'text-sky-700 dark:text-sky-300', border: 'border-sky-200 dark:border-sky-800', ring: 'ring-sky-500' },
    { bg: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-800', ring: 'ring-indigo-500' },
    { bg: 'bg-teal-50 dark:bg-teal-950/40', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-200 dark:border-teal-800', ring: 'ring-teal-500' },
    { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', ring: 'ring-amber-500' },
    { bg: 'bg-rose-50 dark:bg-rose-950/40', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800', ring: 'ring-rose-500' },
    { bg: 'bg-purple-50 dark:bg-purple-950/40', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800', ring: 'ring-purple-500' },
  ];
  return TINTS[Math.abs(hash) % TINTS.length];
}

export function getBankInitials(bankName?: string | null, isCash?: boolean) {
  if (isCash) return 'CASH';
  if (!bankName) return 'BK';
  const parts = bankName.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return bankName.slice(0, 3).toUpperCase();
}

export function maskAccountNumber(num?: string | null) {
  if (!num) return '••••';
  const clean = num.replace(/\s+/g, '');
  if (clean.length <= 4) return clean;
  return `••••${clean.slice(-4)}`;
}

export const TransferSheet: React.FC<TransferSheetProps> = ({
  open,
  onOpenChange,
  initialFromBankAccountId,
  initialToBankAccountId,
}) => {
  const queryClient = useQueryClient();

  const [fromBankAccId, setFromBankAccId] = useState<string>('');
  const [toBankAccId, setToBankAccId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [memo, setMemo] = useState<string>('');

  // Fetch active bank accounts
  const { data: bankAccountsRes } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: financeService.getBankAccounts,
  });

  const activeAccounts: BankAccount[] = useMemo(() => {
    return (bankAccountsRes?.data || []).filter((b) => b.isActive && !b.deletedAt);
  }, [bankAccountsRes]);

  // Fetch open accounting periods
  const { data: periodsRes } = useQuery({
    queryKey: ['accountingPeriods'],
    queryFn: () => financeService.getAccountingPeriods(),
  });

  const openPeriods: AccountingPeriod[] = useMemo(() => {
    return (periodsRes?.data || []).filter((p: AccountingPeriod) => p.status === 'Open');
  }, [periodsRes]);

  // Set default selections when sheet opens
  useEffect(() => {
    if (open && activeAccounts.length > 0) {
      if (initialFromBankAccountId) {
        setFromBankAccId(initialFromBankAccountId);
        const other = activeAccounts.find((a) => a.id !== initialFromBankAccountId);
        if (other) setToBankAccId(other.id);
      } else {
        if (!fromBankAccId) setFromBankAccId(activeAccounts[0]?.id || '');
        if (!toBankAccId && activeAccounts.length > 1) {
          setToBankAccId(activeAccounts[1]?.id || '');
        }
      }
    }
  }, [open, activeAccounts, initialFromBankAccountId]);

  const fromBankAcc = useMemo(
    () => activeAccounts.find((a) => a.id === fromBankAccId) || null,
    [activeAccounts, fromBankAccId]
  );
  const toBankAcc = useMemo(
    () => activeAccounts.find((a) => a.id === toBankAccId) || null,
    [activeAccounts, toBankAccId]
  );

  const transferNum = parseFloat(amount) || 0;
  const fromBookBalance = Number(fromBankAcc?.book_balance ?? fromBankAcc?.opening_balance ?? 0);

  // Check period coverage
  const isPeriodOpen = useMemo(() => {
    if (!date) return false;
    const transferDate = new Date(date);
    return openPeriods.some((p) => {
      const s = new Date(p.start_date);
      const e = new Date(p.end_date);
      return transferDate >= s && transferDate <= e;
    });
  }, [date, openPeriods]);

  // Swap From / To
  const handleSwap = () => {
    const temp = fromBankAccId;
    setFromBankAccId(toBankAccId);
    setToBankAccId(temp);
  };

  // Transfer Mutation
  const transferMutation = useMutation({
    mutationFn: financeService.transferFunds,
    onSuccess: (res) => {
      toast.success('Funds transferred successfully');
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['bankAccountTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['bankAccountBalanceHistory'] });
      onOpenChange(false);
      setAmount('');
      setMemo('');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to transfer funds';
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromBankAcc?.accountId || !toBankAcc?.accountId) {
      toast.error('Please select valid From and To accounts');
      return;
    }
    if (fromBankAcc.id === toBankAcc.id) {
      toast.error('From and To accounts must be different');
      return;
    }
    if (transferNum <= 0) {
      toast.error('Transfer amount must be greater than zero');
      return;
    }
    if (!isPeriodOpen) {
      toast.error(`No open accounting period covers date ${date}`);
      return;
    }

    transferMutation.mutate({
      fromAccountId: fromBankAcc.accountId,
      toAccountId: toBankAcc.accountId,
      amount: transferNum,
      date,
      memo: memo || `Transfer from ${fromBankAcc.bank_name || 'Cash'} to ${toBankAcc.bank_name || 'Cash'}`,
    });
  };

  // Will post journal preview lines
  const previewLines = useMemo(() => {
    if (!fromBankAcc?.account || !toBankAcc?.account || transferNum <= 0) return [];
    return [
      {
        account: toBankAcc.account,
        debit: transferNum,
        credit: 0,
      },
      {
        account: fromBankAcc.account,
        debit: 0,
        credit: transferNum,
      },
    ];
  }, [fromBankAcc, toBankAcc, transferNum]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[540px] w-full p-0 flex flex-col justify-between overflow-hidden border-l border-slate-200 dark:border-slate-800 shadow-2xl rounded-l-[24px]">
        {/* Header */}
        <SheetHeader className="p-6 border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-950/50 flex items-center justify-center text-[#FA634E] shrink-0 border border-orange-200/60 dark:border-orange-900/40">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <SheetTitle className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                Transfer Funds
              </SheetTitle>
              <SheetDescription className="text-xs text-slate-500 dark:text-slate-400">
                Move cash between bank accounts or cash drawers. Posts a 2-line journal entry.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Content Body */}
        <form id="transfer-form" onSubmit={handleSubmit} className="p-6 space-y-5 flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950/40">
          {/* Account Selector Cards Grid */}
          <div className="space-y-4">
            {/* From Account */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  From Account (Source) <span className="text-rose-500">*</span>
                </Label>
                {fromBankAcc && (
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Book Balance: <span className="fin-num font-bold">{formatMoney(fromBookBalance)}</span>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {activeAccounts.map((acc) => {
                  const tint = getBankTint(acc.bank_name, acc.is_cash);
                  const isSelected = acc.id === fromBankAccId;
                  const bal = Number(acc.book_balance ?? acc.opening_balance ?? 0);
                  return (
                    <button
                      key={`from-${acc.id}`}
                      type="button"
                      onClick={() => {
                        if (acc.id === toBankAccId) handleSwap();
                        else setFromBankAccId(acc.id);
                      }}
                      className={`p-3 rounded-xl text-left border transition-all ${
                        isSelected
                          ? `bg-white dark:bg-slate-900 border-[#FA634E] ring-2 ring-[#FA634E]/20 shadow-xs`
                          : `bg-white/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700`
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center font-black text-[10px] ${tint.bg} ${tint.text}`}>
                          {acc.is_cash ? <Wallet className="w-3.5 h-3.5" /> : getBankInitials(acc.bank_name)}
                        </div>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate flex-1">
                          {acc.is_cash ? 'Cash Drawer' : acc.bank_name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-mono">{acc.is_cash ? 'Cash' : maskAccountNumber(acc.account_number)}</span>
                        <span className="fin-num font-semibold text-slate-700 dark:text-slate-300">{formatMoney(bal)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Swap Button Divider */}
            <div className="flex items-center justify-center py-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSwap}
                className="h-8 gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full px-4 shadow-2xs"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-[#FA634E]" />
                <span>Swap From / To</span>
              </Button>
            </div>

            {/* To Account */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  To Account (Destination) <span className="text-rose-500">*</span>
                </Label>
                {toBankAcc && (
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Book Balance: <span className="fin-num font-bold">{formatMoney(Number(toBankAcc.book_balance ?? toBankAcc.opening_balance ?? 0))}</span>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {activeAccounts.map((acc) => {
                  const tint = getBankTint(acc.bank_name, acc.is_cash);
                  const isSelected = acc.id === toBankAccId;
                  const bal = Number(acc.book_balance ?? acc.opening_balance ?? 0);
                  const isSameAsFrom = acc.id === fromBankAccId;
                  return (
                    <button
                      key={`to-${acc.id}`}
                      type="button"
                      disabled={isSameAsFrom}
                      onClick={() => setToBankAccId(acc.id)}
                      className={`p-3 rounded-xl text-left border transition-all ${
                        isSameAsFrom ? 'opacity-40 cursor-not-allowed border-dashed' : ''
                      } ${
                        isSelected
                          ? `bg-white dark:bg-slate-900 border-[#FA634E] ring-2 ring-[#FA634E]/20 shadow-xs`
                          : `bg-white/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700`
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center font-black text-[10px] ${tint.bg} ${tint.text}`}>
                          {acc.is_cash ? <Wallet className="w-3.5 h-3.5" /> : getBankInitials(acc.bank_name)}
                        </div>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate flex-1">
                          {acc.is_cash ? 'Cash Drawer' : acc.bank_name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-mono">{acc.is_cash ? 'Cash' : maskAccountNumber(acc.account_number)}</span>
                        <span className="fin-num font-semibold text-slate-700 dark:text-slate-300">{formatMoney(bal)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Amount & Date inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Amount (SAR) <span className="text-rose-500">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  SAR
                </span>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-12 h-11 text-base font-extrabold fin-num bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                />
              </div>
              {transferNum > fromBookBalance && fromBankAcc && (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium pt-0.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Transfer amount exceeds current book balance ({formatMoney(fromBookBalance)})</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Transfer Date <span className="text-rose-500">*</span>
              </Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 text-xs font-semibold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
              />
              {!isPeriodOpen && (
                <div className="flex items-center gap-1.5 text-[11px] text-rose-600 dark:text-rose-400 font-medium pt-0.5">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>No open accounting period covers this date</span>
                </div>
              )}
            </div>
          </div>

          {/* Memo */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Memo / Description
            </Label>
            <Input
              placeholder="e.g. Internal liquidity balancing transfer..."
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="h-9 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
            />
          </div>

          {/* Will Post Preview */}
          {previewLines.length > 0 && (
            <div className="pt-2">
              <JournalLinesTable lines={previewLines} title="Will post" variant="preview" />
            </div>
          )}
        </form>

        {/* Footer Actions */}
        <SheetFooter className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-end gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-9 text-xs font-semibold px-4 border-slate-200 dark:border-slate-700"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="transfer-form"
            disabled={transferMutation.isPending || transferNum <= 0 || !isPeriodOpen || fromBankAccId === toBankAccId}
            className="h-9 text-xs font-bold px-5 bg-[#FA634E] hover:bg-[#EE553F] text-white shadow-xs"
          >
            {transferMutation.isPending ? 'Posting Transfer...' : 'Post Transfer'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
