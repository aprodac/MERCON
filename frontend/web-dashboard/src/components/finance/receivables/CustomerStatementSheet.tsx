import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import ExportModal, { type ExportColumn } from '@/components/ui/ExportModal';
import { SegmentedControl } from '@/components/finance/kit/SegmentedControl';
import { financeService, type CustomerStatementLine } from '@/services/financeService';
import { settingsService } from '@/services/settingsService';
import { toDateOnly } from '@/lib/finance/ageing';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { printElement } from '@/lib/share';
import { cn } from '@/lib/utils';

type Period = 'month' | 'last_month' | 'quarter' | 'year' | 'custom';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'quarter', label: 'This quarter' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom' },
];

const utc = (y: number, m: number, d: number) => toDateOnly(new Date(Date.UTC(y, m, d)));

/** Date range for a preset, ending at `asOf` for the current periods. */
function periodRange(period: Exclude<Period, 'custom'>, asOf: string) {
  const [y, m] = asOf.split('-').map(Number);
  const month = m - 1;
  if (period === 'last_month') return { from: utc(y, month - 1, 1), to: utc(y, month, 0) };
  if (period === 'quarter') return { from: utc(y, Math.floor(month / 3) * 3, 1), to: asOf };
  if (period === 'year') return { from: utc(y, 0, 1), to: asOf };
  return { from: utc(y, month, 1), to: asOf };
}

const TYPE_LABEL: Record<CustomerStatementLine['type'], string> = {
  Invoice: 'Invoice',
  Payment: 'Payment',
  AdvanceApplied: 'Advance applied',
  InvoiceVoided: 'Invoice voided',
};

const exportColumns: ExportColumn<CustomerStatementLine>[] = [
  { id: 'date', label: 'Date', accessor: (l) => formatDate(l.date) },
  { id: 'type', label: 'Type', accessor: (l) => TYPE_LABEL[l.type] },
  { id: 'ref', label: 'Reference', accessor: (l) => l.ref ?? '' },
  { id: 'description', label: 'Description', accessor: (l) => l.description },
  {
    id: 'debit',
    label: 'Debit (SAR)',
    accessor: (l) => (l.debit ? formatMoney(l.debit) : ''),
  },
  {
    id: 'credit',
    label: 'Credit (SAR)',
    accessor: (l) => (l.credit ? formatMoney(l.credit) : ''),
  },
  {
    id: 'balance',
    label: 'Balance (SAR)',
    accessor: (l) => formatMoney(l.running_balance),
  },
];

const AGEING_COLUMNS = [
  { key: 'current', label: 'Current' },
  { key: 'days_1_30', label: '1–30' },
  { key: 'days_31_60', label: '31–60' },
  { key: 'days_61_90', label: '61–90' },
  { key: 'days_90_plus', label: '90+' },
  { key: 'total', label: 'Total due' },
] as const;

const cell = 'px-2.5 py-1.5 text-xs';

