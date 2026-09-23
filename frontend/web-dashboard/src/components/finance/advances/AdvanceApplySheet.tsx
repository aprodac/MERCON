import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { MoneyText, JournalLinesTable } from '@/components/finance/kit';
import { formatDate, dueLabel, formatMoney } from '@/lib/finance/format';
import { financeService } from '@/services/financeService';
import type { Advance, Invoice, Bill, Account } from '@mercon/shared-types';

interface AdvanceApplySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  advance: Advance;
}

interface DocRow {
  id: string;
  ref_id: string;
  date: string;
  due_date?: string | null;
  balance_due: number;
  applyAmount: number;
}

export const AdvanceApplySheet: React.FC<AdvanceApplySheetProps> = ({
  open,
  onOpenChange,
  advance,
}) => {
  const queryClient = useQueryClient();
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const partyId = advance.party_id || '';
  const partyType = advance.party_type;
  const remainingAdvance = Number(advance.remaining_amount || 0);

  // Fetch open documents for party
  const { data: invoicesRes, isLoading: isLoadingInvoices } = useQuery({
    queryKey: ['invoices', 'unpaid', partyId],
    queryFn: () => financeService.getInvoices({ customer_id: partyId, status: 'unpaid' as any }),
    enabled: open && partyType === 'Customer' && Boolean(partyId),
  });

  const { data: billsRes, isLoading: isLoadingBills } = useQuery({
    queryKey: ['bills', 'unpaid', partyId],
    queryFn: () => financeService.getBills({ provider_id: partyId, status: 'unpaid' as any }),
    enabled: open && partyType === 'Provider' && Boolean(partyId),
  });

  // Fetch settings / accounts for Will Post preview
  const { data: accountsRes } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => financeService.getAccounts(),
    enabled: open,
  });

  const accounts: Account[] = accountsRes?.data || [];

  const rawDocs: DocRow[] = React.useMemo(() => {
    if (partyType === 'Customer') {
      const invs: Invoice[] = invoicesRes?.data || [];
      return invs
        .filter((inv) => inv.status === 'Issued' || inv.status === 'PartiallyPaid')
        .map((inv) => ({
          id: inv.id,
          ref_id: inv.ref_id || inv.id.slice(0, 8),
          date: inv.invoice_date,
          due_date: inv.due_date,
          balance_due: Number(inv.balance_due || 0),
          applyAmount: allocations[inv.id] || 0,
        }));
    } else if (partyType === 'Provider') {
      const blls: Bill[] = billsRes?.data || [];
      return blls
        .filter((b) => b.status === 'Approved' || b.status === 'PartiallyPaid')
        .map((b) => ({
          id: b.id,
          ref_id: b.ref_id || b.id.slice(0, 8),
          date: b.bill_date,
          due_date: b.due_date,
          balance_due: Number(b.balance_due || 0),
          applyAmount: allocations[b.id] || 0,
        }));
    }
    return [];
  }, [partyType, invoicesRes, billsRes, allocations]);

  // Reset allocations when sheet opens or docs change
  useEffect(() => {
    if (open) {
      setAllocations({});
    }
  }, [open]);

  const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + (val || 0), 0);
  const remainingUnallocated = remainingAdvance - totalAllocated;
  const isOverAllocated = totalAllocated > remainingAdvance + 0.001;

  // Auto-allocate (oldest first)
  const handleAutoAllocate = () => {
    const sorted = [...rawDocs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let available = remainingAdvance;
    const nextAllocations: Record<string, number> = {};

    for (const doc of sorted) {
      if (available <= 0) break;
      const toApply = Math.min(doc.balance_due, available);
      if (toApply > 0) {
        nextAllocations[doc.id] = Number(toApply.toFixed(2));
        available -= toApply;
      }
    }
    setAllocations(nextAllocations);
  };

  const handleClear = () => {
    setAllocations({});
  };

  const handleAmountChange = (docId: string, balanceDue: number, valStr: string) => {
    const parsed = parseFloat(valStr);
    if (isNaN(parsed) || parsed <= 0) {
      const copy = { ...allocations };
      delete copy[docId];
      setAllocations(copy);
      return;
    }

    const clamped = Math.min(parsed, balanceDue);
    setAllocations((prev) => ({
      ...prev,
      [docId]: Number(clamped.toFixed(2)),
    }));
  };

  // Preview GL Lines
  const previewLines = React.useMemo(() => {
    if (totalAllocated <= 0) return [];

    if (partyType === 'Customer') {
      const advAccount = accounts.find((a) => a.account_code === '2210' || a.name.toLowerCase().includes('customer advance')) || {
        account_code: '2210',
        name: 'Customer Advances Liability',
      };
      const arAccount = accounts.find((a) => a.account_code === '1200' || a.name.toLowerCase().includes('accounts receivable')) || {
        account_code: '1200',
        name: 'Accounts Receivable',
      };

      return [
        { account: advAccount as Account, debit: totalAllocated, credit: 0 },
        { account: arAccount as Account, debit: 0, credit: totalAllocated },
      ];
    } else {
      const apAccount = accounts.find((a) => a.account_code === '2100' || a.name.toLowerCase().includes('accounts payable')) || {
        account_code: '2100',
        name: 'Accounts Payable',
      };
      const advAccount = accounts.find((a) => a.account_code === '1310' || a.name.toLowerCase().includes('provider advance')) || {
        account_code: '1310',
        name: 'Provider Advances Asset',
      };

      return [
        { account: apAccount as Account, debit: totalAllocated, credit: 0 },
        { account: advAccount as Account, debit: 0, credit: totalAllocated },
      ];
    }
  }, [totalAllocated, partyType, accounts]);

  const handleApplyAll = async () => {
    const activeAllocations = Object.entries(allocations).filter(([, amt]) => amt > 0);
    if (activeAllocations.length === 0) {
      toast.error('Please enter an amount to apply for at least one document');
      return;
    }

    if (isOverAllocated) {
      toast.error(`Total allocated (${formatMoney(totalAllocated)}) exceeds available advance (${formatMoney(remainingAdvance)})`);
      return;
    }

    setIsSubmitting(true);
    let successCount = 0;
    let failCount = 0;

    for (const [targetId, amount] of activeAllocations) {
      try {
        await financeService.applyAdvance(advance.id, {
          targetId,
          targetType: partyType === 'Customer' ? 'Invoice' : 'Bill',
          amount,
        });
        successCount++;
      } catch (err: any) {
        failCount++;
        const msg = err?.response?.data?.error || err?.message || 'Failed to apply advance';
        toast.error(`Document application failed: ${msg}`);
      }
    }

    setIsSubmitting(false);

    if (successCount > 0) {
      toast.success(`Successfully applied credits to ${successCount} document${successCount > 1 ? 's' : ''}`);
      queryClient.invalidateQueries({ queryKey: ['advances'] });
      queryClient.invalidateQueries({ queryKey: ['advance', advance.id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      onOpenChange(false);
    }
  };

  const isLoading = isLoadingInvoices || isLoadingBills;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
        <SheetHeader className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <SheetTitle className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
            <span>Apply Credits</span>
            <span className="text-sm font-mono font-normal text-slate-500">
              Ref: {advance.ref_id || advance.id.slice(0, 8)}
            </span>
          </SheetTitle>
          <SheetDescription className="text-xs text-slate-500 dark:text-slate-400">
            Apply held advance credits against open {partyType === 'Customer' ? 'customer invoices' : 'provider bills'}.
          </SheetDescription>

          {/* Available meter */}
          <div className="mt-4 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block">Available Advance</span>
              <MoneyText value={remainingAdvance} className="text-lg font-extrabold text-slate-900 dark:text-slate-100" />
            </div>
            <div className="text-right">
              <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block">Allocated</span>
              <MoneyText
                value={totalAllocated}
                className={`text-lg font-extrabold ${isOverAllocated ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400'}`}
              />
            </div>
          </div>
        </SheetHeader>

        {/* Action Bar */}
        <div className="px-6 py-2.5 bg-slate-100/60 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
            {rawDocs.length} open document{rawDocs.length === 1 ? '' : 's'} found
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAutoAllocate}
              disabled={rawDocs.length === 0 || remainingAdvance <= 0}
              className="h-7 text-xs"
            >
              Auto-allocate (oldest first)
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={totalAllocated <= 0}
              className="h-7 text-xs text-slate-500"
            >
              Clear
            </Button>
          </div>
        </div>

        {/* Scrollable Documents List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : rawDocs.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              No open {partyType === 'Customer' ? 'invoices' : 'bills'} found for this party.
            </div>
          ) : (
            rawDocs.map((doc) => (
              <div
                key={doc.id}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700 transition-colors flex items-center justify-between gap-4"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100">{doc.ref_id}</span>
                    <span className="text-[11px] text-slate-500">{formatDate(doc.date)}</span>
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <span>{dueLabel({ due_date: doc.due_date, balance_due: doc.balance_due })}</span>
                    <span>·</span>
                    <span>Balance due: <MoneyText value={doc.balance_due} className="font-semibold text-slate-700 dark:text-slate-300" /></span>
                  </div>
                </div>

                <div className="w-36">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={allocations[doc.id] || ''}
                    onChange={(e) => handleAmountChange(doc.id, doc.balance_due, e.target.value)}
                    className="h-9 text-right font-mono text-sm focus-visible:ring-[#FA634E]"
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer with Will Post preview */}
        <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-4">
          {previewLines.length > 0 && (
            <div>
              <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-1.5">
                Will post (on today's date)
              </span>
              <JournalLinesTable lines={previewLines as any} variant="preview" />
            </div>
          )}

          <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
            Note: Application entries post on today's date. An open accounting period must cover today.
          </p>

          <SheetFooter className="flex-row justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleApplyAll}
              disabled={isSubmitting || totalAllocated <= 0 || isOverAllocated}
              className="bg-[#FA634E] hover:bg-[#E54D38] text-white font-semibold"
            >
              {isSubmitting ? 'Applying...' : `Apply ${formatMoney(totalAllocated)}`}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
};
