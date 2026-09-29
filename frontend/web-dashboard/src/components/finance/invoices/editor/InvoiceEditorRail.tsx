import type { ComponentType, ReactNode } from 'react';
import { AlertCircle, AlertTriangle, BookOpenCheck, Building2, CalendarClock, CheckCircle2, ListChecks, Scale } from 'lucide-react';

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

// What each figure is, the same colour in the split bar, the rows and the posting
const REVENUE = TONE_CLASSES.info;
const VAT = TONE_CLASSES.orange;
const DEBIT = TONE_CLASSES.positive;
const CREDIT = TONE_CLASSES.negative;

function Section({ title, icon: Icon, aside, children, className }: { title: string; icon: ComponentType<{ className?: string }>; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-2 px-4 py-3', className)}>
      <h3 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {title}
        {aside && <span className="ml-auto normal-case tracking-normal">{aside}</span>}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value, dot, className, strong }: { label: ReactNode; value: ReactNode; dot?: string; className?: string; strong?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 text-xs', className)}>
      <dt className="flex min-w-0 items-center gap-1.5 truncate text-muted-foreground">
        {dot && <span className={cn('size-1.5 shrink-0 rounded-full', dot)} />}
        {label}
      </dt>
      <dd className={cn('fin-num shrink-0 text-foreground', strong ? 'font-semibold' : 'font-medium')}>{value}</dd>
    </div>
  );
}