/** Statement of account for one customer: opening balance, every movement with a running balance, ageing at the end date. */
export function CustomerStatementSheet({
  open,
  onOpenChange,
  customerId,
  asOf,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | null;
  asOf: string;
}) {
  const docRef = useRef<HTMLDivElement>(null);
  const [period, setPeriod] = useState<Period>('quarter');
  const [custom, setCustom] = useState(() => periodRange('quarter', asOf));
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (open) setCustom(periodRange('quarter', asOf));
  }, [open, asOf]);

  const range = period === 'custom' ? custom : periodRange(period, asOf);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['finance-reports', 'customer-statement', customerId, range.from, range.to],
    queryFn: () =>
      financeService.getCustomerStatementLedger({
        customer_id: customerId as string,
        date_from: range.from,
        date_to: range.to,
      }),
    enabled: open && Boolean(customerId) && range.from <= range.to,
  });
  const { data: company } = useQuery({
    queryKey: ['settings', 'public'],
    queryFn: () => settingsService.getPublic(),
    enabled: open,
  });

  const statement = data?.data;
  const title = statement ? `Statement — ${statement.customer.name}` : 'Statement of account';

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl">
          <SheetHeader className="border-b p-5">
            <SheetTitle className="text-base">Statement of account</SheetTitle>
            <SheetDescription className="text-xs">Every invoice, payment and credit in the period, with a running balance.</SheetDescription>
          </SheetHeader>

          <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
            <SegmentedControl aria-label="Statement period" value={period} onChange={setPeriod} options={PERIODS} />
            {period === 'custom' && (
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  aria-label="From"
                  value={custom.from}
                  onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                  className="h-8 w-36 text-xs"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  aria-label="To"
                  value={custom.to}
                  onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                  className="h-8 w-36 text-xs"
                />
              </div>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" disabled={!statement} onClick={() => setExportOpen(true)}>
                <Download className="size-3.5" /> Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={!statement}
                onClick={() => docRef.current && printElement(docRef.current, title)}
              >
                <Printer className="size-3.5" /> Print
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-muted/40 p-5">
            {isLoading ? (
              <div className="space-y-2 rounded-xl bg-card p-6">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : isError || !statement ? (
              <p className="rounded-xl border border-dashed bg-card p-8 text-center text-xs text-muted-foreground">
                {range.from > range.to ? 'The start date is after the end date.' : 'Could not load the statement.'}
              </p>
            ) : (
              <div ref={docRef} className="mx-auto max-w-[210mm] space-y-5 rounded-xl border bg-card p-8 text-foreground shadow-xs">
                <header className="flex items-start justify-between gap-6 border-b pb-4">
                  <div>
                    <p className="text-sm font-semibold">{company?.companyLegalName || company?.appName}</p>
                    {company?.vatNumber && <p className="text-[11px] text-muted-foreground">VAT {company.vatNumber}</p>}
                    {company?.crNumber && <p className="text-[11px] text-muted-foreground">CR {company.crNumber}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-base font-semibold tracking-tight">Statement of account</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(statement.date_from)} – {formatDate(statement.date_to)}
                    </p>
                  </div>
                </header>

                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Customer</p>
                    <Link to={`/customers/${statement.customer.id}`} className="text-sm font-semibold hover:underline">
                      {statement.customer.name}
                    </Link>
                    {statement.customer.phone && <p className="text-[11px] text-muted-foreground">{statement.customer.phone}</p>}
                    {statement.customer.payment_terms && (
                      <p className="text-[11px] text-muted-foreground">Terms: {statement.customer.payment_terms}</p>
                    )}
                  </div>
                  <div className="rounded-lg border px-4 py-2 text-right">
                    <p className="text-[11px] text-muted-foreground">Balance due</p>
                    <p className="fin-num text-lg font-semibold">SAR {formatMoney(statement.closing_balance)}</p>
                  </div>
                </div>

                <div className="table-container overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse">
                    <thead>
                      <tr className="border-y bg-muted/60 text-left">
                        <th className={cn(cell, 'font-semibold')}>Date</th>
                        <th className={cn(cell, 'font-semibold')}>Details</th>
                        <th className={cn(cell, 'text-right font-semibold')}>Debit</th>
                        <th className={cn(cell, 'text-right font-semibold')}>Credit</th>
                        <th className={cn(cell, 'text-right font-semibold')}>Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      <tr>
                        <td className={cn(cell, 'text-muted-foreground')}>{formatDate(statement.date_from)}</td>
                        <td className={cn(cell, 'font-medium')}>Opening balance</td>
                        <td className={cell} />
                        <td className={cell} />
                        <td className={cn(cell, 'fin-num text-right font-medium')}>{formatMoney(statement.opening_balance)}</td>
                      </tr>
                      {statement.lines.map((l, i) => (
                        <tr key={`${l.document_id}-${l.type}-${i}`}>
                          <td className={cn(cell, 'whitespace-nowrap text-muted-foreground')}>{formatDate(l.date)}</td>
                          <td className={cell}>
                            <span className="font-medium">{TYPE_LABEL[l.type]}</span>
                            {l.ref && <span className="text-muted-foreground"> · {l.ref}</span>}
                            {l.description && <p className="text-[11px] text-muted-foreground">{l.description}</p>}
                          </td>
                          <td className={cn(cell, 'fin-num text-right')}>{l.debit ? formatMoney(l.debit) : ''}</td>
                          <td className={cn(cell, 'fin-num text-right')}>{l.credit ? formatMoney(l.credit) : ''}</td>
                          <td className={cn(cell, 'fin-num text-right')}>{formatMoney(l.running_balance)}</td>
                        </tr>
                      ))}
                      {statement.lines.length === 0 && (
                        <tr>
                          <td colSpan={5} className={cn(cell, 'py-4 text-center text-muted-foreground')}>
                            No movements in this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-foreground/70 font-semibold">
                        <td className={cell} colSpan={2}>
                          Closing balance
                        </td>
                        <td className={cn(cell, 'fin-num text-right')}>{formatMoney(statement.total_debit)}</td>
                        <td className={cn(cell, 'fin-num text-right')}>{formatMoney(statement.total_credit)}</td>
                        <td className={cn(cell, 'fin-num text-right')}>{formatMoney(statement.closing_balance)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Ageing as of {formatDate(statement.date_to)}</p>
                  <div className="grid grid-cols-3 overflow-hidden rounded-lg border sm:grid-cols-6">
                    {AGEING_COLUMNS.map((c) => (
                      <div key={c.key} className={cn('border-r px-2.5 py-1.5 last:border-r-0', c.key === 'total' && 'bg-muted/60')}>
                        <p className="text-[10px] text-muted-foreground">{c.label}</p>
                        <p className="fin-num text-xs font-semibold">{formatMoney(statement.ageing[c.key])}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {statement.unapplied_advances > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    You also have <span className="fin-num font-medium text-foreground">SAR {formatMoney(statement.unapplied_advances)}</span> in
                    advance payments with us, not yet applied to invoices.
                  </p>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {statement && (
        <ExportModal
          isOpen={exportOpen}
          onClose={() => setExportOpen(false)}
          title={title}
          subtitle={`${formatDate(statement.date_from)} – ${formatDate(statement.date_to)} · opening ${formatMoney(statement.opening_balance)} · closing ${formatMoney(statement.closing_balance)}`}
          data={statement.lines}
          columns={exportColumns}
          fileNamePrefix={`Statement_${statement.customer.name.replace(/\W+/g, '_')}_${statement.date_to}`}
        />
      )}
    </>
  );
}
