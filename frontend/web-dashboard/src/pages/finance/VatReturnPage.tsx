import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Info } from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PeriodControl } from '@/components/finance/kit/PeriodControl';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { financeService, type VatBox, type VatDoc } from '@/services/financeService';
import { resolvePeriodPreset, type PeriodPreset } from '@/lib/finance/pnlPeriodHelpers';
import { formatDate, formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';

const BOX_META: Record<VatBox, { no: string; label: string; hint: string }> = {
  standard_sales: { no: '1', label: 'Standard-rated sales (15%)', hint: 'Invoice lines with VAT' },
  zero_sales: { no: '3–4', label: 'Zero-rated sales and exports', hint: 'Invoice lines at 0%, e.g. international freight' },
  standard_purchases: { no: '7', label: 'Standard-rated purchases', hint: 'Approved bills with VAT' },
  no_vat_purchases: { no: '10–11', label: 'Purchases without VAT', hint: 'Approved bills with no VAT' },
};
const KIND_LINK: Record<VatDoc['kind'], (id: string) => string> = {
  invoice: (id) => `/finance/invoices/${id}`,
  credit_note: () => '/finance/invoices',
  bill: () => '/finance/bills',
};
const KIND_LABEL: Record<VatDoc['kind'], string> = { invoice: 'Invoice', credit_note: 'Credit note', bill: 'Bill' };

function csv(rows: VatDoc[]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ['Box', 'Document', 'Number', 'Date', 'Party', 'Amount', 'Adjustment', 'VAT'];
  return [head, ...rows.map((r) => [BOX_META[r.box].label, KIND_LABEL[r.kind], r.ref ?? '', r.date, r.party, r.amount, r.adjustment, r.vat])].map((r) => r.map(esc).join(',')).join('\n');
}

/**
 * VAT return for a period in the shape of the ZATCA return: sales boxes (with credit-note
 * adjustments), purchase boxes, and the net VAT to pay or reclaim. A box lists its documents.
 */
export default function VatReturnPage() {
  const [params, setParams] = useSearchParams();
  const preset = (params.get('preset') as PeriodPreset) || 'last_quarter';
  const range = preset === 'custom' ? { from: params.get('from') || '', to: params.get('to') || '' } : resolvePeriodPreset(preset);
  const [box, setBox] = useState<VatBox | null>(null);
  const q = useQuery({ queryKey: ['finance-reports', 'vat-return', range.from, range.to], queryFn: () => financeService.getVatReturn(range.from, range.to), enabled: Boolean(range.from && range.to) });
  const r = q.data;
  const payable = (r?.net_vat ?? 0) > 0.005;
  const refund = (r?.net_vat ?? 0) < -0.005;
  const docs = (r?.documents ?? []).filter((d) => !box || d.box === box);

  const download = () => {
    if (!r) return;
    const blob = new Blob([csv(r.documents)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vat-return-${r.from}-to-${r.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const Row = ({ b }: { b: VatBox }) => {
    const t = r?.boxes[b];
    return (
      <tr onClick={() => setBox(box === b ? null : b)} className={cn('cursor-pointer border-b border-border/60 hover:bg-muted/40', box === b && 'bg-muted/60')}>
        <td className="w-14 px-3 py-2 text-muted-foreground">{BOX_META[b].no}</td>
        <td className="px-3 py-2">
          <span className="font-medium text-foreground">{BOX_META[b].label}</span>
          <span className="block text-[11px] text-muted-foreground">{BOX_META[b].hint} · {t?.docs ?? 0} documents</span>
        </td>
        <td className="fin-num px-3 py-2 text-right">{t ? formatMoney(t.amount) : '…'}</td>
        <td className={cn('fin-num px-3 py-2 text-right', t && t.adjustment < 0 ? TONE_CLASSES.warning.fg : 'text-muted-foreground')}>{t ? (t.adjustment ? formatMoney(t.adjustment) : '—') : '…'}</td>
        <td className="fin-num px-3 py-2 text-right font-medium">{t ? formatMoney(t.vat) : '…'}</td>
      </tr>
    );
  };
  const Total = ({ label, amount, adjustment, vat }: { label: string; amount: number; adjustment?: number; vat: number }) => (
    <tr className="border-b bg-muted/30 font-semibold">
      <td />
      <td className="px-3 py-2">{label}</td>
      <td className="fin-num px-3 py-2 text-right">{formatMoney(amount)}</td>
      <td className="fin-num px-3 py-2 text-right">{adjustment ? formatMoney(adjustment) : '—'}</td>
      <td className="fin-num px-3 py-2 text-right">{formatMoney(vat)}</td>
    </tr>
  );

  return (
    <DashboardLayout active="finance" title="VAT return">
      <div className="mx-auto w-full max-w-5xl space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <PeriodControl preset={preset} from={range.from} to={range.to} onChange={({ preset: p, from, to }) => setParams({ ...(p !== 'last_quarter' ? { preset: p } : {}), ...(p === 'custom' ? { from, to } : {}) })} />
          <Button variant="outline" size="sm" className="ml-auto h-8 gap-1.5 text-xs" onClick={download} disabled={!r}>
            <Download className="size-3.5" /> Documents CSV
          </Button>
        </div>

        {/* What's owed for the period */}
        <Card className={cn('flex-row flex-wrap items-center gap-6 rounded-xl border p-4 shadow-xs', payable && cn(TONE_CLASSES.warning.bg, TONE_CLASSES.warning.border), refund && cn(TONE_CLASSES.positive.bg, TONE_CLASSES.positive.border))}>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">{refund ? 'VAT to reclaim' : 'Net VAT payable'} · {formatDate(range.from)} – {formatDate(range.to)}</p>
            {r ? (
              <p className={cn('fin-num text-3xl font-semibold', payable ? TONE_CLASSES.warning.fg : refund ? TONE_CLASSES.positive.fg : 'text-foreground')}>
                <span className="mr-1 text-base font-medium text-muted-foreground">SAR</span>
                {formatMoney(Math.abs(r.net_vat))}
              </p>
            ) : (
              <Skeleton className="mt-1 h-9 w-40" />
            )}
          </div>
          {r && (
            <div className="fin-num flex items-center gap-2 text-sm">
              <span><span className="block text-[11px] font-sans text-muted-foreground">Output VAT on sales</span>{formatMoney(r.sales.vat)}</span>
              <span className="text-muted-foreground">−</span>
              <span><span className="block text-[11px] font-sans text-muted-foreground">Input VAT on purchases</span>{formatMoney(r.purchases.vat)}</span>
            </div>
          )}
        </Card>

        <Card className="gap-0 overflow-hidden rounded-xl py-0 shadow-xs">
          <table className="w-full text-xs">
            <thead className="text-[11px] text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-medium">Box</th>
                <th className="px-3 py-2 text-left font-medium">Sales</th>
                <th className="px-3 py-2 text-right font-medium">Amount (SAR)</th>
                <th className="px-3 py-2 text-right font-medium">Adjustment</th>
                <th className="px-3 py-2 text-right font-medium">VAT</th>
              </tr>
            </thead>
            <tbody>
              <Row b="standard_sales" />
              <Row b="zero_sales" />
              {r && <Total label="Total sales" amount={r.sales.amount} adjustment={r.sales.adjustment} vat={r.sales.vat} />}
              <tr className="border-b text-[11px] text-muted-foreground">
                <td />
                <td className="px-3 pb-2 pt-4 font-medium" colSpan={4}>Purchases</td>
              </tr>
              <Row b="standard_purchases" />
              <Row b="no_vat_purchases" />
              {r && <Total label="Total purchases" amount={r.purchases.amount} vat={r.purchases.vat} />}
              {r && (
                <tr className="text-sm font-semibold">
                  <td />
                  <td className="px-3 py-2.5">Net VAT due</td>
                  <td colSpan={2} />
                  <td className={cn('fin-num px-3 py-2.5 text-right', payable ? TONE_CLASSES.warning.fg : refund ? TONE_CLASSES.positive.fg : '')}>{formatMoney(r.net_vat)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card className="gap-0 overflow-hidden rounded-xl py-0 shadow-xs">
          <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
            <span className="font-medium">{box ? BOX_META[box].label : 'All documents'} · {docs.length}</span>
            {box && (
              <button type="button" onClick={() => setBox(null)} className="text-muted-foreground hover:text-foreground">
                Show all
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-xs">
              <tbody>
                {docs.length === 0 && (
                  <tr>
                    <td className="px-3 py-8 text-center text-muted-foreground">{q.isLoading ? 'Loading…' : 'No documents in this period.'}</td>
                  </tr>
                )}
                {docs.map((d) => (
                  <tr key={`${d.box}:${d.kind}:${d.id}`} className="border-b border-border/60">
                    <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{formatDate(d.date)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <Link to={KIND_LINK[d.kind](d.id)} className="font-medium text-foreground hover:underline">{d.ref ?? KIND_LABEL[d.kind]}</Link>
                      <span className="ml-1.5 text-[11px] text-muted-foreground">{KIND_LABEL[d.kind]}</span>
                    </td>
                    <td className="max-w-[240px] truncate px-3 py-1.5">{d.party}</td>
                    <td className="fin-num px-3 py-1.5 text-right">{formatMoney(d.amount || d.adjustment)}</td>
                    <td className={cn('fin-num px-3 py-1.5 text-right font-medium', d.vat < 0 && TONE_CLASSES.warning.fg)}>{formatMoney(d.vat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" />
          Built from issued invoices, credit notes and approved bills dated in the period; voided documents don't count. Expenses have no VAT field, so VAT paid on them isn't here. Check the figures with your accountant before filing with ZATCA.
        </p>
      </div>
    </DashboardLayout>
  );
}
