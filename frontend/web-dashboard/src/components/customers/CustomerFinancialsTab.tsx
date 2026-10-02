import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, FileText, ReceiptText, TriangleAlert, Wallet } from 'lucide-react';

import type { CustomerStatementData, CustomerStatementInvoice } from '@/services/customerService';
import { useDeploymentTimezone } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { fmtDate } from '@/components/details/DetailKit';
import { Badge, EmptyBlock, Panel, Stat, ui, type UiTone } from '@/components/customers/customerUi';

const STATUS: Record<CustomerStatementInvoice['status'], { tone: UiTone; label: string }> = {
  Draft: { tone: 'slate', label: 'Draft' },
  Issued: { tone: 'blue', label: 'Issued' },
  PartiallyPaid: { tone: 'amber', label: 'Part paid' },
  Paid: { tone: 'emerald', label: 'Paid' },
  Void: { tone: 'slate', label: 'Void' },
};

/** Customer → Invoices & balance: what they were billed, what they paid, what they still owe. */
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

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Invoiced" icon={FileText} tone="blue" unit="SAR" value={money(invoiced)} sub="Issued invoices, all time" />
        <Stat label="Paid" icon={CheckCircle2} tone="emerald" unit="SAR" value={money(paid)} sub={`${paidPct}% collected`} />
        <Stat label="Outstanding" icon={Wallet} tone="amber" unit="SAR" value={money(statement?.total_outstanding ?? 0)} sub="Still to collect" />
        <Stat
          label="Overdue"
          icon={TriangleAlert}
          tone="rose"
          unit="SAR"
          value={money(overdueAmount)}
          sub={overdueAmount > 0 ? 'Past the due date' : 'Nothing past due'}
          subTone={overdueAmount > 0 ? 'rose' : undefined}
        />
      </div>

      <Panel
        title="Invoices"
        description={statement ? `${statement.invoices.length} invoice${statement.invoices.length === 1 ? '' : 's'} · ${paidPct}% of the invoiced amount collected` : undefined}
        icon={ReceiptText}
        tone="indigo"
        flush
        action={
          financeEnabled ? (
            <>
              <button type="button" onClick={onOpenStatement} className={cn(ui.btn, ui.btnOutline, 'h-8')}>Statement of account</button>
              <button type="button" onClick={() => navigate(`/finance/invoices?customer=${customerId}`)} className={cn(ui.btn, ui.btnOutline, 'h-8')}>
                Open in Invoices <ArrowUpRight className="size-4" />
              </button>
            </>
          ) : undefined
        }
      >
        <div className="h-1 bg-slate-100 dark:bg-slate-800">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${paidPct}%` }} />
        </div>
        {isLoading ? (
          <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />)}</div>
        ) : !statement?.invoices?.length ? (
          <div className="p-5"><EmptyBlock icon={ReceiptText} title="No invoices yet" text="Invoices raised for this customer show up here." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50/80 dark:bg-slate-800/40">
                <tr>
                  <th className={cn(ui.th, 'pl-5')}>Invoice</th>
                  <th className={ui.th}>Date</th>
                  <th className={ui.th}>Due</th>
                  <th className={ui.th}>Status</th>
                  <th className={cn(ui.th, 'text-right')}>Total (SAR)</th>
                  <th className={cn(ui.th, 'pr-5 text-right')}>Balance (SAR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {statement.invoices.map((inv) => {
                  const st = status(inv);
                  return (
                    <tr
                      key={inv.id}
                      onClick={financeEnabled ? () => navigate(`/finance/invoices/${inv.id}`) : undefined}
                      className={cn('group', financeEnabled && 'cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40')}
                    >
                      <td className={cn(ui.td, 'pl-5 font-medium text-slate-900 tabular-nums group-hover:text-[#E5533F] dark:text-white')}>{inv.ref_id || 'Draft'}</td>
                      <td className={cn(ui.td, 'text-slate-600 dark:text-slate-300')}>{fmtDate(inv.invoice_date, tz)}</td>
                      <td className={cn(ui.td, st.isOverdue ? 'font-medium text-rose-600' : 'text-slate-600 dark:text-slate-300')}>{fmtDate(inv.due_date, tz)}</td>
                      <td className={ui.td}><Badge tone={st.tone} dot>{st.label}</Badge></td>
                      <td className={cn(ui.td, 'text-right text-slate-900 tabular-nums dark:text-white')}>{inv.total_amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                      <td className={cn(ui.td, 'pr-5 text-right font-medium tabular-nums', inv.balance_due > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-400')}>
                        {inv.balance_due > 0 ? inv.balance_due.toLocaleString('en-US', { maximumFractionDigits: 2 }) : 'Paid'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
