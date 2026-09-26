import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X,
  CreditCard,
  Building2,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
  DollarSign,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { MoneyText } from '@/components/finance/kit/MoneyText';
import { JournalLinesTable } from '@/components/finance/kit/JournalLinesTable';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { financeService } from '@/services/financeService';
import type { BankAccount, AccountingPeriod } from '@mercon/shared-types';

export interface PayRunBillItem {
  id: string;
  ref_id?: string | null;
  bill_date?: string | null;
  due_date?: string | null;
  balance: number;
  vendor_name?: string | null;
}

interface PayRunSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialBills?: PayRunBillItem[];
  allAvailableBills?: PayRunBillItem[];
  onSuccess?: () => void;
}

export function PayRunSheet({
  open,
  onOpenChange,
  initialBills = [],
  allAvailableBills = [],
  onSuccess,
}: PayRunSheetProps) {
  const queryClient = useQueryClient();

  // Selection & Amount states
  const [selectedBillsMap, setSelectedBillsMap] = useState<Map<string, { bill: PayRunBillItem; amountToPay: number }>>(() => {
    const map = new Map<string, { bill: PayRunBillItem; amountToPay: number }>();
    for (const b of initialBills) {
      map.set(b.id, { bill: b, amountToPay: b.balance });
    }
    return map;
  });

  // Sync initial bills when sheet opens
  React.useEffect(() => {
    if (open) {
      const map = new Map<string, { bill: PayRunBillItem; amountToPay: number }>();
      const billsToUse = initialBills.length > 0 ? initialBills : [];
      for (const b of billsToUse) {
        map.set(b.id, { bill: b, amountToPay: b.balance });
      }
      setSelectedBillsMap(map);
      setExecutionResults(null);
      setIsExecuting(false);
      setConfirmOpen(false);
    }
  }, [open, initialBills]);

  // Payment configuration state
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<string>('Bank transfer');
  const [referencePrefix, setReferencePrefix] = useState<string>('PAY-BATCH');

  // Processing state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionIndex, setExecutionIndex] = useState(0);
  const [executionResults, setExecutionResults] = useState<Array<{
    billId: string;
    ref_id: string;
    vendor_name: string;
    amount: number;
    success: boolean;
    error?: string;
    jeId?: string;
  }> | null>(null);

  // Fetch bank accounts
  const { data: bankAccountsRes } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => financeService.getBankAccounts(),
    enabled: open,
  });
  const bankAccounts: BankAccount[] = bankAccountsRes?.data || [];

  // Default selected bank account to first available
  React.useEffect(() => {
    if (!selectedAccountId && bankAccounts.length > 0) {
      setSelectedAccountId(bankAccounts[0].accountId);
    }
  }, [bankAccounts, selectedAccountId]);

  // Fetch accounting periods for period check
  const { data: periodsRes } = useQuery({
    queryKey: ['accounting-periods'],
    queryFn: () => financeService.getAccountingPeriods(),
    enabled: open,
  });
  const periods: AccountingPeriod[] = periodsRes?.data || [];

  const isOpenPeriodForDate = useMemo(() => {
    if (!paymentDate) return false;
    const pDate = new Date(paymentDate);
    return periods.some((p) => {
      if (p.status !== 'Open') return false;
      const start = new Date(p.start_date);
      const end = new Date(p.end_date);
      return pDate >= start && pDate <= end;
    });
  }, [paymentDate, periods]);

  // Selected account details
  const currentBankAccount = useMemo(() => {
    return bankAccounts.find((a) => a.accountId === selectedAccountId);
  }, [bankAccounts, selectedAccountId]);

  const bankBookBalance = Number(currentBankAccount?.book_balance || 0);

  // Selected items list
  const selectedItems = useMemo(() => {
    return Array.from(selectedBillsMap.values());
  }, [selectedBillsMap]);

  const totalAmountToPay = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + (item.amountToPay || 0), 0);
  }, [selectedItems]);

  const balanceAfterPayment = bankBookBalance - totalAmountToPay;

  // Quick Select handlers
  const handleSelectAllOverdue = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const map = new Map<string, { bill: PayRunBillItem; amountToPay: number }>();
    const candidates = allAvailableBills.length > 0 ? allAvailableBills : initialBills;
    for (const b of candidates) {
      const isOverdue = b.due_date && b.due_date < todayStr;
      if (isOverdue) {
        map.set(b.id, { bill: b, amountToPay: b.balance });
      }
    }
    setSelectedBillsMap(map);
  };

  const handleSelectDueIn7Days = () => {
    const today = new Date();
    const in7 = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const in7Str = in7.toISOString().split('T')[0];
    const map = new Map<string, { bill: PayRunBillItem; amountToPay: number }>();
    const candidates = allAvailableBills.length > 0 ? allAvailableBills : initialBills;
    for (const b of candidates) {
      if (b.due_date && b.due_date <= in7Str) {
        map.set(b.id, { bill: b, amountToPay: b.balance });
      }
    }
    setSelectedBillsMap(map);
  };

  const handleClearSelection = () => {
    setSelectedBillsMap(new Map());
  };

  const handleRemoveBill = (id: string) => {
    const next = new Map(selectedBillsMap);
    next.delete(id);
    setSelectedBillsMap(next);
  };

  const handleAmountChange = (id: string, val: number) => {
    const item = selectedBillsMap.get(id);
    if (!item) return;
    const capped = Math.max(0, Math.min(val, item.bill.balance));
    const next = new Map(selectedBillsMap);
    next.set(id, { ...item, amountToPay: capped });
    setSelectedBillsMap(next);
  };

  // Execute Batch Payments
  const executePayRun = async () => {
    setConfirmOpen(false);
    setIsExecuting(true);
    const results: Array<{
      billId: string;
      ref_id: string;
      vendor_name: string;
      amount: number;
      success: boolean;
      error?: string;
      jeId?: string;
    }> = [];

    for (let i = 0; i < selectedItems.length; i++) {
      setExecutionIndex(i);
      const item = selectedItems[i];
      const ref = `${referencePrefix}-${item.bill.ref_id || item.bill.id.slice(0, 6)}`;

      try {
        const res = await financeService.recordBillPayment(item.bill.id, {
          amount: item.amountToPay,
          payment_date: paymentDate,
          accountId: selectedAccountId,
          payment_method: paymentMethod,
          reference: ref,
        });

        results.push({
          billId: item.bill.id,
          ref_id: item.bill.ref_id || item.bill.id.slice(0, 8),
          vendor_name: item.bill.vendor_name || 'Vendor',
          amount: item.amountToPay,
          success: true,
          jeId: res?.data?.journalEntryId || res?.data?.journalEntry?.id,
        });
      } catch (err: any) {
        const msg = err?.response?.data?.error?.message || err?.message || 'Payment failed';
        results.push({
          billId: item.bill.id,
          ref_id: item.bill.ref_id || item.bill.id.slice(0, 8),
          vendor_name: item.bill.vendor_name || 'Vendor',
          amount: item.amountToPay,
          success: false,
          error: msg,
        });
      }
    }

    setIsExecuting(false);
    setExecutionResults(results);

    // Invalidate finance queries
    queryClient.invalidateQueries({ queryKey: ['finance-reports', 'ap-ageing'] });
    queryClient.invalidateQueries({ queryKey: ['bills'] });
    queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['journal-entries'] });

    const successCount = results.filter((r) => r.success).length;
    if (successCount > 0) {
      toast.success(`Successfully recorded ${successCount} bill payment${successCount > 1 ? 's' : ''}`);
      if (onSuccess) onSuccess();
    }
  };

  const isFormValid =
    selectedItems.length > 0 &&
    totalAmountToPay > 0 &&
    Boolean(selectedAccountId) &&
    isOpenPeriodForDate &&
    !isExecuting;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col bg-card border-l border-border dark:border-border">
          {/* Header */}
          <SheetHeader className="p-6 border-b border-border dark:border-border bg-muted/50">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-xl font-bold text-[#3E3C3D] flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-[#FA634E]" />
                  Pay Run — Batch Bill Payment
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground mt-1">
                  Select payables, allocate payment amounts, and record transactions in bulk.
                </SheetDescription>
              </div>
            </div>

            {/* Quick Selection Chips */}
            {!executionResults && (
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border dark:border-border">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick select:</span>
                <Button variant="outline" size="sm" onClick={handleSelectAllOverdue} className="h-7 text-xs rounded-full">
                  All overdue
                </Button>
                <Button variant="outline" size="sm" onClick={handleSelectDueIn7Days} className="h-7 text-xs rounded-full">
                  Due in 7 days
                </Button>
                <Button variant="ghost" size="sm" onClick={handleClearSelection} className="h-7 text-xs text-muted-foreground rounded-full">
                  Clear
                </Button>
              </div>
            )}
          </SheetHeader>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {executionResults ? (
              /* Execution Results Summary */
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-muted border border-border dark:border-border">
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    Pay Run Completed
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Processed {executionResults.length} payment{executionResults.length > 1 ? 's' : ''}. Total paid:{' '}
                    <span className="font-bold text-foreground">
                      {formatMoney(executionResults.filter((r) => r.success).reduce((s, r) => s + r.amount, 0))} SAR
                    </span>
                  </p>
                </div>

                <div className="space-y-2">
                  {executionResults.map((res) => (
                    <div
                      key={res.billId}
                      className="p-3 rounded-lg border border-border dark:border-border flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        {res.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        )}
                        <div>
                          <div className="font-bold text-foreground">
                            {res.ref_id} · <span className="text-muted-foreground">{res.vendor_name}</span>
                          </div>
                          {res.error && <div className="text-rose-600 mt-0.5">{res.error}</div>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="fin-num font-bold text-foreground">
                          {formatMoney(res.amount)} SAR
                        </div>
                        {res.jeId && (
                          <Link
                            to={`/finance/journal-entries/${res.jeId}`}
                            className="text-[10px] text-[#FA634E] hover:underline font-semibold"
                          >
                            View JE →
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Main Payment Form */
              <>
                {/* 1. Selected Bills List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Bills to Pay ({selectedItems.length})
                    </Label>
                    <span className="text-xs fin-num text-muted-foreground">
                      Total: <span className="font-bold text-foreground"><MoneyText value={totalAmountToPay} /></span>
                    </span>
                  </div>

                  {selectedItems.length === 0 ? (
                    <div className="p-8 text-center border-2 border-dashed border-border dark:border-border rounded-xl text-muted-foreground text-xs">
                      No bills selected for payment. Select bills from the table or use quick selection above.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {selectedItems.map(({ bill, amountToPay }) => (
                        <div
                          key={bill.id}
                          className="p-3 rounded-xl border border-border dark:border-border bg-muted/50 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-foreground truncate">
                              {bill.ref_id || bill.id.slice(0, 8)} ·{' '}
                              <span className="text-muted-foreground dark:text-muted-foreground">{bill.vendor_name || 'Vendor'}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                              <span>Due: {formatDate(bill.due_date || bill.bill_date)}</span>
                              <span>·</span>
                              <span>Balance: {formatMoney(bill.balance)} SAR</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="w-32">
                              <Input
                                type="number"
                                step="0.01"
                                min="0.01"
                                max={bill.balance}
                                value={amountToPay}
                                onChange={(e) => handleAmountChange(bill.id, parseFloat(e.target.value) || 0)}
                                className="h-8 text-xs fin-num text-right bg-card"
                              />
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveBill(bill.id)}
                              className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Bank Account Picker Cards */}
                <div className="space-y-3">
                  <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Pay From Account
                  </Label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {bankAccounts.map((acc) => {
                      const isSelected = acc.accountId === selectedAccountId;
                      const bal = Number(acc.book_balance || 0);

                      return (
                        <div
                          key={acc.id}
                          onClick={() => setSelectedAccountId(acc.accountId)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? 'border-[#FA634E] bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20/20 dark:bg-rose-950/20 ring-1 ring-[#FA634E]'
                              : 'border-border dark:border-border hover:border-border'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {acc.is_cash ? (
                              <Wallet className="w-4 h-4 text-teal-600 shrink-0" />
                            ) : (
                              <Building2 className="w-4 h-4 text-sky-600 shrink-0" />
                            )}
                            <div className="font-bold text-xs text-foreground truncate">
                              {acc.bank_name || (acc.is_cash ? 'Cash Account' : 'Bank Account')}
                            </div>
                          </div>
                          <div className="mt-2 text-[11px] text-muted-foreground fin-num flex items-center justify-between">
                            <span>Book balance</span>
                            <span className="font-bold text-foreground">{formatMoney(bal)} SAR</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Payment Meta Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground dark:text-muted-foreground">Payment Date</Label>
                    <Input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="h-9 text-xs mt-1 bg-card"
                    />
                    {!isOpenPeriodForDate && (
                      <p className="text-[10px] text-rose-600 font-semibold mt-1">No open accounting period covers this date.</p>
                    )}
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground dark:text-muted-foreground">Method</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="h-9 text-xs mt-1 bg-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Bank transfer">Bank transfer</SelectItem>
                        <SelectItem value="Cheque">Cheque</SelectItem>
                        <SelectItem value="Cash">Cash</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground dark:text-muted-foreground">Reference Prefix</Label>
                    <Input
                      type="text"
                      value={referencePrefix}
                      onChange={(e) => setReferencePrefix(e.target.value)}
                      className="h-9 text-xs mt-1 bg-card fin-num"
                    />
                  </div>
                </div>

                {/* 4. Live Summary Card */}
                <div className="p-4 rounded-xl bg-card text-foreground border border-border text-white space-y-3">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment Impact Summary</div>

                  <div className="grid grid-cols-3 gap-3 border-y border-border py-3 text-xs">
                    <div>
                      <div className="text-[10px] text-muted-foreground">Total to Pay</div>
                      <div className="fin-num font-bold text-lg text-[#FA634E]">{formatMoney(totalAmountToPay)} SAR</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground">Bank Balance Before</div>
                      <div className="fin-num font-bold text-sm text-slate-200">{formatMoney(bankBookBalance)} SAR</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground">Balance After</div>
                      <div className={`fin-num font-bold text-sm ${balanceAfterPayment < 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {formatMoney(balanceAfterPayment)} SAR
                      </div>
                    </div>
                  </div>

                  {balanceAfterPayment < 0 && (
                    <div className="text-xs text-amber-300 flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      Warning: Bank balance will drop below zero after this payment.
                    </div>
                  )}
                </div>

                {/* 5. Journal Lines Preview */}
                {selectedItems.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Posting Preview (Dr Accounts Payable / Cr Bank)
                    </Label>
                    <JournalLinesTable
                      variant="preview"
                      lines={[
                        {
                          account: { account_code: '2000', name: 'Accounts Payable' },
                          debit: totalAmountToPay,
                          credit: 0,
                        },
                        {
                          account: {
                            account_code: currentBankAccount?.account?.account_code || '1010',
                            name: currentBankAccount?.bank_name || 'Bank Account',
                          },
                          debit: 0,
                          credit: totalAmountToPay,
                        },
                      ]}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <SheetFooter className="p-6 border-t border-border dark:border-border bg-muted/50 flex items-center justify-between">
            {executionResults ? (
              <Button onClick={() => onOpenChange(false)} className="w-full bg-card text-foreground border border-border hover:bg-slate-800 text-white">
                Close Pay Run
              </Button>
            ) : (
              <div className="flex items-center justify-between w-full gap-3">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>

                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={!isFormValid}
                  className="bg-[#FA634E] hover:bg-[#e5533f] text-white font-bold px-6"
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing ({executionIndex + 1}/{selectedItems.length})...
                    </>
                  ) : (
                    `Confirm & Pay (${selectedItems.length} bills)`
                  )}
                </Button>
              </div>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#FA634E]" />
              Confirm Batch Payment Execution
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground dark:text-muted-foreground space-y-2">
              <p>
                You are about to record <span className="font-bold text-foreground">{selectedItems.length} bill payments</span> totalling{' '}
                <span className="font-bold text-[#FA634E]">{formatMoney(totalAmountToPay)} SAR</span> from{' '}
                <span className="font-bold text-foreground">{currentBankAccount?.bank_name || 'Bank Account'}</span>.
              </p>
              <p>This action will immediately post general ledger transactions and update bank balances.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executePayRun} className="bg-[#FA634E] hover:bg-[#e5533f] text-white font-bold">
              Execute Pay Run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
