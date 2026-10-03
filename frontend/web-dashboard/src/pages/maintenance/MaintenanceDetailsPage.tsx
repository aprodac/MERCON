import { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, Edit2, Wrench, Truck, Clock, CheckCircle2,
  AlertTriangle, FileText, Phone, Building2, Gauge,
  Trash2, ExternalLink, AlertCircle, RotateCw, CalendarClock,
  ChevronDown, Download, Receipt, Banknote, XCircle,
  Upload, Paperclip, Printer, Hash, ClipboardList, MoreVertical,
} from 'lucide-react';

import WorkshopField from '@/components/fleet/WorkshopField';
import WorkDoneSelect from '@/components/maintenance/WorkDoneSelect';
import MaintenanceRecordModal from '@/components/maintenance/MaintenanceRecordModal';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import {
  maintenanceService,
  MAINTENANCE_ENTITY_TYPE,
  CreateMaintenancePayload,
  MaintenanceType,
  MaintenanceStatus,
} from '@/services/maintenanceService';
import { documentService, MerconDocument } from '@/services/documentService';
import { exportToCSV } from '@/utils/exportUtils';
import { cn } from '@/lib/utils';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';

import AddMaintenanceCostModal from '@/components/maintenance/AddMaintenanceCostModal';

const STATUS_META: Record<string, { label: string; className: string }> = {
  Scheduled: { label: 'Scheduled', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  In_Progress: { label: 'In Progress', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  'In Progress': { label: 'In Progress', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  Completed: { label: 'Completed', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  Cancelled: { label: 'Cancelled', className: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
};

const TYPE_META: Record<string, { label: string; className: string }> = {
  Routine: { label: 'Routine', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20' },
  Repair: { label: 'Repair', className: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
  Inspection: { label: 'Inspection', className: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' },
  Renewal: { label: 'Renewal / Istimara', className: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' },
  Emergency: { label: 'Emergency', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
};

const LIFECYCLE: MaintenanceStatus[] = ['Scheduled', 'In_Progress', 'Completed'];

const EMPTY = '—';

const formatDate = (value: string | null | undefined, tz: string) => {
  if (!value) return EMPTY;
  const d = new Date(value);
  return isNaN(d.getTime()) ? EMPTY : formatInDeploymentTz(d, tz, 'dd MMM yyyy');
};

const formatSAR = (value?: number | null) =>
  `SAR ${(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Small labelled row used across the detail cards. */
function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-800/70 last:border-0">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className={cn('text-xs font-semibold text-slate-900 dark:text-slate-100 text-right', mono && 'font-mono')}>
        {value}
      </span>
    </div>
  );
}

/** One integrated stat tile living inside the hero card — no separate KPI row, no extra scroll. */
function HeroStat({
  icon: Icon, label, value, hint, tone,
}: {
  icon: React.ElementType; label: string; value: React.ReactNode; hint?: React.ReactNode; tone: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 min-w-0">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-current/10', tone)}>
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
        <div className="text-sm font-mono font-black text-slate-900 dark:text-slate-100 truncate leading-tight mt-0.5">
          {value}
        </div>
        {hint && <div className="text-[10px] text-slate-500 truncate leading-tight">{hint}</div>}
      </div>
    </div>
  );
}

export default function MaintenanceDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = useDeploymentTimezone();

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isCostModalOpen, setIsCostModalOpen] = useState(false);

  const { data: record, isLoading, error } = useQuery({
    queryKey: ['maintenance-detail', id],
    queryFn: () => maintenanceService.getById(id!),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: any) => maintenanceService.update(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      // Closing/reopening an order moves the vehicle in or out of the workshop.
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['workshops'] });
      if (record?.vehicleId) {
        queryClient.invalidateQueries({ queryKey: ['vehicle', record.vehicleId] });
        queryClient.invalidateQueries({ queryKey: ['vehicle-financials', record.vehicleId] });
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to update record.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => maintenanceService.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      if (record?.vehicleId) {
        queryClient.invalidateQueries({ queryKey: ['vehicle', record.vehicleId] });
      }
      navigate('/maintenance');
    },
  });

  const handleOpenEditModal = () => {
    navigate(`/maintenance/${id}/edit`);
  };

  const handleQuickStatusChange = (newStatus: MaintenanceStatus) => {
    updateMutation.mutate({ status: newStatus });
  };

  if (isLoading) {
    return (
      <DashboardLayout active="Vehicles" title="Maintenance Details">
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
      <DashboardLayout active="Vehicles" title="Maintenance Details">
        <div className="px-4 sm:px-6 pb-6 max-w-[1400px] mx-auto w-full flex flex-col items-center justify-center text-center h-[60vh] gap-3">
          <AlertTriangle className="w-8 h-8 text-rose-500 shrink-0" />
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">Record not found</h2>
          <p className="text-xs text-slate-500 max-w-md">
            This maintenance record does not exist or has been deleted.
          </p>
          <Button onClick={() => navigate('/maintenance')} size="sm" className="mt-2 text-xs font-bold bg-brand hover:bg-[#d03c0b] text-white">
            Back to maintenance
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const vehicle = record.vehicle;
  const statusMeta = STATUS_META[record.status] ?? { label: record.status, className: '' };
  const typeMeta = TYPE_META[record.maintenance_type] ?? { label: record.maintenance_type, className: '' };

  const orderNo = record.ref_id || `MNT-${record.id.slice(0, 8)}`;
  const isCancelled = record.status === 'Cancelled';
  const normalizedStatus = (record.status as string) === 'In Progress' ? 'In_Progress' : record.status;
  const currentStep = LIFECYCLE.indexOf(normalizedStatus as MaintenanceStatus);
  // Fill the rail up to the active milestone; a completed order fills it entirely.
  const progressPct = isCancelled ? 0 : (Math.max(0, currentStep) / (LIFECYCLE.length - 1)) * 100;

  const durationDays =
    record.start_date && record.end_date
      ? Math.max(
          0,
          Math.round(
            (new Date(record.end_date).getTime() - new Date(record.start_date).getTime()) / 86_400_000,
          ),
        )
      : null;

  const odoSinceService =
    vehicle && record.odometer_reading
      ? Math.max(0, (vehicle.current_odometer || 0) - record.odometer_reading)
      : null;

  return (
    <DashboardLayout active="Vehicles" title={`Service Order ${orderNo}`}>
      <div className="px-4 sm:px-6 pb-6 space-y-4 animate-fade-in max-w-[1400px] mx-auto w-full">

        {/* ── HERO: Header, Actions, Sleek Timeline & Integrated Metrics ─── */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3.5 min-w-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/maintenance')}
                className="h-9 w-9 p-0 shrink-0 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs"
                title="Back to maintenance list"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>

              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-mono">
                    {orderNo}
                  </h1>
                  <Badge className={cn('font-bold text-[10px] uppercase tracking-wide px-2.5 py-0.5 rounded-full', typeMeta.className)}>
                    {typeMeta.label}
                  </Badge>
                  <Badge className={cn('font-bold text-[10px] uppercase tracking-wide px-2.5 py-0.5 rounded-full', statusMeta.className)}>
                    {statusMeta.label}
                  </Badge>
                </div>

                {vehicle && (
                  <button
                    type="button"
                    onClick={() => navigate(`/vehicles/${vehicle.id}`)}
                    className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-slate-600 dark:text-slate-300 hover:text-[#FA634E] transition-colors"
                  >
                    <Truck className="w-3.5 h-3.5 text-slate-400" />
                    <span>Plate: {vehicle.plate_number}</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </button>
                )}
              </div>
            </div>

            {/* Top Right Action Group */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenEditModal}
                className="h-9 px-3 rounded-xl border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 text-xs font-bold gap-1.5 shadow-2xs"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="h-9 px-3 rounded-xl border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 text-xs font-bold gap-1.5 shadow-2xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => exportToCSV([record], `maintenance_${orderNo}.csv`)}
                className="h-9 px-3 rounded-xl border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 text-xs font-bold gap-1.5 shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-3 rounded-xl border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 text-xs font-extrabold gap-1 shadow-2xs"
                  >
                    <span>Status</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 text-xs font-semibold rounded-xl">
                  <DropdownMenuLabel className="text-[10px] text-slate-400 uppercase">Set status</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleQuickStatusChange('Scheduled')}>
                    <Clock className="w-3.5 h-3.5 mr-2 text-blue-500" /> Scheduled
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleQuickStatusChange('In_Progress')}>
                    <RotateCw className="w-3.5 h-3.5 mr-2 text-amber-500" /> In Progress
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleQuickStatusChange('Completed')}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-500" /> Completed
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleQuickStatusChange('Cancelled')}>
                    <XCircle className="w-3.5 h-3.5 mr-2 text-rose-500" /> Cancelled
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Clean Lifecycle Step Bar */}
          <div className="px-5 py-3.5 bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800">
            {isCancelled ? (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-bold">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>Service order cancelled</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative h-2 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-[#FA634E] rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-xs">
                  {LIFECYCLE.map((step, index) => (
                    <div
                      key={step}
                      className={cn(
                        'flex items-center gap-1.5 font-bold',
                        index <= currentStep ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'
                      )}
                    >
                      <span className={cn('w-2 h-2 rounded-full', index <= currentStep ? 'bg-[#FA634E]' : 'bg-slate-300')} />
                      <span>{STATUS_META[step].label}</span>
                      {step === 'Scheduled' && record.start_date && (
                        <span className="text-[10px] font-mono text-slate-400 font-normal">({formatDate(record.start_date, tz)})</span>
                      )}
                      {step === 'Completed' && record.end_date && (
                        <span className="text-[10px] font-mono text-slate-400 font-normal">({formatDate(record.end_date, tz)})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Integrated 4 Stat Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 text-xs">
            <HeroStat
              icon={Banknote}
              label="Cost"
              value={formatSAR(record.cost)}
              hint={`Invoice ${record.invoice_number || EMPTY}`}
              tone="bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400"
            />
            <HeroStat
              icon={Gauge}
              label="Odometer at service"
              value={record.odometer_reading ? `${record.odometer_reading.toLocaleString()} km` : EMPTY}
              hint={odoSinceService !== null ? `+${odoSinceService.toLocaleString()} km driven since` : 'Vehicle odometer unavailable'}
              tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400"
            />
            <HeroStat
              icon={Clock}
              label="Downtime"
              value={durationDays !== null ? `${durationDays} ${durationDays === 1 ? 'day' : 'days'}` : EMPTY}
              hint={record.end_date ? `Closed ${formatDate(record.end_date, tz)}` : 'Not closed yet'}
              tone="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
            />
            <HeroStat
              icon={CalendarClock}
              label="Next service due"
              value={formatDate(record.next_service_due, tz)}
              hint={record.next_service_due ? 'Scheduled follow-up' : 'No follow-up recorded'}
              tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
            />
          </div>
        </div>

        {/* ── Body: 2 Column Layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

          {/* Left Column (2/3): Workshop Work Report */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs p-0 gap-0 overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-[#FA634E]" />
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                    Workshop Work Report
                  </h3>
                </div>
                <span className="text-xs font-bold text-slate-500">
                  {record.workshop_name || 'Unnamed Workshop'}
                </span>
              </div>

              <div className="px-5 sm:px-6 py-5 space-y-5">
                <section>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Scope of Work Performed
                  </h4>
                  {record.work_done ? (
                    <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed border-l-2 border-[#FA634E] pl-3.5">
                      {record.work_done}
                    </p>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-slate-500 py-4 justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                      <AlertCircle className="w-4 h-4 text-slate-400" />
                      <span>No work details recorded for this service order.</span>
                    </div>
                  )}
                </section>

                {record.remarks && (
                  <section>
                    <h3 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400 mb-2">
                      Technician remarks
                    </h3>
                    <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed rounded-xl bg-slate-50 dark:bg-slate-800/40 p-3.5 border border-slate-100 dark:border-slate-800">
                      {record.remarks}
                    </p>
                  </section>
                )}

                <Separator />

                <section>
                  <h3 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400 mb-1">
                    Service record
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                    <Field label="Start date" value={formatDate(record.start_date, tz)} mono />
                    <Field label="Completion date" value={formatDate(record.end_date, tz)} mono />
                    <Field label="Service date" value={formatDate(record.service_date, tz)} mono />
                    <Field label="Next service due" value={formatDate(record.next_service_due, tz)} mono />
                    <Field
                      label="Odometer at service"
                      value={record.odometer_reading ? `${record.odometer_reading.toLocaleString()} km` : EMPTY}
                      mono
                    />
                    <Field label="Last updated" value={formatDate(record.updatedAt, tz)} mono />
                  </div>
                </section>
              </div>
            </Card>

            {/* Card 2: Billing & Invoice */}
            <Card className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-16px_rgba(16,24,40,0.14)] p-0 gap-0 ring-0 overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                <div className="flex items-center gap-2.5">
                  <Receipt className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400 block">
                      Billing &amp; Invoice
                    </span>
                    <span className="text-base font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                      {formatSAR(record.cost)}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setIsCostModalOpen(true)}
                  className="h-8.5 text-xs font-bold bg-[#FA634E] hover:bg-[#e0523d] text-white rounded-xl gap-1.5 shadow-xs border-none"
                >
                  <Banknote className="w-3.5 h-3.5" />
                  Enter / Update Cost
                </Button>
              </div>

              <div className="px-5 sm:px-6 py-5">
                <h3 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400 mb-2">
                  Billing details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                  <Field label="Total billed" value={formatSAR(record.cost)} mono />
                  <Field label="Invoice number" value={record.invoice_number || EMPTY} mono />
                  <Field
                    label="Payment Status"
                    value={
                      record.cost > 0 || record.status === 'Completed' ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] font-bold">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Paid
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] font-bold">
                          Unpaid
                        </Badge>
                      )
                    }
                  />
                  <Field label="Workshop" value={record.workshop_name || EMPTY} />
                  <Field label="Maintenance type" value={typeMeta.label} />
                  <Field label="Status" value={statusMeta.label} />
                  <Field label="Recorded on" value={formatDate(record.createdAt, tz)} mono />
                </div>
              </div>
            </Card>
          </div>

          {/* Service provider: vehicle + workshop, joined into one card */}
          <Card className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-16px_rgba(16,24,40,0.14)] p-0 gap-0 ring-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-brand" /> Vehicle Details
              </h3>
            </div>

            <CardContent className="p-4 divide-y divide-slate-100 dark:divide-slate-800">
              {/* Vehicle */}
              <div className="pb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-brand" /> Vehicle
                  </span>
                  {vehicle && (
                    <button
                      type="button"
                      onClick={() => navigate(`/vehicles/${vehicle.id}`)}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5"
                    >
                      View <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {vehicle ? (
                  <>
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 px-3.5 py-3 mb-1">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Plate number</div>
                      <div className="text-lg font-mono font-black text-slate-900 dark:text-slate-100 tracking-wider">
                        {vehicle.plate_number}
                      </div>
                    </div>
                    <Field label="Reference ID" value={vehicle.ref_id || EMPTY} mono />
                    <Field label="Asset type" value={vehicle.asset_type} />
                    <Field label="Vehicle status" value={vehicle.status} />
                    <Field
                      label="Current odometer"
                      value={`${(vehicle.current_odometer || 0).toLocaleString()} km`}
                      mono
                    />
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-slate-500 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 px-3 py-3">
                    <Truck className="w-4 h-4 text-slate-300 shrink-0" /> No vehicle is linked to this record.
                  </div>
                )}
              </div>

              {/* Workshop */}
              <div className="pt-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-1.5">
                  <Building2 className="w-3.5 h-3.5 text-indigo-500" /> Workshop
                </span>

                <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100 mb-2">
                  {record.workshop_name || EMPTY}
                </div>

                {record.workshop_contact ? (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Contact</div>
                      <div className="text-xs font-mono font-extrabold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                        {record.workshop_contact}
                      </div>
                    </div>
                    <a
                      href={`tel:${record.workshop_contact}`}
                      className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 dark:text-indigo-300 shrink-0"
                      title="Call workshop"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No contact number on file.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Delete record modal ──────────────────────────────────────────── */}
      <Dialog open={isDeleteModalOpen} onOpenChange={(open) => !open && setIsDeleteModalOpen(false)}>
        <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <DialogTitle className="text-base font-extrabold">Delete service order</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              This deletes service order <strong className="font-mono text-slate-900 dark:text-slate-100">{orderNo}</strong>
              {vehicle ? <> for vehicle <strong className="text-slate-900 dark:text-slate-100">{vehicle.plate_number}</strong></> : null}.
              The order number is released and will be reused by the next service order.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsDeleteModalOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-4"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add / Update Cost modal ─────────────────────────────────────────── */}
      <AddMaintenanceCostModal
        open={isCostModalOpen}
        onOpenChange={setIsCostModalOpen}
        record={record}
      />

    </DashboardLayout>
  );
}
