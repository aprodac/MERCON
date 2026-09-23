import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Calendar, Lock, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import KpiCard from '@/components/ui/KpiCard';
import DataTable, { Column } from '@/components/ui/DataTable';
import ExportModal, { ExportColumn } from '@/components/ui/ExportModal';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

import { financeService, CreateAccountingPeriodDTO } from '@/services/financeService';
import { usePermissions } from '@/hooks/usePermissions';
import type { AccountingPeriod, PeriodStatus } from '@mercon/shared-types';

type PeriodRow = AccountingPeriod & { _count?: { journalEntries: number } };

const STATUS_BADGES: Record<PeriodStatus, string> = {
  Open: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Closed: 'bg-amber-50 text-amber-700 border-amber-200',
  Locked: 'bg-slate-100 text-slate-600 border-slate-300',
};

const ACCOUNTING_PERIODS_EXPORT_COLUMNS: ExportColumn<PeriodRow>[] = [
  { id: 'name', label: 'Period Name', accessor: (p) => p.name },
  { id: 'start_date', label: 'Start Date', accessor: (p) => (p.start_date ? new Date(p.start_date).toLocaleDateString() : '—') },
  { id: 'end_date', label: 'End Date', accessor: (p) => (p.end_date ? new Date(p.end_date).toLocaleDateString() : '—') },
  { id: 'status', label: 'Status', accessor: (p) => p.status },
  { id: 'journal_entries_count', label: 'Journal Entries Count', accessor: (p) => p._count?.journalEntries || 0 },
];

