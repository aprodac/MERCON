import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Trash2,
  Edit2,
  FolderTree,
  List,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Download,
  Search,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DataTable, { Column } from '@/components/ui/DataTable';
import ExportModal, { ExportColumn } from '@/components/ui/ExportModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusTabs, MoneyText } from '@/components/finance/kit';
import { formatMoney } from '@/lib/finance';

import { financeService, CreateAccountDTO } from '@/services/financeService';
import type { Account, AccountType } from '@mercon/shared-types';

const ACCOUNT_TYPES: AccountType[] = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

const TYPE_CONFIG: Record<AccountType, { label: string; bgClass: string; textClass: string; borderClass: string }> = {
  Asset: { label: 'Asset', bgClass: 'bg-emerald-50 dark:bg-emerald-950/50', textClass: 'text-emerald-800 dark:text-emerald-300', borderClass: 'border-emerald-200/80 dark:border-emerald-800/60' },
  Liability: { label: 'Liability', bgClass: 'bg-amber-50 dark:bg-amber-950/50', textClass: 'text-amber-800 dark:text-amber-300', borderClass: 'border-amber-200/80 dark:border-amber-800/60' },
  Equity: { label: 'Equity', bgClass: 'bg-purple-50 dark:bg-purple-950/50', textClass: 'text-purple-800 dark:text-purple-300', borderClass: 'border-purple-200/80 dark:border-purple-800/60' },
  Revenue: { label: 'Revenue', bgClass: 'bg-blue-50 dark:bg-blue-950/50', textClass: 'text-blue-800 dark:text-blue-300', borderClass: 'border-blue-200/80 dark:border-blue-800/60' },
  Expense: { label: 'Expense', bgClass: 'bg-rose-50 dark:bg-rose-950/50', textClass: 'text-rose-800 dark:text-rose-300', borderClass: 'border-rose-200/80 dark:border-rose-800/60' },
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
  const [viewMode, setViewMode] = useState<'tree' | 'table'>('table');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

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

  // Hierarchical Tree Structure
  const treeData = useMemo(() => {
    const rootNodes = accounts.filter((a) => !a.parentId);
    return rootNodes;
  }, [accounts]);

  const toggleTreeNode = (id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
      account_type: 'Asset',
      cash_flow_category: null,
      parentId: parentId || null,
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
      cash_flow_category: acc.cash_flow_category || null,
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

  // Helper for Balance & Dr/Cr Tag
  const renderBalance = (acc: Account) => {
    const bal = (acc as any).current_balance ?? 0;
    const isAssetOrExpense = acc.account_type === 'Asset' || acc.account_type === 'Expense';
    const tag = isAssetOrExpense ? 'Dr' : 'Cr';
    const isDr = tag === 'Dr';

    return (
      <div className="flex items-center gap-1.5 font-mono text-xs">
        <span className="font-bold text-slate-900 dark:text-slate-100 fin-num">
          {formatMoney(Math.abs(bal), { currency: 'SAR' })}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
            isDr
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-300'
              : 'bg-amber-50 text-amber-900 border border-amber-200/80 dark:bg-amber-950/60 dark:text-amber-300'
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
          className="font-mono font-bold text-[11.5px] tracking-tight bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-2.5 py-0.5 rounded-md hover:bg-[#FA634E] dark:hover:bg-[#FA634E] dark:hover:text-white transition-colors cursor-pointer shadow-2xs"
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
            className="font-semibold text-slate-900 dark:text-slate-100 hover:text-[#FA634E] text-xs text-left cursor-pointer transition-colors"
          >
            {acc.parentId && <span className="text-slate-300 font-mono mr-1.5">└</span>}
            {acc.name}
          </button>
          {acc.description && <div className="text-[11px] text-slate-400 truncate">{acc.description}</div>}
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
        <span className="text-slate-500 text-xs">
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
          <span className="inline-flex items-center text-slate-500 dark:text-slate-400 text-xs font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
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
              className="h-7 px-2 text-xs text-[#FA634E] hover:text-white hover:bg-[#FA634E] font-bold rounded-lg transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5 mr-1" />
              Ledger
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEditModal(acc)}
            className="h-7 w-7 p-0 text-slate-400 hover:text-slate-900 dark:hover:text-white"
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
              className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateMutation.mutate({ id: acc.id, data: { isActive: true } })}
              title="Reactivate Account"
              className="h-7 px-2 text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
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
        {/* Top Header Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Chart of Accounts</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              General ledger accounts master registry & live financial balances
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExportOpen(true)}
              className="h-9 text-xs font-semibold rounded-xl"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export
            </Button>
            <Button
              onClick={() => openCreateModal()}
              className="bg-[#FA634E] hover:bg-[#e0523d] text-white h-9 text-xs font-semibold px-3.5 rounded-xl shadow-xs"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add Account
            </Button>
          </div>
        </div>

        {/* Account Class Tabs (Odoo / Zoho style) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 rounded-2xl px-4 py-1.5 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <StatusTabs
            value={selectedType}
            onChange={(tab) => setSelectedType(tab as any)}
            tabs={[
              { key: 'all', label: 'All Accounts', count: tabCounts.all },
              { key: 'Asset', label: 'Assets', count: tabCounts.Asset, badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200' },
              { key: 'Liability', label: 'Liabilities', count: tabCounts.Liability, badgeClass: 'bg-amber-100 text-amber-800 border border-amber-200' },
              { key: 'Equity', label: 'Equity', count: tabCounts.Equity, badgeClass: 'bg-purple-100 text-purple-800 border border-purple-200' },
              { key: 'Revenue', label: 'Revenue', count: tabCounts.Revenue, badgeClass: 'bg-blue-100 text-blue-800 border border-blue-200' },
              { key: 'Expense', label: 'Expenses', count: tabCounts.Expense, badgeClass: 'bg-rose-100 text-rose-800 border border-rose-200' },
            ]}
          />

          {/* View Mode & Inactive Toggle */}
          <div className="flex items-center gap-2 self-end sm:self-auto py-1">
            <div className="bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl flex items-center border border-slate-200/80 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'table' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <List className="w-3.5 h-3.5" /> Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('tree')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'tree' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <FolderTree className="w-3.5 h-3.5" /> Tree View
              </button>
            </div>

            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 font-medium cursor-pointer select-none h-8 px-2.5 border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-2xs">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-slate-300 text-[#FA634E] focus:ring-[#FA634E] w-3.5 h-3.5"
              />
              Show Inactive
            </label>
          </div>
        </div>

        {/* Tree View vs Flat Table View */}
        {viewMode === 'tree' ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 rounded-2xl shadow-2xs overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            <div className="bg-[#F9FAFB] dark:bg-slate-800/90 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 grid grid-cols-12 gap-3 border-b border-slate-200/60 dark:border-slate-700">
              <div className="col-span-5">Account Code & Name</div>
              <div className="col-span-2">Account Type</div>
              <div className="col-span-3 text-right">Live Balance</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            {treeData.map((node) => (
              <TreeRow
                key={node.id}
                node={node}
                allAccounts={accounts}
                expandedNodes={expandedNodes}
                toggleTreeNode={toggleTreeNode}
                navigate={navigate}
                openEditModal={openEditModal}
                openCreateModal={openCreateModal}
                deleteMutation={deleteMutation}
                renderBalance={renderBalance}
              />
            ))}
          </div>
        ) : (
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
        )}

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
              <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">
                {editingAccount ? 'Edit Account' : 'New Account'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                    Account Code *
                  </label>
                  <Input
                    placeholder="e.g. 1010"
                    value={formData.account_code}
                    onChange={(e) => setFormData({ ...formData, account_code: e.target.value })}
                    className="h-9 text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
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
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                  Account Name *
                </label>
                <Input
                  placeholder="e.g. Main Cash Account"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="h-9 text-xs font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                  Parent Header Account (Optional)
                </label>
                <Select
                  value={formData.parentId || 'none'}
                  onValueChange={(val) => setFormData({ ...formData, parentId: val === 'none' ? null : val })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="No Parent (Root Header)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Parent (Root Header)</SelectItem>
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
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                  Description
                </label>
                <Input
                  placeholder="Account purpose or memo"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3">
                <label className="flex items-center space-x-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
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
                  className="bg-[#FA634E] hover:bg-[#e0523d] text-white font-bold"
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

// Tree Row Component for Hierarchical Display
function TreeRow({
  node,
  allAccounts,
  expandedNodes,
  toggleTreeNode,
  navigate,
  openEditModal,
  openCreateModal,
  deleteMutation,
  renderBalance,
  depth = 0,
}: {
  node: Account;
  allAccounts: Account[];
  expandedNodes: Set<string>;
  toggleTreeNode: (id: string) => void;
  navigate: ReturnType<typeof useNavigate>;
  openEditModal: (acc: Account) => void;
  openCreateModal: (parentId?: string) => void;
  deleteMutation: any;
  renderBalance: (acc: Account) => React.ReactNode;
  depth?: number;
}) {
  const children = allAccounts.filter((a) => a.parentId === node.id);
  const hasChildren = children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const cfg = TYPE_CONFIG[node.account_type] || TYPE_CONFIG.Asset;

  return (
    <div className="flex flex-col">
      <div
        className={`px-4 py-2.5 text-xs grid grid-cols-12 gap-3 items-center hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
          !node.is_postable ? 'bg-slate-50/50 dark:bg-slate-800/30 font-semibold' : ''
        }`}
        style={{ paddingLeft: `${16 + depth * 24}px` }}
      >
        <div className="col-span-5 flex items-center gap-2 min-w-0">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleTreeNode(node.id)}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 cursor-pointer"
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-5" />
          )}

          <button
            type="button"
            onClick={() => navigate(`/finance/general-ledger?account_id=${node.id}`)}
            className="font-mono font-bold text-[11px] tracking-tight bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-2 py-0.5 rounded shadow-2xs hover:bg-[#FA634E] dark:hover:bg-[#FA634E] dark:hover:text-white transition-colors cursor-pointer shrink-0"
          >
            {node.account_code}
          </button>

          <button
            type="button"
            onClick={() => navigate(`/finance/general-ledger?account_id=${node.id}`)}
            className="font-medium text-slate-900 dark:text-slate-100 hover:text-[#FA634E] truncate text-left cursor-pointer"
          >
            {node.name}
          </button>
        </div>

        <div className="col-span-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.bgClass} ${cfg.textClass} ${cfg.borderClass}`}>
            {node.account_type}
          </span>
        </div>

        <div className="col-span-3 text-right">{renderBalance(node)}</div>

        <div className="col-span-2 flex items-center justify-end gap-1">
          {node.is_postable && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/finance/general-ledger?account_id=${node.id}`)}
              className="h-6 px-1.5 text-[11px] text-[#FA634E] hover:bg-rose-50 font-bold"
            >
              <BookOpen className="w-3 h-3 mr-1" /> Ledger
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openCreateModal(node.id)}
            title="Add Sub-Account"
            className="h-6 w-6 p-0 text-slate-400 hover:text-slate-700"
          >
            <Plus className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEditModal(node)}
            className="h-6 w-6 p-0 text-slate-400 hover:text-slate-700"
          >
            <Edit2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              allAccounts={allAccounts}
              expandedNodes={expandedNodes}
              toggleTreeNode={toggleTreeNode}
              navigate={navigate}
              openEditModal={openEditModal}
              openCreateModal={openCreateModal}
              deleteMutation={deleteMutation}
              renderBalance={renderBalance}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
