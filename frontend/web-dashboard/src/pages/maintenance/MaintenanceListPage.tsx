import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Wrench, Download, Plus, RotateCw, Filter, Search, Eye,
  Calendar, CheckCircle2, Clock, AlertTriangle, FileText, FileSpreadsheet,
  DollarSign, Truck, Edit2, Trash2, ExternalLink, ShieldAlert,
  Building2, Gauge, Layers, ChevronDown, Tag, MoreVertical,
  ChevronsUpDown, ArrowDown, ArrowUp, LayoutGrid, List, Phone, Database,
  Banknote, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X,
} from 'lucide-react';

import WorkshopField from '@/components/fleet/WorkshopField';
import MaintenanceRecordModal from '@/components/maintenance/MaintenanceRecordModal';
import ManageWorkshopsModal from '@/components/maintenance/ManageWorkshopsModal';
import AddMaintenanceCostModal from '@/components/maintenance/AddMaintenanceCostModal';
import DashboardLayout from '@/components/layout/DashboardLayout';
import KpiCard from '@/components/ui/KpiCard';
import { MaintenanceWrench, CheckBadge, MoneyBills } from '@/components/ui/kpi-icons';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';

import { maintenanceService, MaintenanceRecord, CreateMaintenancePayload, MaintenanceType, MaintenanceStatus } from '@/services/maintenanceService';
import { vehicleService } from '@/services/vehicleService';
import { exportToCSV, exportExcelTable, exportPDFTable } from '@/utils/exportUtils';
import ExportModal, { ExportColumn, ExportFilter } from '@/components/ui/ExportModal';
import { SortDropdown, SortOption } from '@/components/ui/SortDropdown';

const MAINTENANCE_EXPORT_COLUMNS: ExportColumn<MaintenanceRecord>[] = [
  { id: 'ref_id', label: 'Record ID', accessor: (r) => r.ref_id || `MNT-${r.id.slice(0, 5).toUpperCase()}` },
  { id: 'vehicle', label: 'Vehicle Plate', accessor: (r) => r.vehicle?.plate_number || 'N/A' },
  { id: 'maintenance_type', label: 'Maintenance Type', accessor: (r) => r.maintenance_type },
  { id: 'status', label: 'Status', accessor: (r) => r.status },
  { id: 'workshop_name', label: 'Workshop Name', accessor: (r) => r.workshop_name },
  { id: 'workshop_contact', label: 'Workshop Contact', accessor: (r) => r.workshop_contact || '—' },
  { id: 'cost', label: 'Cost (SAR)', accessor: (r) => r.cost ? `SAR ${r.cost.toLocaleString()}` : 'SAR 0' },
  { id: 'start_date', label: 'Start Date', accessor: (r) => (r.start_date ? new Date(r.start_date).toLocaleDateString() : '—') },
  { id: 'end_date', label: 'Completion Date', accessor: (r) => (r.end_date ? new Date(r.end_date).toLocaleDateString() : '—') },
  { id: 'work_done', label: 'Work Done / Details', accessor: (r) => r.work_done || r.remarks || '—' },
  { id: 'invoice_number', label: 'Invoice #', accessor: (r) => r.invoice_number || '—' },
];

const MAINTENANCE_EXPORT_FILTERS: ExportFilter<MaintenanceRecord>[] = [
  {
    id: 'status',
    label: 'Status',
    options: [
      { label: 'All Statuses', value: 'All' },
      { label: 'Pending', value: 'Pending' },
      { label: 'In Progress', value: 'InProgress' },
      { label: 'Completed', value: 'Completed' },
      { label: 'Cancelled', value: 'Cancelled' },
    ],
    filterFn: (row, val) => row.status === val,
  },
  {
    id: 'maintenance_type',
    label: 'Type',
    options: [
      { label: 'All Types', value: 'All' },
      { label: 'Periodic Service', value: 'Periodic' },
      { label: 'Repair & Fix', value: 'Repair' },
      { label: 'Tire Replacement', value: 'Tires' },
      { label: 'Oil Change', value: 'Oil' },
      { label: 'Emergency Breakdown', value: 'Emergency' },
    ],
    filterFn: (row, val) => row.maintenance_type === val,
  },
];
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';
import ConfirmModal from '@/components/ui/ConfirmModal';
import DataTable, { Column } from '@/components/ui/DataTable';
import DeletedBadge from '@/components/ui/DeletedBadge';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';

