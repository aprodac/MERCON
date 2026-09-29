import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, HandCoins, Loader2, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { AccountingPeriod, Account, Advance, BankAccount } from '@mercon/shared-types';

import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { JournalLinesTable } from '@/components/finance/kit/JournalLinesTable';
import { financeService } from '@/services/financeService';
import { settingsService } from '@/services/settingsService';
import { allocateOldestFirst, addDays, dueOn, toDateOnly, type AgeingDocument } from '@/lib/finance/ageing';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { BankAccountPicker } from './BankAccountPicker';

export type SettlementMode = 'pay' | 'collect';

/**
 * One sheet for settling open documents against a bank/cash account:
 *  - pay:     vendor bills  → Dr Accounts Payable / Cr bank  (Zoho "pay bills in bulk")
 *  - collect: customer invoices → Dr bank / Cr Accounts Receivable, from one amount received,
 *             allocated oldest-due first (Zoho "receive payment")
 */
const MODE = {
  pay: {
    title: 'Pay bills',
    description: 'Record payments for the selected bills from one bank or cash account.',
    accountLabel: 'Pay from',
    documentNoun: 'bills',
    controlSetting: 'defaultPayableAccountId' as const,
    controlFallback: 'Accounts Payable',
    confirm: 'Record payments',
    record: (id: string, data: Parameters<typeof financeService.recordBillPayment>[1]) => financeService.recordBillPayment(id, data),
    invalidate: [['finance-reports', 'ap-ageing'], ['bills']],
  },
  collect: {
    title: 'Collect payment',
    description: 'Record money received from a customer and apply it to their open invoices, oldest first.',
    accountLabel: 'Deposit to',
    documentNoun: 'invoices',
    controlSetting: 'defaultReceivableAccountId' as const,
    controlFallback: 'Accounts Receivable',
    confirm: 'Record receipt',
    record: (id: string, data: Parameters<typeof financeService.recordInvoicePayment>[1]) => financeService.recordInvoicePayment(id, data),
    invalidate: [['finance-reports', 'ar-ageing'], ['invoices'], ['finance-reports', 'customer-statement']],
  },
};

interface Result {
  doc: AgeingDocument;
  amount: number;
  ok: boolean;
  error?: string;
  jeId?: string;
}

export interface SettlementSheetProps {
  mode: SettlementMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every open document that can be settled. */
  documents: AgeingDocument[];
  /** Documents preselected when the sheet opens (pay mode). */
  initialIds?: string[];
  /** Party preselected when the sheet opens (collect mode). */
  initialPartyId?: string;
  onSuccess?: () => void;
}

