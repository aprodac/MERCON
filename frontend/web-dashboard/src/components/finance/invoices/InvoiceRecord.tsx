import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileCheck2, FilePlus2, HandCoins, Pencil, Send, Trash2, Truck, XCircle, type LucideIcon } from 'lucide-react';
import type { Invoice } from '@mercon/shared-types';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { JournalLinesTable } from '@/components/finance/kit/JournalLinesTable';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { financeService, type InvoiceActivity } from '@/services/financeService';
import { dueText, invoiceState, paidShare } from '@/lib/finance/invoices';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';
import { InvoiceActions, InvoiceStateChip } from './InvoiceActions';
import type { InvoiceCommand } from './useInvoiceWorkflow';

const n = (v: number | string | null | undefined) => Number(v ?? 0);

const ACTIVITY: Record<string, { label: string; icon: LucideIcon; tone?: keyof typeof TONE_CLASSES }> = {
  INVOICE_DRAFT_CREATED: { label: 'Draft created', icon: FilePlus2 },
  INVOICE_DRAFT_UPDATED: { label: 'Draft edited', icon: Pencil },
  INVOICE_ISSUED: { label: 'Issued', icon: FileCheck2, tone: 'info' },
  INVOICE_PAYMENT_RECORDED: { label: 'Payment recorded', icon: HandCoins, tone: 'positive' },
  INVOICE_SENT: { label: 'Sent', icon: Send, tone: 'violet' },
  INVOICE_VOIDED: { label: 'Voided', icon: XCircle, tone: 'negative' },
  INVOICE_DRAFT_DELETED: { label: 'Draft deleted', icon: Trash2, tone: 'negative' },
};
const CHANNEL: Record<string, string> = { whatsapp: 'by WhatsApp', email: 'by email', copy: 'message copied', download: 'PDF downloaded', print: 'printed' };

export const invoiceDetailKey = (id: string) => ['invoices', 'detail', id];

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="truncate text-xs font-medium text-foreground">{children}</div>
    </div>
  );
}