export default function AccountingPeriodsPage() {
  const queryClient = useQueryClient();
  const { userRole, isSuperAdmin } = usePermissions();
  const isAdmin = isSuperAdmin || userRole === 'Admin';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFyModalOpen, setIsFyModalOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [closingDate, setClosingDate] = useState<string>('');
  const [formData, setFormData] = useState<CreateAccountingPeriodDTO>({
    name: '',
    start_date: '',
    end_date: '',
  });

  const { data: periodsRes, isLoading } = useQuery({
    queryKey: ['accounting-periods'],
    queryFn: () => financeService.getAccountingPeriods(),
  });

  const periods: (AccountingPeriod & { _count?: { journalEntries: number } })[] = periodsRes?.data || [];

  const createMutation = useMutation({
    mutationFn: financeService.createAccountingPeriod,
    onSuccess: () => {
      toast.success('Accounting period created');
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
      setIsModalOpen(false);
      setFormData({ name: '', start_date: '', end_date: '' });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to create period');
    },
  });

  const closeMutation = useMutation({
    mutationFn: financeService.closeAccountingPeriod,
    onSuccess: () => {
      toast.success('Accounting period closed successfully');
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to close period');
    },
  });

  const lockMutation = useMutation({
    mutationFn: financeService.lockAccountingPeriod,
    onSuccess: () => {
      toast.success('Accounting period locked');
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to lock period');
    },
  });

  const fyClosingMutation = useMutation({
    mutationFn: (dateStr: string) => financeService.closeFiscalYear(dateStr),
    onSuccess: (res: any) => {
      const entry = res?.data;
      toast.success(`Fiscal year closed successfully! Journal Entry ${entry?.ref_id || ''} posted.`);
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      setIsFyModalOpen(false);
      setClosingDate('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to close fiscal year');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.start_date || !formData.end_date) {
      toast.error('All fields are required');
      return;
    }
    createMutation.mutate(formData);
  };

  const kpis = {
    open: periods.filter((p) => p.status === 'Open').length,
    closed: periods.filter((p) => p.status === 'Closed').length,
    locked: periods.filter((p) => p.status === 'Locked').length,
    totalEntries: periods.reduce((sum, p) => sum + (p._count?.journalEntries || 0), 0),
  };

  type PeriodRow = AccountingPeriod & { _count?: { journalEntries: number } };

  const columns: Column<PeriodRow>[] = [
    { header: 'Period Name', accessor: (p) => <span className="font-bold text-[#3E3C3D]">{p.name}</span>, mobilePriority: 'primary' },
    { header: 'Start Date', accessor: (p) => <span className="font-mono text-slate-600">{new Date(p.start_date).toLocaleDateString()}</span>, mobilePriority: 'secondary' },
    { header: 'End Date', accessor: (p) => <span className="font-mono text-slate-600">{new Date(p.end_date).toLocaleDateString()}</span>, mobilePriority: 'secondary' },
    { header: 'Journal Entries', accessor: (p) => <span className="font-semibold text-slate-800">{p._count?.journalEntries || 0}</span>, mobilePriority: 'meta' },
    { header: 'Status', accessor: (p) => <Badge className={`${STATUS_BADGES[p.status]} border`}>{p.status}</Badge>, mobilePriority: 'meta' },
    {
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      accessor: (p) =>
        !isAdmin ? (
          <span className="text-slate-400 text-xs italic">Read Only</span>
        ) : (
          <>
            {p.status === 'Open' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm(`Close period '${p.name}'? Unposted draft entries must be posted or removed first.`)) closeMutation.mutate(p.id);
                }}
                className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Close Period
              </Button>
            )}
            {p.status === 'Closed' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm(`Lock period '${p.name}' permanently? This cannot be undone.`)) lockMutation.mutate(p.id);
                }}
                className="h-7 text-xs border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                <Lock className="w-3.5 h-3.5 mr-1" />
                Lock Period
              </Button>
            )}
            {p.status === 'Locked' && <span className="text-slate-400 text-xs italic">Read Only</span>}
          </>
        ),
      mobilePriority: 'hidden',
    },
  ];

  return (
    <DashboardLayout active="finance" title="Accounting Periods">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#3E3C3D]">Accounting Periods</h1>
            <p className="text-sm text-slate-500">Financial closing cycles and posting locks</p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const today = new Date();
                  const defaultClosing = `${today.getFullYear()}-12-31`;
                  setClosingDate(defaultClosing);
                  setIsFyModalOpen(true);
                }}
                className="border-slate-300 text-slate-700 hover:bg-slate-50 font-medium"
              >
                <Lock className="w-4 h-4 mr-2 text-slate-500" />
                Close Fiscal Year
              </Button>
              <Button
                onClick={() => setIsModalOpen(true)}
                className="bg-[#FA634E] hover:bg-[#e0523d] text-white shadow-sm font-medium"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Period
              </Button>
            </div>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 shrink-0">
          <KpiCard title="OPEN PERIODS" value={kpis.open} variant="emerald" icon={Calendar} description="Accepting new postings" />
          <KpiCard title="CLOSED PERIODS" value={kpis.closed} variant="amber" icon={CheckCircle2} description="Finalized, no new postings" />
          <KpiCard title="LOCKED PERIODS" value={kpis.locked} variant="slate" icon={Lock} description="Permanently read-only" />
          <KpiCard title="TOTAL JOURNAL ENTRIES" value={kpis.totalEntries} variant="brand" icon={Calendar} description="Across all periods" />
        </div>

        {/* Table */}
        <DataTable<PeriodRow>
          title="Accounting Periods"
          columns={columns}
          data={periods}
          isLoading={isLoading}
          onExport={() => setIsExportOpen(true)}
          enableSelection={false}
          getRowId={(p) => p.id}
          emptyTitle="No Accounting Periods"
          emptyMessage={`No accounting periods defined yet.${isAdmin ? ' Click "New Period" to create one.' : ''}`}
        />

        {/* Export Modal */}
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          title="Export Accounting Periods"
          description="Choose your export preferences and columns."
          fileNamePrefix="accounting_periods"
          sheetName="Accounting Periods"
          subtitle="MERCON Logistics Accounting Periods"
          filteredData={periods}
          columns={ACCOUNTING_PERIODS_EXPORT_COLUMNS}
          formats={['xlsx', 'csv']}
        />

        {/* Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-[#3E3C3D]">
                Create Accounting Period
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">
                  Period Name *
                </label>
                <Input
                  placeholder="e.g. FY2026-Q3 or Sep 2026"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">
                    Start Date *
                  </label>
                  <Input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">
                    End Date *
                  </label>
                  <Input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-[#FA634E] hover:bg-[#e0523d] text-white"
                  disabled={createMutation.isPending}
                >
                  Create Period
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Close Fiscal Year Confirm Dialog */}
        <Dialog open={isFyModalOpen} onOpenChange={setIsFyModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-[#3E3C3D]">
                Close Fiscal Year
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2 text-sm text-slate-600">
              <p>
                Closing a fiscal year zeros out all Revenue and Expense account balances up to the specified closing date and posts the net income/loss to Retained Earnings via a single closing Journal Entry.
              </p>
              <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                Ensure all accounting periods prior to and including the closing date are Closed or Locked before performing fiscal year closing.
              </p>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">
                  Fiscal Year Closing Date *
                </label>
                <Input
                  type="date"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsFyModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-[#FA634E] hover:bg-[#e0523d] text-white"
                disabled={!closingDate || fyClosingMutation.isPending}
                onClick={() => {
                  if (closingDate) fyClosingMutation.mutate(closingDate);
                }}
              >
                {fyClosingMutation.isPending ? 'Closing FY...' : 'Confirm & Close FY'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
