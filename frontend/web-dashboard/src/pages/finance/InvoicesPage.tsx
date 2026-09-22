import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Eye, FileText, ReceiptText, Wallet, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import KpiCard from '@/components/ui/KpiCard';
import DataTable, { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

import { financeService, CreateInvoiceDTO, InvoiceLineDTO } from '@/services/financeService';
import { customerService } from '@/services/customerService';
import { tripService } from '@/services/tripService';
import type { Invoice, InvoiceStatus, Account } from '@mercon/shared-types';

const STATUS_BADGES: Record<InvoiceStatus, string> = {
  Draft: 'bg-amber-50 text-amber-700 border-amber-200',
  Issued: 'bg-blue-50 text-blue-700 border-blue-200',
  PartiallyPaid: 'bg-orange-50 text-orange-700 border-orange-200',
  Paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Void: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function InvoicesPage() {
  const queryClient = useQueryClient();

  const [selectedStatus, setSelectedStatus] = useState<InvoiceStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 25;

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Create form state
  const [customerId, setCustomerId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState<string>('');
  const [taxRate, setTaxRate] = useState<number>(0);
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [manualLines, setManualLines] = useState<InvoiceLineDTO[]>([]);

  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');

  const { data: invoicesRes, isLoading } = useQuery({
    queryKey: ['invoices', selectedStatus, search, page],
    queryFn: () => financeService.getInvoices({ status: selectedStatus, search, page, per_page: perPage }),
  });

  const { data: customersRes } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: () => customerService.getAll({ per_page: 500 } as any),
  });

  const { data: unbilledTripsRes } = useQuery({
    queryKey: ['trips', 'completed-unbilled', customerId],
    queryFn: () => tripService.getAll({ customer_id: customerId, status: 'Completed', per_page: 200 }),
    enabled: !!customerId && isCreateModalOpen,
  });

  const { data: accountsRes } = useQuery({
    queryKey: ['accounts', 'postable'],
    queryFn: () => financeService.getAccounts({ include_inactive: false }),
  });

  const invoices: Invoice[] = invoicesRes?.data || [];
  const pagination = invoicesRes?.pagination || { page: 1, per_page: perPage, total: invoices.length, total_pages: 1 };
  const customers = customersRes?.data || [];
  const unbilledTrips = (unbilledTripsRes?.data || []).filter((t: any) => !t.invoiceId);
  const postableAccounts: Account[] = (accountsRes?.data || []).filter((a: Account) => a.is_postable);

  const createMutation = useMutation({
    mutationFn: financeService.createDraftInvoice,
    onSuccess: () => {
      toast.success('Draft invoice created');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      closeCreateModal();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Failed to create invoice'),
  });

  const issueMutation = useMutation({
    mutationFn: financeService.issueInvoice,
    onSuccess: () => {
      toast.success('Invoice issued — AR/Revenue posted');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setViewingInvoice(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Failed to issue invoice'),
  });

  const voidMutation = useMutation({
    mutationFn: financeService.voidInvoice,
    onSuccess: () => {
      toast.success('Invoice voided and reversal posted');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setViewingInvoice(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Failed to void invoice'),
  });

  const deleteMutation = useMutation({
    mutationFn: financeService.deleteDraftInvoice,
    onSuccess: () => {
      toast.success('Draft invoice deleted');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Failed to delete draft'),
  });

  const paymentMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => financeService.recordInvoicePayment(id, data),
    onSuccess: () => {
      toast.success('Payment recorded — Dr Bank / Cr AR posted');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setIsPaymentModalOpen(false);
      setViewingInvoice(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Failed to record payment'),
  });

  const openCreateModal = () => {
    setCustomerId('');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setDueDate('');
    setTaxRate(0);
    setSelectedTripIds([]);
    setManualLines([]);
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => setIsCreateModalOpen(false);

  const toggleTrip = (tripId: string) => {
    setSelectedTripIds((prev) => (prev.includes(tripId) ? prev.filter((id) => id !== tripId) : [...prev, tripId]));
  };

  const handleAddManualLine = () => {
    setManualLines([...manualLines, { description: '', rate: 0, amount: 0, quantity: 1 }]);
  };

  const handleManualLineChange = (index: number, field: keyof InvoiceLineDTO, value: any) => {
    const updated = [...manualLines];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'rate' || field === 'quantity') {
      const qty = field === 'quantity' ? Number(value) : Number(updated[index].quantity || 1);
      const rate = field === 'rate' ? Number(value) : Number(updated[index].rate || 0);
      updated[index].amount = qty * rate;
    }
    setManualLines(updated);
  };

  const handleRemoveManualLine = (index: number) => {
    setManualLines(manualLines.filter((_, i) => i !== index));
  };

  const estimatedSubtotal =
    unbilledTrips
      .filter((t: any) => selectedTripIds.includes(t.id))
      .reduce((sum: number, t: any) => sum + (Number(t.billing_amount) || 0), 0) +
    manualLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      toast.error('Please select a customer');
      return;
    }
    if (selectedTripIds.length === 0 && manualLines.length === 0) {
      toast.error('Select at least one trip or add a manual line');
      return;
    }
    const payload: CreateInvoiceDTO = {
      customerId,
      invoice_date: invoiceDate,
      due_date: dueDate || null,
      tax_rate: taxRate,
      tripIds: selectedTripIds,
      lines: manualLines.filter((l) => l.description && l.amount >= 0),
    };
    createMutation.mutate(payload);
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingInvoice) return;
    if (!paymentAccountId) {
      toast.error('Select the account that received the payment');
      return;
    }
    if (paymentAmount <= 0 || paymentAmount > Number(viewingInvoice.balance_due)) {
      toast.error('Payment amount must be > 0 and not exceed the balance due');
      return;
    }
    paymentMutation.mutate({
      id: viewingInvoice.id,
      data: {
        amount: paymentAmount,
        payment_date: paymentDate,
        accountId: paymentAccountId,
        payment_method: paymentMethod || null,
      },
    });
  };

  const openPaymentModal = () => {
    setPaymentAmount(Number(viewingInvoice?.balance_due) || 0);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentAccountId('');
    setPaymentMethod('');
    setIsPaymentModalOpen(true);
  };

  const kpis = {
    total: pagination.total,
    outstanding: invoices
      .filter((i) => i.status === 'Issued' || i.status === 'PartiallyPaid')
      .reduce((sum, i) => sum + Number(i.balance_due), 0),
    paid: invoices.filter((i) => i.status === 'Paid').length,
    drafts: invoices.filter((i) => i.status === 'Draft').length,
  };

  const columns: Column<Invoice>[] = [
    {
      header: 'Ref ID',
      accessor: (inv) => <span className="font-mono font-bold text-[#3E3C3D]">{inv.ref_id || `INV-${inv.id.slice(0, 6)}`}</span>,
      mobilePriority: 'primary',
    },
    {
      header: 'Customer',
      accessor: (inv) => <span className="font-medium text-slate-800">{(inv as any).customer?.name || '—'}</span>,
      mobilePriority: 'primary',
    },
    {
      header: 'Invoice Date',
      accessor: (inv) => <span className="font-mono text-slate-600">{new Date(inv.invoice_date).toLocaleDateString()}</span>,
      mobilePriority: 'secondary',
    },
    {
      header: 'Total',
      headerClassName: 'text-right',
      className: 'text-right',
      accessor: (inv) => <span className="font-mono text-slate-800">SAR {Number(inv.total_amount).toFixed(2)}</span>,
      mobilePriority: 'meta',
    },
    {
      header: 'Balance Due',
      headerClassName: 'text-right',
      className: 'text-right',
      accessor: (inv) => <span className="font-mono font-semibold text-slate-900">SAR {Number(inv.balance_due).toFixed(2)}</span>,
      mobilePriority: 'secondary',
    },
    {
      header: 'Status',
      accessor: (inv) => <Badge className={`${STATUS_BADGES[inv.status]} border`}>{inv.status}</Badge>,
      mobilePriority: 'secondary',
    },
    {
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      accessor: (inv) => (
        <div className="space-x-1">
          <Button variant="ghost" size="sm" onClick={() => setViewingInvoice(inv)} className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900">
            <Eye className="w-3.5 h-3.5 mr-1" />
            View
          </Button>
          {inv.status === 'Draft' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm(`Delete draft invoice ${inv.ref_id}?`)) deleteMutation.mutate(inv.id);
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
      {(['Draft', 'Issued', 'PartiallyPaid', 'Paid', 'Void'] as InvoiceStatus[]).map((st) => (
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
    <DashboardLayout active="finance" title="Invoices">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#3E3C3D]">Invoices</h1>
            <p className="text-sm text-slate-500">Customer billing, revenue recognition & accounts receivable</p>
          </div>
          <Button onClick={openCreateModal} className="bg-[#FA634E] hover:bg-[#e0523d] text-white shadow-sm font-medium">
            <Plus className="w-4 h-4 mr-2" />
            New Invoice
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 shrink-0">
          <KpiCard title="TOTAL INVOICES" value={kpis.total} variant="slate" icon={ReceiptText} description="Across all statuses" />
          <KpiCard
            title="OUTSTANDING AR"
            value={<span><span className="text-[16px] font-semibold mr-1 opacity-85">SAR</span>{kpis.outstanding.toLocaleString()}</span>}
            variant="amber"
            icon={AlertTriangle}
            description="Issued or partially paid"
          />
          <KpiCard title="PAID" value={kpis.paid} variant="emerald" icon={Wallet} description="This page — fully settled" />
          <KpiCard title="DRAFTS" value={kpis.drafts} variant="brand" icon={FileText} description="Not yet issued" />
        </div>

        <DataTable<Invoice>
          title="Invoices"
          columns={columns}
          data={invoices}
          isLoading={isLoading}
          searchPlaceholder="Search ref or customer..."
          searchValue={search}
          onSearchChange={(val) => {
            setSearch(val);
            setPage(1);
          }}
          filterElement={statusFilterElement}
          enableSelection={false}
          getRowId={(inv) => inv.id}
          currentPage={pagination.page}
          totalPages={pagination.total_pages}
          totalRecords={pagination.total}
          onPageChange={setPage}
          emptyTitle="No Invoices"
          emptyMessage="No invoices found matching criteria."
        />

        {/* Create Modal */}
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-[#3E3C3D]">New Invoice (Draft)</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateSubmit} className="space-y-4 py-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">Customer *</label>
                  <Select value={customerId} onValueChange={(v) => { setCustomerId(v); setSelectedTripIds([]); }}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">Invoice Date *</label>
                  <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="h-9 text-xs" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">Due Date</label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9 text-xs" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Tax Rate (%)</label>
                <Input type="number" step="0.01" min="0" max="100" value={taxRate} onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)} className="h-9 text-xs w-32" />
              </div>

              {/* Trip selection */}
              {customerId && (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-3 py-2 border-b border-slate-200">
                    <span className="text-xs font-bold text-slate-700">Completed, Unbilled Trips for this Customer</span>
                  </div>
                  <div className="p-3 space-y-1.5 max-h-40 overflow-y-auto">
                    {unbilledTrips.length === 0 ? (
                      <p className="text-xs text-slate-400">No completed unbilled trips for this customer.</p>
                    ) : (
                      unbilledTrips.map((t: any) => (
                        <label key={t.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-slate-50 p-1 rounded">
                          <input type="checkbox" checked={selectedTripIds.includes(t.id)} onChange={() => toggleTrip(t.id)} className="rounded text-[#FA634E]" />
                          <span className="font-mono font-semibold">{t.ref_id || t.id.slice(0, 8)}</span>
                          <span className="text-slate-500">— {t.vehicle_type || 'Trip'}</span>
                          <span className="ml-auto font-mono font-semibold text-slate-800">SAR {(Number(t.billing_amount) || 0).toFixed(2)}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Manual lines */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-700">Manual / Adjustment Lines</span>
                  <Button type="button" variant="ghost" size="sm" onClick={handleAddManualLine} className="h-7 text-xs text-[#FA634E] hover:bg-rose-50">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Line
                  </Button>
                </div>
                {manualLines.length > 0 && (
                  <div className="p-3 space-y-2">
                    {manualLines.map((line, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input placeholder="Description" value={line.description} onChange={(e) => handleManualLineChange(idx, 'description', e.target.value)} className="h-8 text-xs flex-1" />
                        <Input type="number" step="0.01" placeholder="Rate" value={line.rate || ''} onChange={(e) => handleManualLineChange(idx, 'rate', parseFloat(e.target.value) || 0)} className="h-8 text-xs w-24 text-right font-mono" />
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveManualLine(idx)} className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 flex justify-between items-center text-xs font-semibold">
                <span>Estimated Subtotal (excl. tax)</span>
                <span className="font-mono text-slate-900">SAR {estimatedSubtotal.toFixed(2)}</span>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" size="sm" onClick={closeCreateModal}>Cancel</Button>
                <Button type="submit" size="sm" className="bg-[#FA634E] hover:bg-[#e0523d] text-white" disabled={createMutation.isPending}>
                  Save as Draft
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* View / Detail Modal */}
        <Dialog open={!!viewingInvoice} onOpenChange={() => setViewingInvoice(null)}>
          <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-[#3E3C3D]">
                Invoice {viewingInvoice?.ref_id || viewingInvoice?.id}
              </DialogTitle>
            </DialogHeader>
            {viewingInvoice && (
              <div className="space-y-4 py-2 text-xs">
                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div>
                    <span className="text-slate-400 block font-medium">Status</span>
                    <Badge className={`${STATUS_BADGES[viewingInvoice.status]} mt-0.5 border`}>{viewingInvoice.status}</Badge>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Total</span>
                    <span className="font-mono font-bold text-slate-800">SAR {Number(viewingInvoice.total_amount).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Balance Due</span>
                    <span className="font-mono font-bold text-slate-900">SAR {Number(viewingInvoice.balance_due).toFixed(2)}</span>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                        <th className="p-2.5">Description</th>
                        <th className="p-2.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewingInvoice.lines?.map((line) => (
                        <tr key={line.id}>
                          <td className="p-2.5 text-slate-800">{line.description}</td>
                          <td className="p-2.5 text-right font-mono text-slate-800">SAR {Number(line.amount).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {viewingInvoice.payments && viewingInvoice.payments.length > 0 && (
                  <div>
                    <span className="text-slate-500 font-medium block mb-1">Payments Recorded</span>
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                      {viewingInvoice.payments.map((p) => (
                        <div key={p.id} className="p-2 flex justify-between">
                          <span className="text-slate-600">{new Date(p.payment_date).toLocaleDateString()} {p.payment_method ? `— ${p.payment_method}` : ''}</span>
                          <span className="font-mono font-semibold text-emerald-700">SAR {Number(p.amount).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <DialogFooter className="pt-2 flex-wrap gap-2">
                  {viewingInvoice.status === 'Draft' && (
                    <Button size="sm" className="bg-[#FA634E] hover:bg-[#e0523d] text-white" onClick={() => issueMutation.mutate(viewingInvoice.id)} disabled={issueMutation.isPending}>
                      <FileText className="w-3.5 h-3.5 mr-1" /> Issue Invoice
                    </Button>
                  )}
                  {(viewingInvoice.status === 'Issued' || viewingInvoice.status === 'PartiallyPaid') && (
                    <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={openPaymentModal}>
                      Record Payment
                    </Button>
                  )}
                  {viewingInvoice.status === 'Issued' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-rose-200 text-rose-700 hover:bg-rose-50"
                      onClick={() => {
                        if (confirm('Void this invoice? This posts a reversing GL entry and unlinks its trips.')) voidMutation.mutate(viewingInvoice.id);
                      }}
                      disabled={voidMutation.isPending}
                    >
                      Void
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setViewingInvoice(null)}>Close</Button>
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
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Amount * (Balance Due: SAR {Number(viewingInvoice?.balance_due || 0).toFixed(2)})</label>
                <Input type="number" step="0.01" min="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)} className="h-9 text-xs" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Payment Date *</label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="h-9 text-xs" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Received Into Account *</label>
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
