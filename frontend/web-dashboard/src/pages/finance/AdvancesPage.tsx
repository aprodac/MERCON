import React, { useState, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Download, ChevronDown, MoreHorizontal, FileText, Ban, CheckCircle2, ArrowDownLeft, ArrowUpRight, User } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  FinancePageHeader,
  SummaryStrip,
  StatusTabs,
  FilterBar,
  MoneyText,
  StatusPill,
  FinanceEmptyState,
} from '@/components/finance/kit';
import ExportModal, { ExportColumn } from '@/components/ui/ExportModal';
import DataTable, { Column } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

import { AdvanceGroupRow } from '@/components/finance/advances/AdvanceGroupRow';
import { AdvancePrintVoucher } from '@/components/finance/advances/AdvancePrintVoucher';
import { AdvanceApplySheet } from '@/components/finance/advances/AdvanceApplySheet';
import { formatDate } from '@/lib/finance/format';
import { financeService } from '@/services/financeService';
import type { Advance, AdvanceStatus, AdvancePartyType, AdvanceDirection } from '@mercon/shared-types';

const PARTY_TINTS: Record<AdvancePartyType, { bg: string; text: string; avatarBg: string; dot: string }> = {
  Customer: { bg: 'bg-sky-50 dark:bg-sky-950/40', text: 'text-sky-700 dark:text-sky-300', avatarBg: 'bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-200', dot: 'bg-sky-500' },
  Provider: { bg: 'bg-purple-50 dark:bg-purple-950/40', text: 'text-purple-700 dark:text-purple-300', avatarBg: 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-200', dot: 'bg-purple-500' },
  Employee: { bg: 'bg-teal-50 dark:bg-teal-950/40', text: 'text-teal-700 dark:text-teal-300', avatarBg: 'bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-200', dot: 'bg-teal-500' },
};

export default function AdvancesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL state
  const currentTab = (searchParams.get('tab') as AdvanceStatus | 'all') || 'all';
  const searchTerm = searchParams.get('search') || '';
  const directionParam = searchParams.get('direction') || 'all';
  const partyTypeParam = searchParams.get('party_type') || ''; // comma-separated
  const groupByParty = searchParams.get('group_by_party') === 'true';

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [printAdvance, setPrintAdvance] = useState<Advance | null>(null);
  const [applyAdvance, setApplyAdvance] = useState<Advance | null>(null);

  // Fetch Advances
  const { data: advancesRes, isLoading } = useQuery({
    queryKey: ['advances'],
    queryFn: () => financeService.getAdvances(),
  });

  const advances: Advance[] = advancesRes?.data || [];

  // Summary strip computations
  const summaryMetrics = useMemo(() => {
    let customerTotal = 0;
    let customerCount = 0;
    let providerTotal = 0;
    let providerCount = 0;
    let employeeTotal = 0;
    let employeeCount = 0;

    for (const adv of advances) {
      if (adv.status === 'Void') continue;
      const rem = Number(adv.remaining_amount || 0);

      if (adv.party_type === 'Customer' && adv.direction === 'Received') {
        customerTotal += rem;
        customerCount++;
      } else if (adv.party_type === 'Provider' && adv.direction === 'Paid') {
        providerTotal += rem;
        providerCount++;
      } else if (adv.party_type === 'Employee' && adv.direction === 'Paid') {
        employeeTotal += rem;
        employeeCount++;
      }
    }

    return { customerTotal, customerCount, providerTotal, providerCount, employeeTotal, employeeCount };
  }, [advances]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts = { all: advances.length, Open: 0, PartiallyApplied: 0, FullyApplied: 0, Void: 0 };
    for (const a of advances) {
      if (counts[a.status] !== undefined) {
        counts[a.status]++;
      }
    }
    return counts;
  }, [advances]);

  // Filtering
  const selectedPartyTypes = partyTypeParam ? partyTypeParam.split(',') : [];

  const filteredAdvances = useMemo(() => {
    return advances.filter((adv) => {
      // Tab filter
      if (currentTab !== 'all' && adv.status !== currentTab) return false;

      // Direction filter
      if (directionParam !== 'all' && adv.direction !== directionParam) return false;

      // Party Type multi-select
      if (selectedPartyTypes.length > 0 && !selectedPartyTypes.includes(adv.party_type)) return false;

      // Search term (ref, memo, party name)
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const ref = (adv.ref_id || '').toLowerCase();
        const memo = (adv.memo || '').toLowerCase();
        const partyName = (adv.party?.name || '').toLowerCase();
        const partyId = (adv.party_id || '').toLowerCase();

        if (!ref.includes(q) && !memo.includes(q) && !partyName.includes(q) && !partyId.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [advances, currentTab, directionParam, selectedPartyTypes, searchTerm]);

  // Grouping by party
  const groupedAdvances = useMemo(() => {
    if (!groupByParty) return null;

    const map = new Map<string, { partyName: string; partyType?: AdvancePartyType; items: Advance[]; totalRemaining: number }>();
    for (const adv of filteredAdvances) {
      const partyKey = adv.party_id || adv.party?.name || 'General';
      const partyName = adv.party?.name || (adv.party_id ? `Party ID: ${adv.party_id}` : 'General / Not Linked');

      if (!map.has(partyKey)) {
        map.set(partyKey, { partyName, partyType: adv.party_type, items: [], totalRemaining: 0 });
      }
      const entry = map.get(partyKey)!;
      entry.items.push(adv);
      if (adv.status !== 'Void') {
        entry.totalRemaining += Number(adv.remaining_amount || 0);
      }
    }
    return Array.from(map.values());
  }, [filteredAdvances, groupByParty]);

  // Void mutation
  const voidMutation = useMutation({
    mutationFn: financeService.voidAdvance,
    onSuccess: () => {
      toast.success('Advance voided successfully');
      queryClient.invalidateQueries({ queryKey: ['advances'] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to void advance';
      toast.error(msg);
    },
  });

  const handleTabChange = (tab: string) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'all') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next);
  };

  const handleSearchChange = (q: string) => {
    const next = new URLSearchParams(searchParams);
    if (q) next.set('search', q);
    else next.delete('search');
    setSearchParams(next);
  };

  const handleDirectionChange = (dir: string) => {
    const next = new URLSearchParams(searchParams);
    if (dir === 'all') next.delete('direction');
    else next.set('direction', dir);
    setSearchParams(next);
  };

  const handlePartyTypeToggle = (type: string) => {
    let list = [...selectedPartyTypes];
    if (list.includes(type)) {
      list = list.filter((t) => t !== type);
    } else {
      list.push(type);
    }
    const next = new URLSearchParams(searchParams);
    if (list.length > 0) next.set('party_type', list.join(','));
    else next.delete('party_type');
    setSearchParams(next);
  };

  const handleGroupByToggle = (checked: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (checked) next.set('group_by_party', 'true');
    else next.delete('group_by_party');
    setSearchParams(next);
  };

  // Helper for age chip calculation
  const getAgeChip = (dateStr: string, status: AdvanceStatus) => {
    if (status === 'FullyApplied' || status === 'Void') return null;
    const advDate = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - advDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays > 60) {
      return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border-none text-[10px] py-0 px-1.5 font-bold">&gt;60 days</Badge>;
    }
    if (diffDays > 30) {
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-none text-[10px] py-0 px-1.5 font-bold">&gt;30 days</Badge>;
    }
    return null;
  };

  // Columns definition for DataTable
  const columns: Column<Advance>[] = [
    {
      header: 'Ref',
      accessor: (row) => (
        <span className="fin-num font-bold text-slate-900 dark:text-slate-100">
          {row.ref_id || row.id.slice(0, 8)}
        </span>
      ),
    },
    {
      header: 'Party',
      accessor: (row) => {
        const partyName = row.party?.name || (row.party_id ? `Party ID: ${row.party_id.slice(0, 8)}` : 'General / Not Linked');
        const initials = partyName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'P';
        const tint = PARTY_TINTS[row.party_type] || PARTY_TINTS.Customer;

        return (
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${tint.avatarBg}`}>
              {initials}
            </div>
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                {partyName}
              </div>
              <Badge variant="outline" className={`${tint.bg} ${tint.text} border-transparent text-[10px] py-0 px-1.5 mt-0.5`}>
                {row.party_type}
              </Badge>
            </div>
          </div>
        );
      },
    },
    {
      header: 'Direction',
      accessor: (row) =>
        row.direction === 'Received' ? (
          <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/60 gap-1 font-semibold">
            <ArrowDownLeft className="w-3 h-3 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
            Money in
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/60 gap-1 font-semibold">
            <ArrowUpRight className="w-3 h-3 text-amber-600 dark:text-amber-400 stroke-[2.5]" />
            Money out
          </Badge>
        ),
    },
    {
      header: 'Date',
      accessor: (row) => (
        <div className="flex items-center gap-2">
          <span className="text-slate-700 dark:text-slate-300 font-medium">{formatDate(row.advance_date)}</span>
          {getAgeChip(row.advance_date, row.status)}
        </div>
      ),
    },
    {
      header: 'Amount',
      accessor: (row) => <MoneyText value={row.amount} currency={row.currency || 'SAR'} className="font-bold text-slate-900 dark:text-slate-100" />,
    },
    {
      header: 'Applied / Remaining',
      accessor: (row) => {
        const total = Number(row.amount || 0);
        const applied = Number(row.applied_amount || 0);
        const remaining = Number(row.remaining_amount || 0);
        const pct = total > 0 ? Math.min(100, Math.round((applied / total) * 100)) : 0;

        return (
          <div className="w-36 space-y-1">
            <Progress value={pct} className="h-1.5 bg-slate-100 dark:bg-slate-800" />
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>remaining</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100"><MoneyText value={remaining} /></span>
            </div>
          </div>
        );
      },
    },
    {
      header: 'Status',
      accessor: (row) => <StatusPill kind="advance" status={row.status} />,
    },
    {
      header: '',
      accessor: (row) => {
        const canApply = (row.direction === 'Received' && row.party_type === 'Customer') || (row.direction === 'Paid' && row.party_type === 'Provider');
        const isUnapplied = Number(row.applied_amount || 0) === 0;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="w-4 h-4 text-slate-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => navigate(`/finance/advances/${row.id}`)}>
                Open details
              </DropdownMenuItem>
              {canApply && Number(row.remaining_amount || 0) > 0 && row.status !== 'Void' && (
                <DropdownMenuItem onClick={() => setApplyAdvance(row)}>
                  Apply credits…
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setPrintAdvance(row)}>
                Print voucher
              </DropdownMenuItem>
              {isUnapplied && row.status !== 'Void' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => voidMutation.mutate(row.id)}
                    className="text-rose-600 dark:text-rose-400 font-semibold"
                  >
                    Void advance
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  // Export Modal columns definition
  const exportColumns: ExportColumn<Advance>[] = [
    { id: 'ref_id', label: 'Advance Ref', accessor: (row) => row.ref_id || row.id.slice(0, 8) },
    { id: 'party_type', label: 'Party Type', accessor: (row) => row.party_type },
    { id: 'party_name', label: 'Party Name', accessor: (row) => row.party?.name || row.party_id || 'General' },
    { id: 'direction', label: 'Direction', accessor: (row) => row.direction },
    { id: 'advance_date', label: 'Advance Date', accessor: (row) => formatDate(row.advance_date) },
    {
      id: 'age',
      label: 'Age (Days)',
      accessor: (row) => {
        if (!row.advance_date) return '';
        const diffTime = Math.abs(Date.now() - new Date(row.advance_date).getTime());
        return Math.floor(diffTime / (1000 * 60 * 60 * 24));
      },
    },
    { id: 'amount', label: 'Amount', accessor: (row) => row.amount },
    { id: 'applied_amount', label: 'Applied Amount', accessor: (row) => row.applied_amount },
    { id: 'remaining_amount', label: 'Remaining Amount', accessor: (row) => row.remaining_amount },
    { id: 'status', label: 'Status', accessor: (row) => row.status },
    { id: 'memo', label: 'Memo', accessor: (row) => row.memo || '' },
  ];

  const exportData = filteredAdvances;

  return (
    <DashboardLayout active="finance" title="Advances">
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <FinancePageHeader
          crumbs={[
            { label: 'Finance', href: '/finance' },
            { label: 'Banking', href: '/finance/bank-accounts' },
            { label: 'Advances' },
          ]}
          title="Advances"
          subtitle="Money held on account — received from customers or paid out ahead to providers and employees."
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExportModalOpen(true)}
                className="gap-2 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200"
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
              </Button>

              {/* Split Button for New Advance */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="gap-1.5 bg-[#FA634E] hover:bg-[#E54D38] text-white font-semibold">
                    <Plus className="w-4 h-4" />
                    <span>New advance</span>
                    <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-80" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => navigate('/finance/advances/new?type=customer')}>
                    <span className="w-2 h-2 rounded-full bg-sky-500 mr-2" />
                    <span>Customer advance (Money in)</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/finance/advances/new?type=provider')}>
                    <span className="w-2 h-2 rounded-full bg-purple-500 mr-2" />
                    <span>Provider advance (Money out)</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/finance/advances/new?type=employee')}>
                    <span className="w-2 h-2 rounded-full bg-teal-500 mr-2" />
                    <span>Employee advance (Money out)</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />

        {/* Summary Strip (3 cells) */}
        <SummaryStrip
          items={[
            {
              label: 'Customer advances held',
              value: summaryMetrics.customerTotal,
              sub: `${summaryMetrics.customerCount} advances · owed back or to be applied`,
              tone: 'default',
            },
            {
              label: 'Paid to providers',
              value: summaryMetrics.providerTotal,
              sub: `${summaryMetrics.providerCount} advances`,
              tone: 'default',
            },
            {
              label: 'Employee advances',
              value: summaryMetrics.employeeTotal,
              sub: `${summaryMetrics.employeeCount} advances`,
              tone: 'default',
            },
          ]}
          isLoading={isLoading}
        />

        {/* Status Tabs */}
        <StatusTabs
          activeTab={currentTab}
          onTabChange={handleTabChange}
          tabs={[
            { id: 'all', label: 'All', count: tabCounts.all },
            { id: 'Open', label: 'Open', count: tabCounts.Open },
            { id: 'PartiallyApplied', label: 'Partially applied', count: tabCounts.PartiallyApplied },
            { id: 'FullyApplied', label: 'Fully applied', count: tabCounts.FullyApplied },
            { id: 'Void', label: 'Void', count: tabCounts.Void },
          ]}
        />

        {/* FilterBar with Group by Party Switch */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex-1">
            <FilterBar
              searchValue={searchTerm}
              onSearchChange={handleSearchChange}
              searchPlaceholder="Search ref, memo, party name..."
              rightSlot={
                <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
                  {/* Type Chips */}
                  {(['Customer', 'Provider', 'Employee'] as const).map((type) => {
                    const active = selectedPartyTypes.includes(type);
                    const tint = PARTY_TINTS[type];

                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handlePartyTypeToggle(type)}
                        className={`h-7 px-2.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                          active
                            ? `${tint.bg} ${tint.text} border-transparent ring-1 ring-inset ring-current`
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${tint.dot}`} />
                        <span>{type}</span>
                      </button>
                    );
                  })}

                  {/* Direction filter */}
                  <select
                    value={directionParam}
                    onChange={(e) => handleDirectionChange(e.target.value)}
                    className="h-7 px-2 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none"
                  >
                    <option value="all">All Directions</option>
                    <option value="Received">Money in</option>
                    <option value="Paid">Money out</option>
                  </select>
                </div>
              }
            />
          </div>

          {/* Group By Switch */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shrink-0">
            <Switch id="group-by-party" checked={groupByParty} onCheckedChange={handleGroupByToggle} />
            <label htmlFor="group-by-party" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              Group by party
            </label>
          </div>
        </div>

        {/* Data List (Grouped or Flat) */}
        {isLoading ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <DataTable data={[]} columns={columns} isLoading={true} />
          </div>
        ) : filteredAdvances.length === 0 ? (
          <FinanceEmptyState
            title="No advances found"
            description={searchTerm ? "No advances match your current search and filters." : "Record money held on account or paid ahead to providers and employees."}
            action={
              <Button onClick={() => navigate('/finance/advances/new')} className="bg-[#FA634E] hover:bg-[#E54D38] text-white">
                <Plus className="w-4 h-4 mr-2" />
                New advance
              </Button>
            }
          />
        ) : groupByParty && groupedAdvances ? (
          <div className="space-y-6">
            {groupedAdvances.map((group) => (
              <div key={group.partyName} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <AdvanceGroupRow
                  partyName={group.partyName}
                  partyType={group.partyType}
                  totalRemaining={group.totalRemaining}
                  count={group.items.length}
                />
                <DataTable
                  data={group.items}
                  columns={columns}
                  onRowClick={(row) => navigate(`/finance/advances/${row.id}`)}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <DataTable
              data={filteredAdvances}
              columns={columns}
              onRowClick={(row) => navigate(`/finance/advances/${row.id}`)}
            />
          </div>
        )}

        {/* Export Modal */}
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          title="Export Advances Report"
          fileNamePrefix="advances-report"
          filteredData={exportData}
          columns={exportColumns}
        />

        {/* Print Voucher Modal */}
        {printAdvance && (
          <AdvancePrintVoucher
            advance={printAdvance}
            onClose={() => setPrintAdvance(null)}
          />
        )}

        {/* Apply Credit Sheet */}
        {applyAdvance && (
          <AdvanceApplySheet
            open={Boolean(applyAdvance)}
            onOpenChange={(open) => !open && setApplyAdvance(null)}
            advance={applyAdvance}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
