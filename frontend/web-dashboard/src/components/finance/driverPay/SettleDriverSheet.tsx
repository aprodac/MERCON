import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Account, AccountingPeriod } from '@mercon/shared-types';

import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { financeService } from '@/services/financeService';
import { authStore } from '@/store/authStore';
import { payFromOptions } from '@/lib/expenses/expenseForm';
import { todayIso } from '@/lib/expenses/expenseMeta';
import { settleProblems, settleTotals, suggestDriverPayAccount, suggestRecovery } from '@/lib/finance/driverPay';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

const label = 'text-[11px] font-medium text-muted-foreground';
const LAST_PAY_FROM = 'mercon.driverPay.payFrom';
const readLast = () => {
  try {
    return localStorage.getItem(LAST_PAY_FROM) || '';
  } catch {
    return '';
  }
};

/**
 * Pay a driver the trip pay they're owed: pick the trips, recover open advances, choose where the
 * money came from. Posts Dr driver pay / Cr advances / Cr bank in one go.
 */
export function SettleDriverSheet({ driver, onOpenChange }: { driver: { id: string; name: string } | null; onOpenChange: (open: boolean) => void }) {
  const open = driver !== null;
  const queryClient = useQueryClient();
  const payable = useQuery({ queryKey: ['driver-pay', 'payable', driver?.id], queryFn: () => financeService.getDriverPayable(driver!.id), enabled: open });
  const { data: bankRes } = useQuery({ queryKey: ['bank-accounts'], queryFn: () => financeService.getBankAccounts(), enabled: open });
  const payFrom = useMemo(() => payFromOptions((bankRes?.data ?? []) as any[]), [bankRes]);
  const { data: glRes } = useQuery({ queryKey: ['accounts', 'all-active'], queryFn: () => financeService.getAccounts({ include_inactive: false }), enabled: open });
  const expenseAccounts = useMemo(() => ((glRes?.data ?? []) as Account[]).filter((a) => a.account_type === 'Expense' && a.is_postable && a.isActive), [glRes]);
  const { data: periodsRes } = useQuery({ queryKey: ['accountingPeriods'], queryFn: () => financeService.getAccountingPeriods(), enabled: open });
  const role = authStore.getUser()?.role as string | undefined;
  const isAdmin = role === 'Admin' || role === 'SuperAdmin';

  const trips = payable.data?.trips ?? [];
  const advances = payable.data?.advances ?? [];
  const key = (t: { tripId: string; role: string }) => `${t.tripId}:${t.role}`;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [recover, setRecover] = useState<Record<string, string>>({});
  const [paidDate, setPaidDate] = useState(todayIso());
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [payAccountId, setPayAccountId] = useState('');
  const [reference, setReference] = useState('');
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fresh state per driver: every trip picked, advances recovered oldest first
  useEffect(() => {
    if (!payable.data) return;
    const all = new Set(payable.data.trips.map(key));
    setPicked(all);
    const gross = payable.data.trips.reduce((t, x) => t + x.amount, 0);
    const rec = suggestRecovery(gross, payable.data.advances);
    setRecover(Object.fromEntries(payable.data.advances.map((a, i) => [a.id, rec[i] ? String(rec[i]) : ''])));
    setTried(false);
    setReference('');
  }, [payable.data]);
  useEffect(() => {
    if (!open || paymentAccountId || !payFrom.length) return;
    const last = readLast();
    setPaymentAccountId(payFrom.some((p) => p.accountId === last) ? last : payFrom.find((p) => p.is_cash)?.accountId ?? payFrom[0].accountId);
  }, [open, paymentAccountId, payFrom]);
  useEffect(() => {
    if (!payable.data || payAccountId) return;
    setPayAccountId(payable.data.driver_pay_account_id || suggestDriverPayAccount(expenseAccounts));
  }, [payable.data, payAccountId, expenseAccounts]);

  const chosen = trips.filter((t) => picked.has(key(t)));
  const adv = advances.map((a) => ({ ...a, take: Number(recover[a.id]) || 0 }));
  const totals = settleTotals({ tripAmounts: chosen.map((t) => t.amount), advances: adv.map((a) => ({ amount: a.take, remaining: a.remaining })) });
  const periodOpen = useMemo(() => {
    const d = new Date(`${paidDate}T12:00:00`);
    return ((periodsRes?.data ?? []) as AccountingPeriod[]).some((p) => p.status === 'Open' && d >= new Date(p.start_date) && d <= new Date(p.end_date));
  }, [paidDate, periodsRes]);
  const problems = settleProblems({
    tripAmounts: chosen.map((t) => t.amount),
    advances: adv.map((a) => ({ amount: a.take, remaining: a.remaining })),
    paymentAccountId,
    driverPayAccountId: payAccountId,
    periodOpen,
  });
  const accountSet = Boolean(payable.data?.driver_pay_account_id);
  const payName = expenseAccounts.find((a) => a.id === payAccountId);
  const bankName = payFrom.find((p) => p.accountId === paymentAccountId);

  const pay = async () => {
    if (saving || !driver) return;
    if (problems.length) {
      setTried(true);
      return;
    }
    setSaving(true);
    try {
      const days = chosen.map((t) => t.day).sort();
      const res = await financeService.createDriverSettlement({
        driver_id: driver.id,
        lines: chosen.map((t) => ({ trip_id: t.tripId, role: t.role })),
        advances: adv.filter((a) => a.take > 0).map((a) => ({ advance_id: a.id, amount: a.take })),
        paid_date: paidDate,
        payment_account_id: totals.net > 0.005 ? paymentAccountId : null,
        driver_pay_account_id: accountSet ? null : payAccountId,
        reference: reference.trim() || null,
        period_from: days[0] ?? null,
        period_to: days[days.length - 1] ?? null,
      });
      try {
        localStorage.setItem(LAST_PAY_FROM, paymentAccountId);
      } catch {
        /* private mode */
      }
      toast.success(`${res.ref_id}: ${driver.name} paid SAR ${formatMoney(res.net)}`);
      ['driver-pay', 'bank-accounts', 'bankAccounts', 'finance-reports', 'journalEntries', 'advances'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      onOpenChange(false);
    } catch (err: any) {
      const e = err?.response?.data?.error;
      toast.error((typeof e === 'string' ? e : e?.message) || 'The settlement could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const allPicked = trips.length > 0 && chosen.length === trips.length;
  return (
    <Sheet open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[620px]">
        <SheetHeader className="border-b p-5 pr-14">
          <SheetTitle className="text-base">Pay {driver?.name}</SheetTitle>
          <SheetDescription className="text-xs">Trip pay for completed trips, less any advances you recover now. Posts to the ledger when you pay.</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-xs">
          {payable.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
          ) : trips.length === 0 ? (
            <p className="rounded-md border p-3 text-muted-foreground">Nothing owed: every completed trip's pay is already settled.</p>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className={label}>Trips · {chosen.length} of {trips.length}</p>
                <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setPicked(allPicked ? new Set() : new Set(trips.map(key)))}>
                  {allPicked ? 'Clear all' : 'Pick all'}
                </button>
              </div>
              <div className="max-h-64 divide-y divide-border/60 overflow-y-auto rounded-lg border">
                {trips.map((t) => {
                  const k = key(t);
                  return (
                    <label key={k} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-muted/40">
                      <Checkbox
                        checked={picked.has(k)}
                        onCheckedChange={(c) =>
                          setPicked((p) => {
                            const n = new Set(p);
                            if (c) n.add(k);
                            else n.delete(k);
                            return n;
                          })
                        }
                        aria-label={`Pay ${t.refId}`}
                      />
                      <span className="w-20 shrink-0 text-muted-foreground">{formatDate(t.day)}</span>
                      <span className="w-20 shrink-0 font-medium text-foreground">{t.refId}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground" title={`${t.customer} · ${t.lane}`}>
                        {t.customer} · {t.lane}
                        {t.role === 'co_driver' && <span className={cn('ml-1', TONE_CLASSES.info.fg)}>co-driver</span>}
                      </span>
                      <span className="fin-num shrink-0 font-medium text-foreground">{formatMoney(t.amount)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {advances.length > 0 && (
            <div className="space-y-1.5">
              <p className={label}>Open advances · recover now</p>
              <div className="divide-y divide-border/60 rounded-lg border">
                {adv.map((a) => (
                  <div key={a.id} className="flex items-center gap-2.5 px-3 py-1.5">
                    <span className="w-20 shrink-0 font-medium text-foreground">{a.ref_id}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {formatDate(a.date)} · <span className="fin-num">{formatMoney(a.remaining)}</span> left
                    </span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={recover[a.id] ?? ''}
                      onChange={(e) => setRecover((r) => ({ ...r, [a.id]: e.target.value }))}
                      placeholder="0.00"
                      aria-label={`Recover from ${a.ref_id}`}
                      className={cn('fin-num h-8 w-28 text-right text-xs', a.take - a.remaining > 0.005 && 'border-chip-negative-border')}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="pay-date" className={label}>Paid on</Label>
              <Input id="pay-date" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className={cn('h-9 text-sm', !periodOpen && 'border-chip-warning-border')} />
            </div>
            <div className="space-y-1">
              <Label className={label}>Paid from</Label>
              <Select value={paymentAccountId || undefined} onValueChange={(v) => v && setPaymentAccountId(v)} disabled={totals.net <= 0.005}>
                <SelectTrigger className="h-9 text-xs" aria-label="Paid from">
                  <SelectValue placeholder={totals.net <= 0.005 ? 'Not needed' : 'Bank or cash…'} />
                </SelectTrigger>
                <SelectContent>
                  {payFrom.map((p) => (
                    <SelectItem key={p.accountId} value={p.accountId} className="text-xs">
                      {p.name} <span className="text-muted-foreground">· {p.is_cash ? 'cash' : 'bank'}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pay-ref" className={label}>Reference</Label>
              <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} placeholder="Transfer / receipt no." className="h-9 text-sm" />
            </div>
          </div>

          {!accountSet && (
            <div className={cn('space-y-1.5 rounded-lg border p-3', TONE_CLASSES.warning.bg, TONE_CLASSES.warning.border)}>
              <p className={cn('text-xs font-medium', TONE_CLASSES.warning.fg)}>Driver trip pay has no expense account yet.</p>
              {isAdmin ? (
                <Select value={payAccountId || undefined} onValueChange={(v) => v && setPayAccountId(v)}>
                  <SelectTrigger className="h-9 bg-background text-xs" aria-label="Driver pay account">
                    <SelectValue placeholder="Expense account…" />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-xs">
                        {a.account_code} {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-foreground">Ask an Admin to open this once and choose it; it's saved for every settlement after.</p>
              )}
            </div>
          )}

          {totals.gross > 0 && (
            <div className="space-y-1 rounded-lg border bg-muted/30 p-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trip pay · {chosen.length} {chosen.length === 1 ? 'trip' : 'trips'}</span>
                <span className="fin-num font-medium">{formatMoney(totals.gross)}</span>
              </div>
              {totals.deducted > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Advances recovered</span>
                  <span className="fin-num font-medium">−{formatMoney(totals.deducted)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 text-sm">
                <span className="font-semibold">To pay now</span>
                <span className="fin-num font-semibold">SAR {formatMoney(totals.net)}</span>
              </div>
              <div className="space-y-0.5 border-t pt-1.5 text-[11px]">
                <p className="flex justify-between gap-2">
                  <span className="truncate">{payName ? `${payName.account_code} ${payName.name}` : 'Driver pay'}</span>
                  <span className={cn('fin-num', TONE_CLASSES.positive.fg)}>Dr {formatMoney(totals.gross)}</span>
                </p>
                {totals.deducted > 0 && (
                  <p className="flex justify-between gap-2 pl-3">
                    <span className="truncate">Employee advances</span>
                    <span className={cn('fin-num', TONE_CLASSES.negative.fg)}>Cr {formatMoney(totals.deducted)}</span>
                  </p>
                )}
                {totals.net > 0.005 && (
                  <p className="flex justify-between gap-2 pl-3">
                    <span className="truncate">{bankName?.name ?? 'Bank / cash'}</span>
                    <span className={cn('fin-num', TONE_CLASSES.negative.fg)}>Cr {formatMoney(totals.net)}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {tried && problems.length > 0 && (
            <ul className="space-y-1">
              {problems.map((p) => (
                <li key={p} className={cn('flex items-start gap-1.5', TONE_CLASSES.negative.fg)}>
                  <AlertCircle className="mt-px size-3.5 shrink-0" /> {p}
                </li>
              ))}
            </ul>
          )}
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t p-4">
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" size="sm" className="h-8 gap-1.5 bg-brand text-xs text-white hover:bg-brand-hover" onClick={pay} disabled={saving || trips.length === 0 || (!accountSet && !isAdmin)}>
            {saving && <Loader2 className="size-3.5 animate-spin" />} Pay SAR {formatMoney(totals.net)}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
