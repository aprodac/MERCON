import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Account } from '@mercon/shared-types';

import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { financeService, type InvoiceLedgerSetup } from '@/services/financeService';
import { authStore } from '@/store/authStore';
import { LEDGER_SLOTS, SLOT_META, ledgerGaps, slotAccounts, suggestAccount, type LedgerSlot } from '@/lib/finance/invoiceLedger';
import { cn } from '@/lib/utils';

const NONE = '__none';
const SETUP_KEY = ['invoices', 'ledger-setup'];

const isAdminUser = () => {
  const role = authStore.getUser()?.role as string | undefined;
  return role === 'Admin' || role === 'SuperAdmin';
};

/** The invoice posting accounts and the chart they're picked from. */
export function useInvoiceLedger(enabled = true) {
  const setup = useQuery({ queryKey: SETUP_KEY, queryFn: financeService.getInvoiceLedgerSetup, enabled, staleTime: 60_000 });
  const accounts = useQuery({ queryKey: ['accounts', 'all-active'], queryFn: () => financeService.getAccounts({ include_inactive: false }), enabled, staleTime: 60_000 });
  return { setup: setup.data, accounts: (accounts.data?.data ?? []) as Account[], loading: setup.isLoading || accounts.isLoading };
}

/** One account picker per slot; `values` holds the picks. */
function SlotPickers({ slots, accounts, values, onChange, disabled }: { slots: LedgerSlot[]; accounts: Account[]; values: Partial<InvoiceLedgerSetup>; onChange: (slot: LedgerSlot, id: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-2.5">
      {slots.map((slot) => {
        const meta = SLOT_META[slot];
        const options = slotAccounts(slot, accounts);
        return (
          <div key={slot} className="space-y-1">
            <Label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <span className={cn('rounded px-1 text-[10px] font-semibold', meta.side === 'Dr' ? cn(TONE_CLASSES.positive.bg, TONE_CLASSES.positive.fg) : cn(TONE_CLASSES.negative.bg, TONE_CLASSES.negative.fg))}>{meta.side}</span>
              {meta.label}
              <span className="font-normal">· {meta.type} account</span>
            </Label>
            <Select value={values[slot] || NONE} onValueChange={(v) => v && onChange(slot, v === NONE ? '' : v)} disabled={disabled}>
              <SelectTrigger className="h-9 text-xs" aria-label={meta.label}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} className="text-xs text-muted-foreground">{options.length ? 'Choose an account…' : `No ${meta.type} accounts in the chart yet`}</SelectItem>
                {options.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">
                    {a.account_code} {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}

/** Picks start from what's saved, else the best-named account for each empty slot. */
function useSlotPicks(slots: LedgerSlot[], setup: InvoiceLedgerSetup | undefined, accounts: Account[], active: boolean) {
  const [picks, setPicks] = useState<Partial<InvoiceLedgerSetup>>({});
  const key = slots.join(',');
  useEffect(() => {
    if (!active || !setup) return;
    setPicks(Object.fromEntries(slots.map((s) => [s, setup[s] || suggestAccount(s, accounts)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, setup, accounts.length, key]);
  return [picks, (slot: LedgerSlot, id: string) => setPicks((p) => ({ ...p, [slot]: id }))] as const;
}

/**
 * The issue confirmation. Before it can be confirmed it checks the accounts the invoice will post
 * to; a missing one is chosen right here (Admin) instead of failing after "Issue".
 */
export function IssueInvoiceDialog({
  open,
  onOpenChange,
  title,
  description,
  hasVat,
  pending,
  onConfirm,
  confirmLabel = 'Issue invoice',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  hasVat: boolean;
  pending?: boolean;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  const queryClient = useQueryClient();
  const { setup, accounts, loading } = useInvoiceLedger(open);
  const gaps = ledgerGaps(setup, hasVat);
  const [picks, pick] = useSlotPicks(gaps, setup, accounts, open);
  const [saving, setSaving] = useState(false);
  const admin = isAdminUser();
  const ready = !loading && gaps.length === 0;

  const saveAndIssue = async () => {
    const body = Object.fromEntries(gaps.map((s) => [s, picks[s] || null]));
    if (gaps.some((s) => !picks[s])) {
      toast.error('Choose an account for each one first.');
      return;
    }
    setSaving(true);
    try {
      await financeService.updateInvoiceLedgerSetup(body);
      await queryClient.invalidateQueries({ queryKey: SETUP_KEY });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      onConfirm();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Could not save the accounts.');
    } finally {
      setSaving(false);
    }
  };

  const busy = pending || saving;
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && !busy && onOpenChange(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {!loading && gaps.length > 0 && (
          <div className={cn('space-y-3 rounded-lg border p-3', TONE_CLASSES.warning.bg, TONE_CLASSES.warning.border)}>
            <p className={cn('flex items-start gap-1.5 text-xs font-medium', TONE_CLASSES.warning.fg)}>
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              {gaps.length === 1
                ? `Issuing posts to a ${SLOT_META[gaps[0]].label} account, and none is set yet.`
                : `Issuing posts to accounts that aren't set yet: ${gaps.map((g) => SLOT_META[g].label).join(', ')}.`}
            </p>
            {admin ? (
              <>
                <SlotPickers slots={gaps} accounts={accounts} values={picks} onChange={pick} disabled={busy} />
                <p className="text-[11px] text-muted-foreground">Saved for every invoice from now on. Change it later in Invoices → Ledger setup.</p>
              </>
            ) : (
              <p className="text-xs text-foreground">Ask an Admin to choose {gaps.length === 1 ? 'it' : 'them'} in Invoices → Ledger setup. You can still save this invoice as a draft.</p>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          {(ready || admin) && (
            <Button
              type="button"
              disabled={busy || loading}
              onClick={() => (ready ? onConfirm() : saveAndIssue())}
              className="gap-1.5 bg-brand text-white hover:bg-brand-hover"
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              {busy ? 'Working…' : ready ? confirmLabel : `Save accounts and ${confirmLabel.charAt(0).toLowerCase()}${confirmLabel.slice(1)}`}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Admin: every account invoices post to, from the invoices list. */
export function InvoiceLedgerSetupSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const { setup, accounts, loading } = useInvoiceLedger(open);
  const [picks, pick] = useSlotPicks(LEDGER_SLOTS, setup, accounts, open);
  const [saving, setSaving] = useState(false);
  const missing = ledgerGaps(setup, true);

  const save = async () => {
    setSaving(true);
    try {
      await financeService.updateInvoiceLedgerSetup(Object.fromEntries(LEDGER_SLOTS.map((s) => [s, picks[s] || null])));
      queryClient.invalidateQueries({ queryKey: SETUP_KEY });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Invoice accounts saved');
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Could not save the accounts.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-5 pr-14">
          <SheetTitle className="text-base">Ledger setup for invoices</SheetTitle>
          <SheetDescription className="text-xs">Issuing an invoice posts Dr accounts receivable for the total, Cr revenue for the amount before VAT and Cr VAT output for the VAT.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {!loading && (
            <p className={cn('flex items-center gap-1.5 text-xs font-medium', missing.length ? TONE_CLASSES.warning.fg : TONE_CLASSES.positive.fg)}>
              {missing.length ? <AlertTriangle className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
              {missing.length ? `Not set: ${missing.map((m) => SLOT_META[m].label).join(', ')}. Suggestions are filled in; check and save.` : 'Invoices can be issued.'}
            </p>
          )}
          <SlotPickers slots={LEDGER_SLOTS} accounts={accounts} values={picks} onChange={pick} disabled={saving} />
        </div>
        <SheetFooter className="flex-row justify-end gap-2 border-t p-4">
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" size="sm" className="h-8 gap-1.5 bg-brand text-xs text-white hover:bg-brand-hover" onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="size-3.5 animate-spin" />} Save accounts
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
