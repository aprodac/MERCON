import React, { useState, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  FileText,
  CalendarClock,
  Calendar as CalendarIcon,
  Printer,
  Download,
  CreditCard,
  Search,
  ArrowUpDown,
  ChevronRight,
  ChevronDown,
  Building2,
  Wallet,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Phone,
  Mail,
  RefreshCw,
  X,
  Filter,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

import { MoneyText } from '@/components/finance/kit/MoneyText';
import { FinanceEmptyState } from '@/components/finance/kit/FinanceEmptyState';
import ExportModal, { ExportColumn } from '@/components/ui/ExportModal';
import { PayRunSheet, PayRunBillItem } from '@/components/finance/payables/PayRunSheet';
import { formatDate, formatMoney, formatPct } from '@/lib/finance/format';
import { financeService, AgeingRow, AgeingBillDetail, AgeingBucketCounts } from '@/services/financeService';
import type { BankAccount, Advance } from '@mercon/shared-types';

type AgeingViewMode = 'vendor' | 'bill' | 'schedule';
type AgeingBucketKey = 'all' | 'current' | '1-30' | '31-60' | '61-90' | '90+';

// Stable hash for avatar background color
function getVendorHashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    'bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-600/20 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
    'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
    'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
    'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
    'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  ];
  return colors[Math.abs(hash) % colors.length];
}

