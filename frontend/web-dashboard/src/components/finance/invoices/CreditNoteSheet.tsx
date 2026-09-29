import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { AccountingPeriod, Invoice } from '@mercon/shared-types';

import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { financeService } from '@/services/financeService';
import { todayIso } from '@/lib/expenses/expenseMeta';
import { CREDIT_REASONS, creditFigures, creditProblems, wholeBalanceLine, type CreditLineDraft } from '@/lib/finance/creditNote';
import { formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

const label = 'text-[11px] font-medium text-muted-foreground';
let seq = 0;
const newKey = () => `cl-${++seq}`;

/**
 * Issue a credit note on an issued invoice: credit its lines (or part of them), or the whole
 * balance. Posts Dr revenue / Dr VAT output / Cr receivable and lowers what the customer owes.
 */
export function CreditNoteSheet({ invoice, onOpenChange }: { invoice: Invoice | null; onOpenChange: (open: boolean) => void }) {
  const open = invoice !== null;
  const queryClient = useQueryClient();
  const full = useQuery({ queryKey: ['invoices', 'detail', invoice?.id], queryFn: () => financeService.getInvoiceById(invoice!.id), enabled: open });
  const inv = (full.data?.data as Invoice | undefined) ?? invoice;
  const { data: periodsRes } = useQuery({ queryKey: ['accountingPeriods'], queryFn: () => financeService.getAccountingPeriods(), enabled: open });

  const [lines, setLines] = useState<CreditLineDraft[]>([]);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(todayIso());
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  const balance = Number(inv?.balance_due ?? 0);
  const rate = Number(inv?.tax_rate ?? 0);
  const ref = inv?.ref_id ?? 'the invoice';
  useEffect(() => {
    if (!open) return;
    setLines([]);
    setReason('');
    setDate(todayIso());
    setTried(false);
  }, [open, invoice?.id]);

  const periodOpen = useMemo(() => {
    const d = new Date(`${date}T12:00:00`);
    return ((periodsRes?.data ?? []) as AccountingPeriod[]).some((p) => p.status === 'Open' && d >= new Date(p.start_date) && d <= new Date(p.end_date));
  }, [date, periodsRes]);
  const figures = creditFigures(lines);
  const problems = creditProblems({ lines, reason, balanceDue: balance, periodOpen });
  const creditedKeys = new Set(lines.map((l) => l.description));

  const addFromInvoiceLine = (l: NonNullable<Invoice['lines']>[number]) =>
    setLines((cur) => [...cur, { key: newKey(), description: l.description, amount: String(Number(l.amount)), taxRate: String(Number(l.tax_rate ?? rate)) }]);
  const change = (key: string, patch: Partial<CreditLineDraft>) => setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = async () => {
    if (!inv || saving) return;
    if (problems.length) {
      setTried(true);
      return;
    }
    setSaving(true);
    try {
      const note = await financeService.createCreditNote(inv.id, {
        credit_date: date,
        reason: reason.trim(),
        lines: lines.map((l) => ({ description: l.description.trim(), amount: Number(l.amount), tax_rate: Number(l.taxRate) })),
      });
      toast.success(`${note.ref_id} issued: SAR ${formatMoney(note.total_amount)} off ${ref}`);
      ['invoices', 'finance-reports', 'credit-notes', 'journalEntries'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      onOpenChange(false);
    } catch (err: any) {
      const e = err?.response?.data?.error;
      toast.error((typeof e === 'string' ? e : e?.message) || 'The credit note could not be issued.');
    } finally {
      setSaving(false);
    }
  };

  const invLines = inv?.lines ?? [];
  return (
    <Sheet open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[600px]">
        <SheetHeader className="border-b p-5 pr-14">
          <SheetTitle className="text-base">Credit note on {ref}</SheetTitle>
          <SheetDescription className="text-xs">
            {inv?.customer?.name ? `${inv.customer.name} · ` : ''}still owes <span className="fin-num font-medium text-foreground">SAR {formatMoney(balance)}</span>. A credit note lowers that and reverses the revenue and VAT.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-xs">
          <div className="space-y-1.5">
            <p className={label}>Credit from the invoice</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setLines([{ key: newKey(), ...wholeBalanceLine(balance, rate, ref) }])}
                className="rounded-md border px-2 py-1 font-medium text-foreground hover:bg-muted/60"
              >
                Whole balance · {formatMoney(balance)}
              </button>
              {invLines.slice(0, 12).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  disabled={creditedKeys.has(l.description)}
                  onClick={() => addFromInvoiceLine(l)}
                  className="max-w-[260px] truncate rounded-md border px-2 py-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-40"
                  title={l.description}
                >
                  + {l.trip?.ref_id ?? l.description} · <span className="fin-num">{formatMoney(l.amount)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className={label}>Lines credited</p>
              <button type="button" className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setLines((c) => [...c, { key: newKey(), description: '', amount: '', taxRate: String(rate) }])}>
                <Plus className="size-3" /> Line
              </button>
            </div>
            {lines.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-center text-muted-foreground">Pick from the invoice above, or add a line.</p>
            ) : (
              <div className="divide-y divide-border/60 rounded-lg border">
                {lines.map((l) => (
                  <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_7rem_4.5rem_auto] items-center gap-2 px-2 py-1.5">
                    <Input value={l.description} onChange={(e) => change(l.key, { description: e.target.value })} placeholder="What's credited" aria-label="Description" className="h-8 text-xs" />
                    <Input type="number" inputMode="decimal" min="0" step="0.01" value={l.amount} onChange={(e) => change(l.key, { amount: e.target.value })} placeholder="0.00" aria-label="Amount before VAT" className="fin-num h-8 text-right text-xs" />
                    <div className="relative">
                      <Input type="number" min="0" max="100" step="0.01" value={l.taxRate} onChange={(e) => change(l.key, { taxRate: e.target.value })} aria-label="VAT rate" className="fin-num h-8 pr-5 text-right text-xs" />
                      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
                    </div>
                    <button type="button" onClick={() => setLines((c) => c.filter((x) => x.key !== l.key))} className="text-muted-foreground hover:text-foreground" aria-label="Remove line">
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <div className="space-y-1">
              <Label htmlFor="cn-reason" className={label}>Reason (printed on the credit note)</Label>
              <Input id="cn-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Why the customer is credited" className={cn('h-9 text-sm', tried && !reason.trim() && 'border-chip-negative-border')} />
              <div className="flex flex-wrap gap-1 pt-0.5">
                {CREDIT_REASONS.map((r) => (
                  <button key={r} type="button" onClick={() => setReason(r)} className={cn('rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground', reason === r && 'bg-muted text-foreground')}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cn-date" className={label}>Credit date</Label>
              <Input id="cn-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn('h-9 text-sm', !periodOpen && 'border-chip-warning-border')} />
            </div>
          </div>

          {figures.total > 0 && (
            <div className="space-y-1 rounded-lg border bg-muted/30 p-3">
              <div className="flex justify-between"><span className="text-muted-foreground">Before VAT</span><span className="fin-num">{formatMoney(figures.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">VAT</span><span className="fin-num">{formatMoney(figures.tax)}</span></div>
              <div className="flex justify-between border-t pt-1 text-sm font-semibold"><span>Credit</span><span className="fin-num">SAR {formatMoney(figures.total)}</span></div>
              <div className="flex justify-between text-muted-foreground">
                <span>{ref} will still owe</span>
                <span className={cn('fin-num font-medium', balance - figures.total < -0.005 ? TONE_CLASSES.negative.fg : 'text-foreground')}>{formatMoney(balance - figures.total)}</span>
              </div>
              <div className="space-y-0.5 border-t pt-1.5 text-[11px]">
                <p className="flex justify-between"><span>Revenue</span><span className={cn('fin-num', TONE_CLASSES.positive.fg)}>Dr {formatMoney(figures.subtotal)}</span></p>
                {figures.tax > 0 && <p className="flex justify-between"><span>VAT output</span><span className={cn('fin-num', TONE_CLASSES.positive.fg)}>Dr {formatMoney(figures.tax)}</span></p>}
                <p className="flex justify-between pl-3"><span>Accounts receivable</span><span className={cn('fin-num', TONE_CLASSES.negative.fg)}>Cr {formatMoney(figures.total)}</span></p>
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
          <Button type="button" size="sm" className="h-8 gap-1.5 bg-brand text-xs text-white hover:bg-brand-hover" onClick={save} disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" />} Issue credit note
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
