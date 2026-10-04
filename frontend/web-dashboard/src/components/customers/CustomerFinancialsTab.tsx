import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, FileText, ReceiptText, TriangleAlert, Wallet } from 'lucide-react';

import type { CustomerStatementData, CustomerStatementInvoice } from '@/services/customerService';
import { Button } from '@/components/ui/button';
import { useDeploymentTimezone } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { fmtDate } from '@/components/details/DetailKit';
import { Badge, Count, EmptyRow, Section, SkeletonRows, StatCell, ui, type UiTone } from '@/components/customers/customerUi';

const STATUS: Record<CustomerStatementInvoice['status'], { tone: UiTone; label: string }> = {
  Draft: { tone: 'slate', label: 'Draft' },
  Issued: { tone: 'blue', label: 'Issued' },
  PartiallyPaid: { tone: 'amber', label: 'Part paid' },
  Paid: { tone: 'emerald', label: 'Paid' },
  Void: { tone: 'slate', label: 'Void' },
};

// Borders between the four figures: 2 × 2 on phones, one row from md.
const CELL_BORDER = ['', 'border-l', 'border-t md:border-t-0 md:border-l', 'border-l border-t md:border-t-0'];

/** Customer → Invoices: what they were billed, what they paid, what they still owe. */
export default function CustomerFinancialsTab({
  customerId,
  statement,
  isLoading,
  overdueAmount,
  financeEnabled,
  onOpenStatement,
}: {
  customerId: string;
  statement?: CustomerStatementData;
  isLoading: boolean;
  overdueAmount: number;
  financeEnabled: boolean;
  onOpenStatement: () => void;
}) {
  const navigate = useNavigate();
  const tz = useDeploymentTimezone();
  const today = new Date().toISOString().slice(0, 10);

  const invoiced = statement?.total_invoiced ?? 0;
  const paid = statement?.total_paid ?? 0;
  const paidPct = invoiced > 0 ? Math.min(100, Math.round((paid / invoiced) * 100)) : 0;
  const money = (v: number) => (isLoading ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 0 }));
  const status = (inv: CustomerStatementInvoice) => {
    const isOverdue = (inv.status === 'Issued' || inv.status === 'PartiallyPaid') && !!inv.due_date && inv.due_date.slice(0, 10) < today;
    return { isOverdue, ...(isOverdue ? { tone: 'rose' as UiTone, label: 'Overdue' } : STATUS[inv.status] ?? { tone: 'slate' as UiTone, label: inv.status }) };
  };

  const cells = [
    <StatCell key="inv" label="Invoiced" icon={FileText} unit="SAR" value={money(invoiced)} sub="all time" />,
    <StatCell key="paid" label="Paid" icon={CheckCircle2} unit="SAR" value={money(paid)} sub={`${paidPct}% collected`} subTone={paidPct === 100 && invoiced > 0 ? 'emerald' : undefined} />,
    <StatCell key="owed" label="Outstanding" icon={Wallet} unit="SAR" value={money(statement?.total_outstanding ?? 0)} sub="to collect" />,
    <StatCell key="late" label="Overdue" icon={TriangleAlert} unit="SAR" value={money(overdueAmount)} sub={overdueAmount > 0 ? 'past due date' : 'nothing past due'} subTone={overdueAmount > 0 ? 'rose' : undefined} />,
  ];

  return (
    <Section
      title="Invoices"
      meta={statement ? <Count>{statement.invoices.length}</Count> : undefined}
      action={
        financeEnabled ? (
          <>
            <Button variant="outline" size="sm" onClick={onOpenStatement} className={ui.btnSm}>
              <ReceiptText /> Statement of account
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/finance/invoices?customer=${customerId}`)} className={cn(ui.btnSm, 'text-slate-600')}>
              Open in Invoices <ArrowUpRight />
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4">
        {cells.map((cell, i) => (
          <div key={i} className={cn('min-w-0 border-slate-100 dark:border-slate-800', CELL_BORDER[i])}>{cell}</div>
        ))}
      </div>
      <div className="h-1 bg-slate-100 dark:bg-slate-800" title={`${paidPct}% of the invoiced amount collected`}>
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${paidPct}%` }} />
      </div>

      {isLoading ? (
        <SkeletonRows rows={4} />
      ) : !statement?.invoices?.length ? (
        <EmptyRow icon={ReceiptText}>No invoices yet — invoices raised for this customer show up here.</EmptyRow>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className={ui.thead}>
              <tr>
                <th className={cn(ui.thc, 'pl-4')}>Invoice</th>
                <th className={ui.thc}>Date</th>
                <th className={ui.thc}>Due</th>
                <th className={ui.thc}>Status</th>
                <th className={cn(ui.thc, 'text-right')}>Total (SAR)</th>
                <th className={cn(ui.thc, 'pr-4 text-right')}>Balance (SAR)</th>
              </tr>
            </thead>
            <tbody className={ui.tbody}>
              {statement.invoices.map((inv) => {
                const st = status(inv);
                return (
                  <tr
                    key={inv.id}
                    onClick={financeEnabled ? () => navigate(`/finance/invoices/${inv.id}`) : undefined}
                    className={financeEnabled ? ui.row : 'group'}
                  >
                    <td className={cn(ui.tdc, 'pl-4', ui.link)}>{inv.ref_id || 'Draft'}</td>
                    <td className={cn(ui.tdc, 'text-slate-600 tabular-nums dark:text-slate-300')}>{fmtDate(inv.invoice_date, tz)}</td>
                    <td className={cn(ui.tdc, 'tabular-nums', st.isOverdue ? 'font-medium text-rose-600' : 'text-slate-600 dark:text-slate-300')}>{fmtDate(inv.due_date, tz)}</td>
                    <td className={ui.tdc}><Badge tone={st.tone} dot>{st.label}</Badge></td>
                    <td className={cn(ui.tdc, 'text-right text-slate-900 tabular-nums dark:text-white')}>{inv.total_amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                    <td className={cn(ui.tdc, 'pr-4 text-right font-medium tabular-nums', inv.balance_due > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-400')}>
                      {inv.balance_due > 0 ? inv.balance_due.toLocaleString('en-US', { maximumFractionDigits: 2 }) : 'Paid'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
