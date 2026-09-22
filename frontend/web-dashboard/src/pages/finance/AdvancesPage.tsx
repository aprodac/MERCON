import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Wallet, ArrowUpRight, ArrowDownLeft, FileText, Ban, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DataTable, { Column } from '@/components/ui/DataTable';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import {
  financeService,
  CreateAdvanceDTO,
  ApplyAdvanceDTO,
} from '@/services/financeService';
import type {
  Advance,
  Account,
  BankAccount,
  AdvancePartyType,
  AdvanceDirection,
  AdvanceStatus,
} from '@mercon/shared-types';

const STATUS_COLORS: Record<AdvanceStatus, string> = {
  Open: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PartiallyApplied: 'bg-blue-50 text-blue-700 border-blue-200',
  FullyApplied: 'bg-gray-100 text-gray-700 border-gray-200',
  Void: 'bg-rose-50 text-rose-700 border-rose-200',
};

const PARTY_COLORS: Record<AdvancePartyType, string> = {
  Customer: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Provider: 'bg-amber-50 text-amber-700 border-amber-200',
  Employee: 'bg-teal-50 text-teal-700 border-teal-200',
};

export default function AdvancesPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [selectedDirection, setSelectedDirection] = useState<AdvanceDirection | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<AdvanceStatus | 'all'>('all');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedAdvanceId, setSelectedAdvanceId] = useState<string | null>(null);

  // Apply Action inside Detail Modal State
  const [applyData, setApplyData] = useState<ApplyAdvanceDTO>({
    targetId: '',
    targetType: 'Invoice',
    amount: 0,
  });

  // Create Form State
  const [formData, setFormData] = useState<CreateAdvanceDTO>({
    party_type: 'Customer',
    party_id: '',
    direction: 'Received',
    amount: 0,
    advance_date: new Date().toISOString().split('T')[0],
    accountId: '',
    memo: '',
    currency: 'SAR',
  });

  // Fetch Advances List
  const { data: advancesRes, isLoading } = useQuery({
    queryKey: ['advances', selectedDirection, selectedStatus],
    queryFn: () =>
      financeService.getAdvances({
        direction: selectedDirection === 'all' ? undefined : selectedDirection,
        status: selectedStatus === 'all' ? undefined : selectedStatus,
      }),
  });

  const advances: Advance[] = advancesRes?.data || [];

  // Fetch Selected Advance Details
  const { data: advanceDetailRes, isLoading: isDetailLoading } = useQuery({
    queryKey: ['advance', selectedAdvanceId],
    queryFn: () => (selectedAdvanceId ? financeService.getAdvanceById(selectedAdvanceId) : null),
    enabled: Boolean(selectedAdvanceId),
  });

  const selectedAdvance: Advance | null = advanceDetailRes?.data || null;

  // Fetch Bank Accounts / GL Asset Accounts for picker
  const { data: bankAccountsRes } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: financeService.getBankAccounts,
  });

  const { data: assetAccountsRes } = useQuery({
    queryKey: ['accounts', 'Asset'],
    queryFn: () => financeService.getAccounts({ type: 'Asset' }),
  });

  const bankAccounts: BankAccount[] = bankAccountsRes?.data || [];
  const assetAccounts: Account[] = (assetAccountsRes?.data || []).filter(
    (a: Account) => a.account_type === 'Asset' && a.is_postable
  );

  // Mutations
  const createMutation = useMutation({
    mutationFn: financeService.createAdvance,
    onSuccess: () => {
      toast.success('Advance recorded successfully');
      queryClient.invalidateQueries({ queryKey: ['advances'] });
      setIsCreateModalOpen(false);
      resetCreateForm();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to record advance';
      toast.error(msg);
    },
  });

  const applyMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ApplyAdvanceDTO }) =>
      financeService.applyAdvance(id, data),
    onSuccess: () => {
      toast.success('Advance applied successfully');
      queryClient.invalidateQueries({ queryKey: ['advances'] });
      queryClient.invalidateQueries({ queryKey: ['advance', selectedAdvanceId] });
      setApplyData({ targetId: '', targetType: 'Invoice', amount: 0 });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to apply advance';
      toast.error(msg);
    },
  });

  const voidMutation = useMutation({
    mutationFn: financeService.voidAdvance,
    onSuccess: () => {
      toast.success('Advance voided successfully');
      queryClient.invalidateQueries({ queryKey: ['advances'] });
      queryClient.invalidateQueries({ queryKey: ['advance', selectedAdvanceId] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to void advance';
      toast.error(msg);
    },
  });

  const resetCreateForm = () => {
    setFormData({
      party_type: 'Customer',
      party_id: '',
      direction: 'Received',
      amount: 0,
      advance_date: new Date().toISOString().split('T')[0],
      accountId: '',
      memo: '',
      currency: 'SAR',
    });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.accountId) {
      toast.error('Please select a Bank / Cash Account');
      return;
    }
    if (!formData.amount || Number(formData.amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    createMutation.mutate({
      ...formData,
      amount: Number(formData.amount),
    });
  };

  const handleApplySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdvance) return;
    if (!applyData.targetId) {
      toast.error(`Please enter a valid ${applyData.targetType} ID`);
      return;
    }
    const applyAmt = Number(applyData.amount);
    const remaining = Number(selectedAdvance.remaining_amount);

    if (!applyAmt || applyAmt <= 0) {
      toast.error('Please enter a valid application amount');
      return;
    }

    if (applyAmt > remaining) {
      toast.error(
        `Application amount (${applyAmt} SAR) exceeds remaining advance balance (${remaining} SAR)`
      );
      return;
    }

    applyMutation.mutate({
      id: selectedAdvance.id,
      data: {
        targetId: applyData.targetId,
        targetType: applyData.targetType,
        amount: applyAmt,
      },
    });
  };

  // Filter advances by search term
  const filteredAdvances = advances.filter((adv) => {
    const q = search.toLowerCase();
    const ref = (adv.ref_id || '').toLowerCase();
    const partyId = (adv.party_id || '').toLowerCase();
    const memo = (adv.memo || '').toLowerCase();
    const partyType = adv.party_type.toLowerCase();
    return ref.includes(q) || partyId.includes(q) || memo.includes(q) || partyType.includes(q);
  });

  const columns: Column<Advance>[] = [
    {
      header: 'Advance Ref',
      accessor: (row) => (
        <div className="font-mono font-medium text-gray-900">
          {row.ref_id || row.id.slice(0, 8)}
        </div>
      ),
    },
    {
      header: 'Party Type',
      accessor: (row) => (
        <Badge className={PARTY_COLORS[row.party_type] || 'bg-gray-100 text-gray-700'}>
          {row.party_type}
        </Badge>
      ),
    },
    {
      header: 'Party ID',
      accessor: (row) =>
        row.party_id ? (
          <span className="font-mono text-xs text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
            {row.party_id.length > 12 ? `${row.party_id.slice(0, 10)}...` : row.party_id}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      header: 'Direction',
      accessor: (row) => (
        <div className="flex items-center gap-1">
          {row.direction === 'Received' ? (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
              <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
              Received
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1">
              <ArrowUpRight className="w-3 h-3 text-amber-600" />
              Paid
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: 'Total Amount',
      accessor: (row) => (
        <div className="font-mono font-medium text-right text-gray-900">
          {Number(row.amount).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{' '}
          <span className="text-xs text-gray-500">{row.currency || 'SAR'}</span>
        </div>
      ),
    },
    {
      header: 'Applied / Remaining',
      accessor: (row) => (
        <div className="text-right text-xs space-y-0.5 font-mono">
          <div className="text-gray-500">
            App: {Number(row.applied_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="font-semibold text-gray-900">
            Rem: {Number(row.remaining_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (row) => (
        <Badge className={STATUS_COLORS[row.status] || 'bg-gray-100 text-gray-700'}>
          {row.status}
        </Badge>
      ),
    },
  ];

  return (
    <DashboardLayout active="finance" title="Advances">
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Advances</h1>
          </div>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="gap-2 bg-[#FA634E] hover:bg-[#E54D38] text-white"
          >
            <Plus className="w-4 h-4" />
            <span>New Advance</span>
          </Button>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-4 bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
          {/* Direction Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-gray-500 mr-1">Direction:</span>
            {(['all', 'Received', 'Paid'] as const).map((dir) => (
              <Button
                key={dir}
                variant={selectedDirection === dir ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSelectedDirection(dir)}
                className={`h-7 text-xs capitalize ${
                  selectedDirection === dir ? 'bg-gray-900 text-white' : 'text-gray-600'
                }`}
              >
                {dir}
              </Button>
            ))}
          </div>

          <div className="h-4 w-px bg-gray-200 hidden sm:block" />

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-gray-500 mr-1">Status:</span>
            {(['all', 'Open', 'PartiallyApplied', 'FullyApplied', 'Void'] as const).map((st) => (
              <Button
                key={st}
                variant={selectedStatus === st ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSelectedStatus(st)}
                className={`h-7 text-xs capitalize ${
                  selectedStatus === st ? 'bg-gray-900 text-white' : 'text-gray-600'
                }`}
              >
                {st}
              </Button>
            ))}
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <DataTable
            data={filteredAdvances}
            columns={columns}
            isLoading={isLoading}
            searchValue={search}
            searchPlaceholder="Search advance ref, party ID, memo..."
            onSearchChange={setSearch}
            onRowClick={(row) => setSelectedAdvanceId(row.id)}
            emptyMessage="No advances found."
          />
        </div>

        {/* Create Advance Dialog */}
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-gray-900">New Advance</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreateSubmit} className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">
                    Party Type <span className="text-rose-500">*</span>
                  </Label>
                  <Select
                    value={formData.party_type}
                    onValueChange={(val: AdvancePartyType) =>
                      setFormData((prev) => ({ ...prev, party_type: val }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Customer">Customer</SelectItem>
                      <SelectItem value="Provider">Provider</SelectItem>
                      <SelectItem value="Employee">Employee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">Party ID</Label>
                  <Input
                    placeholder="ID / Code"
                    value={formData.party_id || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, party_id: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">
                    Direction <span className="text-rose-500">*</span>
                  </Label>
                  <Select
                    value={formData.direction}
                    onValueChange={(val: AdvanceDirection) =>
                      setFormData((prev) => ({ ...prev, direction: val }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Received">Received (Deposit In)</SelectItem>
                      <SelectItem value="Paid">Paid (Deposit Out)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">
                    Amount (SAR) <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.amount || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">
                    Advance Date <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={formData.advance_date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, advance_date: e.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">
                    Bank / Cash Account <span className="text-rose-500">*</span>
                  </Label>
                  <Select
                    value={formData.accountId}
                    onValueChange={(val) => setFormData((prev) => ({ ...prev, accountId: val }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Account" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.length > 0
                        ? bankAccounts.map((b) => (
                            <SelectItem key={b.accountId} value={b.accountId}>
                              <span>{b.is_cash ? 'Cash Drawer' : b.bank_name || 'Bank Account'}</span>
                              {b.account && <span className="text-xs text-gray-400 ml-1">({b.account.account_code})</span>}
                            </SelectItem>
                          ))
                        : assetAccounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id}>
                              <span className="font-mono font-semibold mr-1">{acc.account_code}</span>
                              <span>{acc.name}</span>
                            </SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-700">Memo / Reference</Label>
                <Input
                  placeholder="Notes or advance purpose..."
                  value={formData.memo || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, memo: e.target.value }))}
                />
              </div>

              <DialogFooter className="pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="bg-[#FA634E] hover:bg-[#E54D38] text-white"
                >
                  {createMutation.isPending ? 'Saving...' : 'Record Advance'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Advance Detail & Action Modal */}
        <Dialog open={Boolean(selectedAdvanceId)} onOpenChange={() => setSelectedAdvanceId(null)}>
          <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-gray-900 flex items-center justify-between">
                <span>Advance Details</span>
                {selectedAdvance && (
                  <Badge className={STATUS_COLORS[selectedAdvance.status]}>
                    {selectedAdvance.status}
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>

            {isDetailLoading || !selectedAdvance ? (
              <div className="p-8 text-center text-gray-500">Loading advance details...</div>
            ) : (
              <div className="space-y-6 py-2">
                {/* Summary Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <div>
                    <span className="text-xs text-gray-500 block">Ref / ID</span>
                    <span className="font-mono font-semibold text-sm text-gray-900">
                      {selectedAdvance.ref_id || selectedAdvance.id.slice(0, 10)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 block">Party</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge className={PARTY_COLORS[selectedAdvance.party_type]}>
                        {selectedAdvance.party_type}
                      </Badge>
                      {selectedAdvance.party_id && (
                        <span className="font-mono text-xs text-gray-600">
                          {selectedAdvance.party_id.slice(0, 8)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 block">Direction</span>
                    <span className="font-semibold text-sm text-gray-900">
                      {selectedAdvance.direction}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 block">Total Amount</span>
                    <span className="font-mono font-bold text-sm text-gray-900">
                      {Number(selectedAdvance.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                      SAR
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 block">Applied Amount</span>
                    <span className="font-mono text-sm text-gray-700">
                      {Number(selectedAdvance.applied_amount || 0).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                      })}{' '}
                      SAR
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 block">Remaining</span>
                    <span className="font-mono font-bold text-sm text-emerald-600">
                      {Number(selectedAdvance.remaining_amount || 0).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                      })}{' '}
                      SAR
                    </span>
                  </div>
                </div>

                {/* Applications List */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Applications History ({selectedAdvance.applications?.length || 0})
                  </h3>
                  {selectedAdvance.applications && selectedAdvance.applications.length > 0 ? (
                    <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
                      {selectedAdvance.applications.map((app) => (
                        <div key={app.id} className="p-3 bg-white flex items-center justify-between text-xs">
                          <div className="space-y-0.5">
                            <div className="font-medium text-gray-900 flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">
                                {app.invoiceId ? 'Invoice' : 'Bill'}
                              </Badge>
                              <span className="font-mono">
                                {app.invoice?.ref_id || app.bill?.ref_id || app.invoiceId || app.billId}
                              </span>
                            </div>
                            <div className="text-gray-400">
                              Applied on {new Date(app.applied_date).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="font-mono font-semibold text-gray-900">
                            {Number(app.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} SAR
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-50 border border-dashed border-gray-200 rounded-lg text-center text-xs text-gray-400">
                      No applications recorded yet.
                    </div>
                  )}
                </div>

                {/* Apply Action Form (Only when remaining > 0 and not void) */}
                {Number(selectedAdvance.remaining_amount) > 0 && selectedAdvance.status !== 'Void' && (
                  <form
                    onSubmit={handleApplySubmit}
                    className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-3"
                  >
                    <h3 className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                      Apply to Invoice / Bill
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold text-gray-700">Target Type</Label>
                        <Select
                          value={applyData.targetType}
                          onValueChange={(val: 'Invoice' | 'Bill') =>
                            setApplyData((prev) => ({ ...prev, targetType: val }))
                          }
                        >
                          <SelectTrigger className="h-8 text-xs bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Invoice">Invoice</SelectItem>
                            <SelectItem value="Bill">Bill</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold text-gray-700">
                          {applyData.targetType} ID <span className="text-rose-500">*</span>
                        </Label>
                        <Input
                          placeholder={`Enter ${applyData.targetType} ID`}
                          value={applyData.targetId}
                          onChange={(e) => setApplyData((prev) => ({ ...prev, targetId: e.target.value }))}
                          className="h-8 text-xs bg-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold text-gray-700">
                          Amount (SAR) <span className="text-rose-500">*</span>
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={applyData.amount || ''}
                          onChange={(e) =>
                            setApplyData((prev) => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))
                          }
                          className="h-8 text-xs bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={applyMutation.isPending}
                        className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {applyMutation.isPending ? 'Applying...' : 'Confirm Application'}
                      </Button>
                    </div>
                  </form>
                )}

                {/* Void Action (Only when applied_amount === 0 and status !== 'Void') */}
                {Number(selectedAdvance.applied_amount || 0) === 0 && selectedAdvance.status !== 'Void' && (
                  <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-500">
                      Unapplied advances can be voided to reverse accounting entries.
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => voidMutation.mutate(selectedAdvance.id)}
                      disabled={voidMutation.isPending}
                      className="text-rose-600 border-rose-200 hover:bg-rose-50 gap-1.5 h-8 text-xs"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      {voidMutation.isPending ? 'Voiding...' : 'Void Advance'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