function ActivityList({ id }: { id: string }) {
  const { data, isLoading } = useQuery({ queryKey: ['invoices', 'activity', id], queryFn: () => financeService.getInvoiceActivity(id) });
  const items: InvoiceActivity[] = data?.data ?? [];
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (items.length === 0) return <p className="py-6 text-center text-xs text-muted-foreground">No activity recorded yet.</p>;
  return (
    <ol className="space-y-3">
      {items.map((a) => {
        const meta = ACTIVITY[a.action] ?? { label: a.action.replace(/_/g, ' ').toLowerCase(), icon: FilePlus2 };
        const tone = meta.tone ? TONE_CLASSES[meta.tone] : null;
        return (
          <li key={a.id} className="flex gap-3 text-xs">
            <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full border', tone ? cn(tone.bg, tone.fg, tone.border) : 'bg-muted text-muted-foreground')}>
              <meta.icon className="size-3.5" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="font-medium text-foreground">
                {meta.label}
                {a.details.channel && <span className="font-normal text-muted-foreground"> {CHANNEL[a.details.channel] ?? a.details.channel}</span>}
                {a.action === 'INVOICE_PAYMENT_RECORDED' && a.details.amount !== undefined && <span className="fin-num font-normal"> · SAR {formatMoney(a.details.amount)}</span>}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {formatDate(a.at)} {new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {a.by && ` · ${a.by}`}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * One invoice: who and how much, what to do next, then Details / Payments / Activity / Accounting.
 * Used in the list's side panel and on the invoice page.
 */
export function InvoiceRecord({
  id,
  today,
  run,
  busy,
  headerExtra,
}: {
  id: string;
  today: string;
  run: (command: InvoiceCommand, invoice: Invoice) => void;
  busy?: boolean;
  /** e.g. an "Open full page" link in the side panel. */
  headerExtra?: ReactNode;
}) {
  const { data, isLoading, isError } = useQuery({ queryKey: invoiceDetailKey(id), queryFn: () => financeService.getInvoiceById(id) });
  const inv: Invoice | undefined = data?.data;

  if (isLoading) {
    return (
      <div className="space-y-3 p-5">
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    );
  }
  if (isError || !inv) return <p className="p-8 text-center text-xs text-muted-foreground">This invoice could not be loaded.</p>;

  const state = invoiceState(inv, today);
  const paid = paidShare(inv);
  const payments = inv.payments ?? [];
  const lines = inv.lines ?? [];
  const je = inv.journalEntry;
  const overdue = state === 'overdue';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="fin-num text-base font-semibold">{inv.ref_id ?? inv.id.slice(0, 8)}</h2>
          <InvoiceStateChip invoice={inv} today={today} />
          <span className={cn('text-xs', overdue ? TONE_CLASSES.negative.fg : 'text-muted-foreground')}>{dueText(inv, today)}</span>
          <span className="ml-auto">{headerExtra}</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link to={`/customers/${inv.customerId}`} className="text-sm font-medium text-foreground hover:underline">{inv.customer?.name}</Link>
            <p className="fin-num text-xl font-semibold leading-tight">
              <span className="mr-1 text-xs font-medium text-muted-foreground">SAR</span>
              {formatMoney(state === 'paid' || state === 'draft' || state === 'void' ? inv.total_amount : inv.balance_due)}
              {(state === 'part_paid' || (overdue && paid > 0)) && <span className="ml-1.5 text-xs font-normal text-muted-foreground">left of {formatMoney(inv.total_amount)}</span>}
            </p>
            {n(inv.total_amount) > 0 && state !== 'draft' && state !== 'void' && (
              <div className="mt-1.5 h-1.5 w-48 overflow-hidden rounded-full bg-muted" title={`${paid.toFixed(0)}% paid`}>
                <div className={cn('h-full rounded-full', TONE_CLASSES.positive.dot)} style={{ width: `${paid}%` }} />
              </div>
            )}
          </div>
          <InvoiceActions invoice={inv} today={today} run={run} busy={busy} />
        </div>
      </div>

      <Tabs defaultValue="details" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="mx-5 mt-3 h-8 w-fit">
          <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
          <TabsTrigger value="payments" className="text-xs">Payments {payments.length > 0 && <span className="ml-1 text-muted-foreground">{payments.length}</span>}</TabsTrigger>
          <TabsTrigger value="activity" className="text-xs">Activity</TabsTrigger>
          <TabsTrigger value="accounting" className="text-xs">Accounting</TabsTrigger>
        </TabsList>

        <div className="table-container min-h-0 flex-1 overflow-y-auto p-5">
          <TabsContent value="details" className="mt-0 space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Info label="Invoice date">{formatDate(inv.invoice_date)}</Info>
              <Info label="Due date">{inv.due_date ? formatDate(inv.due_date) : '—'}</Info>
              <Info label="Terms">{inv.customer?.payment_terms || '—'}</Info>
              <Info label="VAT rate">{n(inv.tax_rate)}%</Info>
            </div>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">Rate</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2">
                        <p className="text-foreground">{l.description}</p>
                        {l.trip && (
                          <Link to={`/trips/${l.trip.id}`} className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline">
                            <Truck className="size-3" /> {l.trip.ref_id}
                            {l.trip.awb_number && ` · AWB ${l.trip.awb_number}`}
                          </Link>
                        )}
                      </td>
                      <td className="fin-num px-3 py-2 text-right">{Number(l.quantity)}</td>
                      <td className="fin-num px-3 py-2 text-right">{formatMoney(l.rate)}</td>
                      <td className="fin-num px-3 py-2 text-right text-foreground">{formatMoney(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="ml-auto w-full max-w-64 space-y-1 text-xs">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="fin-num">{formatMoney(inv.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">VAT {n(inv.tax_rate)}%</dt><dd className="fin-num">{formatMoney(inv.tax_amount)}</dd></div>
              <div className="flex justify-between border-t pt-1 font-semibold"><dt>Total</dt><dd className="fin-num">{formatMoney(inv.total_amount)}</dd></div>
              {n(inv.paid_amount) > 0 && (
                <div className={cn('flex justify-between', TONE_CLASSES.positive.fg)}><dt>Paid</dt><dd className="fin-num">−{formatMoney(inv.paid_amount)}</dd></div>
              )}
              {state !== 'draft' && state !== 'void' && (
                <div className={cn('flex justify-between font-semibold', overdue && TONE_CLASSES.negative.fg)}><dt>Balance due</dt><dd className="fin-num">{formatMoney(inv.balance_due)}</dd></div>
              )}
            </dl>
          </TabsContent>

          <TabsContent value="payments" className="mt-0">
            {payments.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {state === 'draft' ? 'Issue the invoice before recording payments.' : 'No payments recorded yet.'}
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {payments.map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <div>
                      <p className="font-medium text-foreground">{formatDate(p.payment_date)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {[p.payment_method, p.reference, p.account ? `into ${p.account.name}` : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className={cn('fin-num font-semibold', TONE_CLASSES.positive.fg)}>{formatMoney(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="activity" className="mt-0">
            <ActivityList id={inv.id} />
          </TabsContent>

          <TabsContent value="accounting" className="mt-0 space-y-2">
            {je ? (
              <>
                <JournalLinesTable variant="posted" title={`Posted when issued · ${formatDate(je.entry_date)}`} lines={je.lines as any} />
                <Link to={`/finance/journal-entries/${je.id}`} className="inline-block text-xs font-medium text-foreground hover:underline">
                  Open journal entry {je.ref_id ?? ''} →
                </Link>
              </>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Nothing posted yet. Issuing posts the invoice to the ledger; the journal entry shows up here.
              </p>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
