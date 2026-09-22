import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Calendar, Lock, CheckCircle2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

import { financeService, CreateAccountingPeriodDTO } from '@/services/financeService';
import { usePermissions } from '@/hooks/usePermissions';
import type { AccountingPeriod, PeriodStatus } from '@mercon/shared-types';

const STATUS_BADGES: Record<PeriodStatus, string> = {
  Open: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Closed: 'bg-amber-50 text-amber-700 border-amber-200',
  Locked: 'bg-slate-100 text-slate-600 border-slate-300',
};

export default function AccountingPeriodsPage() {
  const queryClient = useQueryClient();
  const { userRole, isSuperAdmin } = usePermissions();
  const isAdmin = isSuperAdmin || userRole === 'Admin';

  const [isModalOpen, setIsModalOpen] = useState(false);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.start_date || !formData.end_date) {
      toast.error('All fields are required');
      return;
    }
    createMutation.mutate(formData);
  };

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
            <Button
              onClick={() => setIsModalOpen(true)}
              className="bg-[#FA634E] hover:bg-[#e0523d] text-white shadow-sm font-medium"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Period
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-slate-500 text-sm">Loading periods...</div>
          ) : periods.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              No accounting periods defined yet.{isAdmin ? ' Click "New Period" to create one.' : ''}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3">Period Name</th>
                    <th className="px-4 py-3">Start Date</th>
                    <th className="px-4 py-3">End Date</th>
                    <th className="px-4 py-3">Journal Entries</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {periods.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-bold text-[#3E3C3D]">
                        {p.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {new Date(p.start_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {new Date(p.end_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {p._count?.journalEntries || 0}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`${STATUS_BADGES[p.status]} border`}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {!isAdmin ? (
                          <span className="text-slate-400 text-xs italic">Read Only</span>
                        ) : (
                          <>
                            {p.status === 'Open' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (confirm(`Close period '${p.name}'? Unposted draft entries must be posted or removed first.`)) {
                                    closeMutation.mutate(p.id);
                                  }
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
                                  if (confirm(`Lock period '${p.name}' permanently? This cannot be undone.`)) {
                                    lockMutation.mutate(p.id);
                                  }
                                }}
                                className="h-7 text-xs border-slate-300 text-slate-700 hover:bg-slate-100"
                              >
                                <Lock className="w-3.5 h-3.5 mr-1" />
                                Lock Period
                              </Button>
                            )}
                            {p.status === 'Locked' && (
                              <span className="text-slate-400 text-xs italic">Read Only</span>
                            )}
                          </>
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
      </div>
    </DashboardLayout>
  );
}
