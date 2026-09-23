import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { financeService } from '@/services/financeService';
import { usePermissions } from '@/hooks/usePermissions';
import type { BankAccount, BankReconciliation } from '@mercon/shared-types';
import { api } from '@/lib/api';

import {
  PeriodRow,
  PeriodChecklist,
  FULL_MONTH_NAMES,
  PeriodControlBar,
  MonthlyPeriodRibbon,
  PeriodChecklistCard,
  PeriodDetailsCard,
  HistoricalPeriodsTable,
  NewPeriodSheet,
  BulkGeneratePeriodsSheet,
  GuidedFiscalYearCloseSheet,
  ReopenPeriodSheet,
  TypedLockPeriodModal,
  CloseWarningModal,
} from '@/components/finance/periods';

export default function AccountingPeriodsPage() {
  const queryClient = useQueryClient();
  const { userRole, isSuperAdmin } = usePermissions();
  const isAdmin = isSuperAdmin || userRole === 'Admin';

  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth();

  // Selected State
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);

  // Modals & Sheets State
  const [isNewSheetOpen, setIsNewSheetOpen] = useState(false);
  const [isGenerateSheetOpen, setIsGenerateSheetOpen] = useState(false);
  const [isFySheetOpen, setIsFySheetOpen] = useState(false);
  const [isReopenSheetOpen, setIsReopenSheetOpen] = useState(false);
  const [isLockConfirmOpen, setIsLockConfirmOpen] = useState(false);
  const [isCloseWarningModalOpen, setIsCloseWarningModalOpen] = useState(false);

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

    const endDate = new Date(lastClosedOrLockedPeriod.end_date);
    return endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
  const checklist: PeriodChecklist = useMemo(() => {
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
    if (!selectedPeriod) return;
    if (checklist.hasWarnings) {
      setIsCloseWarningModalOpen(true);
    } else {
      closeMutation.mutate(selectedPeriod.id);
    }
  };

  // FY Pre-checks evaluation
  const fyPreChecks = useMemo(() => {
    const fyEnd = new Date(fyClosingDate);
    const openPeriodsBefore = periods.filter(
      (p) => new Date(p.end_date) <= fyEnd && p.status === 'Open'
    );

    const defaultRetainedAccId = settingsRes?.defaultRetainedEarningsAccountId;
    const retainedAccSet = Boolean(defaultRetainedAccId);

    const canPass = openPeriodsBefore.length === 0 && retainedAccSet;
    return { openPeriodsBefore, retainedAccSet, canPass };
  }, [periods, fyClosingDate, settingsRes]);

  // FY Closing Journal Entry Lines Preview
  const fyClosingPreviewLines = useMemo(() => {
    const pnlData = pnlRes?.data;
    if (!pnlData) return [];

    const lines: any[] = [];
    const revs = pnlData.revenues || [];
    const exps = pnlData.expenses || [];

    revs.forEach((r: any) => {
      if (r.amount > 0) {
        lines.push({
          account: { account_code: r.account_code, name: r.name },
          debit: r.amount,
          credit: 0,
        });
      }
    });

    exps.forEach((e: any) => {
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
    toast.success(`Generated ${createdCount} accounting period(s) for ${generateYear}`);
    queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
    setIsGenerateSheetOpen(false);
  };

  return (
    <DashboardLayout active="finance" title="Period Close">
      <div className="p-6 space-y-5 max-w-7xl mx-auto">
        {/* Top Control Bar: Fiscal-Year Switcher + Lock Line + Action Buttons */}
        <PeriodControlBar
          selectedYear={selectedYear}
          availableYears={availableYears}
          booksLockedThroughLabel={booksLockedThroughLabel}
          isAdmin={isAdmin}
          onSelectYear={setSelectedYear}
          onOpenGenerateSheet={() => setIsGenerateSheetOpen(true)}
          onOpenFySheet={() => {
            setFyClosingDate(`${selectedYear}-12-31`);
            setFyStep(1);
            setIsFySheetOpen(true);
          }}
          onOpenNewSheet={() => {
            setNewPeriodForm({ name: '', start_date: '', end_date: '' });
            setIsNewSheetOpen(true);
          }}
        />

        {/* Year Ribbon Tiles */}
        <MonthlyPeriodRibbon
          selectedYear={selectedYear}
          periods={periods}
          selectedPeriodId={selectedPeriodId}
          isAdmin={isAdmin}
          currentYear={currentYear}
          currentMonthIdx={currentMonthIdx}
          onSelectPeriod={setSelectedPeriodId}
          onOpenNewPeriodForMonth={handleOpenNewPeriodForMonth}
        />

        {/* Main Workspace Grid */}
        {selectedPeriod && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Close Checklist Card (8 cols) */}
            <PeriodChecklistCard
              selectedPeriod={selectedPeriod}
              checklist={checklist}
              reopenedAuditLog={reopenedAuditLog}
              isAdmin={isAdmin}
              selectedStartDateStr={selectedStartDateStr}
              selectedEndDateStr={selectedEndDateStr}
              isClosePending={closeMutation.isPending}
              onClosePeriodClick={handleClosePeriodClick}
              onOpenReopenSheet={() => {
                setReopenReason('');
                setIsReopenSheetOpen(true);
              }}
              onOpenLockModal={() => {
                setLockTypedConfirm('');
                setIsLockConfirmOpen(true);
              }}
            />

            {/* Period Details Card (4 cols) */}
            <PeriodDetailsCard
              selectedPeriod={selectedPeriod}
              periodJeBreakdown={periodJeBreakdown}
              periodFinSummary={periodFinSummary}
              activityLogs={activityLogs}
              isActivityLoading={isActivityLoading}
            />
          </div>
        )}

        {/* All Periods Collapsible Ledger Table */}
        <HistoricalPeriodsTable
          periods={periods}
          selectedPeriodId={selectedPeriodId}
          onSelectPeriod={(id, year) => {
            setSelectedPeriodId(id);
            setSelectedYear(year);
          }}
        />

        {/* NEW PERIOD SHEET */}
        <NewPeriodSheet
          isOpen={isNewSheetOpen}
          onOpenChange={setIsNewSheetOpen}
          periods={periods}
          currentYear={currentYear}
          currentMonthIdx={currentMonthIdx}
          newPeriodForm={newPeriodForm}
          setNewPeriodForm={setNewPeriodForm}
          onSubmit={(form) => createMutation.mutate(form)}
          isPending={createMutation.isPending}
        />

        {/* BULK GENERATE PERIODS SHEET */}
        <BulkGeneratePeriodsSheet
          isOpen={isGenerateSheetOpen}
          onOpenChange={setIsGenerateSheetOpen}
          periods={periods}
          generateYear={generateYear}
          setGenerateYear={setGenerateYear}
          generateFreq={generateFreq}
          setGenerateFreq={setGenerateFreq}
          isGenerating={isGenerating}
          generateProgress={generateProgress}
          onBulkGenerate={handleBulkGenerate}
        />

        {/* GUIDED CLOSE FISCAL YEAR SHEET */}
        <GuidedFiscalYearCloseSheet
          isOpen={isFySheetOpen}
          onOpenChange={setIsFySheetOpen}
          selectedYear={selectedYear}
          fyStep={fyStep}
          setFyStep={setFyStep}
          fyClosingDate={fyClosingDate}
          setFyClosingDate={setFyClosingDate}
          fyPreChecks={fyPreChecks}
          pnlRes={pnlRes}
          fyClosingPreviewLines={fyClosingPreviewLines}
          fyTypedConfirm={fyTypedConfirm}
          setFyTypedConfirm={setFyTypedConfirm}
          onSubmitFyClose={(dateStr) => fyClosingMutation.mutate(dateStr)}
          isPending={fyClosingMutation.isPending}
        />

        {/* REOPEN PERIOD SHEET */}
        <ReopenPeriodSheet
          isOpen={isReopenSheetOpen}
          onOpenChange={setIsReopenSheetOpen}
          selectedPeriod={selectedPeriod}
          reopenReason={reopenReason}
          setReopenReason={setReopenReason}
          onConfirmReopen={(params) => reopenMutation.mutate(params)}
          isPending={reopenMutation.isPending}
        />

        {/* LOCK PERMANENTLY CONFIRM MODAL */}
        <TypedLockPeriodModal
          isOpen={isLockConfirmOpen}
          onClose={() => setIsLockConfirmOpen(false)}
          selectedPeriod={selectedPeriod}
          lockTypedConfirm={lockTypedConfirm}
          setLockTypedConfirm={setLockTypedConfirm}
          onConfirmLock={(id) => lockMutation.mutate(id)}
          isPending={lockMutation.isPending}
        />

        {/* CLOSE WITH WARNINGS CONFIRM MODAL */}
        <CloseWarningModal
          isOpen={isCloseWarningModalOpen}
          onClose={() => setIsCloseWarningModalOpen(false)}
          selectedPeriod={selectedPeriod}
          checklist={checklist}
          onConfirmClose={() => selectedPeriod && closeMutation.mutate(selectedPeriod.id)}
          isPending={closeMutation.isPending}
        />
      </div>
    </DashboardLayout>
  );
}
