import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { EXPENSE_CATEGORIES } from '@mercon/shared-types';

import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { financeService } from '@/services/financeService';
import { expenseService, type PostUnpostedResult } from '@/services/expenseService';
import { categoryTone } from '@/lib/expenses/expenseMeta';
import { cn } from '@/lib/utils';
import type { Account } from '@mercon/shared-types';

const DEFAULT = '__default';
const NONE = '__none';
const label = 'text-[11px] font-medium text-muted-foreground';
/** Workshop maintenance records are mirrored as expenses under this category (syncMaintenanceExpense). */
const MAINTENANCE_MIRROR = 'Maintenance';

/**
 * Admin: which expense account each category posts to (with a default for the rest), the payables
 * account to-pay expenses use, and posting the expenses that aren't in the ledger yet.
 */
export function ExpenseLedgerSetupSheet({ open, onOpenChange, extraCategories }: { open: boolean; onOpenChange: (o: boolean) => void; extraCategories: string[] }) {
  const queryClient = useQueryClient();
  const setup = useQuery({ queryKey: ['expenses', 'ledger-setup'], queryFn: expenseService.getLedgerSetup, enabled: open });
  const accounts = useQuery({ queryKey: ['accounts', 'all-active'], queryFn: () => financeService.getAccounts({ include_inactive: false }), enabled: open });
  const banks = useQuery({ queryKey: ['bank-accounts'], queryFn: () => financeService.getBankAccounts(), enabled: open });
  const payFrom = ((banks.data?.data ?? []) as any[]).filter((b) => !b.deletedAt && b.isActive !== false);
  const all = ((accounts.data?.data ?? []) as Account[]).filter((a) => a.is_postable);
  const expenseAccounts = all.filter((a) => a.account_type === 'Expense');
  const liabilityAccounts = all.filter((a) => a.account_type === 'Liability');

  const [def, setDef] = useState<string>('');
  const [map, setMap] = useState<Record<string, string>>({});
  const [ap, setAp] = useState<string>('');
  const [fallback, setFallback] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [result, setResult] = useState<PostUnpostedResult | null>(null);

  useEffect(() => {
    if (!open || !setup.data) return;
    setDef(setup.data.default_expense_account_id ?? '');
    setMap(setup.data.category_accounts ?? {});
    setAp(setup.data.payable_account_id ?? '');
  }, [open, setup.data]);
  useEffect(() => {
    if (open) setResult(null);
  }, [open]);

  const categories = useMemo(() => [...new Set([...EXPENSE_CATEGORIES, MAINTENANCE_MIRROR, ...extraCategories])], [extraCategories]);
  const accountLabel = (a: Account) => `${a.account_code} ${a.name}`;

  const save = async () => {
    setSaving(true);
    try {
      const clean = Object.fromEntries(Object.entries(map).filter(([, v]) => v));
      await expenseService.updateLedgerSetup({ default_expense_account_id: def || null, category_accounts: clean, payable_account_id: ap || null });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success(def ? 'Expense accounts saved. New and edited expenses now post to the ledger.' : 'Saved. Expenses will post once a default account is set.');
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Could not save the accounts.');
    } finally {
      setSaving(false);
    }
  };

  const postBacklog = async () => {
    setPosting(true);
    try {
      const r = await expenseService.postUnposted(fallback ? { fallback_payment_account_id: fallback } : {});
      setResult(r);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      if (r.posted > 0) toast.success(`${r.posted} ${r.posted === 1 ? 'expense' : 'expenses'} posted to the ledger`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Posting failed.');
    } finally {
      setPosting(false);
    }
  };

  const enabled = Boolean(setup.data?.enabled);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-5 pr-14">
          <SheetTitle className="text-base">Ledger setup for expenses</SheetTitle>
          <SheetDescription className="text-xs">
            A paid expense posts Dr its category&apos;s account, Cr the bank or cash it was paid from. A to-pay expense credits payables until it is paid.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <p className={cn('flex items-center gap-1.5 text-xs font-medium', enabled ? TONE_CLASSES.positive.fg : TONE_CLASSES.warning.fg)}>
            {enabled ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
            {enabled ? 'Expenses post to the ledger when saved.' : 'Not posting yet: choose a default expense account.'}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className={label}>Default expense account</Label>
              <Select value={def || NONE} onValueChange={(v) => v && setDef(v === NONE ? '' : v)}>
                <SelectTrigger className="h-9 text-xs" aria-label="Default expense account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} className="text-xs text-muted-foreground">Not set (no posting)</SelectItem>
                  {expenseAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id} className="text-xs">{accountLabel(a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className={label}>Accounts payable (to-pay)</Label>
              <Select value={ap || NONE} onValueChange={(v) => v && setAp(v === NONE ? '' : v)}>
                <SelectTrigger className="h-9 text-xs" aria-label="Accounts payable">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} className="text-xs text-muted-foreground">Not set</SelectItem>
                  {liabilityAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id} className="text-xs">{accountLabel(a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {expenseAccounts.length === 0 && !accounts.isLoading && (
            <p className={cn('text-xs', TONE_CLASSES.warning.fg)}>There are no postable Expense accounts yet. Add them in Finance → Chart of accounts.</p>
          )}

          <div className="space-y-1">
            <p className={label}>Per category (blank uses the default)</p>
            <div className="divide-y divide-border/60 rounded-lg border">
              {categories.map((c) => (
                <div key={c} className="flex items-center gap-3 px-3 py-1.5">
                  <span className="flex w-40 shrink-0 items-center gap-2 text-xs text-foreground">
                    <span className={cn('size-2 rounded-full', TONE_CLASSES[categoryTone(c)].dot)} />
                    <span className="truncate">{c}</span>
                  </span>
                  <Select value={map[c] || DEFAULT} onValueChange={(v) => v && setMap((m) => ({ ...m, [c]: v === DEFAULT ? '' : v }))}>
                    <SelectTrigger className="h-8 flex-1 text-xs" aria-label={`Account for ${c}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEFAULT} className="text-xs text-muted-foreground">Default account</SelectItem>
                      {expenseAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id} className="text-xs">{accountLabel(a)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {enabled && (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-xs text-foreground">
                <span className="font-medium">{setup.data?.unposted_count ?? 0}</span> expenses are not in the ledger. Older expenses only post when you choose to.
              </p>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <Label className={label}>Paid from, where an expense has none</Label>
                  <Select value={fallback || NONE} onValueChange={(v) => v && setFallback(v === NONE ? '' : v)}>
                    <SelectTrigger className="h-8 text-xs" aria-label="Paid from, where missing">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE} className="text-xs text-muted-foreground">Leave those unposted</SelectItem>
                      {payFrom.map((b) => (
                        <SelectItem key={b.accountId} value={b.accountId} className="text-xs">
                          {b.account?.account_code} {b.account?.name ?? b.bank_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-xs" onClick={postBacklog} disabled={posting || !setup.data?.unposted_count}>
                  {posting && <Loader2 className="size-3.5 animate-spin" />} Post them now
                </Button>
              </div>
              {result && (
                <div className="space-y-1 text-xs">
                  <p className="text-foreground">
                    Posted {result.posted} of {result.considered}.{result.remaining > 0 ? ` ${result.remaining} more to go: run it again.` : ''}
                  </p>
                  {result.problems.map((p) => (
                    <p key={p.message} className={TONE_CLASSES.warning.fg}>
                      {p.count} not posted: {p.message} (e.g. {p.example})
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t p-4">
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" size="sm" className="h-8 gap-1.5 bg-brand text-xs text-white hover:bg-brand-hover" onClick={save} disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" />} Save accounts
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
