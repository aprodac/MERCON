import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet,
  ArrowLeft,
  Edit2,
  Trash2,
  Download,
  Printer,
  RotateCw,
  CheckCircle2,
  Clock,
  User,
  Truck,
  CreditCard,
  Tag,
  FileText,
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  Calendar,
  Hash,
  XCircle,
  Building2,
  ClockIcon,
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { exportToCSV } from '@/utils/exportUtils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import DeletedBadge from '@/components/ui/DeletedBadge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { ExpenseFormSheet } from '@/components/expenses/ExpenseFormSheet';
import ExpenseCategoryBadge from '@/components/expenses/ExpenseCategoryBadge';
import { expenseService, Expense, ExpenseStatus } from '@/services/expenseService';
import { exportExcelTable } from '@/utils/exportUtils';
import { FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';

const EMPTY = '—';

const formatDate = (value: string | null | undefined, tz: string) => {
  if (!value) return EMPTY;
  const d = new Date(value);
  return isNaN(d.getTime()) ? EMPTY : formatInDeploymentTz(d, tz, 'dd MMM yyyy');
};

const formatCurrency = (amount: number, currency: string = 'SAR') => {
  return `${currency} ${(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/** Field row for detail cards */
function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-slate-100 dark:border-slate-800/70 last:border-0">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <span className={cn('text-xs font-semibold text-slate-900 dark:text-slate-100 text-right', mono && 'font-mono')}>
        {value}
      </span>
    </div>
  );
}

/** Stat tile inside hero section */
function HeroStat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 min-w-0">
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-current/10', tone)}>
        <Icon className="w-5 h-5" />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
        <div className="text-sm font-mono font-black text-slate-900 dark:text-slate-100 truncate leading-tight mt-0.5">
          {value}
        </div>
        {hint && <div className="text-[10px] text-slate-500 truncate leading-tight mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}

export default function ExpenseDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = useDeploymentTimezone();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const { data: record, isLoading, error, refetch } = useQuery({
    queryKey: ['expense-detail', id],
    queryFn: () => expenseService.getById(id!),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (status: ExpenseStatus) => expenseService.update(id!, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => expenseService.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      navigate('/expenses');
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout active="Expenses" title="Expense Details">
        <div className="px-4 sm:px-6 pb-6 max-w-[1400px] mx-auto w-full space-y-4 animate-pulse">
          <Skeleton className="h-44 rounded-2xl" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Skeleton className="lg:col-span-2 h-[440px] rounded-2xl" />
            <Skeleton className="h-[440px] rounded-2xl" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !record) {
    return (
      <DashboardLayout active="Expenses" title="Expense Details">
        <div className="px-4 sm:px-6 pb-6 max-w-[1400px] mx-auto w-full flex flex-col items-center justify-center text-center h-[60vh] gap-3">
          <AlertTriangle className="w-8 h-8 text-rose-500 shrink-0" />
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">Expense Record Not Found</h2>
          <p className="text-xs text-slate-500 max-w-md">
            This expense record does not exist or may have been deleted.
          </p>
          <Button
            onClick={() => navigate('/expenses')}
            size="sm"
            className="mt-2 text-xs font-bold bg-brand hover:bg-brand-hover text-white"
          >
            Back to Expenses Ledger
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const expRef = record.ref_id || `EXP-${record.id.slice(0, 8)}`;
  const isPaid = record.status === 'Paid';

  const handleQuickStatusToggle = (newStatus: ExpenseStatus) => {
    updateMutation.mutate(newStatus);
  };

  const handleExportSingle = () => {
    const headers = ['Ref', 'Category', 'Status', 'Date', 'Amount', 'Currency', 'Payee', 'Driver', 'Vehicle', 'Payment Method', 'Description', 'Created At'];
    const row = [
      expRef,
      record.category,
      record.status,
      record.expense_date ? formatInDeploymentTz(record.expense_date, tz, 'MM/dd/yyyy') : '',
      record.amount,
      record.currency,
      record.payee || '',
      record.driver ? `${record.driver.first_name} ${record.driver.last_name}` : '',
      record.vehicle?.plate_number || '',
      record.payment_method || '',
      record.description || '',
      record.createdAt ? formatInDeploymentTz(record.createdAt, tz, 'MM/dd/yyyy, hh:mm:ss a') : '',
    ];
    exportExcelTable(`Expense ${expRef}`, headers, [row], `expense_${expRef}.xlsx`);
  };

  return (
    <DashboardLayout active="Expenses" title={`Expense ${expRef}`}>
      <div className="px-4 sm:px-6 pb-6 space-y-4 animate-fade-in max-w-[1400px] mx-auto w-full">
        {/* ── HERO CARD: Header + Action Group + Key Stats ────────────────── */}
        <Card className="relative overflow-hidden border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.12)] py-0 gap-0 ring-0">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-500 via-amber-500 to-purple-500" />

          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 p-4 pt-5">
            <div className="flex items-start gap-3 min-w-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/expenses')}
                className="h-9 w-9 p-0 shrink-0 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-brand dark:text-orange-400 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:border-brand/40 shadow-2xs"
                title="Back to Expenses"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  <Hash className="w-3 h-3 text-orange-500" /> Financial Expense Voucher
                </div>
                <h1 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight truncate font-mono mt-0.5">
                  {expRef}
                </h1>
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  <ExpenseCategoryBadge category={record.category} size="md" />
                  {isPaid ? (
                    <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200/60 rounded-full px-3 py-0.5 font-bold text-[11px] flex items-center gap-1.5 shadow-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Paid
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-200/60 rounded-full px-3 py-0.5 font-bold text-[11px] flex items-center gap-1.5 shadow-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Pending
                    </Badge>
                  )}

                  {record.driver && (
                    <Link
                      to={`/drivers/${record.driver.id}`}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-0.5 hover:text-brand hover:border-orange-300 transition-colors"
                    >
                      <User className="w-3 h-3 text-purple-500" />
                      {record.driver.first_name} {record.driver.last_name}
                      <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                    </Link>
                  )}
                  {record.driver?.deletedAt && <DeletedBadge />}

                  {record.vehicle && (
                    <Link
                      to={`/vehicles/${record.vehicle.id}`}
                      className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-0.5 hover:text-brand hover:border-orange-300 transition-colors"
                    >
                      <Truck className="w-3.5 h-3.5 text-blue-500" />
                      {record.vehicle.plate_number}
                      <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                    </Link>
                  )}
                  {record.vehicle?.deletedAt && <DeletedBadge />}
                </div>
              </div>
            </div>

            {/* Action Group */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditModalOpen(true)}
                  className="h-9 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-brand hover:bg-orange-50 dark:hover:bg-orange-950/30 gap-1.5"
                  title="Edit Expense"
                >
                  <Edit2 className="w-3.5 h-3.5 text-amber-500" /> Edit
                </Button>
                <span className="w-px h-5 bg-slate-200 dark:bg-slate-800" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.print()}
                  className="h-9 w-9 p-0 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Print Voucher"
                >
                  <Printer className="w-4 h-4" />
                </Button>
                <span className="w-px h-5 bg-slate-200 dark:bg-slate-800" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleExportSingle}
                  className="h-9 w-9 p-0 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Export Excel"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                </Button>
                <span className="w-px h-5 bg-slate-200 dark:bg-slate-800" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 gap-1.5"
                    >
                      Status <ChevronDown className="w-3.5 h-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44 text-xs font-semibold">
                    <DropdownMenuLabel className="text-[10px] text-slate-400 uppercase">Change Status</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleQuickStatusToggle('Paid')}
                      className="cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-500" /> Mark as Paid
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleQuickStatusToggle('Pending')}
                      className="cursor-pointer"
                    >
                      <Clock className="w-3.5 h-3.5 mr-2 text-amber-500" /> Mark as Pending
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <span className="w-px h-5 bg-slate-200 dark:bg-slate-800" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="h-9 w-9 p-0 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                  title="Delete Expense"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Integrated Stat Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-slate-100 dark:border-slate-800 divide-x divide-y lg:divide-y-0 divide-slate-100 dark:divide-slate-800 bg-slate-50/40 dark:bg-slate-800/20">
            <HeroStat
              icon={CreditCard}
              label="TOTAL AMOUNT"
              value={formatCurrency(record.amount, record.currency)}
              hint={`Category: ${record.category}`}
              tone="bg-rose-500/10 text-rose-600 dark:text-rose-400"
            />
            <HeroStat
              icon={Calendar}
              label="EXPENSE DATE"
              value={formatDate(record.expense_date, tz)}
              hint={`Recorded ${formatDate(record.createdAt, tz)}`}
              tone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
            />
            <HeroStat
              icon={User}
              label="PAYEE / RECIPIENT"
              value={record.payee || EMPTY}
              hint={record.driver ? `Driver: ${record.driver.first_name} ${record.driver.last_name}` : 'General Payee'}
              tone="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
            />
            <HeroStat
              icon={isPaid ? CheckCircle2 : ClockIcon}
              label="PAYMENT STATUS"
              value={record.status}
              hint={record.payment_method ? `Method: ${record.payment_method}` : 'Method unassigned'}
              tone={isPaid ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}
            />
          </div>
        </Card>

        {/* ── BODY GRID ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {/* Left Column (2 Cols wide) - Main Financial & Notes Cards */}
          <div className="lg:col-span-2 space-y-4">
            {/* Financial Overview Card */}
            <Card className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs p-0 gap-0 ring-0 overflow-hidden">
              <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                <div className="flex items-center gap-2 text-brand font-extrabold text-[11px] uppercase tracking-wider">
                  <CreditCard className="w-4 h-4 text-orange-500" />
                  Financial & Payment Breakdown
                </div>
              </div>

              <div className="px-5 sm:px-6 py-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                  <Field
                    label="Voucher Reference"
                    value={<span className="font-mono font-bold text-brand">{expRef}</span>}
                  />
                  <Field label="Category" value={<ExpenseCategoryBadge category={record.category} size="sm" />} />
                  <Field
                    label="Expense Amount"
                    value={
                      <span className="font-mono font-black text-rose-600 dark:text-rose-400 text-sm">
                        {formatCurrency(record.amount, record.currency)}
                      </span>
                    }
                  />
                  <Field label="Currency" value={record.currency || 'SAR'} mono />
                  <Field label="Expense Date" value={formatDate(record.expense_date, tz)} mono />
                  <Field label="Payment Method" value={record.payment_method || EMPTY} />
                  <Field
                    label="Payment Status"
                    value={
                      isPaid ? (
                        <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border-none rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Paid
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border-none rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                          <Clock className="w-3 h-3 mr-1" /> Pending
                        </Badge>
                      )
                    }
                  />
                  <Field label="Date Added" value={formatDate(record.createdAt, tz)} mono />
                </div>
              </div>
            </Card>

            {/* Scope / Notes Card */}
            <Card className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs p-0 gap-0 ring-0 overflow-hidden">
              <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-extrabold text-[11px] uppercase tracking-wider">
                  <FileText className="w-4 h-4 text-orange-500" />
                  Description & Context Notes
                </div>
              </div>

              <div className="px-5 sm:px-6 py-5">
                {record.description ? (
                  <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed border-l-2 border-brand/50 pl-4 py-1">
                    {record.description}
                  </p>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-400 py-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                    <FileText className="w-4 h-4 text-slate-300" />
                    No description or context notes recorded for this expense.
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Right Column (1 Col wide) - Linked Assets & Audit Trail */}
          <div className="space-y-4">
            {/* Linked Payee & Asset Card */}
            <Card className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs p-0 gap-0 ring-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <User className="w-4 h-4 text-brand" /> Payee & Asset Linkage
                </h3>
              </div>

              <CardContent className="p-5 divide-y divide-slate-100 dark:divide-slate-800 space-y-4">
                {/* Payee Info */}
                <div className="pb-3">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                    Payee / Vendor
                  </div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                    {record.payee || EMPTY}
                  </div>
                </div>

                {/* Linked Driver */}
                <div className="pt-3 pb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-purple-500" /> Linked Driver
                    </span>
                    {record.driver && (
                      <Link
                        to={`/drivers/${record.driver.id}`}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5"
                      >
                        View <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>

                  {record.driver ? (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 p-3">
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        {record.driver.first_name} {record.driver.last_name}
                        {record.driver.deletedAt && <DeletedBadge />}
                      </div>
                      {record.driver.ref_id && (
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                          ID: {record.driver.ref_id}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 italic">No driver linked.</div>
                  )}
                </div>

                {/* Linked Vehicle */}
                <div className="pt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-blue-500" /> Linked Vehicle
                    </span>
                    {record.vehicle && (
                      <Link
                        to={`/vehicles/${record.vehicle.id}`}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5"
                      >
                        View <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>

                  {record.vehicle ? (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 p-3">
                      <div className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        {record.vehicle.plate_number}
                        {record.vehicle.deletedAt && <DeletedBadge />}
                      </div>
                      {record.vehicle.ref_id && (
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                          Ref: {record.vehicle.ref_id}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 italic">No vehicle linked.</div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Audit & System Info Card */}
            <Card className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs p-0 gap-0 ring-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-orange-500" /> Audit Ledger
                </h3>
              </div>

              <div className="p-5">
                <Field label="Expense Record ID" value={record.id} mono />
                <Field label="Reference No." value={expRef} mono />
                <Field label="Created At" value={formatDate(record.createdAt, tz)} mono />
                <Field label="Last Modified" value={formatDate(record.updatedAt, tz)} mono />
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* ── Edit Expense Modal ────────────────────────────────────────────── */}
      <ExpenseFormSheet
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        expense={record ?? null}
        onSaved={() => refetch()}
      />

      {/* ── Delete Confirmation Dialog ─────────────────────────────────────── */}
      <Dialog open={isDeleteModalOpen} onOpenChange={(open) => !open && setIsDeleteModalOpen(false)}>
        <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden border-slate-200 dark:border-slate-800">
          <DialogHeader className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-rose-50/50 dark:bg-rose-950/20">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <DialogTitle className="text-base font-extrabold">Delete Expense Record</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              Are you sure you want to delete expense <strong className="font-mono text-slate-900 dark:text-slate-100">{expRef}</strong> ({record.category}) of{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {record.currency} {(record.amount || 0).toLocaleString()}
              </strong>
              ?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsDeleteModalOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-4"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Confirm Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