/** `YYYY-MM-DD` for today — used as the `min` on scheduling date inputs. */
const TODAY_ISO = new Date().toISOString().split('T')[0];

type MaintenanceSortOption = 'latest' | 'oldest' | 'cost_desc' | 'cost_asc' | 'vehicle_asc' | 'type_asc' | 'status';

const MAINTENANCE_SORT_OPTIONS: SortOption<MaintenanceSortOption>[] = [
  { value: 'latest', label: 'Newest Logged', icon: <ArrowDown className="w-3.5 h-3.5 text-blue-600" /> },
  { value: 'oldest', label: 'Oldest Logged', icon: <ArrowUp className="w-3.5 h-3.5 text-amber-600" /> },
  { value: 'cost_desc', label: 'Cost: High → Low', icon: <ArrowDown className="w-3.5 h-3.5 text-emerald-600" /> },
  { value: 'cost_asc', label: 'Cost: Low → High', icon: <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> },
  { value: 'vehicle_asc', label: 'Vehicle Plate (A → Z)', icon: <Truck className="w-3.5 h-3.5 text-purple-600" /> },
  { value: 'type_asc', label: 'Maintenance Type', icon: <Wrench className="w-3.5 h-3.5 text-orange-500" /> },
  { value: 'status', label: 'Record Status', icon: <Filter className="w-3.5 h-3.5 text-slate-500" /> },
];

