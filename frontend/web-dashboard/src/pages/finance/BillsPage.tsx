import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Eye, CheckCircle2, CreditCard, AlertTriangle, FileText } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import KpiCard from '@/components/ui/KpiCard';
import DataTable, { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

import { financeService } from '@/services/financeService';
import type { Bill, BillStatus, Account } from '@mercon/shared-types';

const STATUS_BADGES: Record<BillStatus, string> = {
  Draft: 'bg-amber-50 text-amber-700 border-amber-200',
  Approved: 'bg-blue-50 text-blue-700 border-blue-200',
  PartiallyPaid: 'bg-orange-50 text-orange-700 border-orange-200',
  Paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Void: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function BillsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedStatus, setSelectedStatus] = useState<BillStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 25;

  const [viewingBill, setViewingBill] = useState<Bill | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');

  const { data: billsRes, isLoading } = useQuery({
    queryKey: ['bills', selectedStatus, search, page],
    queryFn: () => financeService.getBills({ status: selectedStatus, search, page, per_page: perPage }),
  });

  const { data: accountsRes } = useQuery({
    queryKey: ['accounts', 'postable'],
    queryFn: () => financeService.getAccounts({ include_inactive: false }),
  });

  const bills: Bill[] = billsRes?.data || [];
  const pagination = billsRes?.pagination || { page: 1, per_page: perPage, total: bills.length, total_pages: 1 };
  const postableAccounts: Account[] = (accountsRes?.data || []).filter((a: Account) => a.is_postable);

  const approveMutation = useMutation({
    mutationFn: financeService.approveBill,
    onSuccess: () => {
      toast.success('Bill approved — Expense/AP posted');
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      setViewingBill(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Failed to approve bill'),
  });

  const voidMutation = useMutation({
    mutationFn: financeService.voidBill,
    onSuccess: () => {
      toast.success('Bill voided and reversal posted');
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      setViewingBill(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Failed to void bill'),
  });

  const deleteMutation = useMutation({
    mutationFn: financeService.deleteDraftBill,
    onSuccess: () => {
      toast.success('Draft bill deleted');
      queryClient.invalidateQueries({ queryKey: ['bills'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Failed to delete draft'),
  });

  const paymentMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => financeService.recordBillPayment(id, data),
    onSuccess: () => {
      toast.success('Payment recorded — Dr AP / Cr Bank posted');
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      setIsPaymentModalOpen(false);
      setViewingBill(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Failed to record payment'),
  });

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingBill) return;
    if (!paymentAccountId) {
      toast.error('Select the account the payment was made from');
      return;
    }
    if (paymentAmount <= 0 || paymentAmount > Number(viewingBill.balance_due)) {
      toast.error('Payment amount must be > 0 and not exceed the balance due');
      return;
    }
    paymentMutation.mutate({
      id: viewingBill.id,
      data: { amount: paymentAmount, payment_date: paymentDate, accountId: paymentAccountId, payment_method: paymentMethod || null },
    });
  };

  const openPaymentModal = () => {
    setPaymentAmount(Number(viewingBill?.balance_due) || 0);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentAccountId('');
    setPaymentMethod('');
    setIsPaymentModalOpen(true);
  };

  const kpis = {
    total: pagination.total,
    outstanding: bills
      .filter((b) => b.status === 'Approved' || b.status === 'PartiallyPaid')
      .reduce((sum, b) => sum + Number(b.balance_due), 0),
    paid: bills.filter((b) => b.status === 'Paid').length,
    drafts: bills.filter((b) => b.status === 'Draft').length,
  };

  const columns: Column<Bill>[] = [
    {
      header: 'Ref ID',
      accessor: (bill) => <span className="font-mono font-bold text-[#3E3C3D]">{bill.ref_id || `BILL-${bill.id.slice(0, 6)}`}</span>,
      mobilePriority: 'primary',
    },
    {
      header: 'Provider / Payee',
      accessor: (bill) => <span className="font-medium text-slate-800">{(bill as any).provider?.name || bill.payee_name || '—'}</span>,
      mobilePriority: 'primary',
    },
    {
      header: 'Bill Date',
      accessor: (bill) => <span className="font-mono text-slate-600">{new Date(bill.bill_date).toLocaleDateString()}</span>,
      mobilePriority: 'secondary',
    },
    {
      header: 'Total',
      headerClassName: 'text-right',
      className: 'text-right',
      accessor: (bill) => <span className="font-mono text-slate-800">SAR {Number(bill.total_amount).toFixed(2)}</span>,
      mobilePriority: 'meta',
    },
    {
      header: 'Balance Due',
      headerClassName: 'text-right',
      className: 'text-right',
      accessor: (bill) => <span className="font-mono font-semibold text-slate-900">SAR {Number(bill.balance_due).toFixed(2)}</span>,
      mobilePriority: 'secondary',
    },
    {
      header: 'Status',
      accessor: (bill) => <Badge className={`${STATUS_BADGES[bill.status]} border`}>{bill.status}</Badge>,
      mobilePriority: 'secondary',
    },
    {
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      accessor: (bill) => (
        <div className="space-x-1">
          <Button variant="ghost" size="sm" onClick={() => setViewingBill(bill)} className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900">
            <Eye className="w-3.5 h-3.5 mr-1" />
            View
          </Button>
          {bill.status === 'Draft' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm(`Delete draft bill ${bill.ref_id}?`)) deleteMutation.mutate(bill.id);
              }}
              className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      ),
      mobilePriority: 'hidden',
    },
  ];

  const statusFilterElement = (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      <button
        onClick={() => {
          setSelectedStatus('all');
          setPage(1);
        }}
        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${selectedStatus === 'all' ? 'bg-[#3E3C3D] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
      >
        All Statuses
      </button>
      {(['Draft', 'Approved', 'PartiallyPaid', 'Paid', 'Void'] as BillStatus[]).map((st) => (
        <button
          key={st}
          onClick={() => {
            setSelectedStatus(st);
            setPage(1);
          }}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${selectedStatus === st ? 'bg-[#FA634E] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          {st}
        </button>
      ))}
    </div>
  );

  return (
    <DashboardLayout active="finance" title="Bills">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#3E3C3D]">Bills</h1>
            <p className="text-sm text-slate-500">Vendor/provider costs, approvals & accounts payable</p>
          </div>
          <Button onClick={() => navigate('/finance/bills/new')} className="bg-[#FA634E] hover:bg-[#e0523d] text-white shadow-sm font-medium">
            <Plus className="w-4 h-4 mr-2" />
            New Bill
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 shrink-0">
          <KpiCard title="TOTAL BILLS" value={kpis.total} variant="slate" icon={CreditCard} description="Across all statuses" />
          <KpiCard
            title="OUTSTANDING AP"
            value={<span><span className="text-[16px] font-semibold mr-1 opacity-85">SAR</span>{kpis.outstanding.toLocaleString()}</span>}
            variant="amber"
            icon={AlertTriangle}
            description="Approved or partially paid"
          />
          <KpiCard title="PAID" value={kpis.paid} variant="emerald" icon={CheckCircle2} description="This page — fully settled" />
          <KpiCard title="DRAFTS" value={kpis.drafts} variant="brand" icon={FileText} description="Not yet approved" />
        </div>

        <DataTable<Bill>
          title="Bills"
          columns={columns}
          data={bills}
          isLoading={isLoading}
          searchPlaceholder="Search ref or payee..."
          searchValue={search}
          onSearchChange={(val) => {
            setSearch(val);
            setPage(1);
          }}
          filterElement={statusFilterElement}
          enableSelection={false}
          getRowId={(bill) => bill.id}
          currentPage={pagination.page}
          totalPages={pagination.total_pages}
          totalRecords={pagination.total}
          onPageChange={setPage}
          emptyTitle="No Bills"
          emptyMessage="No bills found matching criteria."
        />

        {/* View / Detail Modal */}
        <Dialog open={!!viewingBill} onOpenChange={() => setViewingBill(null)}>
          <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-[#3E3C3D]">Bill {viewingBill?.ref_id || viewingBill?.id}</DialogTitle>
            </DialogHeader>
            {viewingBill && (
              <div className="space-y-4 py-2 text-xs">
                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div>
                    <span className="text-slate-400 block font-medium">Status</span>
                    <Badge className={`${STATUS_BADGES[viewingBill.status]} mt-0.5 border`}>{viewingBill.status}</Badge>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Total</span>
                    <span className="font-mono font-bold text-slate-800">SAR {Number(viewingBill.total_amount).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Balance Due</span>
                    <span className="font-mono font-bold text-slate-900">SAR {Number(viewingBill.balance_due).toFixed(2)}</span>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                        <th className="p-2.5">Description</th>
                        <th className="p-2.5">Account</th>
                        <th className="p-2.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewingBill.lines?.map((line) => (
                        <tr key={line.id}>
                          <td className="p-2.5 text-slate-800">{line.description}</td>
                          <td className="p-2.5 text-slate-500">{line.account ? `${line.account.account_code} - ${line.account.name}` : '—'}</td>
                          <td className="p-2.5 text-right font-mono text-slate-800">SAR {Number(line.amount).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {viewingBill.payments && viewingBill.payments.length > 0 && (
                  <div>
                    <span className="text-slate-500 font-medium block mb-1">Payments Recorded</span>
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                      {viewingBill.payments.map((p) => (
                        <div key={p.id} className="p-2 flex justify-between">
                          <span className="text-slate-600">{new Date(p.payment_date).toLocaleDateString()} {p.payment_method ? `— ${p.payment_method}` : ''}</span>
                          <span className="font-mono font-semibold text-emerald-700">SAR {Number(p.amount).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <DialogFooter className="pt-2 flex-wrap gap-2">
                  {viewingBill.status === 'Draft' && (
                    <Button size="sm" className="bg-[#FA634E] hover:bg-[#e0523d] text-white" onClick={() => approveMutation.mutate(viewingBill.id)} disabled={approveMutation.isPending}>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve Bill
                    </Button>
                  )}
                  {(viewingBill.status === 'Approved' || viewingBill.status === 'PartiallyPaid') && (
                    <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={openPaymentModal}>
                      Record Payment
                    </Button>
                  )}
                  {viewingBill.status === 'Approved' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-rose-200 text-rose-700 hover:bg-rose-50"
                      onClick={() => {
                        if (confirm('Void this bill? This posts a reversing GL entry.')) voidMutation.mutate(viewingBill.id);
                      }}
                      disabled={voidMutation.isPending}
                    >
                      Void
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setViewingBill(null)}>Close</Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Payment Modal */}
        <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-[#3E3C3D]">Record Payment</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleRecordPayment} className="space-y-3 py-2">
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Amount * (Balance Due: SAR {Number(viewingBill?.balance_due || 0).toFixed(2)})</label>
                <Input type="number" step="0.01" min="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)} className="h-9 text-xs" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Payment Date *</label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="h-9 text-xs" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Paid From Account *</label>
                <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select bank/cash account" />
                  </SelectTrigger>
                  <SelectContent>
                    {postableAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.account_code} - {acc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Method</label>
                <Input placeholder="e.g. Bank Transfer" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="h-9 text-xs" />
              </div>
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsPaymentModalOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" className="bg-[#FA634E] hover:bg-[#e0523d] text-white" disabled={paymentMutation.isPending}>
                  Record Payment
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