/**
 * The side of the draft editor: what the invoice comes to, where the customer stands, what issuing
 * it will post to the ledger, and anything that needs fixing first. The coloured rule on top is the
 * draft's state: green ready, amber warnings, red blocked.
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
  const state = errors.length ? CREDIT : warnings.length ? TONE_CLASSES.warning : hasLines ? DEBIT : TONE_CLASSES.neutral;
  const vatShare = totals.total > 0.005 ? Math.min(100, Math.max(0, (totals.tax / totals.total) * 100)) : 0;
  const debits = totals.total;
  const credits = totals.subtotal + totals.tax;
  const balanced = Math.abs(debits - credits) < 0.005;

  return (
    <Card className="gap-0 divide-y divide-border/60 overflow-hidden rounded-xl py-0 shadow-xs">
      <div className={cn('h-1 w-full', state.dot)} aria-hidden="true" />
      <section className="space-y-3 px-4 py-4">
        <div>
          <p className="text-[11px] font-medium text-muted-foreground">Invoice total</p>
          <p className="fin-num text-2xl font-semibold leading-tight text-foreground">
            <span className="mr-1 text-sm font-medium text-muted-foreground">SAR</span>
            {formatMoney(totals.total)}
          </p>
          <p className={cn('mt-1.5 inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px]', dueDate ? cn(TONE_CLASSES.neutral.bg, TONE_CLASSES.neutral.fg, TONE_CLASSES.neutral.border) : cn(TONE_CLASSES.warning.bg, TONE_CLASSES.warning.fg, TONE_CLASSES.warning.border))}>
            <CalendarClock className="size-3" />
            {dueDate ? (
              <>
                Due {formatDate(dueDate)}
                {dueInDays !== null && <span className="opacity-80">· {dueInDays === 0 ? 'on receipt' : `${dueInDays} days`}</span>}
              </>
            ) : (
              'No due date'
            )}
          </p>
        </div>

        {/* What the total is made of: freight vs VAT */}
        {totals.total > 0.005 && (
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted" title={`Freight ${formatMoney(totals.subtotal)} · VAT ${formatMoney(totals.tax)}`}>
            <div className={REVENUE.dot} style={{ width: `${100 - vatShare}%` }} />
            <div className={VAT.dot} style={{ width: `${vatShare}%` }} />
          </div>
        )}

        <dl className="space-y-1.5">
          <Row
            label={`${totals.tripCount} ${totals.tripCount === 1 ? 'trip' : 'trips'} · ${totals.manualCount} ${totals.manualCount === 1 ? 'charge' : 'charges'}`}
            value={formatMoney(totals.gross)}
          />
          {totals.discount > 0 && <Row label="Discount" value={<span className={CREDIT.fg}>−{formatMoney(totals.discount)}</span>} />}
          <Row label="Subtotal before VAT" value={formatMoney(totals.subtotal)} dot={REVENUE.dot} />
          {totals.vat.length === 0 && <Row label="VAT" value={formatMoney(0)} dot={VAT.dot} />}
          {totals.vat.map((v) => (
            <Row
              key={v.rate}
              dot={VAT.dot}
              label={
                <>
                  VAT {v.rate}%{v.rate === 0 ? ' (zero-rated)' : ''} <span className="fin-num text-muted-foreground/80">on {formatMoney(v.taxable)}</span>
                </>
              }
              value={formatMoney(v.tax)}
            />
          ))}
          <Row label={<span className="font-semibold text-foreground">Total</span>} value={formatMoney(totals.total)} strong className="border-t border-border/60 pt-1.5 text-[13px]" />
        </dl>
      </section>

      {customer && (
        <Section title="Customer position" icon={Building2}>
          <dl className="space-y-1.5">
            <Row
              label="Payment terms"
              value={customer.terms ? <span className="font-sans">{customer.terms}</span> : <span className={cn('font-sans', TONE_CLASSES.warning.fg)}>Not set</span>}
            />
            <Row
              label={`Open invoices${customer.unpaidCount ? ` (${customer.unpaidCount})` : ''}`}
              value={customer.loading ? '…' : formatMoney(customer.unpaid)}
            />
            <Row
              label="Overdue"
              dot={customer.loading ? undefined : customer.overdue > 0.005 ? CREDIT.dot : DEBIT.dot}
              value={customer.loading ? '…' : <span className={customer.overdue > 0.005 ? cn('font-semibold', CREDIT.fg) : DEBIT.fg}>{formatMoney(customer.overdue)}</span>}
            />
            {customer.advances > 0.005 && (
              <Row label="Advances on account" dot={DEBIT.dot} value={<span className={DEBIT.fg}>{formatMoney(customer.advances)}</span>} />
            )}
          </dl>
          {customer.advances > 0.005 && <p className="text-[11px] text-muted-foreground">The advance can be applied to this invoice after it is issued.</p>}
          {!customer.loading && customer.unpaid > 0.005 && (
            <p className="text-[11px] text-muted-foreground">
              After this invoice: <span className="fin-num font-medium text-foreground">SAR {formatMoney(customer.unpaid + totals.total)}</span> outstanding.
            </p>
          )}
        </Section>
      )}

      {hasLines && (
        <Section
          title="Posts when issued"
          icon={BookOpenCheck}
          aside={
            <span className={cn('flex items-center gap-1 text-[11px]', balanced ? DEBIT.fg : CREDIT.fg)} title="Debits equal credits">
              <Scale className="size-3" /> {balanced ? 'Balanced' : 'Not balanced'}
            </span>
          }
        >
          <table className="w-full table-fixed text-xs">
            <thead>
              <tr className="text-[11px]">
                <th className="py-0.5 text-left font-normal text-muted-foreground">Account</th>
                <th className={cn('w-[5.5rem] py-0.5 text-right font-medium', DEBIT.fg)}>Dr</th>
                <th className={cn('w-[5.5rem] py-0.5 text-right font-medium', CREDIT.fg)}>Cr</th>
              </tr>
            </thead>
            <tbody className="fin-num">
              <tr>
                <td className="truncate py-0.5 pr-2 font-sans text-foreground" title={accounts.receivable}>{accounts.receivable}</td>
                <td className={cn('py-0.5 text-right font-medium', DEBIT.fg)}>{formatMoney(debits)}</td>
                <td />
              </tr>
              <tr>
                <td className="truncate py-0.5 pr-2 pl-3 font-sans text-foreground" title={accounts.revenue}>
                  <span className={cn('mr-1.5 inline-block size-1.5 rounded-full align-middle', REVENUE.dot)} />
                  {accounts.revenue}
                </td>
                <td />
                <td className={cn('py-0.5 text-right font-medium', CREDIT.fg)}>{formatMoney(totals.subtotal)}</td>
              </tr>
              {totals.tax > 0.005 && (
                <tr>
                  <td className="truncate py-0.5 pr-2 pl-3 font-sans text-foreground" title={accounts.vat}>
                    <span className={cn('mr-1.5 inline-block size-1.5 rounded-full align-middle', VAT.dot)} />
                    {accounts.vat}
                  </td>
                  <td />
                  <td className={cn('py-0.5 text-right font-medium', CREDIT.fg)}>{formatMoney(totals.tax)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="text-[11px] text-muted-foreground">Saving a draft posts nothing.</p>
        </Section>
      )}

      <Section title="Checks" icon={ListChecks}>
        {issues.length === 0 ? (
          <p className={cn('flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium', DEBIT.bg, DEBIT.fg, DEBIT.border)}>
            <CheckCircle2 className="size-4" /> Ready to save and issue
          </p>
        ) : (
          <ul className="space-y-1.5">
            {errors.map((i) => (
              <li key={i.message} className={cn('flex items-start gap-1.5 rounded-md border px-2.5 py-1.5 text-xs', CREDIT.bg, CREDIT.fg, CREDIT.border)}>
                <AlertCircle className="mt-px size-3.5 shrink-0" /> {i.message}
              </li>
            ))}
            {warnings.map((i) => (
              <li key={i.message} className={cn('flex items-start gap-1.5 rounded-md border px-2.5 py-1.5 text-xs', TONE_CLASSES.warning.bg, TONE_CLASSES.warning.fg, TONE_CLASSES.warning.border)}>
                <AlertTriangle className="mt-px size-3.5 shrink-0" /> {i.message}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Card>
  );
}