export default function MaintenanceListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = useDeploymentTimezone();

  // "Service History" on the Vehicles page links here as ?vehicle=<plate>; the list search
  // already matches on plate number, so it lands pre-filtered to that vehicle.
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('vehicle') ?? '');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<MaintenanceSortOption>('latest');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, typeFilter, pageSize]);

  // Modal states
  const [isManageWorkshopsOpen, setIsManageWorkshopsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [selectedRecordsForExport, setSelectedRecordsForExport] = useState<MaintenanceRecord[]>([]);
  const [recordToDelete, setRecordToDelete] = useState<MaintenanceRecord | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Cost Modal state (list page)
  const [costModalRecord, setCostModalRecord] = useState<MaintenanceRecord | null>(null);

  // Queries
  const { data: maintenanceRes, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['maintenance', debouncedSearch, statusFilter, typeFilter, page, pageSize],
    queryFn: () => maintenanceService.getAll({
      search: debouncedSearch || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      maintenance_type: typeFilter !== 'all' ? typeFilter : undefined,
      page,
      per_page: pageSize,
    }),
    // Keep previous data visible while the new search query is loading so the DataTable
    // is never unmounted mid-search (which caused focus loss and the "full page reload" UX bug).
    placeholderData: (prev) => prev,
  });

  const { data: vehiclesRes } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => vehicleService.getAll({ per_page: 100, mode: 'lookup' }),
  });

  const records = [...(maintenanceRes?.data || [])].sort((a, b) => {
    if (sortOrder === 'cost_desc') return (Number(b.cost) || 0) - (Number(a.cost) || 0);
    if (sortOrder === 'cost_asc') return (Number(a.cost) || 0) - (Number(b.cost) || 0);
    if (sortOrder === 'vehicle_asc') return (a.vehicle?.plate_number || '').localeCompare(b.vehicle?.plate_number || '');
    if (sortOrder === 'type_asc') return (a.maintenance_type || '').localeCompare(b.maintenance_type || '');
    if (sortOrder === 'status') return (a.status || '').localeCompare(b.status || '');
    const dateA = new Date(a.createdAt || 0).getTime();
    const dateB = new Date(b.createdAt || 0).getTime();
    return sortOrder === 'oldest' ? dateA - dateB : dateB - dateA;
  });
  const kpis = maintenanceRes?.kpis || {
    total_cost: 0,
    active_count: 0,
    scheduled_count: 0,
    completed_count: 0,
    renewal_cost: 0,
  };

  const vehicles = vehiclesRes?.data || [];

  // Writing a service order can move its vehicle in or out of the workshop, so the
  // vehicle caches have to be dropped alongside the maintenance ones.
  const invalidateMaintenanceAndVehicles = () => {
    queryClient.invalidateQueries({ queryKey: ['maintenance'] });
    queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    queryClient.invalidateQueries({ queryKey: ['vehicle'] });
    // A workshop typed for the first time becomes a saved suggestion.
    queryClient.invalidateQueries({ queryKey: ['workshops'] });
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => maintenanceService.delete(id),
    onSuccess: () => {
      invalidateMaintenanceAndVehicles();
      setRecordToDelete(null);
    },
  });

  const handleOpenCreateModal = () => {
    navigate('/maintenance/new');
  };

  const handleOpenEditModal = (rec: MaintenanceRecord) => {
    navigate(`/maintenance/${rec.id}/edit`);
  };

  const handleExportExcel = async () => {
    const headers = [
      'Vehicle Plate',
      'Vehicle Ref',
      'Maintenance Type',
      'Status',
      'Start Date',
      'End Date',
      'Cost (SAR)',
      'Workshop',
      'Odometer (KM)',
      'Work Done'
    ];

    const dataRows = records.map(r => [
      r.vehicle?.plate_number || 'N/A',
      r.vehicle?.ref_id || 'N/A',
      r.maintenance_type,
      r.status,
      r.start_date ? new Date(r.start_date).toLocaleDateString() : '',
      r.end_date ? new Date(r.end_date).toLocaleDateString() : '',
      r.cost || 0,
      r.workshop_name || 'N/A',
      r.odometer_reading || '',
      r.work_done || r.remarks || ''
    ]);

    await exportExcelTable('MERCON Maintenance Ledger', headers, dataRows, `maintenance_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExportPDF = () => {
    const headers = [
      'Vehicle',
      'Type',
      'Status',
      'Start Date',
      'Cost (SAR)',
      'Workshop',
      'Work Done'
    ];

    const dataRows = records.map(r => [
      r.vehicle?.plate_number || 'N/A',
      r.maintenance_type,
      r.status,
      r.start_date ? new Date(r.start_date).toLocaleDateString() : '',
      `SAR ${(r.cost || 0).toLocaleString()}`,
      r.workshop_name || 'N/A',
      r.work_done || r.remarks || ''
    ]);

    exportPDFTable('MERCON Maintenance Ledger', headers, dataRows, `maintenance_report_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handleExportCSV = () => {
    const exportData = records.map(r => ({
      ID: r.id,
      Vehicle: r.vehicle?.plate_number || 'N/A',
      Ref_ID: r.vehicle?.ref_id || 'N/A',
      Maintenance_Type: r.maintenance_type,
      Status: r.status,
      Start_Date: r.start_date ? formatInDeploymentTz(r.start_date, tz, 'MM/dd/yyyy') : '',
      End_Date: r.end_date ? formatInDeploymentTz(r.end_date, tz, 'MM/dd/yyyy') : '',
      Cost_SAR: r.cost,
      Workshop: r.workshop_name,
      Contact: r.workshop_contact || '',
      Odometer_km: r.odometer_reading,
      Work_Done: r.work_done || '',
      Invoice_No: r.invoice_number || '',
      Remarks: r.remarks || '',
    }));
    exportToCSV(exportData, `vehicle_maintenance_report_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'In_Progress':
      case 'In Progress':
        return (
          <Badge className="bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-400 border-none rounded-full px-2.5 py-0.5 font-medium text-[11px] flex items-center gap-1.5 shadow-none shrink-0 w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0"></span>
            In Progress
          </Badge>
        );
      case 'Scheduled':
        return (
          <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 border-none rounded-full px-2.5 py-0.5 font-medium text-[11px] flex items-center gap-1.5 shadow-none shrink-0 w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>
            Scheduled
          </Badge>
        );
      case 'Completed':
        return (
          <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border-none rounded-full px-2.5 py-0.5 font-medium text-[11px] flex items-center gap-1.5 shadow-none shrink-0 w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
            Completed
          </Badge>
        );
      case 'Cancelled':
        return (
          <Badge className="bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400 border-none rounded-full px-2.5 py-0.5 font-medium text-[11px] flex items-center gap-1.5 shadow-none shrink-0 w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
            Cancelled
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400 border-none rounded-full px-2.5 py-0.5 font-medium text-[11px] shadow-none w-fit">
            {status}
          </Badge>
        );
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'Renewal':
        return (
          <Badge className="bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-400 border-none rounded-full px-2.5 py-0.5 font-medium text-[11px] shadow-none w-fit">
            Renewal
          </Badge>
        );
      case 'Repair':
        return (
          <Badge className="bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400 border-none rounded-full px-2.5 py-0.5 font-medium text-[11px] shadow-none w-fit">
            Repair
          </Badge>
        );
      case 'Inspection':
        return (
          <Badge className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400 border-none rounded-full px-2.5 py-0.5 font-medium text-[11px] shadow-none w-fit">
            Inspection
          </Badge>
        );
      case 'Emergency':
        return (
          <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border-none rounded-full px-2.5 py-0.5 font-medium text-[11px] shadow-none w-fit">
            Emergency
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-400 border-none rounded-full px-2.5 py-0.5 font-medium text-[11px] shadow-none w-fit">
            Routine Service
          </Badge>
        );
    }
  };

  const bulkActions = [
    {
      label: 'Export Documents',
      icon: <Download size={13} />,
      variant: 'secondary' as const,
      onClick: (selectedRows: MaintenanceRecord[]) => {
        setSelectedRecordsForExport(selectedRows);
        setIsExportOpen(true);
      }
    },
    {
      label: 'Delete Selected',
      icon: <Trash2 size={13} />,
      variant: 'danger' as const,
      onClick: (selectedRows: MaintenanceRecord[]) => {
        setConfirmModal({
          isOpen: true,
          title: 'Delete Selected Maintenance Records',
          message: `Are you sure you want to delete ${selectedRows.length} maintenance records? This action cannot be undone.`,
          onConfirm: async () => {
            try {
              await Promise.all(selectedRows.map(r => maintenanceService.delete(r.id)));
              invalidateMaintenanceAndVehicles();
            } catch (e) {
              toast.error('Failed to delete selected maintenance records');
            }
          }
        });
      }
    }
  ];

  const totalMaintenanceCount = kpis.active_count + kpis.scheduled_count + kpis.completed_count;



  const maintenanceTotalPages = maintenanceRes?.meta?.total_pages || 1;
  const maintenanceTotalCount = maintenanceRes?.meta?.total || records.length;
  const gridPageSizeOptions = [10, 25, 50, 100];
  const gridFromIndex = maintenanceTotalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const gridToIndex = maintenanceTotalCount === 0 ? 0 : gridFromIndex + records.length - 1;

  const maintenanceFilters = (
    <div className="flex items-center gap-3">
      {/* Status Dropdown using shadcn Select */}
      <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
        <SelectTrigger className="h-9 px-3 w-40 shrink-0 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
            <SelectValue placeholder="All Statuses" />
          </div>
        </SelectTrigger>
        <SelectContent className="bg-white rounded-xl shadow-lg border border-slate-200">
          <SelectItem value="all" className="text-xs font-semibold">All Statuses</SelectItem>
          <SelectItem value="Scheduled" className="text-xs font-semibold">Scheduled</SelectItem>
          <SelectItem value="In_Progress" className="text-xs font-semibold">In Progress</SelectItem>
          <SelectItem value="Completed" className="text-xs font-semibold">Completed</SelectItem>
          <SelectItem value="Cancelled" className="text-xs font-semibold">Cancelled</SelectItem>
        </SelectContent>
      </Select>

      {/* Type Dropdown using shadcn Select */}
      <Select value={typeFilter} onValueChange={(val) => { setTypeFilter(val); setPage(1); }}>
        <SelectTrigger className="h-9 px-3 w-40 shrink-0 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <Wrench className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
            <SelectValue placeholder="All Types" />
          </div>
        </SelectTrigger>
        <SelectContent className="bg-white rounded-xl shadow-lg border border-slate-200">
          <SelectItem value="all" className="text-xs font-semibold">All Types</SelectItem>
          <SelectItem value="Routine" className="text-xs font-semibold">Routine Service</SelectItem>
          <SelectItem value="Repair" className="text-xs font-semibold">Repair</SelectItem>
          <SelectItem value="Inspection" className="text-xs font-semibold">Inspection</SelectItem>
          <SelectItem value="Renewal" className="text-xs font-semibold">Renewal / Istimara</SelectItem>
          <SelectItem value="Emergency" className="text-xs font-semibold">Emergency</SelectItem>
        </SelectContent>
      </Select>

      <SortDropdown
        value={sortOrder}
        onChange={setSortOrder}
        options={MAINTENANCE_SORT_OPTIONS}
      />

    </div>
  );

  const maintenanceHeaderActions = (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs font-semibold border-slate-200 bg-white hover:bg-slate-50 shadow-2xs text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300"
          >
            <Download className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
            Export
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 p-1.5 shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl">
          <DropdownMenuLabel className="text-[10px] font-bold tracking-wider uppercase text-slate-400 px-2 py-1">
            Export Data
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={handleExportExcel}
            className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md"
          >
            <FileSpreadsheet className="mr-2 h-3.5 w-3.5 text-emerald-600" />
            Export Excel (.xlsx)
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleExportPDF}
            className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md"
          >
            <FileText className="mr-2 h-3.5 w-3.5 text-rose-600" />
            Export PDF (.pdf)
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setSelectedRecordsForExport([]);
              setIsExportOpen(true);
            }}
            className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md text-brand hover:bg-orange-50 dark:hover:bg-orange-950/40"
          >
            <Filter className="mr-2 h-3.5 w-3.5 text-brand" />
            Custom Export Settings...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsManageWorkshopsOpen(true)}
        className="h-9 gap-1.5 text-xs font-semibold border-slate-200 bg-white hover:bg-slate-50 shadow-2xs text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300"
      >
        <Building2 className="h-3.5 w-3.5 text-amber-500" />
        Manage Workshops
      </Button>

      <Button
        size="sm"
        onClick={handleOpenCreateModal}
        className="h-9 gap-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-xs rounded-md px-4"
      >
        <Plus className="h-4 w-4" />
        Add Maintenance
      </Button>
    </div>
  );

  return (
    <DashboardLayout active="Vehicles" title="Vehicle Maintenance">
      <div className="px-4 sm:px-6 pb-6 w-full flex flex-col animate-fade-in gap-5">

        {/* ── 1. Instrument-Panel KPI Cards ───────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 shrink-0">
          
          <KpiCard
            title="TOTAL MAINTENANCE EXPENSE"
            className="kpi-tint-maintenance"
            value={
              <span>
                <span className="text-[16px] font-semibold mr-1.5 opacity-85">SAR</span>
                {kpis.total_cost.toLocaleString()}
              </span>
            }
            variant="slate"
            description={`${totalMaintenanceCount || records.length} total service records`}
            icon={MoneyBills}
            progressSegments={[
              { label: `Active (${kpis.active_count})`, value: kpis.active_count > 0 ? 50 : 0, color: 'bg-slate-400' },
              { label: `Completed (${kpis.completed_count})`, value: kpis.completed_count > 0 ? 50 : 100, color: 'bg-emerald-500' },
            ]}
            isActive={statusFilter === 'all'}
            onClick={() => {
              setStatusFilter('all');
              setPage(1);
            }}
          />

          <KpiCard
            title="IN-PROGRESS SERVICE"
            className="kpi-tint-maintenance"
            value={
              <span>
                {kpis.active_count}
                <span className="text-[16px] font-semibold ml-1.5 opacity-85">Vehicles</span>
              </span>
            }
            variant={kpis.active_count > 0 ? 'rose' : 'slate'}
            trend={kpis.active_count > 0 ? 'down' : 'neutral'}
            trendValue={kpis.active_count > 0 ? 'In Shop' : 'All Clear'}
            description="Currently in workshop repair"
            icon={MaintenanceWrench}
            completionGauge={{
              percentage: totalMaintenanceCount > 0 ? Math.round((kpis.active_count / totalMaintenanceCount) * 100) : 0,
              label: `${kpis.active_count} In Repair`,
              subtext: 'Workshop Occupancy'
            }}
            isActive={statusFilter === 'In_Progress'}
            onClick={() => {
              setStatusFilter(statusFilter === 'In_Progress' ? 'all' : 'In_Progress');
              setPage(1);
            }}
          />

          <KpiCard
            title="COMPLETED REPAIRS"
            className="kpi-tint-maintenance"
            value={
              <span>
                {kpis.completed_count}
                <span className="text-[16px] font-semibold ml-1.5 opacity-85">Records</span>
              </span>
            }
            variant="emerald"
            trend="up"
            trendValue="Verified"
            description="Fully serviced & verified"
            icon={CheckBadge}
            completionGauge={{
              percentage: totalMaintenanceCount > 0 ? Math.round((kpis.completed_count / totalMaintenanceCount) * 100) : 100,
              label: `${kpis.completed_count} Resolved`,
              subtext: 'Serviced Clear'
            }}
            isActive={statusFilter === 'Completed'}
            onClick={() => {
              setStatusFilter(statusFilter === 'Completed' ? 'all' : 'Completed');
              setPage(1);
            }}
          />

        </div>

        {/* ── 2. Data Table Ledger & Empty States ─────────────────────────── */}
        <div className="w-full flex flex-col">
            <DataTable
              title={
                <span className="flex items-center gap-2 text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  <Wrench className="w-5 h-5 text-red-500" />
                  <span>Maintenance Ledger</span>
                </span>
              }
              actionsElement={maintenanceHeaderActions}
              columns={[
                {
                  header: 'Order #',
                  accessor: (r: MaintenanceRecord) => (
                    <span className="font-mono font-extrabold text-slate-900 dark:text-slate-100">
                      {r.ref_id || '—'}
                    </span>
                  ),
                },
                {
                  header: 'Vehicle / Ref',
                  accessor: (r: MaintenanceRecord) => (
                    <div>
                      <div className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-indigo-500" />
                        {r.vehicle?.plate_number || 'TRK-UNKNOWN'}
                        {r.vehicle?.deletedAt && <DeletedBadge />}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        {r.vehicle?.ref_id || 'Ref N/A'} • {r.odometer_reading ? `${r.odometer_reading.toLocaleString()} km` : '0 km'}
                      </div>
                    </div>
                  ),
                },
                {
                  header: 'Type',
                  accessor: (r: MaintenanceRecord) => getTypeBadge(r.maintenance_type),
                },
                {
                  header: 'Start Date',
                  accessor: (r: MaintenanceRecord) => (
                    <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                      {r.start_date ? formatInDeploymentTz(r.start_date, tz, 'MM/dd/yyyy') : r.service_date ? formatInDeploymentTz(r.service_date, tz, 'MM/dd/yyyy') : 'N/A'}
                    </span>
                  ),
                },
                {
                  header: 'End Date',
                  accessor: (r: MaintenanceRecord) => (
                    <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                      {r.end_date ? formatInDeploymentTz(r.end_date, tz, 'MM/dd/yyyy') : '—'}
                    </span>
                  ),
                },
                {
                  header: 'Expense (SAR)',
                  accessor: (r: MaintenanceRecord) => (
                    <span className="font-mono font-extrabold text-rose-600 dark:text-rose-400 text-xs">
                      {r.cost ? `SAR ${r.cost.toLocaleString()}` : '—'}
                    </span>
                  ),
                },
                {
                  header: 'Status',
                  accessor: (r: MaintenanceRecord) => getStatusBadge(r.status),
                },
                {
                  header: 'Actions',
                  className: 'w-[80px] whitespace-nowrap text-right',
                  headerClassName: 'text-right',
                  accessor: (row: MaintenanceRecord) => (
                    <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                            <MoreVertical className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40 bg-white border border-slate-200 dark:border-slate-800 p-1 rounded-xl shadow-lg">
                          <DropdownMenuItem
                            onClick={() => navigate(`/maintenance/${row.id}`)}
                            className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md hover:bg-slate-50"
                          >
                            <Eye className="w-3.5 h-3.5 mr-2" /> View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleOpenEditModal(row)}
                            className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md hover:bg-slate-50"
                          >
                            <Edit2 className="w-3.5 h-3.5 mr-2" /> Edit Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="my-1 border-slate-100 dark:border-slate-800" />
                          <DropdownMenuItem
                            onClick={() => setRecordToDelete(row)}
                            className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md text-rose-600 focus:bg-rose-50"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete Record
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ),
                },
              ]}
              data={records}
              sortAccessor={(row: MaintenanceRecord) => row.createdAt}
              compact={true}
              isLoading={isLoading}
              isError={isError}
              errorMessage="Failed to load maintenance records."
              emptyTitle="No Maintenance Records Found"
              emptyMessage="No providers match your search or status filter. Get started by adding a provider or importing an Excel workbook."
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              currentPage={page}
              totalPages={maintenanceRes?.meta?.total_pages || 1}
              totalRecords={maintenanceRes?.meta?.total || records.length}
              onPageChange={setPage}
              onRowClick={(row) => navigate(`/maintenance/${row.id}`)}
              searchPlaceholder="Search vehicle plate, workshop, invoice, or work done..."
              searchValue={search}
              filterElement={maintenanceFilters}
            />
          </div>
      </div>



      {/* ── 6. Delete Confirmation Modal ───────────────────────────────── */}
      <Dialog open={!!recordToDelete} onOpenChange={(open) => !open && setRecordToDelete(null)}>
        <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden border-slate-200 dark:border-slate-800">
          <DialogHeader className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-rose-50/50 dark:bg-rose-950/20">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <DialogTitle className="text-base font-extrabold">Delete Maintenance Record</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              Are you sure you want to delete this maintenance record for vehicle <strong className="text-slate-900 dark:text-slate-100">{recordToDelete?.vehicle?.plate_number}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRecordToDelete(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => recordToDelete && deleteMutation.mutate(recordToDelete.id)}
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-4"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Confirm Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={async () => {
          await confirmModal.onConfirm();
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }}
        title={confirmModal.title}
        message={confirmModal.message}
        isDestructive={true}
      />

      <ManageWorkshopsModal
        open={isManageWorkshopsOpen}
        onOpenChange={setIsManageWorkshopsOpen}
      />

      <AddMaintenanceCostModal
        open={!!costModalRecord}
        onOpenChange={(open) => !open && setCostModalRecord(null)}
        record={costModalRecord}
      />

      {/* ── Universal Export Modal ────────────────────────────────────── */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title="Export Maintenance Logs"
        description="Choose your export preferences, filters, and columns."
        fileNamePrefix="maintenance_logs"
        sheetName="Maintenance"
        subtitle="MERCON Logistics Fleet Maintenance Logs"
        filteredData={records}
        allData={records}
        selectedData={selectedRecordsForExport}
        totalCount={maintenanceTotalCount}
        columns={MAINTENANCE_EXPORT_COLUMNS}
        filters={MAINTENANCE_EXPORT_FILTERS}
        formats={['xlsx', 'csv', 'pdf']}
        rowDateAccessor={(m) => m.service_date || m.createdAt}
      />

    </DashboardLayout>
  );
}
