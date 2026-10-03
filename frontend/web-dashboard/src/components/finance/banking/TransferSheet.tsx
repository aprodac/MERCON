import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowDownUp, Circle, Loader2, Plus, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Account, AccountingPeriod, BankAccount } from '@mercon/shared-types';

import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { formatMoney } from '@/lib/finance';
import {
  CONTRA_META, balancesAfter, chargedSide, contraProblems, contraTypeOf, lastChargesAccount, rememberChargesAccount, suggestChargesAccount,
} from '@/lib/finance/contra';
import { financeService } from '@/services/financeService';
import { todayIso } from '@/lib/expenses/expenseMeta';
import { cn } from '@/lib/utils';

interface TransferSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFromBankAccountId?: string;
  initialToBankAccountId?: string;
  /** Called after each contra is posted. */
  onPosted?: () => void;
}

// Stable tint background per bank name hash
export function getBankTint(bankName?: string | null, isCash?: boolean) {
  if (isCash) {
    return {
      bg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40',
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
    { bg: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-600/20 dark:bg-sky-950/40', text: 'text-sky-700 dark:text-sky-300', border: 'border-sky-200 dark:border-sky-800', ring: 'ring-sky-500' },
    { bg: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-800', ring: 'ring-indigo-500' },
    { bg: 'bg-teal-50 dark:bg-teal-950/40', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-200 dark:border-teal-800', ring: 'ring-teal-500' },
    { bg: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', ring: 'ring-amber-500' },
    { bg: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-950/40', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800', ring: 'ring-rose-500' },
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

/** Small bank / cash avatar used across the contra screens. */
export function BankAvatar({ bankName, isCash, className }: { bankName?: string | null; isCash?: boolean; className?: string }) {
  const tint = getBankTint(bankName, isCash);
  return (
    <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md text-[9px] font-bold', tint.bg, tint.text, className)}>
      {isCash ? <Wallet className="size-3.5" /> : getBankInitials(bankName)}
    </span>
  );
}

const bankLabel = (b: BankAccount) => (b.is_cash ? b.bank_name || 'Cash' : b.bank_name || b.account?.name || 'Bank');
const balanceOf = (b: BankAccount | null) => Number(b?.book_balance ?? b?.opening_balance ?? 0);
const label = 'text-[11px] font-medium text-muted-foreground';

/** One side of the contra: the account picker with its balance before → after. */
function SideCard({
  title, value, onChange, accounts, exclude, after, warn,
}: {
  title: string;
  value: string;
  onChange: (id: string) => void;
  accounts: BankAccount[];
  exclude?: string;
  after: number | null;
  warn?: string | null;
}) {
  const acc = accounts.find((a) => a.id === value) ?? null;
  const before = balanceOf(acc);
  return (
    <div className="min-w-0 space-y-1.5 rounded-lg border bg-background p-3">
      <p className={label}>{title}</p>
      <Select value={value || undefined} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="h-10 text-sm" aria-label={title}>
          <SelectValue placeholder="Choose an account…">
            {acc && (
              <span className="flex min-w-0 items-center gap-2">
                <BankAvatar bankName={acc.bank_name} isCash={acc.is_cash} />
                <span className="truncate font-medium">{bankLabel(acc)}</span>
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id} disabled={a.id === exclude} className="text-xs">
              <span className="flex w-full items-center gap-2">
                <BankAvatar bankName={a.bank_name} isCash={a.is_cash} />
                <span className="truncate">{bankLabel(a)}</span>
                <span className="text-muted-foreground">{a.is_cash ? 'cash' : maskAccountNumber(a.account_number)}</span>
                <span className="fin-num ml-auto pl-3 text-muted-foreground">{formatMoney(balanceOf(a))}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {acc && (
        <p className="fin-num flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          {formatMoney(before)}
          {after !== null && Math.abs(after - before) > 0.005 && (
            <>
              <span>→</span>
              <span className={cn('font-semibold', after < -0.005 ? TONE_CLASSES.negative.fg : after > before ? TONE_CLASSES.positive.fg : 'text-foreground')}>{formatMoney(after)}</span>
            </>
          )}
        </p>
      )}
      {warn && <p className={cn('text-[11px]', TONE_CLASSES.warning.fg)}>{warn}</p>}
    </div>
  );
}

/**
 * New contra entry: money moved between cash and bank or between banks. The type follows from the
 * two accounts; an optional bank fee posts to an expense account. Posts a journal entry at once.
 */
export const TransferSheet: React.FC<TransferSheetProps> = ({ open, onOpenChange, initialFromBankAccountId, initialToBankAccountId, onPosted }) => {
  const queryClient = useQueryClient();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [reference, setReference] = useState('');
  const [memo, setMemo] = useState('');
  const [showCharges, setShowCharges] = useState(false);
  const [charges, setCharges] = useState('');
  const [chargesAccountId, setChargesAccountId] = useState('');
  const [tried, setTried] = useState(false);

  const { data: bankAccountsRes } = useQuery({ queryKey: ['bankAccounts'], queryFn: financeService.getBankAccounts, enabled: open });
  const accounts: BankAccount[] = useMemo(() => (bankAccountsRes?.data || []).filter((b) => b.isActive && !b.deletedAt), [bankAccountsRes]);
  const { data: periodsRes } = useQuery({ queryKey: ['accountingPeriods'], queryFn: () => financeService.getAccountingPeriods(), enabled: open });
  const openPeriods: AccountingPeriod[] = useMemo(() => (periodsRes?.data || []).filter((p: AccountingPeriod) => p.status === 'Open'), [periodsRes]);
  const { data: glRes } = useQuery({ queryKey: ['accounts', 'all-active'], queryFn: () => financeService.getAccounts({ include_inactive: false }), enabled: open && showCharges });
  const expenseAccounts = useMemo(() => ((glRes?.data ?? []) as Account[]).filter((a) => a.account_type === 'Expense' && a.is_postable && a.isActive), [glRes]);

  // Starting accounts: the ones asked for, else a cash till and a bank (the usual deposit)
  useEffect(() => {
    if (!open || accounts.length === 0) return;
    const from = initialFromBankAccountId || accounts.find((a) => a.is_cash)?.id || accounts[0]?.id || '';
    const to = initialToBankAccountId || accounts.find((a) => a.id !== from && !a.is_cash)?.id || accounts.find((a) => a.id !== from)?.id || '';
    setFromId((cur) => (cur && accounts.some((a) => a.id === cur) && !initialFromBankAccountId ? cur : from));
    setToId((cur) => (cur && accounts.some((a) => a.id === cur) && cur !== from && !initialToBankAccountId ? cur : to));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accounts.length, initialFromBankAccountId, initialToBankAccountId]);
  useEffect(() => {
    if (!open) setTried(false);
  }, [open]);
  // The charges account: last used, else the best-named expense account
  useEffect(() => {
    if (!showCharges || chargesAccountId || expenseAccounts.length === 0) return;
    const last = lastChargesAccount();
    setChargesAccountId(expenseAccounts.some((a) => a.id === last) ? last : suggestChargesAccount(expenseAccounts));
  }, [showCharges, chargesAccountId, expenseAccounts]);

  const from = accounts.find((a) => a.id === fromId) ?? null;
  const to = accounts.find((a) => a.id === toId) ?? null;
  const amt = Number(amount) || 0;
  const fee = showCharges ? Number(charges) || 0 : 0;
  const type = from && to ? contraTypeOf(Boolean(from.is_cash), Boolean(to.is_cash)) : null;
  const meta = type ? CONTRA_META[type] : null;
  const periodOpen = useMemo(() => {
    if (!date) return false;
    const d = new Date(`${date}T12:00:00`);
    return openPeriods.some((p) => d >= new Date(p.start_date) && d <= new Date(p.end_date));
  }, [date, openPeriods]);
  const after = from && to && amt > 0 ? balancesAfter(balanceOf(from), balanceOf(to), amt, fee, Boolean(from.is_cash)) : null;
  const problems = contraProblems({ fromId, toId, amount: amt, charges: fee, chargesAccountId, periodOpen });
  const feeFrom = from && to ? (chargedSide(Boolean(from.is_cash)) === 'from' ? from : to) : null;
  const chargesAccount = expenseAccounts.find((a) => a.id === chargesAccountId);

  const reset = (keep: boolean) => {
    setAmount('');
    setReference('');
    setMemo('');
    setCharges('');
    setTried(false);
    if (!keep) setShowCharges(false);
  };

  const mutation = useMutation({
    mutationFn: financeService.transferFunds,
    onSuccess: (res, vars) => {
      const ref = res?.data?.ref_id;
      toast.success(`${meta?.label ?? 'Contra entry'} posted${ref ? ` · ${ref}` : ''}`);
      if (vars.charges_account_id) rememberChargesAccount(vars.charges_account_id);
      ['bankAccounts', 'bank-accounts', 'contra', 'journalEntries', 'bankAccountTransactions', 'bankAccountBalanceHistory', 'finance-reports'].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }),
      );
      onPosted?.();
    },
    onError: (err: any) => {
      const e = err?.response?.data?.error;
      toast.error((typeof e === 'string' ? e : e?.message) || 'The contra entry could not be posted.');
    },
  });

  const submit = (again: boolean) => {
    if (mutation.isPending) return;
    if (problems.length) {
      setTried(true);
      return;
    }
    mutation.mutate(
      {
        fromAccountId: from!.accountId,
        toAccountId: to!.accountId,
        amount: amt,
        date,
        reference: reference.trim() || null,
        memo: memo.trim() || `${meta?.label ?? 'Transfer'}: ${bankLabel(from!)} to ${bankLabel(to!)}`,
        charges_amount: fee > 0 ? fee : null,
        charges_account_id: fee > 0 ? chargesAccountId : null,
      },
      {
        onSuccess: () => {
          reset(again);
          if (again) document.getElementById('contra-amount')?.focus();
          else onOpenChange(false);
        },
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !mutation.isPending && onOpenChange(o)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]">
        <SheetHeader className="border-b p-5 pr-14">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="text-base">New contra entry</SheetTitle>
            {meta && (
              <Chip tone={meta.tone} size="sm" dot>
                {meta.label}
              </Chip>
            )}
          </div>
          <SheetDescription className="text-xs">{meta ? meta.hint : 'Money moved between cash and bank, or between banks.'} Posts to the ledger straight away.</SheetDescription>
        </SheetHeader>

        <form
          id="contra-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"
        >
          {accounts.length < 2 && bankAccountsRes && (
            <p className={cn('rounded-md border p-2 text-xs', TONE_CLASSES.warning.bg, TONE_CLASSES.warning.fg, TONE_CLASSES.warning.border)}>
              A contra entry needs at least two bank or cash accounts. Add them in Finance → Bank accounts.
            </p>
          )}

          <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <SideCard
              title="From"
              value={fromId}
              onChange={(id) => (id === toId ? (setToId(fromId), setFromId(id)) : setFromId(id))}
              accounts={accounts}
              after={after?.from ?? null}
              warn={from?.is_cash && after && after.from < -0.005 ? 'More than the cash in hand.' : null}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8 justify-self-center rounded-full max-sm:rotate-0 sm:rotate-90"
              onClick={() => {
                setFromId(toId);
                setToId(fromId);
              }}
              aria-label="Swap from and to"
              title="Swap"
            >
              <ArrowDownUp className="size-3.5" />
            </Button>
            <SideCard title="To" value={toId} onChange={setToId} accounts={accounts} exclude={fromId} after={after?.to ?? null} />
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-1">
              <Label htmlFor="contra-amount" className={label}>Amount (SAR)</Label>
              <Input
                id="contra-amount"
                autoFocus
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={cn('fin-num h-11 text-right text-lg font-semibold', tried && !(amt > 0) && 'border-chip-negative-border')}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contra-date" className={label}>Date</Label>
              <Input id="contra-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn('h-11 text-sm', !periodOpen && 'border-chip-warning-border')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contra-ref" className={label}>{type === 'withdrawal' ? 'Cheque no.' : type === 'deposit' ? 'Deposit slip no.' : 'Reference no.'}</Label>
              <Input id="contra-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} placeholder={type === 'bank_to_bank' ? 'UTR / transfer no.' : 'Optional'} className="h-11 text-sm" />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="contra-memo" className={label}>Note</Label>
            <Input id="contra-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={from && to ? `${meta?.label}: ${bankLabel(from)} to ${bankLabel(to)}` : 'Optional'} className="h-9 text-sm" />
          </div>

          {showCharges ? (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <p className={label}>Bank charges{feeFrom ? ` · taken by ${bankLabel(feeFrom)}` : ''}</p>
                <button type="button" onClick={() => (setShowCharges(false), setCharges(''))} className="text-muted-foreground hover:text-foreground" aria-label="Remove bank charges">
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
                <Input type="number" inputMode="decimal" min="0" step="0.01" value={charges} onChange={(e) => setCharges(e.target.value)} placeholder="0.00" aria-label="Bank charges" className="fin-num h-9 text-right text-sm" />
                <Select value={chargesAccountId || undefined} onValueChange={(v) => v && setChargesAccountId(v)}>
                  <SelectTrigger className={cn('h-9 text-xs', tried && fee > 0 && !chargesAccountId && 'border-chip-negative-border')} aria-label="Charges account">
                    <SelectValue placeholder={expenseAccounts.length ? 'Expense account…' : 'No expense accounts'} />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-xs">
                        {a.account_code} {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowCharges(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Plus className="size-3" /> Bank charges
            </button>
          )}

          {/* What will post */}
          {from && to && amt > 0 && (
            <div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-xs">
              <p className={label}>Posts</p>
              <table className="w-full table-fixed">
                <tbody className="fin-num">
                  <tr>
                    <td className="truncate font-sans">{to.account ? `${to.account.account_code} ${to.account.name}` : bankLabel(to)}</td>
                    <td className={cn('w-28 text-right font-medium', TONE_CLASSES.positive.fg)}>Dr {formatMoney(amt)}</td>
                  </tr>
                  <tr>
                    <td className="truncate pl-3 font-sans">{from.account ? `${from.account.account_code} ${from.account.name}` : bankLabel(from)}</td>
                    <td className={cn('w-28 text-right font-medium', TONE_CLASSES.negative.fg)}>Cr {formatMoney(amt)}</td>
                  </tr>
                  {fee > 0 && feeFrom && (
                    <>
                      <tr>
                        <td className="truncate font-sans">{chargesAccount ? `${chargesAccount.account_code} ${chargesAccount.name}` : 'Bank charges'}</td>
                        <td className={cn('w-28 text-right font-medium', TONE_CLASSES.positive.fg)}>Dr {formatMoney(fee)}</td>
                      </tr>
                      <tr>
                        <td className="truncate pl-3 font-sans">{feeFrom.account ? `${feeFrom.account.account_code} ${feeFrom.account.name}` : bankLabel(feeFrom)}</td>
                        <td className={cn('w-28 text-right font-medium', TONE_CLASSES.negative.fg)}>Cr {formatMoney(fee)}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {problems.length > 0 && (tried || !periodOpen) && (
            <ul className="space-y-1">
              {problems.map((p) => (
                <li key={p} className={cn('flex items-start gap-1.5 text-xs', tried ? TONE_CLASSES.negative.fg : TONE_CLASSES.warning.fg)}>
                  {tried ? <AlertCircle className="mt-px size-3.5 shrink-0" /> : <Circle className="mt-px size-3.5 shrink-0" />} {p}
                </li>
              ))}
            </ul>
          )}
        </form>

        <SheetFooter className="flex-row justify-end gap-2 border-t p-4">
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => submit(true)} disabled={mutation.isPending}>
            Post and add another
          </Button>
          <Button type="submit" form="contra-form" size="sm" className="h-8 gap-1.5 bg-brand text-xs text-white hover:bg-brand-hover" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />} Post contra
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
