import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Landmark, Wallet, ArrowRightLeft, Building2 } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import KpiCard from '@/components/ui/KpiCard';
import DataTable, { Column } from '@/components/ui/DataTable';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

import {
  financeService,
  CreateBankAccountDTO,
  TransferFundsDTO,
} from '@/services/financeService';
import type { BankAccount, Account } from '@mercon/shared-types';

export default function BankAccountsPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);

  // Form State: Create Bank Account
  const [formData, setFormData] = useState<CreateBankAccountDTO>({
    accountId: '',
    bank_name: '',
    account_number: '',
    iban: '',
    swift_code: '',
    is_cash: false,
    opening_balance: 0,
    opening_date: new Date().toISOString().split('T')[0],
    currency: 'SAR',
  });

  // Form State: Transfer Funds
  const [transferData, setTransferData] = useState<TransferFundsDTO>({
    fromAccountId: '',
    toAccountId: '',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    memo: '',
  });

  // Fetch Bank Accounts
  const { data: bankAccountsRes, isLoading } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: financeService.getBankAccounts,
  });

  const bankAccounts: BankAccount[] = bankAccountsRes?.data || [];

  // Fetch GL Accounts for dropdown (Filter Asset & Postable)
  const { data: accountsRes } = useQuery({
    queryKey: ['accounts', 'Asset'],
    queryFn: () => financeService.getAccounts({ type: 'Asset' }),
  });

  const assetAccounts: Account[] = (accountsRes?.data || []).filter(
    (a: Account) => a.account_type === 'Asset' && a.is_postable
  );

  // Mutations
  const createMutation = useMutation({
    mutationFn: financeService.createBankAccount,
    onSuccess: () => {
      toast.success('Bank Account created successfully');
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      setIsCreateModalOpen(false);
      resetCreateForm();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to create bank account';
      toast.error(msg);
    },
  });

  const transferMutation = useMutation({
    mutationFn: financeService.transferFunds,
    onSuccess: () => {
      toast.success('Funds transferred successfully');
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      setIsTransferModalOpen(false);
      resetTransferForm();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to transfer funds';
      toast.error(msg);
    },
  });

  const resetCreateForm = () => {
    setFormData({
      accountId: '',
      bank_name: '',
      account_number: '',
      iban: '',
      swift_code: '',
      is_cash: false,
      opening_balance: 0,
      opening_date: new Date().toISOString().split('T')[0],
      currency: 'SAR',
    });
  };

  const resetTransferForm = () => {
    setTransferData({
      fromAccountId: '',
      toAccountId: '',
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      memo: '',
    });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.accountId) {
      toast.error('Please select a linked GL Account');
      return;
    }
    createMutation.mutate({
      ...formData,
      bank_name: formData.is_cash ? null : formData.bank_name,
      account_number: formData.is_cash ? null : formData.account_number,
      iban: formData.is_cash ? null : formData.iban,
      swift_code: formData.is_cash ? null : formData.swift_code,
      opening_balance: Number(formData.opening_balance) || 0,
    });
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferData.fromAccountId || !transferData.toAccountId) {
      toast.error('Please select both From and To GL Accounts');
      return;
    }
    if (transferData.fromAccountId === transferData.toAccountId) {
      toast.error('From and To accounts must be different');
      return;
    }
    if (!transferData.amount || Number(transferData.amount) <= 0) {
      toast.error('Please enter a valid transfer amount');
      return;
    }
    transferMutation.mutate({
      ...transferData,
      amount: Number(transferData.amount),
    });
  };

  // Filtered bank accounts
  const filteredBankAccounts = bankAccounts.filter((ba) => {
    const q = search.toLowerCase();
    const nameStr = (ba.is_cash ? 'Cash Drawer' : ba.bank_name || '').toLowerCase();
    const accNum = (ba.account_number || '').toLowerCase();
    const iban = (ba.iban || '').toLowerCase();
    const glAcc = ba.account ? `${ba.account.account_code} ${ba.account.name}`.toLowerCase() : '';
    return nameStr.includes(q) || accNum.includes(q) || iban.includes(q) || glAcc.includes(q);
  });

  // KPI calculations
  const totalBankAccounts = bankAccounts.filter((b) => !b.is_cash).length;
  const totalCashDrawers = bankAccounts.filter((b) => b.is_cash).length;
  const totalOpeningBalance = bankAccounts.reduce(
    (sum, b) => sum + (Number(b.opening_balance) || 0),
    0
  );

  const columns: Column<BankAccount>[] = [
    {
      header: 'Bank / Cash Name',
      accessor: (row) => (
        <div className="flex items-center gap-2">
          {row.is_cash ? (
            <div className="flex items-center gap-1.5 font-medium text-amber-700">
              <Wallet className="w-4 h-4 text-amber-600" />
              <span>Cash Drawer</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 font-medium text-gray-900">
              <Building2 className="w-4 h-4 text-slate-500" />
              <span>{row.bank_name || 'Bank Account'}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Account / IBAN',
      accessor: (row) =>
        row.is_cash ? (
          <span className="text-gray-400">—</span>
        ) : (
          <div className="text-xs space-y-0.5">
            {row.account_number && <div className="font-mono text-gray-800">{row.account_number}</div>}
            {row.iban && <div className="font-mono text-gray-400 text-[11px]">{row.iban}</div>}
            {!row.account_number && !row.iban && <span className="text-gray-400">—</span>}
          </div>
        ),
    },
    {
      header: 'Linked GL Account',
      accessor: (row) =>
        row.account ? (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">
              {row.account.account_code}
            </span>
            <span className="text-sm text-gray-900 truncate max-w-[180px]">{row.account.name}</span>
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      header: 'Currency',
      accessor: (row) => <Badge variant="outline" className="text-xs font-mono">{row.currency || 'SAR'}</Badge>,
    },
    {
      header: 'Opening Balance',
      accessor: (row) => (
        <div className="font-mono font-medium text-right text-gray-900">
          {Number(row.opening_balance || 0).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{' '}
          <span className="text-xs text-gray-500">{row.currency || 'SAR'}</span>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (row) => (
        <Badge
          className={
            row.isActive
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-gray-100 text-gray-600 border-gray-200'
          }
        >
          {row.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
  ];

  return (
    <DashboardLayout active="finance" title="Bank Accounts">
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Bank Accounts</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setIsTransferModalOpen(true)}
              className="gap-2 border-gray-300"
            >
              <ArrowRightLeft className="w-4 h-4 text-gray-600" />
              <span>Transfer Funds</span>
            </Button>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="gap-2 bg-[#FA634E] hover:bg-[#E54D38] text-white"
            >
              <Plus className="w-4 h-4" />
              <span>New Bank Account</span>
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard
            title="Bank Accounts"
            value={totalBankAccounts}
            icon={Landmark}
            color="text-blue-600"
            bg="bg-blue-50"
          />
          <KpiCard
            title="Cash Drawers"
            value={totalCashDrawers}
            icon={Wallet}
            color="text-amber-600"
            bg="bg-amber-50"
          />
          <KpiCard
            title="Total Opening Balance"
            value={`${totalOpeningBalance.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} SAR`}
            icon={Building2}
            color="text-emerald-600"
            bg="bg-emerald-50"
          />
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <DataTable
            data={filteredBankAccounts}
            columns={columns}
            isLoading={isLoading}
            searchValue={search}
            searchPlaceholder="Search bank accounts, cash drawers, IBAN..."
            onSearchChange={setSearch}
            emptyMessage="No bank accounts found."
          />
        </div>

        {/* Create Bank Account Dialog */}
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogContent className="sm:max-w-[540px]">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-gray-900">New Bank Account</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreateSubmit} className="space-y-4 py-2">
              <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <Checkbox
                  id="is_cash"
                  checked={formData.is_cash}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, is_cash: Boolean(checked) }))
                  }
                />
                <Label htmlFor="is_cash" className="text-sm font-medium text-gray-900 cursor-pointer">
                  This is a cash drawer (Physical Cash Account)
                </Label>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-700">
                  Linked GL Account <span className="text-rose-500">*</span>
                </Label>
                <Select
                  value={formData.accountId}
                  onValueChange={(val) => setFormData((prev) => ({ ...prev, accountId: val }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Asset GL Account" />
                  </SelectTrigger>
                  <SelectContent>
                    {assetAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        <span className="font-mono font-semibold mr-2">{acc.account_code}</span>
                        <span>{acc.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!formData.is_cash && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-700">Bank Name</Label>
                    <Input
                      placeholder="e.g. Al Rajhi Bank, SNB"
                      value={formData.bank_name || ''}
                      onChange={(e) => setFormData((prev) => ({ ...prev, bank_name: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-700">Account Number</Label>
                    <Input
                      placeholder="Account Number"
                      value={formData.account_number || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, account_number: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-700">SWIFT Code</Label>
                    <Input
                      placeholder="SWIFT Code"
                      value={formData.swift_code || ''}
                      onChange={(e) => setFormData((prev) => ({ ...prev, swift_code: e.target.value }))}
                    />
                  </div>

                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-700">IBAN</Label>
                    <Input
                      placeholder="SA..."
                      value={formData.iban || ''}
                      onChange={(e) => setFormData((prev) => ({ ...prev, iban: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">Opening Balance</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.opening_balance || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        opening_balance: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">Opening Date</Label>
                  <Input
                    type="date"
                    value={formData.opening_date || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, opening_date: e.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">Currency</Label>
                  <Select
                    value={formData.currency || 'SAR'}
                    onValueChange={(val) => setFormData((prev) => ({ ...prev, currency: val }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SAR">SAR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                  {createMutation.isPending ? 'Saving...' : 'Create Account'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Transfer Funds Dialog */}
        <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-gray-900">Transfer Funds</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleTransferSubmit} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-700">
                  From Account (Debit Source) <span className="text-rose-500">*</span>
                </Label>
                <Select
                  value={transferData.fromAccountId}
                  onValueChange={(val) => setTransferData((prev) => ({ ...prev, fromAccountId: val }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Source Asset Account" />
                  </SelectTrigger>
                  <SelectContent>
                    {assetAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        <span className="font-mono font-semibold mr-2">{acc.account_code}</span>
                        <span>{acc.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-700">
                  To Account (Credit Destination) <span className="text-rose-500">*</span>
                </Label>
                <Select
                  value={transferData.toAccountId}
                  onValueChange={(val) => setTransferData((prev) => ({ ...prev, toAccountId: val }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Destination Asset Account" />
                  </SelectTrigger>
                  <SelectContent>
                    {assetAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        <span className="font-mono font-semibold mr-2">{acc.account_code}</span>
                        <span>{acc.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">
                    Amount (SAR) <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={transferData.amount || ''}
                    onChange={(e) =>
                      setTransferData((prev) => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">
                    Transfer Date <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={transferData.date}
                    onChange={(e) => setTransferData((prev) => ({ ...prev, date: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-700">Memo / Description</Label>
                <Input
                  placeholder="Reason for transfer..."
                  value={transferData.memo || ''}
                  onChange={(e) => setTransferData((prev) => ({ ...prev, memo: e.target.value }))}
                />
              </div>

              <DialogFooter className="pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsTransferModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={transferMutation.isPending}
                  className="bg-[#FA634E] hover:bg-[#E54D38] text-white"
                >
                  {transferMutation.isPending ? 'Transferring...' : 'Post Transfer'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
