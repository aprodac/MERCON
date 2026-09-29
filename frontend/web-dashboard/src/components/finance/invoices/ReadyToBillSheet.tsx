import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PartyAvatar } from '@/components/finance/ageing/PartyAvatar';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { financeService, type UnbilledCustomer, type UnbilledTrips } from '@/services/financeService';
import { dueDateFor } from '@/lib/finance/invoices';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

const DEFAULT_VAT = 15;

interface Result {
  customer: UnbilledCustomer;
  ok: boolean;
  invoiceId?: string;
  ref?: string;
  error?: string;
}

/**
 * Bill every completed trip in one go: one draft invoice per customer, trips pre-filled, due date
 * from the customer's payment terms. Drafts are reviewed and issued from the list afterwards.
 */
export function ReadyToBillSheet({
  open,
  onOpenChange,
  unbilled,
  today,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unbilled: UnbilledTrips | undefined;
  today: string;
  /** Show the new drafts (switches the list to the Drafts tab). */
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const billable = useMemo(() => (unbilled?.customers ?? []).filter((c) => c.trip_ids.length > 0), [unbilled]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [vat, setVat] = useState(DEFAULT_VAT);
  const [running, setRunning] = useState<number | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(billable.map((c) => c.customer_id)));
    setInvoiceDate(today);
    setVat(DEFAULT_VAT);
    setResults(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const chosen = billable.filter((c) => selected.has(c.customer_id));
  const trips = chosen.reduce((n, c) => n + c.trip_ids.length, 0);
  const amount = chosen.reduce((n, c) => n + c.amount, 0);

  const create = async () => {
    const out: Result[] = [];
    for (let i = 0; i < chosen.length; i++) {
      setRunning(i);
      const c = chosen[i];
      try {
        const res = await financeService.createDraftInvoice({
          customerId: c.customer_id,
          invoice_date: invoiceDate,
          due_date: dueDateFor(invoiceDate, c.payment_terms),
          tax_rate: vat,
          tripIds: c.trip_ids,
        });
        out.push({ customer: c, ok: true, invoiceId: res.data?.id, ref: res.data?.ref_id });
      } catch (err: any) {
        out.push({ customer: c, ok: false, error: err?.response?.data?.error?.message || 'Could not create the draft' });
      }
    }
    setRunning(null);
    setResults(out);
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['trips'] });
  };

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <Sheet open={open} onOpenChange={(o) => running === null && onOpenChange(o)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b p-5">
          <SheetTitle className="text-base">Bill completed trips</SheetTitle>
          <SheetDescription className="text-xs">One draft invoice per customer with their completed trips. Review and issue them from the list.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {results ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {results.filter((r) => r.ok).length} of {results.length} drafts created
              </p>
              {results.map((r) => (
                <div key={r.customer.customer_id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    {r.ok ? <CheckCircle2 className={cn('size-4 shrink-0', TONE_CLASSES.positive.fg)} /> : <XCircle className={cn('size-4 shrink-0', TONE_CLASSES.negative.fg)} />}
                    <span className="truncate font-medium">{r.customer.customer_name}</span>
                    {r.error && <span className={TONE_CLASSES.negative.fg}>{r.error}</span>}
                  </span>
                  {r.invoiceId && (
                    <Link to={`/finance/invoices/${r.invoiceId}`} className="shrink-0 font-medium hover:underline">{r.ref} →</Link>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <>
              {(unbilled?.missing_amount_count ?? 0) > 0 && (
                <Alert>
                  <AlertTriangle className="size-4" />
                  <AlertDescription className="text-xs">
                    {unbilled?.missing_amount_count} completed trip{unbilled?.missing_amount_count === 1 ? ' has' : 's have'} no billing amount and can't be invoiced
                    until one is set on the trip.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rtb-date" className="text-xs">Invoice date</Label>
                  <Input id="rtb-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="h-9 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rtb-vat" className="text-xs">VAT %</Label>
                  <Input id="rtb-vat" type="number" min={0} max={100} value={vat} onChange={(e) => setVat(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} className="h-9 text-xs" />
                </div>
              </div>

              <div className="divide-y rounded-lg border">
                {billable.length === 0 && <p className="p-6 text-center text-xs text-muted-foreground">Every completed trip is already on an invoice.</p>}
                {billable.map((c) => (
                  <label key={c.customer_id} className="flex cursor-pointer items-center gap-3 p-3 text-xs hover:bg-muted/40">
                    <Checkbox checked={selected.has(c.customer_id)} onCheckedChange={(v) => toggle(c.customer_id, v === true)} />
                    <PartyAvatar name={c.customer_name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{c.customer_name}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {c.trip_ids.length} trip{c.trip_ids.length === 1 ? '' : 's'} · due {formatDate(dueDateFor(invoiceDate, c.payment_terms))}
                        {c.payment_terms ? ` (${c.payment_terms})` : ' (30 days)'}
                      </span>
                    </span>
                    <span className="fin-num font-medium text-foreground">{formatMoney(c.amount)}</span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Amounts are before VAT. The trips stay available to bill until the drafts are issued.</p>
            </>
          )}
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t p-4">
          {results ? (
            <Button
              onClick={() => {
                onOpenChange(false);
                onDone();
              }}
            >
              Review drafts
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running !== null}>Cancel</Button>
              <Button onClick={create} disabled={chosen.length === 0 || running !== null || !invoiceDate} className="bg-brand text-white hover:bg-brand-hover">
                {running !== null ? (
                  <>
                    <Loader2 className="mr-1 size-4 animate-spin" /> {running + 1} of {chosen.length}
                  </>
                ) : (
                  `Create ${chosen.length} draft${chosen.length === 1 ? '' : 's'} · ${trips} trips · SAR ${formatMoney(amount)}`
                )}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
