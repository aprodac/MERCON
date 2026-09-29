import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { formatDate, formatMoney } from '@/lib/finance/format';
import type { DraftIssue, DraftTotals } from '@/lib/finance/invoiceDraft';
import { cn } from '@/lib/utils';

export interface CustomerPosition {
  name: string;
  terms: string | null;
  /** Issued, not fully paid. */
  unpaid: number;
  overdue: number;
  unpaidCount: number;
  /** Open customer advances that can be applied once the invoice is issued. */
  advances: number;
  loading: boolean;
}

export interface PostingAccounts {
  receivable: string;
  revenue: string;
  vat: string;
}

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-2 px-4 py-3', className)}>
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value, className, strong }: { label: ReactNode; value: ReactNode; className?: string; strong?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 text-xs', className)}>
      <dt className="min-w-0 truncate text-muted-foreground">{label}</dt>
      <dd className={cn('fin-num shrink-0 text-foreground', strong ? 'font-semibold' : 'font-medium')}>{value}</dd>
    </div>
  );
}

/**
 * The side of the draft editor: what the invoice comes to, where the customer stands, what issuing
 * it will post to the ledger, and anything that needs fixing first.
 */
export function InvoiceEditorRail({
  totals,
  dueDate,
  dueInDays,
  customer,
  accounts,
  issues,
}: {
  totals: DraftTotals;
  dueDate: string;
  dueInDays: number | null;
  customer: CustomerPosition | null;
  accounts: PostingAccounts;
  issues: DraftIssue[];
}) {
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const hasLines = totals.tripCount + totals.manualCount > 0;

  return (
    <Card className="gap-0 divide-y divide-border/60 overflow-hidden rounded-xl py-0 shadow-xs">
      <section className="space-y-3 px-4 py-4">
        <div>
          <p className="text-[11px] font-medium text-muted-foreground">Invoice total</p>
          <p className="fin-num text-2xl font-semibold leading-tight text-foreground">
            <span className="mr-1 text-sm font-medium text-muted-foreground">SAR</span>
            {formatMoney(totals.total)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {dueDate ? (
              <>
                Due {formatDate(dueDate)}
                {dueInDays !== null && ` · ${dueInDays === 0 ? 'on receipt' : `${dueInDays} days after the invoice date`}`}
              </>
            ) : (
              'No due date'
            )}
          </p>
        </div>
        <dl className="space-y-1.5 border-t border-border/60 pt-3">
          <Row
            label={`${totals.tripCount} ${totals.tripCount === 1 ? 'trip' : 'trips'} · ${totals.manualCount} ${totals.manualCount === 1 ? 'charge' : 'charges'}`}
            value={formatMoney(totals.gross)}
          />
          {totals.discount > 0 && <Row label="Discount" value={`−${formatMoney(totals.discount)}`} />}
          <Row label="Subtotal before VAT" value={formatMoney(totals.subtotal)} />
          {totals.vat.length === 0 && <Row label="VAT" value={formatMoney(0)} />}
          {totals.vat.map((v) => (
            <Row
              key={v.rate}
              label={
                <>
                  VAT {v.rate}%{v.rate === 0 ? ' (zero-rated)' : ''} <span className="fin-num text-muted-foreground/80">on {formatMoney(v.taxable)}</span>
                </>
              }
              value={formatMoney(v.tax)}
            />
          ))}
          <Row label={<span className="font-medium text-foreground">Total</span>} value={formatMoney(totals.total)} strong className="border-t border-border/60 pt-1.5" />
        </dl>
      </section>

      {customer && (
        <Section title="Customer position">
          <dl className="space-y-1.5">
            <Row label="Payment terms" value={<span className="font-sans">{customer.terms || 'Not set'}</span>} />
            <Row
              label={`Open invoices${customer.unpaidCount ? ` (${customer.unpaidCount})` : ''}`}
              value={customer.loading ? '…' : formatMoney(customer.unpaid)}
            />
            <Row
              label="Overdue"
              value={customer.loading ? '…' : <span className={cn(customer.overdue > 0.005 && TONE_CLASSES.negative.fg)}>{formatMoney(customer.overdue)}</span>}
            />
            {customer.advances > 0.005 && (
              <Row
                label="Advances on account"
                value={<span className={TONE_CLASSES.positive.fg}>{formatMoney(customer.advances)}</span>}
              />
            )}
          </dl>
          {customer.advances > 0.005 && (
            <p className="text-[11px] text-muted-foreground">The advance can be applied to this invoice after it is issued.</p>
          )}
          {!customer.loading && customer.unpaid > 0.005 && (
            <p className="text-[11px] text-muted-foreground">
              After this invoice: <span className="fin-num font-medium text-foreground">SAR {formatMoney(customer.unpaid + totals.total)}</span> outstanding.
            </p>
          )}
        </Section>
      )}

      {hasLines && (
        <Section title="Posts when issued">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-muted-foreground">
                <th className="py-0.5 text-left font-normal">Account</th>
                <th className="py-0.5 text-right font-normal">Dr</th>
                <th className="py-0.5 text-right font-normal">Cr</th>
              </tr>
            </thead>
            <tbody className="fin-num">
              <tr>
                <td className="truncate py-0.5 pr-2 font-sans text-foreground">{accounts.receivable}</td>
                <td className="py-0.5 text-right">{formatMoney(totals.total)}</td>
                <td />
              </tr>
              <tr>
                <td className="truncate py-0.5 pr-2 pl-3 font-sans text-foreground">{accounts.revenue}</td>
                <td />
                <td className="py-0.5 text-right">{formatMoney(totals.subtotal)}</td>
              </tr>
              {totals.tax > 0.005 && (
                <tr>
                  <td className="truncate py-0.5 pr-2 pl-3 font-sans text-foreground">{accounts.vat}</td>
                  <td />
                  <td className="py-0.5 text-right">{formatMoney(totals.tax)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="text-[11px] text-muted-foreground">Saving a draft posts nothing.</p>
        </Section>
      )}

      <Section title="Checks">
        {issues.length === 0 ? (
          <p className={cn('flex items-center gap-1.5 text-xs font-medium', TONE_CLASSES.positive.fg)}>
            <CheckCircle2 className="size-3.5" /> Ready to save and issue
          </p>
        ) : (
          <ul className="space-y-1.5">
            {errors.map((i) => (
              <li key={i.message} className={cn('flex items-start gap-1.5 text-xs', TONE_CLASSES.negative.fg)}>
                <AlertCircle className="mt-px size-3.5 shrink-0" /> {i.message}
              </li>
            ))}
            {warnings.map((i) => (
              <li key={i.message} className={cn('flex items-start gap-1.5 text-xs', TONE_CLASSES.warning.fg)}>
                <AlertTriangle className="mt-px size-3.5 shrink-0" /> {i.message}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Card>
  );
}