const BUCKET_STYLES: Record<string, { bg: string; text: string; border: string; bar: string }> = {
  current: { bg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200/60 dark:border-emerald-800/60', bar: 'bg-emerald-500' },
  '1-30': { bg: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200/60 dark:border-amber-800/60', bar: 'bg-amber-500' },
  '31-60': { bg: 'bg-orange-50 dark:bg-orange-950/40', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200/60 dark:border-orange-800/60', bar: 'bg-orange-500' },
  '61-90': { bg: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-950/40', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200/60 dark:border-rose-800/60', bar: 'bg-rose-500' },
  '90+': { bg: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-300 font-bold', border: 'border-red-200/60 dark:border-red-800/60', bar: 'bg-red-600' },
};

export default function APAgeingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL state synchronization
  const viewMode = (searchParams.get('view') as AgeingViewMode) || 'vendor';
  const asOfDateStr = searchParams.get('as_of') || new Date().toISOString().split('T')[0];
  const basis = (searchParams.get('basis') as 'due' | 'bill') || 'due';
  const activeBucketFilter = (searchParams.get('bucket') as AgeingBucketKey) || 'all';
  const searchTerm = searchParams.get('search') || '';
  const overdueOnly = searchParams.get('overdue_only') === 'true';
  const sortBy = searchParams.get('sort') || 'total_desc';

  // Local UI state
  const [expandedVendorIds, setExpandedVendorIds] = useState<Set<string>>(new Set());
  const [vendorBucketFilterMap, setVendorBucketFilterMap] = useState<Map<string, AgeingBucketKey>>(new Map());
  const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [payRunSheetOpen, setPayRunSheetOpen] = useState(false);
  const [payRunInitialBills, setPayRunInitialBills] = useState<PayRunBillItem[]>([]);
  const [calendarPopoverOpen, setCalendarPopoverOpen] = useState(false);

  // 1. Query Current AP Ageing Report
  const { data: reportRes, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance-reports', 'ap-ageing', asOfDateStr, basis],
    queryFn: () =>
      financeService.getAPAgeing({
        as_of: asOfDateStr,
        basis,
        include_bills: true,
      }),
  });

  const report = reportRes?.data;
  const rows: AgeingRow[] = report?.rows || [];
  const grandTotal = report?.grand_total || {
    party_id: 'TOTAL',
    party_name: 'Total',
    current: 0,
    days_1_30: 0,
    days_31_60: 0,
    days_61_90: 0,
    days_90_plus: 0,
    total: 0,
  };
  const bucketCounts: AgeingBucketCounts = report?.bucket_counts || {
    current: 0,
    days_1_30: 0,
    days_31_60: 0,
    days_90_plus: 0,
    days_61_90: 0,
    total: 0,
  };

  // 2. Query Ageing 30 Days Ago for Delta Comparison
  const date30dPrior = useMemo(() => {
    const d = new Date(asOfDateStr);
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  }, [asOfDateStr]);

  const { data: priorReportRes } = useQuery({
    queryKey: ['finance-reports', 'ap-ageing-prior', date30dPrior, basis],
    queryFn: () =>
      financeService.getAPAgeing({
        as_of: date30dPrior,
        basis,
      }),
  });
  const priorGrandTotal = priorReportRes?.data?.grand_total;

  // 3. Query Bank Accounts for Cash Coverage Strip
  const { data: bankAccountsRes } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => financeService.getBankAccounts(),
  });
  const bankAccounts: BankAccount[] = bankAccountsRes?.data || [];

  const availableCash = useMemo(() => {
    return bankAccounts.reduce((sum, acc) => sum + Number(acc.book_balance || 0), 0);
  }, [bankAccounts]);

  // 4. Query Provider Advances for Insights Row
  const { data: advancesRes } = useQuery({
    queryKey: ['advances', 'Provider'],
    queryFn: () => financeService.getAdvances({ party_type: 'Provider' }),
  });
  const providerAdvances: Advance[] = advancesRes?.data || [];

  // Flatten all open bills from rows for By-bill view, Pay Run, & Schedule
  const allOpenBills = useMemo(() => {
    const flat: Array<PayRunBillItem & { bill_date: string; due_date: string | null; days_overdue: number; bucket: string; party_id: string; vendor_name: string }> = [];
    for (const r of rows) {
      if (r.bills) {
        for (const b of r.bills) {
          flat.push({
            id: b.id,
            ref_id: b.ref_id,
            bill_date: b.bill_date,
            due_date: b.due_date,
            days_overdue: b.days_overdue,
            balance: b.balance,
            bucket: b.bucket,
            party_id: r.party_id,
            vendor_name: r.party_name,
          });
        }
      }
    }
    return flat;
  }, [rows]);

  // Payables due calculations for Cash Coverage Strip
  const { payablesDue7d, payablesDue30d, totalOverdue } = useMemo(() => {
    const todayStr = asOfDateStr;
    const in7 = new Date(new Date(asOfDateStr).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const in30 = new Date(new Date(asOfDateStr).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let due7 = 0;
    let due30 = 0;
    let overdue = 0;

    for (const b of allOpenBills) {
      const dueDateStr = b.due_date || b.bill_date;
      if (dueDateStr < todayStr) {
        overdue += b.balance;
      }
      if (dueDateStr <= in7) {
        due7 += b.balance;
      }
      if (dueDateStr <= in30) {
        due30 += b.balance;
      }
    }

    return { payablesDue7d: due7, payablesDue30d: due30, totalOverdue: overdue };
  }, [allOpenBills, asOfDateStr]);

  // Prior Ageing Vendor Map for row-level 30d deltas
  const priorVendorMap = useMemo(() => {
    const map = new Map<string, number>();
    if (priorReportRes?.data?.rows) {
      for (const r of priorReportRes.data.rows) {
        map.set(r.party_id, r.total);
      }
    }
    return map;
  }, [priorReportRes]);

  // Filtered Vendor Rows
  const filteredVendorRows = useMemo(() => {
    return rows.filter((r) => {
      if (overdueOnly) {
        const hasOverdue = (r.days_1_30 + r.days_31_60 + r.days_61_90 + r.days_90_plus) > 0;
        if (!hasOverdue) return false;
      }

      if (activeBucketFilter !== 'all') {
        const valMap: Record<string, number> = {
          current: r.current,
          '1-30': r.days_1_30,
          '31-60': r.days_31_60,
          '61-90': r.days_61_90,
          '90+': r.days_90_plus,
        };
        if ((valMap[activeBucketFilter] || 0) <= 0) return false;
      }

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const name = (r.party_name || '').toLowerCase();
        if (!name.includes(q)) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'total_asc') return a.total - b.total;
      if (sortBy === 'name_asc') return a.party_name.localeCompare(b.party_name);
      return b.total - a.total; // total_desc
    });
  }, [rows, overdueOnly, activeBucketFilter, searchTerm, sortBy]);

  // Filtered Flat Bills for By-bill view
  const filteredBillRows = useMemo(() => {
    return allOpenBills.filter((b) => {
      if (overdueOnly && b.days_overdue <= 0) return false;
      if (activeBucketFilter !== 'all' && b.bucket !== activeBucketFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const ref = (b.ref_id || '').toLowerCase();
        const vendor = (b.vendor_name || '').toLowerCase();
        if (!ref.includes(q) && !vendor.includes(q)) return false;
      }
      return true;
    });
  }, [allOpenBills, overdueOnly, activeBucketFilter, searchTerm]);

  // URL State Updates
  const updateUrlParam = (key: string, val: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (val === null || val === 'all' || val === '') {
      next.delete(key);
    } else {
      next.set(key, val);
    }
    setSearchParams(next);
  };

  const handleViewChange = (v: string) => updateUrlParam('view', v);
  const handleBasisChange = (b: string) => updateUrlParam('basis', b);
  const handleBucketFilterToggle = (bucketKey: AgeingBucketKey) => {
    const next = activeBucketFilter === bucketKey ? 'all' : bucketKey;
    updateUrlParam('bucket', next);
  };

  // Row Expansion toggle
  const toggleVendorExpand = (partyId: string) => {
    const next = new Set(expandedVendorIds);
    if (next.has(partyId)) next.delete(partyId);
    else next.add(partyId);
    setExpandedVendorIds(next);
  };

  // Open Pay Run Sheet with specific bills
  const handleOpenPayRun = (billsToPay: PayRunBillItem[]) => {
    setPayRunInitialBills(billsToPay);
    setPayRunSheetOpen(true);
  };

  const handlePaySelectedBills = () => {
    const selected = filteredBillRows.filter((b) => selectedBillIds.has(b.id));
    handleOpenPayRun(selected);
  };

  const handleSelectAllOverdueBills = () => {
    const overdueBills = filteredBillRows.filter((b) => b.days_overdue > 0);
    const ids = new Set(overdueBills.map((b) => b.id));
    setSelectedBillIds(ids);
  };

  // Print layout handler
  const handlePrint = () => {
    window.print();
  };

  // Preset Date Picker options
  const applyDatePreset = (preset: 'today' | 'endLastMonth' | 'endLastQuarter') => {
    const today = new Date();
    let d = today;
    if (preset === 'endLastMonth') {
      d = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (preset === 'endLastQuarter') {
      const currentQuarter = Math.floor(today.getMonth() / 3);
      d = new Date(today.getFullYear(), currentQuarter * 3, 0);
    }
    updateUrlParam('as_of', d.toISOString().split('T')[0]);
    setCalendarPopoverOpen(false);
  };

  // Insights Calculations
  const insights = useMemo(() => {
    const list: Array<{ id: string; icon: any; title: string; subtitle: string; actionText: string; action: () => void }> = [];

    // 1. Oldest Overdue
    let oldestBill: (typeof allOpenBills)[0] | null = null;
    for (const b of allOpenBills) {
      if (b.days_overdue > 0) {
        if (!oldestBill || b.days_overdue > oldestBill.days_overdue) {
          oldestBill = b;
        }
      }
    }
    if (oldestBill) {
      list.push({
        id: 'oldest-overdue',
        icon: AlertTriangle,
        title: `${oldestBill.vendor_name} — ${oldestBill.ref_id || 'Bill'}`,
        subtitle: `${oldestBill.days_overdue} days overdue (${formatMoney(oldestBill.balance)} SAR)`,
        actionText: 'Pay',
        action: () => handleOpenPayRun([oldestBill!]),
      });
    }

    // 2. Due this week
    const todayStr = asOfDateStr;
    const in7 = new Date(new Date(asOfDateStr).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dueThisWeekBills = allOpenBills.filter((b) => b.due_date && b.due_date >= todayStr && b.due_date <= in7);
    if (dueThisWeekBills.length > 0) {
      const sumWeek = dueThisWeekBills.reduce((s, b) => s + b.balance, 0);
      list.push({
        id: 'due-this-week',
        icon: CalendarClock,
        title: `${dueThisWeekBills.length} bill${dueThisWeekBills.length > 1 ? 's' : ''} due this week`,
        subtitle: `${formatMoney(sumWeek)} SAR due by ${formatDate(in7)}`,
        actionText: 'Select in Pay run',
        action: () => handleOpenPayRun(dueThisWeekBills),
      });
    }

    // 3. Provider Advance Available
    const availableAdvance = providerAdvances.find((a) => a.status !== 'Void' && Number(a.remaining_amount || 0) > 0);
    if (availableAdvance) {
      const advName = availableAdvance.party?.name || 'Provider';
      const advRem = Number(availableAdvance.remaining_amount || 0);
      list.push({
        id: 'provider-advance',
        icon: Wallet,
        title: `${advName} has advance credit`,
        subtitle: `${formatMoney(advRem)} SAR available to apply against bills`,
        actionText: 'Apply advances',
        action: () => navigate('/finance/advances'),
      });
    }

    // 4. Change vs 30 days ago
    if (priorGrandTotal && priorGrandTotal.total > 0) {
      const diff = grandTotal.total - priorGrandTotal.total;
      const pct = (diff / priorGrandTotal.total) * 100;
      const isUp = diff > 0;
      list.push({
        id: 'change-30d',
        icon: isUp ? TrendingUp : TrendingDown,
        title: `Payables ${isUp ? '↑' : '↓'} ${Math.abs(pct).toFixed(1)}% vs 30 days ago`,
        subtitle: `${isUp ? '+' : ''}${formatMoney(diff)} SAR total change`,
        actionText: 'Compare',
        action: () => updateUrlParam('as_of', date30dPrior),
      });
    }

    return list.slice(0, 4);
  }, [allOpenBills, providerAdvances, priorGrandTotal, grandTotal, asOfDateStr, date30dPrior, navigate]);

  // Schedule Timeline Weekly Breakdown Data
  const scheduleWeeks = useMemo(() => {
    if (viewMode !== 'schedule') return [];

    const today = new Date(asOfDateStr);
    const weeks: Array<{
      key: string;
      label: string;
      startDate: string;
      endDate: string;
      bills: typeof allOpenBills;
      total: number;
    }> = [];

    // Overdue bucket
    const overdueBills = allOpenBills.filter((b) => (b.due_date || b.bill_date) < asOfDateStr);
    weeks.push({
      key: 'overdue',
      label: 'Overdue',
      startDate: '',
      endDate: asOfDateStr,
      bills: overdueBills,
      total: overdueBills.reduce((s, b) => s + b.balance, 0),
    });

    // Next 6 weeks
    let currentStart = new Date(today);
    for (let i = 0; i < 6; i++) {
      const weekEnd = new Date(currentStart.getTime() + 6 * 24 * 60 * 60 * 1000);
      const startStr = currentStart.toISOString().split('T')[0];
      const endStr = weekEnd.toISOString().split('T')[0];

      const wBills = allOpenBills.filter((b) => {
        const d = b.due_date || b.bill_date;
        return d >= startStr && d <= endStr;
      });

      weeks.push({
        key: `week-${i + 1}`,
        label: `Week of ${formatDate(currentStart, 'MMM d, yyyy')}`,
        startDate: startStr,
        endDate: endStr,
        bills: wBills,
        total: wBills.reduce((s, b) => s + b.balance, 0),
      });

      currentStart = new Date(currentStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    // Later bucket
    const laterStartStr = currentStart.toISOString().split('T')[0];
    const laterBills = allOpenBills.filter((b) => (b.due_date || b.bill_date) > laterStartStr);
    weeks.push({
      key: 'later',
      label: 'Later',
      startDate: laterStartStr,
      endDate: '',
      bills: laterBills,
      total: laterBills.reduce((s, b) => s + b.balance, 0),
    });

    return weeks;
  }, [allOpenBills, asOfDateStr, viewMode]);

  // Export Modal columns definition
  const vendorExportColumns: ExportColumn<AgeingRow>[] = [
    { id: 'party_name', label: 'Vendor Name', accessor: (r) => r.party_name },
    { id: 'current', label: 'Current (SAR)', accessor: (r) => formatMoney(r.current) },
    { id: 'days_1_30', label: '1–30 Days (SAR)', accessor: (r) => formatMoney(r.days_1_30) },
    { id: 'days_31_60', label: '31–60 Days (SAR)', accessor: (r) => formatMoney(r.days_31_60) },
    { id: 'days_61_90', label: '61–90 Days (SAR)', accessor: (r) => formatMoney(r.days_61_90) },
    { id: 'days_90_plus', label: '90+ Days (SAR)', accessor: (r) => formatMoney(r.days_90_plus) },
    { id: 'total', label: 'Total Outstanding (SAR)', accessor: (r) => formatMoney(r.total) },
  ];

  return (
    <DashboardLayout active="finance" title="AP Ageing">
      <div className="p-6 space-y-6 max-w-7xl mx-auto fin-report">
        {/* ========================================================================= */}
        {/* 1. TOOLBAR ROW (§4.0a Page Shell Specification)                          */}
        {/* ========================================================================= */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-card p-3 rounded-xl border border-border dark:border-border shadow-xs">
          {/* Left: View Mode Segmented Controls */}
          <div className="flex items-center gap-1 bg-muted p-1 rounded-xl">
            <button
              onClick={() => handleViewChange('vendor')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'vendor'
                  ? 'bg-card  text-foreground  shadow-xs'
                  : 'text-muted-foreground dark:text-muted-foreground hover:text-foreground'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              By vendor
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                {rows.length}
              </Badge>
            </button>

            <button
              onClick={() => handleViewChange('bill')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'bill'
                  ? 'bg-card  text-foreground  shadow-xs'
                  : 'text-muted-foreground dark:text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              By bill
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                {bucketCounts.total}
              </Badge>
            </button>

            <button
              onClick={() => handleViewChange('schedule')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'schedule'
                  ? 'bg-card  text-foreground  shadow-xs'
                  : 'text-muted-foreground dark:text-muted-foreground hover:text-foreground'
              }`}
            >
              <CalendarClock className="w-3.5 h-3.5" />
              Payment schedule
            </button>
          </div>

          {/* Right: Controls & Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* As-Of Date Control Popover */}
            <Popover open={calendarPopoverOpen} onOpenChange={setCalendarPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 text-xs gap-2 bg-card">
                  <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  As of: <span className="font-bold">{formatDate(asOfDateStr)}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-3">
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground border-b pb-2">
                    <span>Quick presets:</span>
                    <Button variant="ghost" size="sm" onClick={() => applyDatePreset('today')} className="h-6 text-[11px] px-2">
                      Today
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => applyDatePreset('endLastMonth')} className="h-6 text-[11px] px-2">
                      End of last month
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => applyDatePreset('endLastQuarter')} className="h-6 text-[11px] px-2">
                      End of last quarter
                    </Button>
                  </div>
                  <Calendar
                    mode="single"
                    selected={new Date(asOfDateStr)}
                    onSelect={(d) => d && applyDatePreset('today')}
                  />
                </div>
              </PopoverContent>
            </Popover>

            {/* Ageing Basis ToggleGroup */}
            <div className="flex items-center border border-border dark:border-border rounded-xl p-0.5 bg-muted">
              <span className="text-[10px] font-semibold text-muted-foreground px-2">Age by:</span>
              <button
                onClick={() => handleBasisChange('due')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  basis === 'due' ? 'bg-card  text-foreground  shadow-xs' : 'text-muted-foreground'
                }`}
              >
                Due date
              </button>
              <button
                onClick={() => handleBasisChange('bill')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  basis === 'bill' ? 'bg-card  text-foreground  shadow-xs' : 'text-muted-foreground'
                }`}
              >
                Bill date
              </button>
            </div>

            {/* Export */}
            <Button variant="outline" size="sm" onClick={() => setIsExportModalOpen(true)} className="h-9 text-xs gap-1.5">
              <Download className="w-3.5 h-3.5 text-muted-foreground" />
              Export
            </Button>

            {/* Print */}
            <Button variant="outline" size="sm" onClick={handlePrint} className="h-9 text-xs gap-1.5">
              <Printer className="w-3.5 h-3.5 text-muted-foreground" />
              Print
            </Button>

            {/* Coral Pay Bills Action */}
            <Button
              onClick={() => handleOpenPayRun([])}
              className="h-9 text-xs bg-[#FA634E] hover:bg-[#e5533f] text-white font-bold px-4 gap-1.5 shadow-xs"
            >
              <CreditCard className="w-4 h-4" />
              Pay bills
            </Button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. BUCKET TILES STRIP (§4.5e Color Scale + Share Bar)                     */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { key: 'current', label: 'Current', amount: grandTotal.current, count: bucketCounts.current, style: BUCKET_STYLES.current },
            { key: '1-30', label: '1–30 Days', amount: grandTotal.days_1_30, count: bucketCounts.days_1_30, style: BUCKET_STYLES['1-30'] },
            { key: '31-60', label: '31–60 Days', amount: grandTotal.days_31_60, count: bucketCounts.days_31_60, style: BUCKET_STYLES['31-60'] },
            { key: '61-90', label: '61–90 Days', amount: grandTotal.days_61_90, count: bucketCounts.days_61_90, style: BUCKET_STYLES['61-90'] },
            { key: '90+', label: '90+ Days', amount: grandTotal.days_90_plus, count: bucketCounts.days_90_plus, style: BUCKET_STYLES['90+'] },
          ].map((tile) => {
            const isActive = activeBucketFilter === tile.key;
            const pct = grandTotal.total > 0 ? (tile.amount / grandTotal.total) * 100 : 0;

            return (
              <div
                key={tile.key}
                onClick={() => handleBucketFilterToggle(tile.key as AgeingBucketKey)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${tile.style.bg} ${tile.style.border} ${
                  isActive ? 'ring-2 ring-[#FA634E] scale-[1.02]' : 'hover:scale-[1.01]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${tile.style.text}`}>{tile.label}</span>
                  <Badge variant="outline" className="text-[10px] font-mono py-0 px-1.5 border-transparent bg-card/60 dark:bg-muted/40">
                    {tile.count} bills
                  </Badge>
                </div>

                <div className="mt-2 font-mono font-extrabold text-base text-foreground">
                  <MoneyText value={tile.amount} />
                </div>

                <div className="mt-2 space-y-1">
                  <div className="w-full h-1 bg-muted/10 dark:bg-card/10 rounded-full overflow-hidden">
                    <div className={`h-full ${tile.style.bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground fin-num text-right">{formatPct(pct)} of total</div>
                </div>
              </div>
            );
          })}

          {/* Charcoal Total Tile */}
          <div className="p-3.5 rounded-xl bg-card text-foreground border border-border text-white flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground">Total payables</span>
              <Badge className="bg-card/20 text-white border-none text-[10px] font-mono">
                {bucketCounts.total} bills
              </Badge>
            </div>
            <div className="font-mono font-extrabold text-lg text-white">
              <MoneyText value={grandTotal.total} currency="SAR" />
            </div>
            <div className="text-[10px] text-muted-foreground font-mono">As of {formatDate(asOfDateStr)}</div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. CASH COVERAGE STRIP                                                    */}
        {/* ========================================================================= */}
        <div className="p-4 rounded-xl bg-card border border-border dark:border-border shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-foreground flex items-center gap-2">
                Cash Coverage Forecast
                {availableCash >= payablesDue30d ? (
                  <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 text-emerald-800 dark:bg-emerald-950 border-none text-[10px] font-bold">
                    Covered ✓
                  </Badge>
                ) : (
                  <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 text-amber-800 dark:bg-amber-950 border-none text-[10px] font-bold">
                    Short by {formatMoney(payablesDue30d - availableCash)} SAR
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="fin-num font-semibold text-foreground">{formatMoney(availableCash)} SAR</span> available in bank & cash accounts ·{' '}
                <span className="fin-num font-semibold text-foreground">{formatMoney(payablesDue30d)} SAR</span> due in next 30 days
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase">Overdue Total</div>
              <div className="fin-num font-semibold text-xs text-amber-600 dark:text-amber-400">{formatMoney(totalOverdue)} SAR</div>
            </div>
            <Link
              to="/finance/bank-accounts"
              className="text-xs font-bold text-[#FA634E] hover:underline flex items-center gap-1 shrink-0"
            >
              View bank accounts →
            </Link>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 4. INSIGHTS ROW (Up to 4 Cards)                                           */}
        {/* ========================================================================= */}
        {insights.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {insights.map((item) => {
              const IconComp = item.icon;
              return (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-card border border-border dark:border-border shadow-xs flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-[#FA634E] shrink-0">
                      <IconComp className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-foreground truncate">{item.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{item.subtitle}</div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={item.action}
                    className="h-7 text-xs font-bold text-[#FA634E] hover:text-[#e5533f] hover:bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 dark:hover:bg-rose-950/30 justify-start px-2 -ml-2"
                  >
                    {item.actionText} →
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 5. MAIN CONTENT AREA BY VIEW MODE                                         */}
        {/* ========================================================================= */}
        {isLoading ? (
          <div className="p-8 bg-card rounded-xl border border-border dark:border-border space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : isError ? (
          <div className="p-6 bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center justify-between">
            <span>Failed to load AP Ageing report. Please try again.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            {/* VIEW 1: BY VENDOR */}
            {viewMode === 'vendor' && (
              <div className="bg-card rounded-xl border border-border dark:border-border shadow-xs overflow-hidden space-y-4">
                {/* Header Controls */}
                <div className="p-4 border-b border-border dark:border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className="relative w-64">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Search vendors..."
                        value={searchTerm}
                        onChange={(e) => updateUrlParam('search', e.target.value)}
                        className="pl-9 h-8 text-xs bg-card"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        id="overdue-only"
                        checked={overdueOnly}
                        onCheckedChange={(c) => updateUrlParam('overdue_only', c ? 'true' : null)}
                      />
                      <label htmlFor="overdue-only" className="text-xs font-semibold text-muted-foreground dark:text-muted-foreground cursor-pointer">
                        Overdue only
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Select value={sortBy} onValueChange={(v) => updateUrlParam('sort', v)}>
                      <SelectTrigger className="h-8 text-xs w-44 bg-card">
                        <SelectValue placeholder="Sort by..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="total_desc">Highest total first</SelectItem>
                        <SelectItem value="total_asc">Lowest total first</SelectItem>
                        <SelectItem value="name_asc">Vendor name A-Z</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Vendor Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-muted/80 border-b border-border dark:border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        <th className="py-3 px-4 w-8"></th>
                        <th className="py-3 px-4">Vendor / Payee</th>
                        <th className="py-3 px-4 text-right w-28">Current</th>
                        <th className="py-3 px-4 text-right w-28">1–30 Days</th>
                        <th className="py-3 px-4 text-right w-28">31–60 Days</th>
                        <th className="py-3 px-4 text-right w-28">61–90 Days</th>
                        <th className="py-3 px-4 text-right w-28">90+ Days</th>
                        <th className="py-3 px-4 text-right w-32">Total (SAR)</th>
                        <th className="py-3 px-4 text-center w-20">30d Change</th>
                        <th className="py-3 px-4 w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 dark:divide-border/60">
                      {filteredVendorRows.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-12 text-center text-muted-foreground text-xs">
                            No vendors match the current filter criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredVendorRows.map((r) => {
                          const isExpanded = expandedVendorIds.has(r.party_id);
                          const initials = r.party_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'V';
                          const tintClass = getVendorHashColor(r.party_name);

                          // Prior total for 30d change chip
                          const priorTot = priorVendorMap.get(r.party_id) || 0;
                          const deltaTot = r.total - priorTot;

                          return (
                            <React.Fragment key={r.party_id}>
                              <tr className="hover:bg-muted/60 dark:hover:bg-slate-800/40 transition-colors group">
                                <td className="py-3 px-4">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => toggleVendorExpand(r.party_id)}
                                    className="h-6 w-6 text-muted-foreground"
                                  >
                                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                  </Button>
                                </td>

                                <td className="py-3 px-4">
                                  <HoverCard>
                                    <HoverCardTrigger className="cursor-pointer">
                                      <div className="flex items-center gap-2.5">
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] ${tintClass}`}>
                                          {initials}
                                        </div>
                                        <div>
                                          <div className="font-bold text-foreground flex items-center gap-1.5">
                                            {r.party_name}
                                            {r.party?.type === 'payee' && (
                                              <Badge variant="outline" className="text-[9px] py-0 px-1 border-border">
                                                payee
                                              </Badge>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </HoverCardTrigger>
                                    <HoverCardContent align="start" className="w-72 p-4 text-xs space-y-3">
                                      <div className="font-bold text-foreground">{r.party_name}</div>
                                      {r.party?.phone && (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                          <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                                          {r.party.phone}
                                        </div>
                                      )}
                                      <div className="pt-2 border-t flex flex-col gap-1 text-[11px] text-[#FA634E] font-semibold">
                                        <Link to={`/third-party/${r.party_id}`} className="hover:underline flex items-center gap-1">
                                          View provider record →
                                        </Link>
                                        <Link to={`/finance/bills?search=${encodeURIComponent(r.party_name)}`} className="hover:underline flex items-center gap-1">
                                          View all bills →
                                        </Link>
                                      </div>
                                    </HoverCardContent>
                                  </HoverCard>
                                </td>

                                {/* Bucket cells heat-tinted by share of row total */}
                                {[
                                  { val: r.current, key: 'current', style: 'text-emerald-700 dark:text-emerald-300' },
                                  { val: r.days_1_30, key: '1-30', style: 'text-amber-700 dark:text-amber-300' },
                                  { val: r.days_31_60, key: '31-60', style: 'text-orange-700 dark:text-orange-300' },
                                  { val: r.days_61_90, key: '61-90', style: 'text-rose-700 dark:text-rose-300' },
                                  { val: r.days_90_plus, key: '90+', style: 'text-red-700 dark:text-red-300 font-bold' },
                                ].map((bCell) => {
                                  const cellPct = r.total > 0 ? bCell.val / r.total : 0;
                                  const opacity = cellPct > 0 ? Math.max(0.05, Math.min(0.2, cellPct)) : 0;

                                  return (
                                    <td
                                      key={bCell.key}
                                      onClick={() => {
                                        toggleVendorExpand(r.party_id);
                                        const map = new Map(vendorBucketFilterMap);
                                        map.set(r.party_id, bCell.key as AgeingBucketKey);
                                        setVendorBucketFilterMap(map);
                                      }}
                                      style={{ backgroundColor: cellPct > 0 ? `rgba(250, 99, 78, ${opacity})` : undefined }}
                                      className={`py-3 px-4 text-right font-mono cursor-pointer transition-colors ${bCell.style}`}
                                    >
                                      {bCell.val > 0 ? formatMoney(bCell.val) : '—'}
                                    </td>
                                  );
                                })}

                                <td className="py-3 px-4 text-right fin-num font-semibold text-foreground">
                                  {formatMoney(r.total)}
                                </td>

                                <td className="py-3 px-4 text-center font-mono text-[11px]">
                                  {priorTot > 0 ? (
                                    <span className={deltaTot > 0 ? 'text-amber-600 font-bold' : 'text-emerald-600'}>
                                      {deltaTot > 0 ? '+' : ''}{formatMoney(deltaTot)}
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                </td>

                                <td className="py-3 px-4 text-right">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const vBills = (r.bills || []).map((b) => ({
                                        id: b.id,
                                        ref_id: b.ref_id,
                                        bill_date: b.bill_date,
                                        due_date: b.due_date,
                                        balance: b.balance,
                                        vendor_name: r.party_name,
                                      }));
                                      handleOpenPayRun(vBills);
                                    }}
                                    className="h-7 text-xs font-bold"
                                  >
                                    Pay
                                  </Button>
                                </td>
                              </tr>

                              {/* Expanded Vendor Bills Sub-Table */}
                              {isExpanded && r.bills && (
                                <tr className="bg-muted/50">
                                  <td colSpan={10} className="p-4 pl-12">
                                    <div className="bg-card rounded-xl border border-border dark:border-border p-3 space-y-2">
                                      <div className="text-[11px] font-bold text-muted-foreground dark:text-muted-foreground flex items-center justify-between">
                                        <span>Open bills for {r.party_name} ({r.bills.length})</span>
                                        {vendorBucketFilterMap.get(r.party_id) && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                              const map = new Map(vendorBucketFilterMap);
                                              map.delete(r.party_id);
                                              setVendorBucketFilterMap(map);
                                            }}
                                            className="h-5 text-[10px] text-[#FA634E]"
                                          >
                                            Clear bucket filter
                                          </Button>
                                        )}
                                      </div>

                                      <table className="w-full text-left text-xs font-mono">
                                        <thead>
                                          <tr className="border-b text-[10px] text-muted-foreground uppercase">
                                            <th className="py-1.5">Bill Ref</th>
                                            <th className="py-1.5">Bill Date</th>
                                            <th className="py-1.5">Due Date</th>
                                            <th className="py-1.5">Overdue</th>
                                            <th className="py-1.5 text-right">Balance (SAR)</th>
                                            <th className="py-1.5 text-right">Action</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/60 dark:divide-border/60">
                                          {r.bills
                                            .filter((b) => {
                                              const vBFilter = vendorBucketFilterMap.get(r.party_id);
                                              return !vBFilter || b.bucket === vBFilter;
                                            })
                                            .map((b) => (
                                              <tr key={b.id} className="hover:bg-muted dark:hover:bg-slate-800/50">
                                                <td className="py-2 font-bold text-foreground">{b.ref_id || b.id.slice(0, 8)}</td>
                                                <td className="py-2 text-muted-foreground">{formatDate(b.bill_date)}</td>
                                                <td className="py-2 text-muted-foreground">{formatDate(b.due_date)}</td>
                                                <td className="py-2">
                                                  {b.days_overdue > 0 ? (
                                                    <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 text-amber-800 border-none text-[10px]">
                                                      {b.days_overdue} days
                                                    </Badge>
                                                  ) : (
                                                    <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 text-emerald-800 border-none text-[10px]">
                                                      Current
                                                    </Badge>
                                                  )}
                                                </td>
                                                <td className="py-2 text-right font-bold text-foreground">
                                                  {formatMoney(b.balance)}
                                                </td>
                                                <td className="py-2 text-right">
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() =>
                                                      handleOpenPayRun([
                                                        {
                                                          id: b.id,
                                                          ref_id: b.ref_id,
                                                          bill_date: b.bill_date,
                                                          due_date: b.due_date,
                                                          balance: b.balance,
                                                          vendor_name: r.party_name,
                                                        },
                                                      ])
                                                    }
                                                    className="h-6 text-[11px] font-bold text-[#FA634E]"
                                                  >
                                                    Pay bill
                                                  </Button>
                                                </td>
                                              </tr>
                                            ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>

                    {/* Charcoal Grand Total Footer */}
                    <tfoot>
                      <tr className="bg-card text-foreground border border-border text-white font-bold text-xs">
                        <td colSpan={2} className="py-3.5 px-4 text-base">Grand Total</td>
                        <td className="py-3.5 px-4 text-right font-mono">{formatMoney(grandTotal.current)}</td>
                        <td className="py-3.5 px-4 text-right font-mono">{formatMoney(grandTotal.days_1_30)}</td>
                        <td className="py-3.5 px-4 text-right font-mono">{formatMoney(grandTotal.days_31_60)}</td>
                        <td className="py-3.5 px-4 text-right font-mono">{formatMoney(grandTotal.days_61_90)}</td>
                        <td className="py-3.5 px-4 text-right font-mono">{formatMoney(grandTotal.days_90_plus)}</td>
                        <td className="py-3.5 px-4 text-right font-mono text-[#FA634E] text-sm font-extrabold">
                          {formatMoney(grandTotal.total)}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* VIEW 2: BY BILL */}
            {viewMode === 'bill' && (
              <div className="bg-card rounded-xl border border-border dark:border-border shadow-xs overflow-hidden space-y-4">
                {/* Header Controls & Selection Bar */}
                <div className="p-4 border-b border-border dark:border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className="relative w-64">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Search bill ref or vendor..."
                        value={searchTerm}
                        onChange={(e) => updateUrlParam('search', e.target.value)}
                        className="pl-9 h-8 text-xs bg-card"
                      />
                    </div>

                    <Button variant="outline" size="sm" onClick={handleSelectAllOverdueBills} className="h-8 text-xs">
                      Select all overdue
                    </Button>
                  </div>

                  {selectedBillIds.size > 0 && (
                    <div className="flex items-center gap-3 bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-950/40 p-1.5 px-3 rounded-xl border border-rose-200/60">
                      <span className="text-xs font-bold text-foreground">
                        {selectedBillIds.size} selected ·{' '}
                        {formatMoney(
                          filteredBillRows
                            .filter((b) => selectedBillIds.has(b.id))
                            .reduce((s, b) => s + b.balance, 0)
                        )}{' '}
                        SAR
                      </span>
                      <Button
                        size="sm"
                        onClick={handlePaySelectedBills}
                        className="h-7 text-xs bg-[#FA634E] hover:bg-[#e5533f] text-white font-bold"
                      >
                        Pay selected
                      </Button>
                    </div>
                  )}
                </div>

                {/* Flat Bills Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-muted/80 border-b text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        <th className="py-3 px-4 w-8">
                          <Checkbox
                            checked={
                              filteredBillRows.length > 0 && selectedBillIds.size === filteredBillRows.length
                            }
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedBillIds(new Set(filteredBillRows.map((b) => b.id)));
                              } else {
                                setSelectedBillIds(new Set());
                              }
                            }}
                          />
                        </th>
                        <th className="py-3 px-4">Bill Ref</th>
                        <th className="py-3 px-4">Vendor</th>
                        <th className="py-3 px-4">Bill Date</th>
                        <th className="py-3 px-4">Due Date</th>
                        <th className="py-3 px-4">Age / Bucket</th>
                        <th className="py-3 px-4 text-right">Balance (SAR)</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 dark:divide-border/60">
                      {filteredBillRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-muted-foreground text-xs">
                            No open bills match the current filters.
                          </td>
                        </tr>
                      ) : (
                        filteredBillRows.map((b) => {
                          const isSelected = selectedBillIds.has(b.id);
                          const bStyle = BUCKET_STYLES[b.bucket] || BUCKET_STYLES.current;

                          return (
                            <tr key={b.id} className="hover:bg-muted/60 dark:hover:bg-slate-800/40">
                              <td className="py-3 px-4">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={(checked) => {
                                    const next = new Set(selectedBillIds);
                                    if (checked) next.add(b.id);
                                    else next.delete(b.id);
                                    setSelectedBillIds(next);
                                  }}
                                />
                              </td>
                              <td className="py-3 px-4 fin-num font-semibold text-foreground">
                                {b.ref_id || b.id.slice(0, 8)}
                              </td>
                              <td className="py-3 px-4 font-semibold text-foreground">
                                {b.vendor_name}
                              </td>
                              <td className="py-3 px-4 text-muted-foreground">{formatDate(b.bill_date)}</td>
                              <td className="py-3 px-4 text-muted-foreground">{formatDate(b.due_date)}</td>
                              <td className="py-3 px-4">
                                <Badge className={`${bStyle.bg} ${bStyle.text} border-none font-bold text-[10px]`}>
                                  {b.days_overdue > 0 ? `${b.days_overdue}d overdue (${b.bucket})` : 'Current'}
                                </Badge>
                              </td>
                              <td className="py-3 px-4 text-right fin-num font-semibold text-foreground">
                                {formatMoney(b.balance)}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenPayRun([b])}
                                  className="h-7 text-xs font-bold"
                                >
                                  Pay
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* VIEW 3: PAYMENT SCHEDULE */}
            {viewMode === 'schedule' && (
              <div className="space-y-6">
                {/* Schedule Visual Timeline */}
                <div className="p-6 bg-card rounded-xl border border-border dark:border-border shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-foreground">Forward Payment Schedule & Cash Line</h3>
                    <span className="text-xs text-muted-foreground font-mono">
                      Starting Cash: <span className="font-bold text-foreground">{formatMoney(availableCash)} SAR</span>
                    </span>
                  </div>

                  {/* Custom Bar Timeline Chart */}
                  <div className="grid grid-cols-8 gap-2 pt-4 border-t border-border dark:border-border">
                    {scheduleWeeks.map((wk, idx) => {
                      const maxTotal = Math.max(...scheduleWeeks.map((w) => w.total)) || 1;
                      const heightPct = Math.max(10, Math.min(100, (wk.total / maxTotal) * 100));

                      return (
                        <div key={wk.key} className="flex flex-col items-center space-y-2">
                          <div className="text-[10px] fin-num font-semibold text-foreground">
                            {formatMoney(wk.total)}
                          </div>

                          <div className="w-full h-32 bg-muted rounded-xl flex items-end p-1">
                            <div
                              className={`w-full rounded-lg transition-all ${
                                idx === 0 ? 'bg-amber-500' : 'bg-[#FA634E]'
                              }`}
                              style={{ height: `${heightPct}%` }}
                            />
                          </div>

                          <div className="text-[10px] font-bold text-muted-foreground text-center truncate w-full">
                            {wk.key === 'overdue' ? 'Overdue' : wk.key === 'later' ? 'Later' : `Wk ${idx}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Collapsible Weekly Groups */}
                <div className="space-y-3">
                  {scheduleWeeks.map((wk) => (
                    <div
                      key={wk.key}
                      className="p-4 bg-card rounded-xl border border-border dark:border-border shadow-xs space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-foreground">{wk.label}</h4>
                          <Badge variant="secondary" className="text-[10px] font-mono">
                            {wk.bills.length} bills
                          </Badge>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-xs fin-num font-semibold text-foreground">
                            {formatMoney(wk.total)} SAR
                          </span>
                          {wk.bills.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenPayRun(wk.bills)}
                              className="h-7 text-xs font-bold"
                            >
                              Pay week
                            </Button>
                          )}
                        </div>
                      </div>

                      {wk.bills.length > 0 && (
                        <div className="pt-2 border-t border-border dark:border-border space-y-1">
                          {wk.bills.map((b) => (
                            <div
                              key={b.id}
                              className="p-2 rounded-lg bg-muted/50 flex items-center justify-between text-xs"
                            >
                              <div className="font-bold text-foreground">
                                {b.ref_id || b.id.slice(0, 8)} · <span className="text-muted-foreground font-normal">{b.vendor_name}</span>
                              </div>
                              <div className="fin-num font-semibold text-foreground">
                                {formatMoney(b.balance)} SAR
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Empty State when zero total payables */}
        {!isLoading && !isError && rows.length === 0 && (
          <FinanceEmptyState
            title={`No open payables as of ${formatDate(asOfDateStr)}`}
            description="All provider bills and vendor obligations are settled."
          />
        )}
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        title="Export AP Ageing Report"
        filteredData={filteredVendorRows}
        columns={vendorExportColumns}
        fileNamePrefix={`AP_Ageing_${asOfDateStr}`}
      />

      {/* Pay Run Sheet */}
      <PayRunSheet
        open={payRunSheetOpen}
        onOpenChange={setPayRunSheetOpen}
        initialBills={payRunInitialBills}
        allAvailableBills={allOpenBills}
        onSuccess={() => refetch()}
      />
    </DashboardLayout>
  );
}
