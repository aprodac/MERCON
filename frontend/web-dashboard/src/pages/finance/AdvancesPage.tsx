import React, { useState, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Download, ChevronDown, MoreHorizontal, FileText, Ban, CheckCircle2, ArrowDownLeft, ArrowUpRight, User, TrendingUp, UserCheck } from 'lucide-react';
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
import { Chip } from '@/components/ui/chip';
import { PartyChip, DirectionChip, StatusChip } from '@/lib/finance/chips';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Customer: { bg: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-600/20 dark:bg-sky-950/40', text: 'text-sky-700 dark:text-sky-300', avatarBg: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-600/20 dark:bg-sky-900 text-sky-700 dark:text-sky-200', dot: 'bg-sky-500' },
  Provider: { bg: 'bg-purple-50 dark:bg-purple-950/40', text: 'text-purple-700 dark:text-purple-300', avatarBg: 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-200', dot: 'bg-purple-500' },
  Employee: { bg: 'bg-teal-50 dark:bg-teal-950/40', text: 'text-teal-700 dark:text-teal-300', avatarBg: 'bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-200', dot: 'bg-teal-500' },
};

export default function AdvancesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL state
  const categoryParam = (searchParams.get('category') as 'all' | 'Customer' | 'Provider' | 'Employee') || 'all';
  const currentTab = (searchParams.get('tab') as AdvanceStatus | 'all') || 'all';
  const searchTerm = searchParams.get('search') || '';
  const directionParam = searchParams.get('direction') || 'all';
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

  // Category counts
  const categoryCounts = useMemo(() => {
    let Customer = 0;
    let Provider = 0;
    let Employee = 0;
    for (const a of advances) {
      if (a.party_type === 'Customer') Customer++;
      else if (a.party_type === 'Provider') Provider++;
      else if (a.party_type === 'Employee') Employee++;
    }
    return { Customer, Provider, Employee };
  }, [advances]);

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

  // Status sub-tab counts (scoped by active category)
  const tabCounts = useMemo(() => {
    const categoryFiltered = advances.filter(
      (a) => categoryParam === 'all' || a.party_type === categoryParam
    );
    const counts = { all: categoryFiltered.length, Open: 0, PartiallyApplied: 0, FullyApplied: 0, Void: 0 };
    for (const a of categoryFiltered) {
      if (counts[a.status] !== undefined) {
        counts[a.status]++;
      }
    }
    return counts;
  }, [advances, categoryParam]);

  // Filtering
  const filteredAdvances = useMemo(() => {
    return advances.filter((adv) => {
      // Primary category tab filter
      if (categoryParam !== 'all' && adv.party_type !== categoryParam) return false;

      // Status sub-tab filter
      if (currentTab !== 'all' && adv.status !== currentTab) return false;

      // Direction filter
      if (directionParam !== 'all' && adv.direction !== directionParam) return false;

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
  }, [advances, categoryParam, currentTab, directionParam, searchTerm]);

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

  const handleCategoryChange = (cat: 'all' | 'Customer' | 'Provider' | 'Employee') => {
    const next = new URLSearchParams(searchParams);
    if (cat === 'all') next.delete('category');
    else next.set('category', cat);
    setSearchParams(next);
  };

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
      return <Chip tone="orange" size="sm">&gt;60 days</Chip>;
    }
    if (diffDays > 30) {
      return <Chip tone="warning" size="sm">&gt;30 days</Chip>;
    }
    return null;
  };

  // Columns definition for DataTable
  const columns: Column<Advance>[] = [
    {
      header: 'Ref',
      accessor: (row) => (
        <span className="fin-num font-bold text-foreground">
          {row.ref_id || row.id.slice(0, 8)}
        </span>
      ),
    },
    {
      header: 'Party',
      accessor: (row) => {
        const partyName = row.party?.name || (row.party_id ? `Party ID: ${row.party_id.slice(0, 8)}` : 'General / Not Linked');
        return <PartyChip type={row.party_type} name={partyName} />;
      },
    },
    {
      header: 'Direction',
      accessor: (row) => <DirectionChip direction={row.direction === 'Received' ? 'In' : 'Out'} />,
    },
    {
      header: 'Date',
      accessor: (row) => (
        <div className="flex items-center gap-2">
          <span className="text-foreground font-medium">{formatDate(row.advance_date)}</span>
          {getAgeChip(row.advance_date, row.status)}
        </div>
      ),
    },
    {
      header: 'Amount',
      accessor: (row) => <MoneyText value={row.amount} currency={row.currency || 'SAR'} className="font-bold text-foreground" />,
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
            <Progress value={pct} className="h-1.5 bg-muted" />
            <div className="text-[11px] font-mono text-muted-foreground dark:text-muted-foreground flex items-center justify-between">
              <span>remaining</span>
              <span className="font-semibold text-foreground"><MoneyText value={remaining} /></span>
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
                <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
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
    <DashboardLayout active="finance" title="Advances" fixedViewport>
      <div className="p-4 flex flex-col flex-1 min-h-0 gap-3 overflow-hidden h-full max-md:overflow-y-auto max-md:h-auto max-w-[1400px] mx-auto w-full">
        {/* Row 1: Top Navigation Bar (Category Tabs + Actions) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2 border-b border-border dark:border-border">
          {/* Primary Category Tabs Container */}
          <div className="bg-[#F4F4F5] p-1 rounded-xl flex items-center gap-1 shadow-xs border border-border dark:border-border overflow-x-auto">
            <button
              type="button"
              onClick={() => handleCategoryChange('all')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 select-none ${
                categoryParam === 'all'
                  ? 'bg-card  text-foreground dark:text-white shadow-xs border border-border dark:border-border'
                  : 'text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-slate-100 hover:bg-card/60 dark:hover:bg-slate-700/60 border border-transparent'
              }`}
            >
              <TrendingUp className={`w-3.5 h-3.5 ${categoryParam === 'all' ? 'text-[#FA634E]' : 'text-muted-foreground'}`} />
              <span>Summary</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] fin-num font-semibold ${
                categoryParam === 'all' ? 'bg-[#FA634E] text-white' : 'bg-muted/80 dark:bg-slate-700 text-foreground '
              }`}>
                {advances.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleCategoryChange('Customer')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 select-none ${
                categoryParam === 'Customer'
                  ? 'bg-card  text-foreground dark:text-white shadow-xs border border-border dark:border-border'
                  : 'text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-slate-100 hover:bg-card/60 dark:hover:bg-slate-700/60 border border-transparent'
              }`}
            >
              <ArrowDownLeft className={`w-3.5 h-3.5 ${categoryParam === 'Customer' ? 'text-sky-600 dark:text-sky-400' : 'text-muted-foreground'}`} />
              <span>Customer Advances</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] fin-num font-semibold ${
                categoryParam === 'Customer' ? 'bg-sky-600 text-white' : 'bg-muted/80 dark:bg-slate-700 text-foreground '
              }`}>
                {categoryCounts.Customer}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleCategoryChange('Provider')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 select-none ${
                categoryParam === 'Provider'
                  ? 'bg-card  text-foreground dark:text-white shadow-xs border border-border dark:border-border'
                  : 'text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-slate-100 hover:bg-card/60 dark:hover:bg-slate-700/60 border border-transparent'
              }`}
            >
              <ArrowUpRight className={`w-3.5 h-3.5 ${categoryParam === 'Provider' ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground'}`} />
              <span>Supplier Advances</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] fin-num font-semibold ${
                categoryParam === 'Provider' ? 'bg-purple-600 text-white' : 'bg-muted/80 dark:bg-slate-700 text-foreground '
              }`}>
                {categoryCounts.Provider}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleCategoryChange('Employee')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 select-none ${
                categoryParam === 'Employee'
                  ? 'bg-card  text-foreground dark:text-white shadow-xs border border-border dark:border-border'
                  : 'text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-slate-100 hover:bg-card/60 dark:hover:bg-slate-700/60 border border-transparent'
              }`}
            >
              <UserCheck className={`w-3.5 h-3.5 ${categoryParam === 'Employee' ? 'text-teal-600 dark:text-teal-400' : 'text-muted-foreground'}`} />
              <span>Employee Advances</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] fin-num font-semibold ${
                categoryParam === 'Employee' ? 'bg-teal-600 text-white' : 'bg-muted/80 dark:bg-slate-700 text-foreground '
              }`}>
                {categoryCounts.Employee}
              </span>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExportModalOpen(true)}
              className="gap-1.5 border-border dark:border-border text-foreground h-8 px-3 text-xs font-semibold rounded-lg"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </Button>

            {/* Split Button for New Advance */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-1.5 bg-[#FA634E] hover:bg-[#E54D38] text-white font-semibold h-8 px-3 text-xs rounded-lg shadow-xs">
                  <Plus className="w-3.5 h-3.5" />
                  <span>New advance</span>
                  <ChevronDown className="w-3 h-3 ml-0.5 opacity-80" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => navigate('/finance/advances/new?type=customer')}>
                  <span className="w-2 h-2 rounded-full bg-chip-info-dot mr-2" />
                  <span>Customer advance (Money in)</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/finance/advances/new?type=provider')}>
                  <span className="w-2 h-2 rounded-full bg-chip-violet-dot mr-2" />
                  <span>Supplier advance (Money out)</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/finance/advances/new?type=employee')}>
                  <span className="w-2 h-2 rounded-full bg-chip-teal-dot mr-2" />
                  <span>Employee advance (Money out)</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Row 2: Compact Summary Strip */}
        <SummaryStrip
          className="p-3.5 rounded-xl border border-border dark:border-border"
          items={[
            {
              label: 'Customer advances held',
              value: summaryMetrics.customerTotal,
              sub: `${summaryMetrics.customerCount} advances · owed back or to be applied`,
              tone: categoryParam === 'Customer' ? 'positive' : 'default',
            },
            {
              label: 'Paid to providers',
              value: summaryMetrics.providerTotal,
              sub: `${summaryMetrics.providerCount} advances`,
              tone: categoryParam === 'Provider' ? 'positive' : 'default',
            },
            {
              label: 'Employee advances',
              value: summaryMetrics.employeeTotal,
              sub: `${summaryMetrics.employeeCount} advances`,
              tone: categoryParam === 'Employee' ? 'positive' : 'default',
            },
          ]}
          isLoading={isLoading}
        />

        {/* Data List (Grouped or Flat) with Integrated Table Header Filters */}
        {isLoading ? (
          <div className="bg-card rounded-xl border border-border dark:border-border p-6 space-y-4">
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
              <div key={group.partyName} className="bg-card rounded-xl border border-border dark:border-border overflow-hidden shadow-xs">
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
          <DataTable
            data={filteredAdvances}
            columns={columns}
            onRowClick={(row) => navigate(`/finance/advances/${row.id}`)}
            searchValue={searchTerm}
            onSearchChange={handleSearchChange}
            searchPlaceholder="Search ref, memo, party..."
            filterElement={
              <div className="flex items-center gap-2">
                {/* Modern Status Select Dropdown */}
                <Select value={currentTab} onValueChange={(val) => handleTabChange(val)}>
                  <SelectTrigger className="w-[175px] h-8 text-xs font-semibold bg-muted border-border dark:border-border text-foreground">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent align="end" className="w-[185px]">
                    <SelectItem value="all">All Statuses ({tabCounts.all})</SelectItem>
                    <SelectItem value="Open">Open ({tabCounts.Open})</SelectItem>
                    <SelectItem value="PartiallyApplied">Partially applied ({tabCounts.PartiallyApplied})</SelectItem>
                    <SelectItem value="FullyApplied">Fully applied ({tabCounts.FullyApplied})</SelectItem>
                    <SelectItem value="Void">Void ({tabCounts.Void})</SelectItem>
                  </SelectContent>
                </Select>

                {/* Modern Direction Select Dropdown */}
                <Select value={directionParam} onValueChange={(val) => handleDirectionChange(val)}>
                  <SelectTrigger className="w-[145px] h-8 text-xs font-semibold bg-muted border-border dark:border-border text-foreground">
                    <SelectValue placeholder="All Directions" />
                  </SelectTrigger>
                  <SelectContent align="end" className="w-[155px]">
                    <SelectItem value="all">All Directions</SelectItem>
                    <SelectItem value="Received">Money in</SelectItem>
                    <SelectItem value="Paid">Money out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            }
            actionsElement={
              <div className="flex items-center gap-2 px-3 py-1 bg-muted border border-border dark:border-border rounded-lg shrink-0">
                <Switch id="group-by-party" checked={groupByParty} onCheckedChange={handleGroupByToggle} />
                <label htmlFor="group-by-party" className="text-xs font-semibold text-foreground cursor-pointer select-none">
                  Group
                </label>
              </div>
            }
          />
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
