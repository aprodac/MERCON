import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Eye, FileText, ReceiptText, Wallet, AlertTriangle, Printer } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import KpiCard from '@/components/ui/KpiCard';
import DataTable, { Column } from '@/components/ui/DataTable';
import ExportModal, { ExportColumn } from '@/components/ui/ExportModal';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { InvoicePrintModal } from '@/components/finance/InvoicePrintModal';

import { financeService } from '@/services/financeService';
import type { Invoice, InvoiceStatus, Account } from '@mercon/shared-types';

import { StatusChip } from '@/lib/finance/chips';

const INVOICES_EXPORT_COLUMNS: ExportColumn<Invoice>[] = [
  { id: 'ref_id', label: 'Invoice Reference', accessor: (inv) => inv.ref_id || inv.id },
  { id: 'customer_name', label: 'Customer Name', accessor: (inv) => (inv as any).customer?.name || '—' },
  { id: 'invoice_date', label: 'Invoice Date', accessor: (inv) => (inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : '—') },
  { id: 'due_date', label: 'Due Date', accessor: (inv) => (inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—') },
  { id: 'status', label: 'Status', accessor: (inv) => inv.status },
  { id: 'total_amount', label: 'Total Amount', accessor: (inv) => Number(inv.total_amount) || 0 },
  { id: 'balance_due', label: 'Balance Due', accessor: (inv) => Number(inv.balance_due) || 0 },
];

export default function InvoicesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedStatus, setSelectedStatus] = useState<InvoiceStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 25;

  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [printingInvoice, setPrintingInvoice] = useState<Invoice | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');

  const { data: invoicesRes, isLoading } = useQuery({
    queryKey: ['invoices', selectedStatus, search, page],
    queryFn: () => financeService.getInvoices({ status: selectedStatus, search, page, per_page: perPage }),
  });

  const { data: accountsRes } = useQuery({
    queryKey: ['accounts', 'postable'],
    queryFn: () => financeService.getAccounts({ include_inactive: false }),
  });

  const invoices: Invoice[] = invoicesRes?.data || [];
  const pagination = invoicesRes?.pagination || { page: 1, per_page: perPage, total: invoices.length, total_pages: 1 };
  const postableAccounts: Account[] = (accountsRes?.data || []).filter((a: Account) => a.is_postable);

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
      accessor: (inv) => <span className="fin-num font-semibold text-[#3E3C3D]">{inv.ref_id || `INV-${inv.id.slice(0, 6)}`}</span>,
      mobilePriority: 'primary',
    },
    {
      header: 'Customer',
      accessor: (inv) => <span className="font-medium text-foreground">{(inv as any).customer?.name || '—'}</span>,
      mobilePriority: 'primary',
    },
    {
      header: 'Invoice Date',
      accessor: (inv) => <span className="font-mono text-muted-foreground">{new Date(inv.invoice_date).toLocaleDateString()}</span>,
      mobilePriority: 'secondary',
    },
    {
      header: 'Total',
      headerClassName: 'text-right',
      className: 'text-right',
      accessor: (inv) => <span className="font-mono text-foreground">SAR {Number(inv.total_amount).toFixed(2)}</span>,
      mobilePriority: 'meta',
    },
    {
      header: 'Balance Due',
      headerClassName: 'text-right',
      className: 'text-right',
      accessor: (inv) => <span className="font-mono font-semibold text-foreground">SAR {Number(inv.balance_due).toFixed(2)}</span>,
      mobilePriority: 'secondary',
    },
    {
      header: 'Status',
      accessor: (inv) => <StatusChip kind="invoice" status={inv.status} doc={{ due_date: inv.due_date, balance_due: inv.balance_due }} />,
      mobilePriority: 'secondary',
    },
    {
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      accessor: (inv) => (
        <div className="space-x-1">
          <Button variant="ghost" size="sm" onClick={() => setViewingInvoice(inv)} className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground">
            <Eye className="w-3.5 h-3.5 mr-1" />
            View
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPrintingInvoice(inv)} className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground">
            <Printer className="w-3.5 h-3.5 mr-1" />
            Print
          </Button>
          {inv.status === 'Draft' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm(`Delete draft invoice ${inv.ref_id}?`)) deleteMutation.mutate(inv.id);
              }}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-600"
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
        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${selectedStatus === 'all' ? 'bg-card text-foreground border border-border text-white' : 'bg-muted text-muted-foreground hover:bg-muted'}`}
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
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${selectedStatus === st ? 'bg-[#FA634E] text-white' : 'bg-muted text-muted-foreground hover:bg-muted'}`}
        >
          {st}
        </button>
      ))}
    </div>
  );

  return (
    <DashboardLayout active="finance" title="Invoices" fixedViewport>
      <div className="p-4 flex flex-col flex-1 min-h-0 gap-3 overflow-hidden h-full max-md:overflow-y-auto max-md:h-auto max-w-7xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#3E3C3D]">Invoices</h1>
            <p className="text-sm text-muted-foreground">Customer billing, revenue recognition & accounts receivable</p>
          </div>
          <Button onClick={() => navigate('/finance/invoices/new')} className="bg-[#FA634E] hover:bg-[#e0523d] text-white shadow-xs font-medium">
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
          onExport={() => setIsExportOpen(true)}
          enableSelection={false}
          getRowId={(inv) => inv.id}
          currentPage={pagination.page}
          totalPages={pagination.total_pages}
          totalRecords={pagination.total}
          onPageChange={setPage}
          emptyTitle="No Invoices"
          emptyMessage="No invoices found matching criteria."
        />

        {/* Export Modal */}
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          title="Export Invoices"
          description="Choose your export preferences and columns."
          fileNamePrefix="invoices_ledger"
          sheetName="Invoices"
          subtitle="MERCON Logistics Invoices Ledger"
          filteredData={invoices}
          columns={INVOICES_EXPORT_COLUMNS}
          formats={['xlsx', 'csv']}
          totalCount={pagination.total}
        />

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
                <div className="grid grid-cols-3 gap-2 bg-muted p-3 rounded-lg border border-border">
                  <div>
                    <span className="text-muted-foreground block font-medium">Status</span>
                    <StatusChip kind="invoice" status={viewingInvoice.status} doc={{ due_date: viewingInvoice.due_date, balance_due: viewingInvoice.balance_due }} className="mt-0.5" />
                  </div>
                  <div>
                    <span className="text-muted-foreground block font-medium">Total</span>
                    <span className="fin-num font-semibold text-foreground">SAR {Number(viewingInvoice.total_amount).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block font-medium">Balance Due</span>
                    <span className="fin-num font-semibold text-foreground">SAR {Number(viewingInvoice.balance_due).toFixed(2)}</span>
                  </div>
                </div>

                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-muted border-b border-border text-muted-foreground font-semibold">
                        <th className="p-2.5">Description</th>
                        <th className="p-2.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {viewingInvoice.lines?.map((line) => (
                        <tr key={line.id}>
                          <td className="p-2.5 text-foreground">{line.description}</td>
                          <td className="p-2.5 text-right font-mono text-foreground">SAR {Number(line.amount).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {viewingInvoice.payments && viewingInvoice.payments.length > 0 && (
                  <div>
                    <span className="text-muted-foreground font-medium block mb-1">Payments Recorded</span>
                    <div className="border border-border rounded-lg divide-y divide-border/60">
                      {viewingInvoice.payments.map((p) => (
                        <div key={p.id} className="p-2 flex justify-between">
                          <span className="text-muted-foreground">{new Date(p.payment_date).toLocaleDateString()} {p.payment_method ? `— ${p.payment_method}` : ''}</span>
                          <span className="font-mono font-semibold text-emerald-700">SAR {Number(p.amount).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <DialogFooter className="pt-2 flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPrintingInvoice(viewingInvoice)}>
                    <Printer className="w-3.5 h-3.5 mr-1" /> Print / Export PDF
                  </Button>
                  {viewingInvoice.status === 'Draft' && (
                    <Button size="sm" className="bg-[#FA634E] hover:bg-[#e0523d] text-white" onClick={() => issueMutation.mutate(viewingInvoice.id)} disabled={issueMutation.isPending}>
                      <FileText className="w-3.5 h-3.5 mr-1" /> Issue Invoice
                    </Button>
                  )}
                  {(viewingInvoice.status === 'Issued' || viewingInvoice.status === 'PartiallyPaid') && (
                    <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20" onClick={openPaymentModal}>
                      Record Payment
                    </Button>
                  )}
                  {viewingInvoice.status === 'Issued' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-rose-200 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20"
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
                <label className="text-xs font-semibold text-foreground mb-1 block">Amount * (Balance Due: SAR {Number(viewingInvoice?.balance_due || 0).toFixed(2)})</label>
                <Input type="number" step="0.01" min="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)} className="h-9 text-xs" />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Payment Date *</label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="h-9 text-xs" />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Received Into Account *</label>
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
                <label className="text-xs font-semibold text-foreground mb-1 block">Method</label>
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

        {/* Printable Tax Invoice Modal */}
        <InvoicePrintModal
          isOpen={!!printingInvoice}
          onClose={() => setPrintingInvoice(null)}
          invoice={printingInvoice}
        />
      </div>
    </DashboardLayout>
  );
}