export function SettlementSheet({ mode, open, onOpenChange, documents, initialIds, initialPartyId, onSuccess }: SettlementSheetProps) {
  const cfg = MODE[mode];
  const queryClient = useQueryClient();
  const today = toDateOnly(new Date());

  const [amounts, setAmounts] = useState<Map<string, number>>(new Map());
  const [partyId, setPartyId] = useState<string>('');
  const [received, setReceived] = useState<number>(0);
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState('Bank transfer');
  const [reference, setReference] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState<number | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);

  const { data: bankRes } = useQuery({ queryKey: ['bank-accounts'], queryFn: () => financeService.getBankAccounts(), enabled: open });
  const { data: periodsRes } = useQuery({ queryKey: ['accounting-periods'], queryFn: () => financeService.getAccountingPeriods(), enabled: open });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsService.get, enabled: open, staleTime: 60000 });
  const { data: accountsRes } = useQuery({ queryKey: ['accounts', 'all'], queryFn: () => financeService.getAccounts({ include_inactive: false }), enabled: open });
  const { data: advancesRes } = useQuery({
    queryKey: ['advances', 'Customer', partyId],
    queryFn: () => financeService.getAdvances({ party_type: 'Customer', party_id: partyId }),
    enabled: open && mode === 'collect' && Boolean(partyId),
  });

  const bankAccounts: BankAccount[] = (bankRes?.data ?? []).filter((b: BankAccount) => b.isActive !== false);
  const bank = bankAccounts.find((b) => b.accountId === accountId);
  const controlAccount = ((accountsRes?.data ?? []) as Account[]).find((a) => a.id === settings?.[cfg.controlSetting]);
  const openAdvances = ((advancesRes?.data ?? []) as Advance[]).filter((a) => a.direction === 'Received' && Number(a.remaining_amount) > 0);
  const advanceTotal = openAdvances.reduce((s, a) => s + Number(a.remaining_amount), 0);

  const periodOpen = useMemo(
    () => ((periodsRes?.data ?? []) as AccountingPeriod[]).some((p) => p.status === 'Open' && toDateOnly(p.start_date) <= date && toDateOnly(p.end_date) >= date),
    [periodsRes, date],
  );

  const parties = useMemo(() => {
    const map = new Map<string, { id: string; name: string; total: number }>();
    for (const d of documents) {
      const p = map.get(d.party_id) ?? { id: d.party_id, name: d.party_name, total: 0 };
      p.total += d.balance;
      map.set(d.party_id, p);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [documents]);

  // Documents the sheet works on: the selection (pay) or the chosen customer's open invoices (collect)
  const workingDocs = useMemo(
    () =>
      (mode === 'collect' ? documents.filter((d) => d.party_id === partyId) : documents.filter((d) => amounts.has(d.id)))
        .sort((a, b) => dueOn(a).localeCompare(dueOn(b))),
    [mode, documents, partyId, amounts],
  );

  // Reset whenever the sheet opens
  useEffect(() => {
    if (!open) return;
    setResults(null);
    setRunning(null);
    setDate(today);
    setReference('');
    if (mode === 'pay') {
      const ids = new Set(initialIds ?? []);
      setAmounts(new Map(documents.filter((d) => ids.has(d.id)).map((d) => [d.id, d.balance])));
    } else {
      setPartyId(initialPartyId ?? '');
      setReceived(0);
      setAmounts(new Map());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!accountId && bankAccounts.length > 0) setAccountId(bankAccounts[0].accountId);
  }, [bankAccounts, accountId]);

  // Collect: re-allocate the amount received whenever it or the customer changes
  const allocate = (amount: number, docs = workingDocs) => {
    const { allocations } = allocateOldestFirst(docs, amount);
    setAmounts(allocations);
  };

  const total = workingDocs.reduce((s, d) => s + (amounts.get(d.id) ?? 0), 0);
  const unallocated = mode === 'collect' ? Math.round((received - total) * 100) / 100 : 0;
  const bankBefore = Number(bank?.book_balance ?? 0);
  const bankAfter = mode === 'pay' ? bankBefore - total : bankBefore + total;

  const setDocAmount = (doc: AgeingDocument, value: number) =>
    setAmounts((prev) => new Map(prev).set(doc.id, Math.max(0, Math.min(doc.balance, value || 0))));

  const selectForPay = (predicate: (d: AgeingDocument) => boolean) =>
    setAmounts(new Map(documents.filter(predicate).map((d) => [d.id, d.balance])));

  const valid = total > 0 && Boolean(accountId) && periodOpen && unallocated >= 0 && running === null;

  const execute = async () => {
    setConfirmOpen(false);
    const out: Result[] = [];
    const toSettle = workingDocs.filter((d) => (amounts.get(d.id) ?? 0) > 0);
    for (let i = 0; i < toSettle.length; i++) {
      setRunning(i);
      const doc = toSettle[i];
      const amount = amounts.get(doc.id) ?? 0;
      try {
        const res = await cfg.record(doc.id, {
          amount,
          payment_date: date,
          accountId,
          payment_method: method,
          reference: reference ? `${reference}${toSettle.length > 1 ? `-${i + 1}` : ''}` : null,
        });
        out.push({ doc, amount, ok: true, jeId: res?.data?.journalEntryId ?? res?.data?.journalEntry?.id });
      } catch (err: any) {
        out.push({ doc, amount, ok: false, error: err?.response?.data?.error?.message || err?.message || 'Failed' });
      }
    }
    setRunning(null);
    setResults(out);
    [...cfg.invalidate, ['bank-accounts'], ['journal-entries']].forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
    const ok = out.filter((r) => r.ok).length;
    if (ok > 0) {
      toast.success(`${ok} ${ok === 1 ? cfg.documentNoun.slice(0, -1) : cfg.documentNoun} ${mode === 'pay' ? 'paid' : 'settled'}`);
      onSuccess?.();
    }
  };

  const bankLine = { account: { account_code: bank?.account?.account_code, name: bank?.bank_name || 'Bank' } };
  const controlLine = { account: { account_code: controlAccount?.account_code, name: controlAccount?.name || cfg.controlFallback } };
  const preview =
    mode === 'pay'
      ? [{ ...controlLine, debit: total, credit: 0 }, { ...bankLine, debit: 0, credit: total }]
      : [{ ...bankLine, debit: total, credit: 0 }, { ...controlLine, debit: 0, credit: total }];

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
          <SheetHeader className="border-b p-5">
            <SheetTitle className="text-base">{cfg.title}</SheetTitle>
            <SheetDescription className="text-xs">{cfg.description}</SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {results ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {results.filter((r) => r.ok).length} of {results.length} recorded · SAR{' '}
                  <span className="fin-num">{formatMoney(results.filter((r) => r.ok).reduce((s, r) => s + r.amount, 0))}</span>
                </p>
                {results.map((r) => (
                  <div key={r.doc.id} className="flex items-center justify-between rounded-lg border p-2.5 text-xs">
                    <span className="flex items-center gap-2">
                      {r.ok ? <CheckCircle2 className="size-4 text-chip-positive-fg" /> : <XCircle className="size-4 text-chip-negative-fg" />}
                      <span className="font-medium">{r.doc.ref_id ?? r.doc.id.slice(0, 8)}</span>
                      <span className="text-muted-foreground">{r.doc.party_name}</span>
                      {r.error && <span className="text-chip-negative-fg">{r.error}</span>}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="fin-num font-medium">{formatMoney(r.amount)}</span>
                      {r.jeId && <Link to={`/finance/journal-entries/${r.jeId}`} className="text-muted-foreground underline-offset-2 hover:underline">View entry</Link>}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {mode === 'collect' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Customer</Label>
                      <Select
                        value={partyId}
                        onValueChange={(v) => {
                          setPartyId(v);
                          setReceived(0);
                          setAmounts(new Map());
                        }}
                      >
                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Choose a customer" /></SelectTrigger>
                        <SelectContent>
                          {parties.map((p) => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">
                              {p.name} · {formatMoney(p.total)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="settle-received" className="text-xs">Amount received (SAR)</Label>
                      <div className="flex gap-2">
                        <Input
                          id="settle-received"
                          type="number"
                          min={0}
                          step="0.01"
                          value={received || ''}
                          disabled={!partyId}
                          onChange={(e) => {
                            const v = Math.max(0, parseFloat(e.target.value) || 0);
                            setReceived(v);
                            allocate(v);
                          }}
                          className="fin-num h-9 text-right text-sm"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 text-xs"
                          disabled={!partyId}
                          onClick={() => {
                            const full = workingDocs.reduce((s, d) => s + d.balance, 0);
                            setReceived(full);
                            allocate(full);
                          }}
                        >
                          Full balance
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {mode === 'collect' && advanceTotal > 0 && (
                  <Alert>
                    <HandCoins className="size-4" />
                    <AlertDescription className="text-xs">
                      This customer has SAR {formatMoney(advanceTotal)} in unapplied advances. Apply those first from the{' '}
                      <Link to={`/finance/advances/${openAdvances[0].id}`} className="font-medium underline underline-offset-2">advance</Link>, then record the rest here.
                    </AlertDescription>
                  </Alert>
                )}

                {mode === 'pay' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Quick select</span>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => selectForPay((d) => d.days_overdue > 0)}>All overdue</Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => selectForPay((d) => dueOn(d) <= addDays(today, 7))}>Due in 7 days</Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAmounts(new Map())}>Clear</Button>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">
                      {workingDocs.length} {cfg.documentNoun}
                    </span>
                    <span className="text-muted-foreground">
                      Applying <span className="fin-num font-medium text-foreground">SAR {formatMoney(total)}</span>
                    </span>
                  </div>
                  {workingDocs.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                      {mode === 'collect' ? 'Choose a customer to see their open invoices.' : 'No bills selected. Use quick select or pick bills from the table.'}
                    </p>
                  ) : (
                    <div className="divide-y rounded-lg border">
                      {workingDocs.map((d) => (
                        <div key={d.id} className="flex items-center gap-3 p-2.5 text-xs">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">
                              {d.ref_id ?? d.id.slice(0, 8)} <span className="font-normal text-muted-foreground">· {d.party_name}</span>
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Due {formatDate(d.due_date ?? d.doc_date)} · balance <span className="fin-num">{formatMoney(d.balance)}</span>
                              {d.days_overdue > 0 && ` · ${d.days_overdue} days overdue`}
                            </p>
                          </div>
                          <Input
                            type="number"
                            min={0}
                            max={d.balance}
                            step="0.01"
                            aria-label={`Amount for ${d.ref_id ?? d.id}`}
                            value={amounts.get(d.id) ?? 0}
                            onChange={(e) => setDocAmount(d, parseFloat(e.target.value))}
                            className="fin-num h-8 w-32 text-right text-xs"
                          />
                          {mode === 'pay' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              aria-label={`Remove ${d.ref_id ?? d.id}`}
                              onClick={() => setAmounts((prev) => { const next = new Map(prev); next.delete(d.id); return next; })}
                            >
                              <X className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {mode === 'collect' && unallocated > 0 && (
                    <Alert>
                      <AlertTriangle className="size-4" />
                      <AlertDescription className="text-xs">
                        SAR {formatMoney(unallocated)} is more than the open invoices. A payment can't exceed an invoice balance — record the
                        extra as a{' '}
                        <Link to={`/finance/advances/new?type=customer&party_id=${partyId}`} className="font-medium underline underline-offset-2">customer advance</Link>.
                      </AlertDescription>
                    </Alert>
                  )}
                  {mode === 'collect' && unallocated < 0 && (
                    <p className="text-xs text-chip-negative-fg">The amounts applied are more than the amount received.</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{cfg.accountLabel}</Label>
                  <BankAccountPicker accounts={bankAccounts} value={accountId} onChange={setAccountId} idPrefix={`settle-${mode}`} />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="settle-date" className="text-xs">Date</Label>
                    <Input id="settle-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-xs" />
                    {!periodOpen && <p className="text-[11px] text-chip-negative-fg">No open accounting period covers this date.</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Method</Label>
                    <Select value={method} onValueChange={setMethod}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['Bank transfer', 'Cheque', 'Cash', 'Card'].map((m) => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="settle-ref" className="text-xs">Reference</Label>
                    <Input id="settle-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transfer or cheque no." className="h-9 text-xs" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/40 p-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">{mode === 'pay' ? 'Total to pay' : 'Total received'}</p>
                    <p className="fin-num text-base font-semibold">{formatMoney(total)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Bank before</p>
                    <p className="fin-num font-medium">{formatMoney(bankBefore)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Bank after</p>
                    <p className={`fin-num font-medium ${bankAfter < 0 ? 'text-chip-negative-fg' : ''}`}>{formatMoney(bankAfter)}</p>
                  </div>
                </div>

                {total > 0 && <JournalLinesTable variant="preview" title="Will post" lines={preview} />}
              </>
            )}
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t p-4">
            {results ? (
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={() => setConfirmOpen(true)} disabled={!valid} className="bg-brand text-white hover:bg-brand-hover">
                  {running !== null ? (
                    <>
                      <Loader2 className="mr-1 size-4 animate-spin" /> {running + 1} of {workingDocs.filter((d) => (amounts.get(d.id) ?? 0) > 0).length}
                    </>
                  ) : (
                    cfg.confirm
                  )}
                </Button>
              </>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{cfg.confirm}?</AlertDialogTitle>
            <AlertDialogDescription>
              This posts {workingDocs.filter((d) => (amounts.get(d.id) ?? 0) > 0).length} {cfg.documentNoun === 'bills' ? 'payments' : 'receipts'} totalling SAR{' '}
              {formatMoney(total)} {mode === 'pay' ? 'from' : 'into'} {bank?.bank_name || 'the selected account'} on {formatDate(date)}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={execute}>{cfg.confirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
