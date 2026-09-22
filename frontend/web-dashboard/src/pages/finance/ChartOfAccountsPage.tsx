import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Layers, CheckCircle2, XCircle, Trash2, Edit2, ChevronRight, FolderTree } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

import { financeService, CreateAccountDTO } from '@/services/financeService';
import type { Account, AccountType } from '@mercon/shared-types';

const ACCOUNT_TYPES: AccountType[] = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

const TYPE_COLORS: Record<AccountType, string> = {
  Asset: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Liability: 'bg-amber-50 text-amber-700 border-amber-200',
  Equity: 'bg-purple-50 text-purple-700 border-purple-200',
  Revenue: 'bg-blue-50 text-blue-700 border-blue-200',
  Expense: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function ChartOfAccountsPage() {
  const queryClient = useQueryClient();

  const [selectedType, setSelectedType] = useState<AccountType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  // Form State
  const [formData, setFormData] = useState<CreateAccountDTO>({
    account_code: '',
    name: '',
    account_type: 'Asset',
    parentId: null,
    description: '',
    is_postable: true,
    isActive: true,
  });

  const { data: accountsRes, isLoading } = useQuery({
    queryKey: ['accounts', selectedType, search, showInactive],
    queryFn: () => financeService.getAccounts({ type: selectedType, search, include_inactive: showInactive }),
  });

  const accounts: Account[] = accountsRes?.data || [];

  const createMutation = useMutation({
    mutationFn: financeService.createAccount,
    onSuccess: () => {
      toast.success('Account created successfully');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to create account');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateAccountDTO> }) =>
      financeService.updateAccount(id, data),
    onSuccess: () => {
      toast.success('Account updated successfully');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to update account');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: financeService.deleteAccount,
    onSuccess: () => {
      toast.success('Account deactivated/deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to delete account');
    },
  });

  const openCreateModal = () => {
    setEditingAccount(null);
    setFormData({
      account_code: '',
      name: '',
      account_type: 'Asset',
      parentId: null,
      description: '',
      is_postable: true,
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (acc: Account) => {
    setEditingAccount(acc);
    setFormData({
      account_code: acc.account_code,
      name: acc.name,
      account_type: acc.account_type,
      parentId: acc.parentId || null,
      description: acc.description || '',
      is_postable: acc.is_postable,
      isActive: acc.isActive,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingAccount(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.account_code || !formData.name) {
      toast.error('Account code and name are required');
      return;
    }

    if (editingAccount) {
      updateMutation.mutate({ id: editingAccount.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <DashboardLayout active="finance" title="Chart of Accounts">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#3E3C3D]">Chart of Accounts</h1>
            <p className="text-sm text-slate-500">General ledger accounts register & hierarchy</p>
          </div>
          <Button
            onClick={openCreateModal}
            className="bg-[#FA634E] hover:bg-[#e0523d] text-white shadow-sm font-medium"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Account
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          {/* Type Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            <button
              onClick={() => setSelectedType('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                selectedType === 'all'
                  ? 'bg-[#3E3C3D] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Types
            </button>
            {ACCOUNT_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  selectedType === type
                    ? 'bg-[#FA634E] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Search & Inactive Toggle */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 font-medium cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-slate-300 text-[#FA634E] focus:ring-[#FA634E] w-3.5 h-3.5"
              />
              Show Inactive
            </label>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search code or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-slate-500 text-sm">Loading Chart of Accounts...</div>
          ) : accounts.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              No accounts found matching search criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3">Account Code</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Parent Account</th>
                    <th className="px-4 py-3">Postable</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {accounts.map((acc) => (
                    <tr key={acc.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-[#3E3C3D]">
                        {acc.account_code}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {acc.parentId && <span className="text-slate-300 mr-1.5">└</span>}
                        {acc.name}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`${TYPE_COLORS[acc.account_type]} border`}>
                          {acc.account_type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {acc.parent ? `${acc.parent.account_code} - ${acc.parent.name}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {acc.is_postable ? (
                          <span className="inline-flex items-center text-emerald-600 text-xs font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Postable
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-slate-400 text-xs">
                            Header Account
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {acc.isActive ? (
                          <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-slate-200 text-slate-500 bg-slate-50">
                            Inactive
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(acc)}
                          className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        {acc.isActive ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Deactivate/delete account ${acc.account_code}?`)) {
                                deleteMutation.mutate(acc.id);
                              }
                            }}
                            title="Deactivate Account"
                            className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              updateMutation.mutate({ id: acc.id, data: { isActive: true } });
                            }}
                            title="Reactivate Account"
                            className="h-7 px-2 text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          >
                            Reactivate
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-[#3E3C3D]">
                {editingAccount ? 'Edit Account' : 'New Account'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">
                    Account Code *
                  </label>
                  <Input
                    placeholder="e.g. 1010"
                    value={formData.account_code}
                    onChange={(e) => setFormData({ ...formData, account_code: e.target.value })}
                    className="h-9 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">
                    Account Type *
                  </label>
                  <Select
                    value={formData.account_type}
                    onValueChange={(val: AccountType) => setFormData({ ...formData, account_type: val })}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">
                  Account Name *
                </label>
                <Input
                  placeholder="e.g. Main Cash Account"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">
                  Parent Account (Optional Header)
                </label>
                <Select
                  value={formData.parentId || 'none'}
                  onValueChange={(val) => setFormData({ ...formData, parentId: val === 'none' ? null : val })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="No Parent (Root Account)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Parent (Root Account)</SelectItem>
                    {accounts
                      .filter((a) => a.id !== editingAccount?.id)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.account_code} - {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">
                  Description
                </label>
                <Input
                  placeholder="Account purpose or memo"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <label className="flex items-center space-x-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_postable}
                    onChange={(e) => setFormData({ ...formData, is_postable: e.target.checked })}
                    className="rounded text-[#FA634E] focus:ring-[#FA634E]"
                  />
                  <span>Allow Direct Postings (Postable Account)</span>
                </label>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" size="sm" onClick={closeModal}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-[#FA634E] hover:bg-[#e0523d] text-white"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editingAccount ? 'Save Changes' : 'Create Account'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
