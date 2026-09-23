import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import {
  Plus,
  Lock,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  RefreshCw,
  Info,
  Check,
  X,
  AlertCircle,
  Clock,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import ConfirmModal from '@/components/ui/ConfirmModal';
import ExportModal, { ExportColumn } from '@/components/ui/ExportModal';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { financeService } from '@/services/financeService';
import { usePermissions } from '@/hooks/usePermissions';
import type { AccountingPeriod, BankAccount, BankReconciliation } from '@mercon/shared-types';
import {
  StatusPill,
  MoneyText,
  ActivityTimeline,
  JournalLinesTable,
} from '@/components/finance/kit';
import { formatDate } from '@/lib/finance';
import { api } from '@/lib/api';

type PeriodRow = AccountingPeriod & { _count?: { journalEntries: number } };

const ACCOUNTING_PERIODS_EXPORT_COLUMNS: ExportColumn<PeriodRow>[] = [
  { id: 'name', label: 'Period Name', accessor: (p) => p.name },
  { id: 'start_date', label: 'Start Date', accessor: (p) => formatDate(p.start_date) },
  { id: 'end_date', label: 'End Date', accessor: (p) => formatDate(p.end_date) },
  { id: 'status', label: 'Status', accessor: (p) => p.status },
  { id: 'journal_entries_count', label: 'Journal Entries Count', accessor: (p) => p._count?.journalEntries || 0 },
];

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function AccountingPeriodsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { userRole, isSuperAdmin } = usePermissions();
  const isAdmin = isSuperAdmin || userRole === 'Admin';

  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth();

  // Selected State
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [isAllPeriodsCollapsed, setIsAllPeriodsCollapsed] = useState(true);

  // Modals & Sheets State
  const [isNewSheetOpen, setIsNewSheetOpen] = useState(false);
  const [isGenerateSheetOpen, setIsGenerateSheetOpen] = useState(false);
  const [isFySheetOpen, setIsFySheetOpen] = useState(false);
  const [isReopenSheetOpen, setIsReopenSheetOpen] = useState(false);
  const [isLockConfirmOpen, setIsLockConfirmOpen] = useState(false);
  const [isCloseWarningModalOpen, setIsCloseWarningModalOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Forms State
  const [newPeriodForm, setNewPeriodForm] = useState({
    name: '',
    start_date: '',
    end_date: '',
  });

  const [reopenReason, setReopenReason] = useState('');
  const [lockTypedConfirm, setLockTypedConfirm] = useState('');

  // FY Closing Stepper State
  const [fyStep, setFyStep] = useState<1 | 2 | 3 | 4>(1);
  const [fyClosingDate, setFyClosingDate] = useState<string>(`${currentYear}-12-31`);
  const [fyTypedConfirm, setFyTypedConfirm] = useState<string>('');

  // Generate Periods State
  const [generateYear, setGenerateYear] = useState<number>(currentYear);
  const [generateFreq, setGenerateFreq] = useState<'monthly' | 'quarterly'>('monthly');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0);

  // Main Accounting Periods Query
  const { data: periodsRes } = useQuery({
    queryKey: ['accounting-periods'],
    queryFn: () => financeService.getAccountingPeriods(),
  });

  const periods: PeriodRow[] = periodsRes?.data || [];

  // Available Fiscal Years
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    yearsSet.add(currentYear);
    periods.forEach((p) => {
      const year = new Date(p.start_date).getFullYear();
      if (!isNaN(year)) yearsSet.add(year);
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [periods, currentYear]);

  // Set default selected period
  useEffect(() => {
    if (periods.length > 0 && !selectedPeriodId) {
      const earliestOpen = [...periods]
        .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
        .find((p) => p.status === 'Open');

      if (earliestOpen) {
        setSelectedPeriodId(earliestOpen.id);
        setSelectedYear(new Date(earliestOpen.start_date).getFullYear());
      } else {
        const firstP = periods[0];
        setSelectedPeriodId(firstP.id);
        setSelectedYear(new Date(firstP.start_date).getFullYear());
      }
    }
  }, [periods, selectedPeriodId]);

  const selectedPeriod = useMemo(
    () => periods.find((p) => p.id === selectedPeriodId) || periods[0] || null,
    [periods, selectedPeriodId]
  );

  // Compute Lock Line: "Books locked through <date>"
  const booksLockedThroughLabel = useMemo(() => {
    if (periods.length === 0) return 'Nothing closed yet';

    const sortedAsc = [...periods].sort(
      (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    );

    let lastClosedOrLockedPeriod: PeriodRow | null = null;
    for (const p of sortedAsc) {
      if (p.status === 'Closed' || p.status === 'Locked') {
        lastClosedOrLockedPeriod = p;
      } else {
        break;
      }
    }

    if (!lastClosedOrLockedPeriod) return 'Nothing closed yet';
    return formatDate(lastClosedOrLockedPeriod.end_date);
  }, [periods]);

  // Selected period date strings (formatted for API queries)
  const selectedStartDateStr = useMemo(
    () => (selectedPeriod?.start_date ? new Date(selectedPeriod.start_date).toISOString().split('T')[0] : ''),
    [selectedPeriod]
  );
  const selectedEndDateStr = useMemo(
    () => (selectedPeriod?.end_date ? new Date(selectedPeriod.end_date).toISOString().split('T')[0] : ''),
    [selectedPeriod]
  );

  // Check queries for selected period
  const { data: draftJesRes } = useQuery({
    queryKey: ['period-check-draft-jes', selectedPeriod?.id],
    queryFn: () => financeService.getJournalEntries({ period_id: selectedPeriod?.id, status: 'Draft', per_page: 1 }),
    enabled: Boolean(selectedPeriod?.id),
    staleTime: 30000,
  });

  const { data: draftInvoicesRes } = useQuery({
    queryKey: ['period-check-draft-invoices', selectedStartDateStr, selectedEndDateStr],
    queryFn: () => financeService.getInvoices({ status: 'Draft', date_from: selectedStartDateStr, date_to: selectedEndDateStr, per_page: 1 }),
    enabled: Boolean(selectedStartDateStr && selectedEndDateStr),
    staleTime: 30000,
  });

  const { data: draftBillsRes } = useQuery({
    queryKey: ['period-check-draft-bills', selectedStartDateStr, selectedEndDateStr],
    queryFn: () => financeService.getBills({ status: 'Draft', date_from: selectedStartDateStr, date_to: selectedEndDateStr, per_page: 1 }),
    enabled: Boolean(selectedStartDateStr && selectedEndDateStr),
    staleTime: 30000,
  });

  const { data: bankAccountsRes } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => financeService.getBankAccounts(),
    staleTime: 30000,
  });

  const { data: reconciliationsRes } = useQuery({
    queryKey: ['bank-reconciliations'],
    queryFn: () => financeService.getReconciliations(),
    staleTime: 30000,
  });

  const { data: trialBalanceRes } = useQuery({
    queryKey: ['trial-balance', selectedPeriod?.id],
    queryFn: () => financeService.getTrialBalance({ period_id: selectedPeriod?.id }),
    enabled: Boolean(selectedPeriod?.id),
    staleTime: 30000,
  });

  const { data: overdueInvoicesRes } = useQuery({
    queryKey: ['period-check-overdue-invoices'],
    queryFn: () => financeService.getInvoices({ status: 'overdue' as any, per_page: 1 }),
    staleTime: 30000,
  });

  const { data: activityRes, isLoading: isActivityLoading } = useQuery({
    queryKey: ['period-activity', selectedPeriod?.id],
    queryFn: () => financeService.getAccountingPeriodActivity(selectedPeriod?.id!),
    enabled: Boolean(selectedPeriod?.id),
  });

  const { data: periodJesRes } = useQuery({
    queryKey: ['journal-entries-period', selectedPeriod?.id],
    queryFn: () => financeService.getJournalEntries({ period_id: selectedPeriod?.id, per_page: 100 }),
    enabled: Boolean(selectedPeriod?.id),
  });

  // Settings query for Retained Earnings pre-check
  const { data: settingsRes } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data;
    },
    staleTime: 60000,
  });

  // Profit and Loss query for FY close preview
  const { data: pnlRes } = useQuery({
    queryKey: ['pnl-fy-preview', selectedYear, fyClosingDate],
    queryFn: () => financeService.getProfitAndLoss({ date_from: `${selectedYear}-01-01`, date_to: fyClosingDate }),
    enabled: isFySheetOpen && fyStep >= 3,
  });

  // Checklist Evaluations
  const checklist = useMemo(() => {
    const draftJeCount = draftJesRes?.pagination?.total || 0;
    const draftInvoiceCount = draftInvoicesRes?.pagination?.total || 0;
    const draftBillCount = draftBillsRes?.pagination?.total || 0;
    const overdueInvoiceCount = overdueInvoicesRes?.pagination?.total || 0;

    const bankAccounts: BankAccount[] = bankAccountsRes?.data || [];
    const reconciliations: BankReconciliation[] = reconciliationsRes?.data || [];
    const periodEnd = selectedPeriod?.end_date ? new Date(selectedPeriod.end_date) : null;

    const unreconciledAccountNames: string[] = [];
    if (periodEnd) {
      bankAccounts.forEach((acc) => {
        if (acc.isActive) {
          const hasRec = reconciliations.some(
            (r) =>
              r.bankAccountId === acc.id &&
              r.status === 'Completed' &&
              new Date(r.statement_date) >= periodEnd
          );
          if (!hasRec) {
            unreconciledAccountNames.push(acc.bank_name || acc.account?.name || 'Bank Account');
          }
        }
      });
    }

    const tbData = trialBalanceRes?.data;
    const isTbBalanced = tbData ? tbData.is_balanced : true;

    let prevPeriod: PeriodRow | null = null;
    let isPrevPeriodClosed = true;
    if (selectedPeriod) {
      const earlierPeriods = periods
        .filter((p) => new Date(p.start_date) < new Date(selectedPeriod.start_date))
        .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());

      if (earlierPeriods.length > 0) {
        prevPeriod = earlierPeriods[0];
        isPrevPeriodClosed = prevPeriod.status === 'Closed' || prevPeriod.status === 'Locked';
      }
    }

    const check1_blocker = draftJeCount === 0;
    const check2_warning = draftInvoiceCount === 0;
    const check3_warning = draftBillCount === 0;
    const check4_warning = unreconciledAccountNames.length === 0;
    const check5_check = isTbBalanced;
    const check6_warning = isPrevPeriodClosed;

    const checksPassedCount = [
      check1_blocker,
      check2_warning,
      check3_warning,
      check4_warning,
      check5_check,
      check6_warning,
    ].filter(Boolean).length;

    const hasWarnings = !check2_warning || !check3_warning || !check4_warning || !check6_warning;

    return {
      draftJeCount,
      draftInvoiceCount,
      draftBillCount,
      overdueInvoiceCount,
      unreconciledAccountNames,
      isTbBalanced,
      prevPeriod,
      isPrevPeriodClosed,
      check1_blocker,
      check2_warning,
      check3_warning,
      check4_warning,
      check5_check,
      check6_warning,
      checksPassedCount,
      hasWarnings,
    };
  }, [
    draftJesRes,
    draftInvoicesRes,
    draftBillsRes,
    overdueInvoicesRes,
    bankAccountsRes,
    reconciliationsRes,
    trialBalanceRes,
    selectedPeriod,
    periods,
  ]);

  // Financial Summary from Trial Balance for Selected Period
  const periodFinSummary = useMemo(() => {
    const items = trialBalanceRes?.data?.items || [];
    let revenue = 0;
    let expenses = 0;

    items.forEach((item) => {
      if (item.account_type === 'Revenue') {
        revenue += Number(item.credit) - Number(item.debit);
      } else if (item.account_type === 'Expense') {
        expenses += Number(item.debit) - Number(item.credit);
      }
    });

    const netResult = revenue - expenses;
    return { revenue, expenses, netResult };
  }, [trialBalanceRes]);

  // Entry totals breakdown for Selected Period
  const periodJeBreakdown = useMemo(() => {
    const list: any[] = periodJesRes?.data || [];
    const posted = list.filter((j) => j.status === 'Posted').length;
    const draft = list.filter((j) => j.status === 'Draft').length;
    const voided = list.filter((j) => j.status === 'Voided').length;
    return { posted, draft, voided, total: list.length };
  }, [periodJesRes]);

  // Audit Activity Logs for Selected Period
  const activityLogs = activityRes?.data || [];

  const reopenedAuditLog = useMemo(
    () => activityLogs.find((l: any) => l.action === 'PERIOD_REOPENED'),
    [activityLogs]
  );

  // Mutations
  const createMutation = useMutation({
    mutationFn: financeService.createAccountingPeriod,
    onSuccess: () => {
      toast.success('Accounting period created successfully');
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
      setIsNewSheetOpen(false);
      setNewPeriodForm({ name: '', start_date: '', end_date: '' });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to create accounting period');
    },
  });

  const closeMutation = useMutation({
    mutationFn: financeService.closeAccountingPeriod,
    onSuccess: () => {
      toast.success(`Period '${selectedPeriod?.name}' closed successfully`);
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['trial-balance'] });
      queryClient.invalidateQueries({ queryKey: ['period-activity'] });
      setIsCloseWarningModalOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to close period');
    },
  });

  const reopenMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => financeService.reopenAccountingPeriod(id, reason),
    onSuccess: () => {
      toast.success(`Period '${selectedPeriod?.name}' reopened successfully`);
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
      queryClient.invalidateQueries({ queryKey: ['period-activity'] });
      setIsReopenSheetOpen(false);
      setReopenReason('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to reopen period');
    },
  });

  const lockMutation = useMutation({
    mutationFn: financeService.lockAccountingPeriod,
    onSuccess: () => {
      toast.success(`Period '${selectedPeriod?.name}' locked permanently`);
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
      queryClient.invalidateQueries({ queryKey: ['period-activity'] });
      setIsLockConfirmOpen(false);
      setLockTypedConfirm('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to lock period');
    },
  });

  const fyClosingMutation = useMutation({
    mutationFn: (dateStr: string) => financeService.closeFiscalYear(dateStr),
    onSuccess: (res: any) => {
      const entry = res?.data;
      toast.success(`Fiscal Year ${selectedYear} closed! Journal Entry ${entry?.ref_id || ''} posted.`);
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['trial-balance'] });
      setIsFySheetOpen(false);
      setFyStep(1);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to close fiscal year');
    },
  });

  const handleOpenNewPeriodForMonth = (monthIdx: number) => {
    const monthName = FULL_MONTH_NAMES[monthIdx];
    const startDate = `${selectedYear}-${String(monthIdx + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(selectedYear, monthIdx + 1, 0).getDate();
    const endDate = `${selectedYear}-${String(monthIdx + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`;

    setNewPeriodForm({
      name: `${monthName} ${selectedYear}`,
      start_date: startDate,
      end_date: endDate,
    });
    setIsNewSheetOpen(true);
  };

  const handleClosePeriodClick = () => {
    if (!checklist.check1_blocker) return;
    if (checklist.hasWarnings) {
      setIsCloseWarningModalOpen(true);
    } else {
      closeMutation.mutate(selectedPeriod.id);
    }
  };

  const fyPreChecks = useMemo(() => {
    const closingDateObj = new Date(fyClosingDate);
    const openPeriodsBefore = periods.filter(
      (p) => new Date(p.end_date) <= closingDateObj && p.status === 'Open'
    );
    const retainedAccSet = Boolean(settingsRes?.data?.defaultRetainedEarningsAccountId);

    return {
      openPeriodsBefore,
      retainedAccSet,
      canPass: openPeriodsBefore.length === 0 && retainedAccSet,
    };
  }, [periods, fyClosingDate, settingsRes]);

  const fyClosingPreviewLines = useMemo(() => {
    const pnlData = pnlRes?.data;
    if (!pnlData) return [];

    const lines: any[] = [];
    const revs = pnlData.revenues || [];
    const exps = pnlData.expenses || [];

    revs.forEach((r) => {
      if (r.amount > 0) {
        lines.push({
          account: { account_code: r.account_code, name: r.name },
          debit: r.amount,
          credit: 0,
        });
      }
    });

    exps.forEach((e) => {
      if (e.amount > 0) {
        lines.push({
          account: { account_code: e.account_code, name: e.name },
          debit: 0,
          credit: e.amount,
        });
      }
    });

    const netProfit = pnlData.net_profit || 0;
    if (netProfit > 0) {
      lines.push({
        account: { account_code: '3900', name: 'Retained Earnings' },
        debit: 0,
        credit: netProfit,
      });
    } else if (netProfit < 0) {
      lines.push({
        account: { account_code: '3900', name: 'Retained Earnings' },
        debit: Math.abs(netProfit),
        credit: 0,
      });
    }

    return lines;
  }, [pnlRes]);

  const handleBulkGenerate = async () => {
    setIsGenerating(true);
    setGenerateProgress(0);

    const isMonthly = generateFreq === 'monthly';
    const totalPeriodsToBuild = isMonthly ? 12 : 4;
    let createdCount = 0;

    for (let i = 0; i < totalPeriodsToBuild; i++) {
      let name = '';
      let startDateStr = '';
      let endDateStr = '';

      if (isMonthly) {
        const monthName = FULL_MONTH_NAMES[i];
        name = `${monthName} ${generateYear}`;
        startDateStr = `${generateYear}-${String(i + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(generateYear, i + 1, 0).getDate();
        endDateStr = `${generateYear}-${String(i + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`;
      } else {
        const qNum = i + 1;
        name = `FY${generateYear}-Q${qNum}`;
        const startMonth = i * 3 + 1;
        const endMonth = i * 3 + 3;
        startDateStr = `${generateYear}-${String(startMonth).padStart(2, '0')}-01`;
        const lastDay = new Date(generateYear, endMonth, 0).getDate();
        endDateStr = `${generateYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`;
      }

      const exists = periods.some(
        (p) =>
          new Date(p.start_date).getTime() === new Date(startDateStr).getTime() &&
          new Date(p.end_date).getTime() === new Date(endDateStr).getTime()
      );

      if (!exists) {
        try {
          await financeService.createAccountingPeriod({
            name,
            start_date: startDateStr,
            end_date: endDateStr,
          });
          createdCount++;
        } catch {
          // Continue bulk generation
        }
      }

      setGenerateProgress(Math.round(((i + 1) / totalPeriodsToBuild) * 100));
    }

    setIsGenerating(false);
    toast.success(`Generated ${createdCount} periods for FY ${generateYear}`);
    queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
    setIsGenerateSheetOpen(false);
  };

  return (
    <DashboardLayout active="finance" title="Period Close">
      <div className="p-6 space-y-5 max-w-7xl mx-auto">
        {/* Top Control Bar: Fiscal-Year Switcher + Lock Line + Action Buttons */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl px-5 py-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-xs">
          <div className="flex flex-wrap items-center gap-4">
            {/* FY Switcher */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#3E3C3D] dark:text-slate-200 uppercase tracking-wider">
                Fiscal Year
              </span>
              <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    const idx = availableYears.indexOf(selectedYear);
                    if (idx < availableYears.length - 1) setSelectedYear(availableYears[idx + 1]);
                    else setSelectedYear(selectedYear - 1);
                  }}
                  className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="px-3 text-xs font-bold font-mono text-slate-900 dark:text-white">
                  FY {selectedYear}
                </span>

                <button
                  type="button"
                  onClick={() => {
                    const idx = availableYears.indexOf(selectedYear);
                    if (idx > 0) setSelectedYear(availableYears[idx - 1]);
                    else setSelectedYear(selectedYear + 1);
                  }}
                  className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Lock Line */}
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300">
              <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>
                Books locked through <strong className="text-slate-900 dark:text-white font-mono">{booksLockedThroughLabel}</strong>
              </span>
            </div>
          </div>

          {/* Header Action Buttons */}
          {isAdmin && (
            <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsGenerateSheetOpen(true)}
                className="h-9 text-xs font-semibold rounded-xl"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                Generate periods
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFyClosingDate(`${selectedYear}-12-31`);
                  setFyStep(1);
                  setIsFySheetOpen(true);
                }}
                className="h-9 text-xs font-semibold rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                <Lock className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                Close fiscal year
              </Button>
              <Button
                onClick={() => {
                  setNewPeriodForm({ name: '', start_date: '', end_date: '' });
                  setIsNewSheetOpen(true);
                }}
                className="bg-[#FA634E] hover:bg-[#e0523d] text-white h-9 text-xs font-semibold px-3.5 rounded-xl shadow-xs"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                New period
              </Button>
            </div>
          )}
        </div>

        {/* Year Ribbon Tiles */}
        <div className="overflow-x-auto pb-2 scrollbar-thin">
          <div className="flex items-center gap-2.5 min-w-max">
            {MONTH_NAMES.map((mName, mIdx) => {
              const matchingPeriod = periods.find((p) => {
                const sDate = new Date(p.start_date);
                return sDate.getFullYear() === selectedYear && sDate.getMonth() === mIdx;
              });

              const isCurrentMonth = selectedYear === currentYear && mIdx === currentMonthIdx;

              if (!matchingPeriod) {
                return (
                  <div
                    key={mName}
                    onClick={() => isAdmin && handleOpenNewPeriodForMonth(mIdx)}
                    className={`w-[88px] h-[96px] rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-2 transition-all ${
                      isAdmin ? 'hover:border-[#FA634E] hover:bg-rose-50/30 cursor-pointer group' : 'opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <span className="text-xs font-bold text-slate-400 group-hover:text-[#FA634E]">{mName}</span>
                    <Plus className="w-4 h-4 my-1 text-slate-300 group-hover:text-[#FA634E]" />
                    <span className="text-[10px] text-slate-400 font-medium">Not created</span>
                  </div>
                );
              }

              const isSelected = selectedPeriodId === matchingPeriod.id;
              const status = matchingPeriod.status;

              let tileClass = 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100';
              if (status === 'Closed') {
                tileClass = 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-200/90 dark:border-amber-800/80 text-amber-950 dark:text-amber-200';
              } else if (status === 'Locked') {
                tileClass = 'bg-[#3E3C3D] text-white border-transparent';
              }

              const jeCount = matchingPeriod._count?.journalEntries || 0;

              return (
                <button
                  key={matchingPeriod.id}
                  type="button"
                  role="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedPeriodId(matchingPeriod.id)}
                  className={`relative w-[88px] h-[96px] rounded-2xl border p-2 flex flex-col justify-between items-center text-center transition-all select-none focus:outline-none ${tileClass} ${
                    isCurrentMonth ? 'ring-2 ring-[#FA634E]' : ''
                  } ${isSelected ? 'border-2 border-[#FA634E] shadow-xs' : 'hover:border-slate-300 dark:hover:border-slate-700'}`}
                >
                  <div className="w-full flex items-center justify-between">
                    <span className={`text-xs font-extrabold ${status === 'Locked' ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                      {mName}
                    </span>
                    {status === 'Open' && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
                    {status === 'Closed' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                    {status === 'Locked' && <Lock className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
                  </div>

                  <div className="text-[11px] font-medium opacity-80">
                    <span className="font-mono font-bold">{jeCount}</span> JEs
                  </div>

                  {isCurrentMonth ? (
                    <span className="px-1.5 py-0.5 rounded-full text-[9.5px] font-bold bg-[#FA634E] text-white tracking-wider uppercase">
                      now
                    </span>
                  ) : (
                    <span className={`text-[10px] font-semibold uppercase tracking-wider opacity-60`}>
                      {status}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Workspace Grid */}
        {selectedPeriod ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Main Column: Close Checklist Card (8 cols) */}
            <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-[#3E3C3D] dark:text-white">
                      Close checklist · {selectedPeriod.name}
                    </h2>
                    <StatusPill kind="period" status={selectedPeriod.status} />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Verify account balances and operational checks before closing this month.
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 rounded-xl border border-slate-200/60 dark:border-slate-700">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {checklist.checksPassedCount} of 6 passed
                  </span>
                  <div className="w-20 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        checklist.checksPassedCount === 6 ? 'bg-emerald-500' : 'bg-[#FA634E]'
                      }`}
                      style={{ width: `${(checklist.checksPassedCount / 6) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {reopenedAuditLog && (
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800 p-3 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Reopened on {formatDate(reopenedAuditLog.createdAt)}</strong>
                    <span className="mx-1">·</span>
                    <span>Reason: &quot;{(reopenedAuditLog.metadata as any)?.reason}&quot;</span>
                  </div>
                </div>
              )}

              {/* Checklist Rows */}
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {/* Row a: Draft JEs (BLOCKER) */}
                <div className="py-3.5 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    {checklist.check1_blocker ? (
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 mt-0.5">
                        <X className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    )}
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span>Draft journal entries</span>
                        {!checklist.check1_blocker && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800 uppercase tracking-wider">
                            BLOCKER
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {checklist.draftJeCount > 0
                          ? `${checklist.draftJeCount} unposted draft journal entry(ies) exist in this period.`
                          : 'No draft journal entries in this period.'}
                      </div>
                    </div>
                  </div>

                  {checklist.draftJeCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/finance/journal-entries?period_id=${selectedPeriod.id}&status=Draft`)}
                      className="h-7 text-xs font-semibold text-[#FA634E] hover:text-[#e0523d] hover:bg-rose-50 shrink-0"
                    >
                      Review drafts →
                    </Button>
                  )}
                </div>

                {/* Row b: Draft Invoices (WARNING) */}
                <div className="py-3.5 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    {checklist.check2_warning ? (
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                        <AlertCircle className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    )}
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Draft invoices in period
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {checklist.draftInvoiceCount > 0
                          ? `${checklist.draftInvoiceCount} draft invoice(s) dated in this period.`
                          : 'No draft invoices dated in this period.'}
                      </div>
                    </div>
                  </div>

                  {checklist.draftInvoiceCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/finance/invoices?status=Draft&date_from=${selectedStartDateStr}&date_to=${selectedEndDateStr}`)}
                      className="h-7 text-xs font-semibold text-amber-700 hover:bg-amber-50 shrink-0"
                    >
                      Review invoices →
                    </Button>
                  )}
                </div>

                {/* Row c: Draft Bills (WARNING) */}
                <div className="py-3.5 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    {checklist.check3_warning ? (
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                        <AlertCircle className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    )}
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Draft bills in period
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {checklist.draftBillCount > 0
                          ? `${checklist.draftBillCount} draft bill(s) dated in this period.`
                          : 'No draft bills dated in this period.'}
                      </div>
                    </div>
                  </div>

                  {checklist.draftBillCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/finance/bills?status=Draft&date_from=${selectedStartDateStr}&date_to=${selectedEndDateStr}`)}
                      className="h-7 text-xs font-semibold text-amber-700 hover:bg-amber-50 shrink-0"
                    >
                      Review bills →
                    </Button>
                  )}
                </div>

                {/* Row d: Bank Accounts Reconciled (WARNING) */}
                <div className="py-3.5 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    {checklist.check4_warning ? (
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                        <AlertCircle className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    )}
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Bank accounts reconciliation
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {checklist.unreconciledAccountNames.length > 0
                          ? `${checklist.unreconciledAccountNames.join(', ')} not reconciled past period end.`
                          : 'All active bank accounts reconciled through period end.'}
                      </div>
                    </div>
                  </div>

                  {checklist.unreconciledAccountNames.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate('/finance/reconciliation')}
                      className="h-7 text-xs font-semibold text-amber-700 hover:bg-amber-50 shrink-0"
                    >
                      Reconcile →
                    </Button>
                  )}
                </div>

                {/* Row e: Trial Balance Check (CHECK) */}
                <div className="py-3.5 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    {checklist.check5_check ? (
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 mt-0.5">
                        <X className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    )}
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Trial balance health
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {checklist.check5_check
                          ? 'Trial balance is fully balanced for this period.'
                          : 'Trial balance has debit/credit imbalance.'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row f: Previous Period Closed (WARNING) */}
                <div className="py-3.5 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    {checklist.check6_warning ? (
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                        <AlertCircle className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    )}
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Sequential period close order
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {checklist.prevPeriod
                          ? checklist.isPrevPeriodClosed
                            ? `Previous period (${checklist.prevPeriod.name}) is closed.`
                            : `Previous period (${checklist.prevPeriod.name}) is still open.`
                          : 'No earlier period defined.'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row g: Overdue Invoices (INFO ONLY) */}
                <div className="py-3.5 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Info className="w-3.5 h-3.5 stroke-[2.5]" />
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Overdue invoices at period end
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {checklist.overdueInvoiceCount > 0
                          ? `${checklist.overdueInvoiceCount} invoice(s) overdue.`
                          : 'No overdue invoices.'}
                      </div>
                    </div>
                  </div>

                  {checklist.overdueInvoiceCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate('/finance/invoices?status=overdue')}
                      className="h-7 text-xs font-semibold text-slate-600 hover:bg-slate-100 shrink-0"
                    >
                      View overdue →
                    </Button>
                  )}
                </div>
              </div>

              {/* Checklist Card Footer by Status */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-2">
                {!isAdmin ? (
                  <div className="text-xs text-slate-500 italic flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Only Admins can close, reopen or lock periods.</span>
                  </div>
                ) : selectedPeriod.status === 'Open' ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Closing takes a snapshot of every account balance and stops new postings in this period.
                    </p>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Button
                            onClick={handleClosePeriodClick}
                            disabled={!checklist.check1_blocker || closeMutation.isPending}
                            className="bg-[#FA634E] hover:bg-[#e0523d] text-white text-xs font-semibold h-9 px-4 rounded-xl shadow-xs"
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1.5" />
                            Close {selectedPeriod.name}
                          </Button>
                        </TooltipTrigger>
                        {!checklist.check1_blocker && (
                          <TooltipContent side="top">
                            <p className="text-xs">Cannot close period while unposted draft journal entries exist.</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                ) : selectedPeriod.status === 'Closed' ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      Closed period · Account balances snapshotted.
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setReopenReason('');
                          setIsReopenSheetOpen(true);
                        }}
                        className="h-9 text-xs font-semibold rounded-xl"
                      >
                        Reopen period
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => {
                          setLockTypedConfirm('');
                          setIsLockConfirmOpen(true);
                        }}
                        className="bg-[#3E3C3D] hover:bg-[#2D2B2C] text-white text-xs font-semibold h-9 px-3.5 rounded-xl shadow-xs"
                      >
                        <Lock className="w-3.5 h-3.5 mr-1.5 text-slate-300" />
                        Lock permanently
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-600 dark:text-slate-400 font-medium flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700">
                    <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Locked periods are permanent and cannot be reopened.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Period Details Card (4 cols ~360px) */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 space-y-5">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[#3E3C3D] dark:text-white">
                      Period details
                    </h3>
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                      {formatDate(selectedPeriod.start_date)} – {formatDate(selectedPeriod.end_date)}
                    </div>
                  </div>
                  <StatusPill kind="period" status={selectedPeriod.status} />
                </div>

                {/* Mini Status Trail */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#757583]">
                    Lifecycle state
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/70 font-semibold">
                      Created
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    <span
                      className={`px-2 py-1 rounded-lg border font-semibold ${
                        selectedPeriod.status === 'Closed' || selectedPeriod.status === 'Locked'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800'
                      }`}
                    >
                      Closed
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    <span
                      className={`px-2 py-1 rounded-lg border font-semibold ${
                        selectedPeriod.status === 'Locked'
                          ? 'bg-[#3E3C3D] text-white border-transparent'
                          : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800'
                      }`}
                    >
                      Locked
                    </span>
                  </div>
                </div>

                {/* Entry Counts Breakdown */}
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200/60 dark:border-slate-700 space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#757583]">
                    Journal entries in period
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200/70 dark:border-slate-800">
                      <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                        {periodJeBreakdown.posted}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium">Posted</div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200/70 dark:border-slate-800">
                      <div className="text-xs font-bold text-amber-700 dark:text-amber-400 font-mono">
                        {periodJeBreakdown.draft}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium">Draft</div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200/70 dark:border-slate-800">
                      <div className="text-xs font-bold text-slate-500 font-mono">
                        {periodJeBreakdown.voided}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium">Voided</div>
                    </div>
                  </div>
                </div>

                {/* Financial Result for Period */}
                <div className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#757583]">
                    Period result
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                      <span>Revenue</span>
                      <MoneyText value={periodFinSummary.revenue} currency="SAR" className="font-semibold text-slate-900 dark:text-slate-100" />
                    </div>
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                      <span>Expenses</span>
                      <MoneyText value={periodFinSummary.expenses} currency="SAR" className="font-semibold text-slate-900 dark:text-slate-100" />
                    </div>
                    <div className="flex justify-between items-center pt-1.5 border-t border-slate-100 dark:border-slate-800 font-bold">
                      <span className="text-slate-900 dark:text-white">Net result</span>
                      <MoneyText
                        value={periodFinSummary.netResult}
                        currency="SAR"
                        tone={periodFinSummary.netResult >= 0 ? 'positive' : 'negative'}
                        className="text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Navigation Links */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                  <Link
                    to={`/finance/reports/trial-balance?period_id=${selectedPeriod.id}`}
                    className="flex items-center justify-between text-xs text-[#FA634E] hover:underline font-semibold py-1"
                  >
                    <span>Trial balance for this period</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  <Link
                    to={`/finance/journal-entries?period_id=${selectedPeriod.id}`}
                    className="flex items-center justify-between text-xs text-[#FA634E] hover:underline font-semibold py-1"
                  >
                    <span>Journal entries in this period</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                {/* Activity Feed */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#757583]">
                    Activity timeline
                  </div>
                  <ActivityTimeline items={activityLogs} isLoading={isActivityLoading} />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* All Periods Collapsible Ledger Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => setIsAllPeriodsCollapsed(!isAllPeriodsCollapsed)}
            className="w-full px-6 py-4 flex items-center justify-between text-left bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-100/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-[#3E3C3D] dark:text-white">
                All accounting periods ({periods.length})
              </span>
              <Badge variant="outline" className="text-[10px] rounded-md font-mono">
                Historical ledger
              </Badge>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExportOpen(true);
                }}
                className="h-7 text-xs font-semibold rounded-lg"
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                Export
              </Button>

              <ChevronDown
                className={`w-4 h-4 text-slate-500 transition-transform ${
                  isAllPeriodsCollapsed ? 'rotate-180' : ''
                }`}
              />
            </div>
          </button>

          {!isAllPeriodsCollapsed && (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-200/80 dark:border-slate-800">
              <div className="bg-[#FAFAFB] dark:bg-slate-800/40 px-6 py-2.5 grid grid-cols-12 text-[10px] font-bold uppercase tracking-wider text-[#757583]">
                <div className="col-span-3">Period Name</div>
                <div className="col-span-3">Date Range</div>
                <div className="col-span-2 text-center">JEs Count</div>
                <div className="col-span-2 text-center">Status</div>
                <div className="col-span-2 text-right">Closed At</div>
              </div>

              {periods.map((p) => {
                const isSel = selectedPeriodId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedPeriodId(p.id);
                      setSelectedYear(new Date(p.start_date).getFullYear());
                    }}
                    className={`px-6 py-3 grid grid-cols-12 items-center text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors ${
                      isSel ? 'bg-rose-50/40 dark:bg-rose-950/20 font-semibold' : ''
                    }`}
                  >
                    <div className="col-span-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{p.name}</span>
                      {isSel && <span className="w-1.5 h-1.5 rounded-full bg-[#FA634E]" />}
                    </div>

                    <div className="col-span-3 font-mono text-slate-600 dark:text-slate-400">
                      {formatDate(p.start_date)} – {formatDate(p.end_date)}
                    </div>

                    <div className="col-span-2 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                      {p._count?.journalEntries || 0}
                    </div>

                    <div className="col-span-2 text-center">
                      <StatusPill kind="period" status={p.status} />
                    </div>

                    <div className="col-span-2 text-right font-mono text-slate-500 text-[11px]">
                      {p.closed_at ? formatDate(p.closed_at) : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* EXPORT MODAL */}
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          title="Export Accounting Periods"
          description="Choose export format and settings."
          fileNamePrefix="accounting_periods"
          sheetName="Accounting Periods"
          subtitle="MERCON Logistics Accounting Periods"
          filteredData={periods}
          columns={ACCOUNTING_PERIODS_EXPORT_COLUMNS}
          formats={['xlsx', 'csv']}
        />

        {/* NEW PERIOD SHEET */}
        <Sheet open={isNewSheetOpen} onOpenChange={setIsNewSheetOpen}>
          <SheetContent className="w-full sm:max-w-md p-6 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>New Accounting Period</SheetTitle>
              <SheetDescription>
                Define a new period for journal entries and financial postings.
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 py-4">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Quick Presets
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const nextMIdx = (currentMonthIdx + 1) % 12;
                      const nextYear = nextMIdx === 0 ? currentYear + 1 : currentYear;
                      const mName = FULL_MONTH_NAMES[nextMIdx];
                      const startDate = `${nextYear}-${String(nextMIdx + 1).padStart(2, '0')}-01`;
                      const lastDay = new Date(nextYear, nextMIdx + 1, 0).getDate();
                      const endDate = `${nextYear}-${String(nextMIdx + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`;

                      setNewPeriodForm({
                        name: `${mName} ${nextYear}`,
                        start_date: startDate,
                        end_date: endDate,
                      });
                    }}
                    className="h-7 text-xs font-semibold rounded-lg"
                  >
                    Next Month
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const currQ = Math.floor(currentMonthIdx / 3) + 1;
                      const nextQ = currQ === 4 ? 1 : currQ + 1;
                      const qYear = nextQ === 1 ? currentYear + 1 : currentYear;
                      const startMonth = (nextQ - 1) * 3 + 1;
                      const endMonth = nextQ * 3;
                      const startDate = `${qYear}-${String(startMonth).padStart(2, '0')}-01`;
                      const lastDay = new Date(qYear, endMonth, 0).getDate();
                      const endDate = `${qYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`;

                      setNewPeriodForm({
                        name: `FY${qYear}-Q${nextQ}`,
                        start_date: startDate,
                        end_date: endDate,
                      });
                    }}
                    className="h-7 text-xs font-semibold rounded-lg"
                  >
                    Next Quarter
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Period Name *
                </label>
                <Input
                  placeholder="e.g. September 2026 or FY2026-Q4"
                  value={newPeriodForm.name}
                  onChange={(e) => setNewPeriodForm({ ...newPeriodForm, name: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Start Date *
                  </label>
                  <Input
                    type="date"
                    value={newPeriodForm.start_date.split('T')[0]}
                    onChange={(e) => setNewPeriodForm({ ...newPeriodForm, start_date: e.target.value })}
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    End Date *
                  </label>
                  <Input
                    type="date"
                    value={newPeriodForm.end_date.split('T')[0]}
                    onChange={(e) => {
                      const dateVal = e.target.value;
                      setNewPeriodForm({
                        ...newPeriodForm,
                        end_date: dateVal ? `${dateVal}T23:59:59.999Z` : '',
                      });
                    }}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              {newPeriodForm.start_date && newPeriodForm.end_date && (() => {
                const sTime = new Date(newPeriodForm.start_date).getTime();
                const eTime = new Date(newPeriodForm.end_date).getTime();
                const isOverlapping = periods.some((p) => {
                  const pStart = new Date(p.start_date).getTime();
                  const pEnd = new Date(p.end_date).getTime();
                  return sTime <= pEnd && eTime >= pStart;
                });

                if (isOverlapping) {
                  return (
                    <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-xs text-amber-800 dark:text-amber-200 p-2.5 rounded-xl flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Warning: Selected date range overlaps with an existing period.</span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            <SheetFooter className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button variant="outline" size="sm" onClick={() => setIsNewSheetOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (!newPeriodForm.name || !newPeriodForm.start_date || !newPeriodForm.end_date) {
                    toast.error('All fields are required');
                    return;
                  }
                  createMutation.mutate(newPeriodForm);
                }}
                disabled={createMutation.isPending}
                className="bg-[#FA634E] hover:bg-[#e0523d] text-white font-semibold"
              >
                Create Period
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {/* BULK GENERATE PERIODS SHEET */}
        <Sheet open={isGenerateSheetOpen} onOpenChange={setIsGenerateSheetOpen}>
          <SheetContent className="w-full sm:max-w-md p-6 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Generate Accounting Periods</SheetTitle>
              <SheetDescription>
                Bulk generate monthly or quarterly periods for a full fiscal year.
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Fiscal Year
                  </label>
                  <Input
                    type="number"
                    value={generateYear}
                    onChange={(e) => setGenerateYear(Number(e.target.value))}
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Frequency
                  </label>
                  <select
                    value={generateFreq}
                    onChange={(e) => setGenerateFreq(e.target.value as any)}
                    className="w-full h-9 text-xs px-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                  >
                    <option value="monthly">Monthly (12 periods)</option>
                    <option value="quarterly">Quarterly (4 periods)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Generation Preview
                </div>
                <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl p-2 space-y-1 bg-slate-50 dark:bg-slate-900/50 divide-y divide-slate-100 dark:divide-slate-800">
                  {Array.from({ length: generateFreq === 'monthly' ? 12 : 4 }).map((_, idx) => {
                    let pName = '';
                    if (generateFreq === 'monthly') {
                      pName = `${FULL_MONTH_NAMES[idx]} ${generateYear}`;
                    } else {
                      pName = `FY${generateYear}-Q${idx + 1}`;
                    }

                    const exists = periods.some((p) => p.name.toLowerCase() === pName.toLowerCase());

                    return (
                      <div key={idx} className="py-1 flex items-center justify-between text-xs px-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{pName}</span>
                        {exists ? (
                          <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded">
                            Exists (skip)
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
                            Will create
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {isGenerating && (
                <div className="space-y-1">
                  <div className="text-xs text-slate-500 font-medium">Generating periods... {generateProgress}%</div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#FA634E] transition-all" style={{ width: `${generateProgress}%` }} />
                  </div>
                </div>
              )}
            </div>

            <SheetFooter className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button variant="outline" size="sm" onClick={() => setIsGenerateSheetOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleBulkGenerate}
                disabled={isGenerating}
                className="bg-[#FA634E] hover:bg-[#e0523d] text-white font-semibold"
              >
                Generate Periods
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {/* GUIDED CLOSE FISCAL YEAR SHEET */}
        <Sheet open={isFySheetOpen} onOpenChange={setIsFySheetOpen}>
          <SheetContent className="w-full sm:max-w-lg p-6 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Close Fiscal Year {selectedYear}</SheetTitle>
              <SheetDescription>
                Guided process to finalize year-end revenue and expense closing.
              </SheetDescription>
            </SheetHeader>

            <div className="flex items-center justify-between py-4 border-b border-slate-100 dark:border-slate-800 my-2">
              {[1, 2, 3, 4].map((stepNum) => (
                <div key={stepNum} className="flex items-center gap-1.5">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      fyStep === stepNum
                        ? 'bg-[#FA634E] text-white'
                        : fyStep > stepNum
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}
                  >
                    {fyStep > stepNum ? <Check className="w-3.5 h-3.5" /> : stepNum}
                  </span>
                  <span className={`text-xs font-semibold ${fyStep === stepNum ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                    {stepNum === 1 ? 'Date' : stepNum === 2 ? 'Checks' : stepNum === 3 ? 'Preview' : 'Confirm'}
                  </span>
                </div>
              ))}
            </div>

            {fyStep === 1 && (
              <div className="space-y-4 py-4">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Select the fiscal year closing date. All Revenue and Expense accounts up to this date will be zeroed out.
                </p>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Closing Date *
                  </label>
                  <Input
                    type="date"
                    value={fyClosingDate}
                    onChange={(e) => setFyClosingDate(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            )}

            {fyStep === 2 && (
              <div className="space-y-4 py-4">
                <div className="space-y-3">
                  <div className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-start gap-2.5">
                    {fyPreChecks.openPeriodsBefore.length === 0 ? (
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <X className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div className="text-xs">
                      <div className="font-bold text-slate-900 dark:text-white">
                        All prior accounting periods closed/locked
                      </div>
                      {fyPreChecks.openPeriodsBefore.length > 0 ? (
                        <div className="text-rose-600 mt-0.5 font-medium">
                          The following periods are still Open:{' '}
                          {fyPreChecks.openPeriodsBefore.map((p) => p.name).join(', ')}
                        </div>
                      ) : (
                        <div className="text-slate-500 mt-0.5">All periods in range are closed or locked.</div>
                      )}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-start gap-2.5">
                    {fyPreChecks.retainedAccSet ? (
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <X className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div className="text-xs">
                      <div className="font-bold text-slate-900 dark:text-white">
                        Default Retained Earnings account configured
                      </div>
                      {!fyPreChecks.retainedAccSet ? (
                        <div className="text-rose-600 mt-0.5 font-medium">
                          Retained earnings account is missing in settings.{' '}
                          <Link to="/settings" className="underline font-bold">
                            Configure in Settings →
                          </Link>
                        </div>
                      ) : (
                        <div className="text-slate-500 mt-0.5">Retained Earnings GL account is valid.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {fyStep === 3 && (
              <div className="space-y-4 py-4">
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700 text-xs flex justify-between items-center">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Estimated FY Net Income</span>
                  <MoneyText
                    value={pnlRes?.data?.net_profit || 0}
                    currency="SAR"
                    tone={(pnlRes?.data?.net_profit || 0) >= 0 ? 'positive' : 'negative'}
                    className="font-bold text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Estimated Closing Journal Entry Preview
                  </div>
                  <div className="max-h-60 overflow-y-auto border border-slate-200/80 dark:border-slate-800 rounded-xl p-2">
                    <JournalLinesTable lines={fyClosingPreviewLines} />
                  </div>
                </div>
              </div>
            )}

            {fyStep === 4 && (
              <div className="space-y-4 py-4">
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-1">
                  <div className="font-bold">Irreversible Action</div>
                  <p>
                    Closing the fiscal year posts a permanent FiscalYearClosing journal entry and zeros out income accounts.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Type &quot;CLOSE FY{selectedYear}&quot; to confirm:
                  </label>
                  <Input
                    placeholder={`CLOSE FY${selectedYear}`}
                    value={fyTypedConfirm}
                    onChange={(e) => setFyTypedConfirm(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>
            )}

            <SheetFooter className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
              {fyStep > 1 ? (
                <Button variant="outline" size="sm" onClick={() => setFyStep((s) => (s - 1) as any)}>
                  Back
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setIsFySheetOpen(false)}>
                  Cancel
                </Button>
              )}

              {fyStep < 4 ? (
                <Button
                  size="sm"
                  onClick={() => setFyStep((s) => (s + 1) as any)}
                  disabled={fyStep === 2 && !fyPreChecks.canPass}
                  className="bg-[#FA634E] hover:bg-[#e0523d] text-white font-semibold"
                >
                  Next Step →
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => fyClosingMutation.mutate(fyClosingDate)}
                  disabled={fyTypedConfirm.trim() !== `CLOSE FY${selectedYear}` || fyClosingMutation.isPending}
                  className="bg-[#FA634E] hover:bg-[#e0523d] text-white font-semibold"
                >
                  {fyClosingMutation.isPending ? 'Closing FY...' : 'Confirm & Close FY'}
                </Button>
              )}
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {/* REOPEN PERIOD SHEET */}
        <Sheet open={isReopenSheetOpen} onOpenChange={setIsReopenSheetOpen}>
          <SheetContent className="w-full sm:max-w-md p-6 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Reopen {selectedPeriod?.name}</SheetTitle>
              <SheetDescription>
                Reopening a closed period allows new journal entries to be posted.
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 py-4">
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  Important Note
                </div>
                <p>
                  The AccountClosingBalance snapshot for this period will be discarded and automatically rebuilt when the period is closed again.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Reason for reopening * (10–500 characters)
                </label>
                <Textarea
                  placeholder="Explain why this period needs to be reopened..."
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  maxLength={500}
                  className="text-xs h-24"
                />
                <div className="text-[10px] text-slate-400 text-right mt-1 font-mono">
                  {reopenReason.length} / 500
                </div>
              </div>
            </div>

            <SheetFooter className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button variant="outline" size="sm" onClick={() => setIsReopenSheetOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => reopenMutation.mutate({ id: selectedPeriod.id, reason: reopenReason })}
                disabled={reopenReason.trim().length < 10 || reopenMutation.isPending}
                className="bg-[#FA634E] hover:bg-[#e0523d] text-white font-semibold"
              >
                Reopen Period
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {/* LOCK PERMANENTLY CONFIRM MODAL */}
        <ConfirmModal
          isOpen={isLockConfirmOpen}
          onClose={() => setIsLockConfirmOpen(false)}
          onConfirm={() => lockMutation.mutate(selectedPeriod.id)}
          title={`Lock ${selectedPeriod?.name} Permanently`}
          confirmLabel="Lock Period Permanently"
          variant="destructive"
          isLoading={lockMutation.isPending}
        >
          <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
            <p className="text-rose-600 font-bold bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200">
              Locking is permanent and CANNOT be undone. The period will become permanently read-only.
            </p>
            <p>
              Type period name <strong className="font-mono text-slate-900 dark:text-white">{selectedPeriod?.name}</strong> to confirm:
            </p>
            <Input
              placeholder={selectedPeriod?.name}
              value={lockTypedConfirm}
              onChange={(e) => setLockTypedConfirm(e.target.value)}
              className="h-9 text-xs font-mono"
            />
          </div>
        </ConfirmModal>

        {/* CLOSE WITH WARNINGS CONFIRM MODAL */}
        <ConfirmModal
          isOpen={isCloseWarningModalOpen}
          onClose={() => setIsCloseWarningModalOpen(false)}
          onConfirm={() => closeMutation.mutate(selectedPeriod?.id)}
          title={`Close ${selectedPeriod?.name} with Warnings`}
          confirmLabel="Close Anyway"
          isLoading={closeMutation.isPending}
        >
          <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
            <p className="text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200">
              Some non-blocking checks have warnings. Are you sure you want to close this period anyway?
            </p>
            <ul className="list-disc pl-4 space-y-1">
              {!checklist.check2_warning && <li>Draft invoices remain in this period</li>}
              {!checklist.check3_warning && <li>Draft bills remain in this period</li>}
              {!checklist.check4_warning && <li>Bank accounts are not reconciled through period end</li>}
              {!checklist.check6_warning && <li>Previous period is still open</li>}
            </ul>
          </div>
        </ConfirmModal>
      </div>
    </DashboardLayout>
  );
}
