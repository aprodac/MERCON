import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Trash2,
  Edit2,
  BookOpen,
  CheckCircle2,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import DataTable, { Column } from '@/components/ui/DataTable';
import ExportModal, { ExportColumn } from '@/components/ui/ExportModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusTabs } from '@/components/finance/kit';
import { formatMoney } from '@/lib/finance';

import { financeService, CreateAccountDTO } from '@/services/financeService';
import type { Account, AccountType } from '@mercon/shared-types';

const ACCOUNT_TYPES: AccountType[] = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

const TYPE_CONFIG: Record<AccountType, { label: string; bgClass: string; textClass: string; borderClass: string }> = {
  Asset: { label: 'Asset', bgClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/50', textClass: 'text-emerald-800 dark:text-emerald-300', borderClass: 'border-emerald-200/80 dark:border-emerald-800/60' },
  Liability: { label: 'Liability', bgClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/50', textClass: 'text-amber-800 dark:text-amber-300', borderClass: 'border-amber-200/80 dark:border-amber-800/60' },
  Equity: { label: 'Equity', bgClass: 'bg-purple-50 dark:bg-purple-950/50', textClass: 'text-purple-800 dark:text-purple-300', borderClass: 'border-purple-200/80 dark:border-purple-800/60' },
  Revenue: { label: 'Revenue', bgClass: 'bg-blue-50 dark:bg-blue-950/50', textClass: 'text-blue-800 dark:text-blue-300', borderClass: 'border-blue-200/80 dark:border-blue-800/60' },
  Expense: { label: 'Expense', bgClass: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-950/50', textClass: 'text-rose-800 dark:text-rose-300', borderClass: 'border-rose-200/80 dark:border-rose-800/60' },
};

const CHART_OF_ACCOUNTS_EXPORT_COLUMNS: ExportColumn<Account>[] = [
  { id: 'account_code', label: 'Account Code', accessor: (a) => a.account_code },
  { id: 'name', label: 'Account Name', accessor: (a) => a.name },
  { id: 'account_type', label: 'Account Type', accessor: (a) => a.account_type },
  { id: 'parent_account_code', label: 'Parent Account', accessor: (a) => a.parent ? `${a.parent.account_code} - ${a.parent.name}` : '—' },
  { id: 'is_postable', label: 'Postable', accessor: (a) => (a.is_postable ? 'Direct Posting' : 'Header Account') },
  { id: 'current_balance', label: 'Live Balance', accessor: (a) => (a as any).current_balance ?? 0 },
  { id: 'isActive', label: 'Status', accessor: (a) => (a.isActive ? 'Active' : 'Inactive') },
];

export default function ChartOfAccountsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedType, setSelectedType] = useState<AccountType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  // Form State
  const [formData, setFormData] = useState<CreateAccountDTO>({
    account_code: '',
    name: '',
    account_type: 'Asset',
    cash_flow_category: null,
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

  // Account Type Tab Counts
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: accounts.length };
    ACCOUNT_TYPES.forEach((t) => {
      counts[t] = accounts.filter((a) => a.account_type === t).length;
    });
    return counts;
  }, [accounts]);

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

  const openCreateModal = (parentId?: string | null) => {
    setEditingAccount(null);
    setFormData({
      account_code: '',
      name: '',
      account_type: selectedType !== 'all' ? selectedType : 'Asset',
      cash_flow_category: null,
      parentId: parentId || null,
      description: '',
      is_postable: true,
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (account: Account) => {
    setEditingAccount(account);
    setFormData({
      account_code: account.account_code,
      name: account.name,
      account_type: account.account_type,
      cash_flow_category: account.cash_flow_category || null,
      parentId: account.parentId || null,
      description: account.description || '',
      is_postable: account.is_postable,
      isActive: account.isActive,
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
      toast.error('Please enter account code and name');
      return;
    }

    if (editingAccount) {
      updateMutation.mutate({ id: editingAccount.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const renderBalance = (acc: Account) => {
    const bal = (acc as any).current_balance ?? 0;
    const isAssetOrExpense = acc.account_type === 'Asset' || acc.account_type === 'Expense';
    const tag = isAssetOrExpense ? 'Dr' : 'Cr';
    const isDr = tag === 'Dr';

    return (
      <div className="flex items-center gap-1.5 font-mono text-xs">
        <span className="font-bold text-foreground fin-num">
          {formatMoney(Math.abs(bal), { currency: 'SAR' })}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
            isDr
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 text-emerald-800 border border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-300'
              : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 text-amber-900 border border-amber-200/80 dark:bg-amber-950/60 dark:text-amber-300'
          }`}
        >
          {tag}
        </span>
      </div>
    );
  };

  const columns: Column<Account>[] = [
    {
      header: 'Account Code',
      accessor: (acc) => (
        <button
          type="button"
          onClick={() => navigate(`/finance/general-ledger?account_id=${acc.id}`)}
          className="font-mono font-bold text-xs text-foreground hover:text-[#FA634E] dark:hover:text-[#FA634E] transition-colors cursor-pointer"
          title="Click to view General Ledger"
        >
          {acc.account_code}
        </button>
      ),
      mobilePriority: 'primary',
    },
    {
      header: 'Account Name',
      accessor: (acc) => (
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => navigate(`/finance/general-ledger?account_id=${acc.id}`)}
            className="font-semibold text-foreground hover:text-[#FA634E] text-xs text-left cursor-pointer transition-colors"
          >
            {acc.parentId && <span className="text-slate-300 font-mono mr-1.5">└</span>}
            {acc.name}
          </button>
          {acc.description && <div className="text-[11px] text-muted-foreground truncate">{acc.description}</div>}
        </div>
      ),
      mobilePriority: 'primary',
    },
    {
      header: 'Type',
      accessor: (acc) => {
        const cfg = TYPE_CONFIG[acc.account_type] || TYPE_CONFIG.Asset;
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.bgClass} ${cfg.textClass} ${cfg.borderClass}`}>
            {acc.account_type}
          </span>
        );
      },
      mobilePriority: 'secondary',
    },
    {
      header: 'Parent Header',
      accessor: (acc) => (
        <span className="text-muted-foreground text-xs">
          {acc.parent ? `${acc.parent.account_code} - ${acc.parent.name}` : '—'}
        </span>
      ),
      mobilePriority: 'meta',
    },
    {
      header: 'Live Balance',
      accessor: (acc) => renderBalance(acc),
      mobilePriority: 'primary',
    },
    {
      header: 'Posting Type',
      accessor: (acc) =>
        acc.is_postable ? (
          <span className="inline-flex items-center text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-500" /> Direct Posting
          </span>
        ) : (
          <span className="inline-flex items-center text-muted-foreground dark:text-muted-foreground text-xs font-medium bg-muted px-2 py-0.5 rounded-md border border-border dark:border-border">
            Header Container
          </span>
        ),
      mobilePriority: 'meta',
    },
    {
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      accessor: (acc) => (
        <div className="space-x-1 flex items-center justify-end">
          {acc.is_postable && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/finance/general-ledger?account_id=${acc.id}`)}
              title="View General Ledger"
              className="h-7 px-2 text-xs text-[#FA634E] hover:text-white hover:bg-[#FA634E] font-bold rounded-lg transition-colors cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 mr-1" />
              Ledger
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEditModal(acc)}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground dark:hover:text-white cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          {acc.isActive ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm(`Deactivate account ${acc.account_code} - ${acc.name}?`)) deleteMutation.mutate(acc.id);
              }}
              title="Deactivate Account"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-600 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateMutation.mutate({ id: acc.id, data: { isActive: true } })}
              title="Reactivate Account"
              className="h-7 px-2 text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 cursor-pointer"
            >
              Reactivate
            </Button>
          )}
        </div>
      ),
      mobilePriority: 'hidden',
    },
  ];

  return (
    <DashboardLayout active="finance" title="Chart of Accounts">
      <div className="p-6 space-y-4 max-w-7xl mx-auto">
        {/* Control Bar: Class Tabs + Actions */}
        <div className="bg-card border border-border dark:border-border rounded-xl px-4 py-2 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <StatusTabs
            value={selectedType}
            onChange={(tab) => setSelectedType(tab as any)}
            tabs={[
              { key: 'all', label: 'All Accounts', count: tabCounts.all },
              { key: 'Asset', label: 'Assets', count: tabCounts.Asset, badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 text-emerald-800 border border-emerald-200' },
              { key: 'Liability', label: 'Liabilities', count: tabCounts.Liability, badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 text-amber-800 border border-amber-200' },
              { key: 'Equity', label: 'Equity', count: tabCounts.Equity, badgeClass: 'bg-purple-100 text-purple-800 border border-purple-200' },
              { key: 'Revenue', label: 'Revenue', count: tabCounts.Revenue, badgeClass: 'bg-blue-100 text-blue-800 border border-blue-200' },
              { key: 'Expense', label: 'Expenses', count: tabCounts.Expense, badgeClass: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 text-rose-800 border border-rose-200' },
            ]}
          />

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground dark:text-muted-foreground font-medium cursor-pointer select-none h-8 px-2.5 border border-border dark:border-border rounded-xl bg-card shadow-xs">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-border text-[#FA634E] focus:ring-[#FA634E] w-3.5 h-3.5"
              />
              Show Inactive
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExportOpen(true)}
              className="h-8 text-xs font-semibold rounded-xl cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export
            </Button>
            <Button
              onClick={() => openCreateModal()}
              className="bg-[#FA634E] hover:bg-[#e0523d] text-white h-8 text-xs font-semibold px-3 rounded-xl shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Account
            </Button>
          </div>
        </div>

        {/* Flat Ledger Table View */}
        <DataTable<Account>
          columns={columns}
          data={accounts}
          isLoading={isLoading}
          searchPlaceholder="Search code, name, description..."
          searchValue={search}
          onSearchChange={setSearch}
          enableSelection={false}
          getRowId={(acc) => acc.id}
          emptyTitle="No Accounts Found"
          emptyMessage="No chart of accounts records found matching filter criteria."
        />

        {/* Export Modal */}
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          title="Export Chart of Accounts"
          description="Download Chart of Accounts ledger and balances."
          fileNamePrefix="chart_of_accounts"
          sheetName="Chart of Accounts"
          subtitle="MERCON Logistics General Ledger Accounts Register"
          filteredData={accounts}
          columns={CHART_OF_ACCOUNTS_EXPORT_COLUMNS}
          formats={['xlsx', 'csv']}
        />

        {/* Create / Edit Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-foreground dark:text-white">
                {editingAccount ? 'Edit Account' : 'New Account'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 block">
                    Account Code *
                  </label>
                  <Input
                    placeholder="e.g. 1010"
                    value={formData.account_code}
                    onChange={(e) => setFormData({ ...formData, account_code: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 block">
                    Account Type *
                  </label>
                  <Select
                    value={formData.account_type}
                    onValueChange={(val: AccountType) => setFormData({ ...formData, account_type: val })}
                  >
                    <SelectTrigger>
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
                <label className="text-xs font-semibold text-foreground mb-1 block">
                  Account Name *
                </label>
                <Input
                  placeholder="e.g. Operating Cash Account"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">
                  Parent Account Header (Optional)
                </label>
                <Select
                  value={formData.parentId || 'none'}
                  onValueChange={(val) => setFormData({ ...formData, parentId: val === 'none' ? null : val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select parent account (if sub-account)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Top-Level Account)</SelectItem>
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
                <label className="text-xs font-semibold text-foreground mb-1 block">
                  Description / Remarks
                </label>
                <Input
                  placeholder="Optional brief description..."
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_postable}
                    onChange={(e) => setFormData({ ...formData, is_postable: e.target.checked })}
                    className="rounded border-border text-[#FA634E] focus:ring-[#FA634E]"
                  />
                  Direct Posting Allowed
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded border-border text-[#FA634E] focus:ring-[#FA634E]"
                  />
                  Active Account
                </label>
              </div>

              <DialogFooter className="pt-4 border-t border-border dark:border-border">
                <Button type="button" variant="ghost" onClick={closeModal}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="bg-[#FA634E] hover:bg-[#e0523d] text-white"
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
