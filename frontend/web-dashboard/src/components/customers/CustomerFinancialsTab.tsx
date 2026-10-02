import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, CreditCard, FileText, ReceiptText, TriangleAlert } from 'lucide-react';

import type { CustomerStatementData, CustomerStatementInvoice } from '@/services/customerService';
import { Button } from '@/components/ui/button';
import { useDeploymentTimezone } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { dk, EMPTY, fmtDate, fmtSar, StatusPill, type Tone } from '@/components/details/DetailKit';

const STATUS: Record<CustomerStatementInvoice['status'], { tone: Tone; label: string }> = {
  Draft: { tone: 'amber', label: 'Draft' },
  Issued: { tone: 'blue', label: 'Issued' },
  PartiallyPaid: { tone: 'amber', label: 'Part paid' },
  Paid: { tone: 'green', label: 'Paid' },
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

  const figures = [
    { label: 'Invoiced', value: fmtSar(invoiced, { allowZero: true }), icon: FileText, tone: 'text-slate-900 dark:text-white', iconTone: 'text-blue-600' },
    { label: 'Paid', value: fmtSar(paid, { allowZero: true }), icon: CheckCircle2, tone: 'text-emerald-600 dark:text-emerald-400', iconTone: 'text-emerald-600' },
    { label: 'Outstanding', value: fmtSar(statement?.total_outstanding ?? 0, { allowZero: true }), icon: CreditCard, tone: 'text-[#FA634E]', iconTone: 'text-[#FA634E]' },
    { label: 'Overdue', value: fmtSar(overdueAmount, { allowZero: true }), icon: TriangleAlert, tone: overdueAmount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white', iconTone: overdueAmount > 0 ? 'text-rose-600' : 'text-slate-400' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className={cn(dk.card, 'p-4 sm:p-5 flex flex-col gap-4')}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {figures.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.label} className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 px-3.5 py-3 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={dk.label}>{f.label}</span>
                  <Icon className={cn('w-4 h-4', f.iconTone)} />
                </div>
                <p className={cn('mt-1.5 text-lg sm:text-xl font-black font-mono leading-tight truncate', f.tone)}>{isLoading ? EMPTY : f.value}</p>
              </div>
            );
          })}
        </div>
        <div>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1.5">
            <span>Collected</span>
            <span className="tabular-nums">{paidPct}% of issued invoices</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${paidPct}%` }} />
          </div>
        </div>
      </section>

      <section className={cn(dk.card, 'p-4 sm:p-5 flex flex-col gap-3')}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
            <ReceiptText className="w-4 h-4 text-[#FA634E]" /> Invoices
          </h2>
          {financeEnabled && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onOpenStatement} className="h-8 rounded-xl text-xs font-bold">
                Statement of account
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate(`/finance/invoices?customer=${customerId}`)} className="h-8 rounded-xl text-xs font-bold gap-1.5">
                Open in Invoices <ArrowUpRight className="w-3.5 h-3.5 text-[#FA634E]" />
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <p className="py-10 text-center text-xs font-bold text-slate-400 animate-pulse">Loading invoices…</p>
        ) : !statement?.invoices?.length ? (
          <div className="py-10 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            <ReceiptText className="w-7 h-7 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No invoices yet</p>
            <p className="text-xs text-slate-400 mt-0.5">Invoices raised for this customer show up here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-extrabold uppercase text-slate-400 tracking-widest">
                  <th className="py-2.5 px-2">Invoice</th>
                  <th className="py-2.5 px-2">Date</th>
                  <th className="py-2.5 px-2">Due</th>
                  <th className="py-2.5 px-2">Status</th>
                  <th className="py-2.5 px-2 text-right">Total</th>
                  <th className="py-2.5 px-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {statement.invoices.map((inv) => {
                  const s = STATUS[inv.status] ?? { tone: 'slate' as Tone, label: inv.status };
                  const isOverdue = (inv.status === 'Issued' || inv.status === 'PartiallyPaid') && !!inv.due_date && inv.due_date.slice(0, 10) < today;
                  return (
                    <tr
                      key={inv.id}
                      onClick={financeEnabled ? () => navigate(`/finance/invoices/${inv.id}`) : undefined}
                      className={cn('group', financeEnabled && 'hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer')}
                    >
                      <td className="py-3 px-2 font-mono font-black text-slate-900 dark:text-white group-hover:text-[#FA634E]">{inv.ref_id || 'Draft'}</td>
                      <td className="py-3 px-2 text-slate-600 dark:text-slate-400">{fmtDate(inv.invoice_date, tz)}</td>
                      <td className={cn('py-3 px-2', isOverdue ? 'text-rose-600 font-bold' : 'text-slate-600 dark:text-slate-400')}>{fmtDate(inv.due_date, tz)}</td>
                      <td className="py-3 px-2">
                        {isOverdue ? <StatusPill tone="red">Overdue</StatusPill> : <StatusPill tone={s.tone}>{s.label}</StatusPill>}
                      </td>
                      <td className="py-3 px-2 text-right font-mono font-bold text-slate-900 dark:text-slate-100">{fmtSar(inv.total_amount, { allowZero: true })}</td>
                      <td className={cn('py-3 px-2 text-right font-mono font-bold', inv.balance_due > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500')}>
                        {fmtSar(inv.balance_due, { allowZero: true })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
