import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Edit2,
  Eye,
  Trash2,
  Search,
  Building2,
  Phone,
  Mail,
  MapPin,
  Download,
  RotateCw,
  List,
  LayoutGrid,
  Filter,
  FileSpreadsheet,
  FileText,
  UploadCloud,
  ChevronDown,
  MoreHorizontal,
  Send,
  Truck,
  DollarSign,
  Star,
  CheckCircle2,
  XCircle,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowDown,
  ArrowUp,
} from 'lucide-react';
import { CustomerBuilding } from '@/components/ui/kpi-icons';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import KpiCard from '@/components/ui/KpiCard';
import { downloadCSV, exportExcelTable, exportPDFTable } from '@/utils/exportUtils';
import { THIRD_PARTY_COLUMNS } from '@/utils/importUtils';
import PhoneDisplay from '@/components/ui/PhoneDisplay';
import ExcelImportDialog from '@/components/fleet/ExcelImportDialog';
import ExportModal, { ExportColumn, ExportFilter } from '@/components/ui/ExportModal';
import { thirdPartyService, ThirdPartyProvider } from '@/services/thirdPartyService';
import { SortDropdown, SortOption } from '@/components/ui/SortDropdown';
import ThirdPartyPreviewModal from '@/components/third-party/ThirdPartyPreviewModal';

const THIRD_PARTY_EXPORT_COLUMNS: ExportColumn<ThirdPartyProvider>[] = [
  { id: 'name', label: 'Provider / Company Name', accessor: (p) => p.name },
  { id: 'contact_person', label: 'Contact Person', accessor: (p) => p.contact_person || '—' },
  { id: 'phone', label: 'Phone', accessor: (p) => p.phone || '—' },
  { id: 'email', label: 'Email', accessor: (p) => p.email || '—' },
  { id: 'tax_id', label: 'Tax ID', accessor: (p) => p.tax_id || '—' },
  { id: 'rating', label: 'Rating', accessor: (p) => p.rating ? `${p.rating} / 5` : '5.0' },
  { id: 'status', label: 'Status', accessor: (p) => (p.isActive !== false ? 'Active' : 'Inactive') },
  { id: 'created_at', label: 'Created Date', accessor: (p) => (p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—') },
];

const THIRD_PARTY_EXPORT_FILTERS: ExportFilter<ThirdPartyProvider>[] = [
  {
    id: 'status',
    label: 'Status',
    options: [
      { label: 'All Statuses', value: 'All' },
      { label: 'Active', value: 'Active' },
      { label: 'Inactive', value: 'Inactive' },
    ],
    filterFn: (row, val) => (val === 'Active' ? row.isActive !== false : row.isActive === false),
  },
];
import DashboardLayout from '@/components/layout/DashboardLayout';
import DataTable, { Column, BulkAction } from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfirmModal from '@/components/ui/ConfirmModal';
import CreateThirdPartyModal from '@/components/third-party/CreateThirdPartyModal';
import EditThirdPartyModal from '@/components/third-party/EditThirdPartyModal';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

type ThirdPartySortOption = 'latest' | 'oldest' | 'name_asc' | 'name_desc' | 'trips_desc' | 'cost_desc' | 'status';

const THIRD_PARTY_SORT_OPTIONS: SortOption<ThirdPartySortOption>[] = [
  { value: 'latest', label: 'Newest Added', icon: <ArrowDown className="w-3.5 h-3.5 text-blue-600" /> },
  { value: 'oldest', label: 'Oldest Added', icon: <ArrowUp className="w-3.5 h-3.5 text-amber-600" /> },
  { value: 'name_asc', label: 'Provider Name (A → Z)', icon: <Building2 className="w-3.5 h-3.5 text-purple-600" /> },
  { value: 'name_desc', label: 'Provider Name (Z → A)', icon: <Building2 className="w-3.5 h-3.5 text-purple-600" /> },
  { value: 'trips_desc', label: 'Total Trips (High → Low)', icon: <Truck className="w-3.5 h-3.5 text-blue-600" /> },
  { value: 'cost_desc', label: 'Rental Outlay (High → Low)', icon: <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> },
  { value: 'status', label: 'Partner Status', icon: <Filter className="w-3.5 h-3.5 text-slate-500" /> },
];

export default function ThirdPartyListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = useDeploymentTimezone();

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedStatus, setSelectedStatus] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [sortOrder, setSortOrder] = useState<ThirdPartySortOption>('latest');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [selectedProvidersForExport, setSelectedProvidersForExport] = useState<ThirdPartyProvider[]>([]);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedProviderForEdit, setSelectedProviderForEdit] = useState<ThirdPartyProvider | null>(null);
  const [previewProvider, setPreviewProvider] = useState<ThirdPartyProvider | null>(null);

  // WhatsApp share dialog state
  const [whatsappProvider, setWhatsappProvider] = useState<ThirdPartyProvider | null>(null);
  const [whatsappMessageText, setWhatsappMessageText] = useState('');
  const [whatsappCustomPhone, setWhatsappCustomPhone] = useState('');

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    isDestructive?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const debouncedSearch = useDebouncedValue(search, 300);

  // Fetch providers using React Query
  const { data: providersRes, isLoading, isError } = useQuery({
    queryKey: ['third-party-providers', selectedStatus, debouncedSearch, currentPage, pageSize],
    queryFn: () =>
      thirdPartyService.getAll({
        is_active: selectedStatus === 'All' ? undefined : selectedStatus === 'Active',
        search: debouncedSearch || undefined,
        page: currentPage,
        per_page: pageSize,
      }),
    // Keep the previous rows on screen while a new search/page loads.
    placeholderData: keepPreviousData,
  });

  // KPI totals, counted and summed in the database. This used to fetch all 1000
  // providers on mount purely to reduce over them in the browser — and each of
  // those rows carried its own per-provider trip aggregates.
  const { data: thirdPartyStats } = useQuery({
    queryKey: ['third-party-providers', 'stats'],
    queryFn: () => thirdPartyService.getStats(),
  });

  const providers: ThirdPartyProvider[] = providersRes?.data?.data || [];
  const totalPages = providersRes?.data?.meta?.total_pages || 1;
  const totalRecords = providersRes?.data?.meta?.total || providers.length;

  const sortedProviders = useMemo(() => {
    return [...providers].sort((a, b) => {
      if (sortOrder === 'name_asc') return (a.name || '').localeCompare(b.name || '');
      if (sortOrder === 'name_desc') return (b.name || '').localeCompare(a.name || '');
      if (sortOrder === 'trips_desc') return (b.total_trips || 0) - (a.total_trips || 0);
      if (sortOrder === 'cost_desc') return (b.total_cost || 0) - (a.total_cost || 0);
      if (sortOrder === 'status') return (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0);
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return sortOrder === 'oldest' ? dateA - dateB : dateB - dateA;
    });
  }, [providers, sortOrder]);

  const totalCount = thirdPartyStats?.total ?? 0;
  const activeCount = thirdPartyStats?.active ?? 0;
  const inactiveCount = thirdPartyStats?.inactive ?? 0;
  const activePct = totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 100;
  const inactivePct = Math.max(0, 100 - activePct);

  const totalSubcontractTrips = thirdPartyStats?.total_trips ?? 0;
  const totalRentalOutlay = thirdPartyStats?.total_cost ?? 0;
  const totalRevenue = thirdPartyStats?.total_revenue ?? 0;
  const totalNetProfit = thirdPartyStats?.net_profit ?? 0;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['third-party-providers'] });
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const openWhatsappShare = (provider: ThirdPartyProvider) => {
    setWhatsappProvider(provider);
    const text =
      `*MERCON LOGISTICS - Third-Party Carrier Profile*\n` +
      `• *Provider:* ${provider.name}\n` +
      `• *Contact:* ${provider.contact_person || 'N/A'}\n` +
      `• *Phone:* ${provider.phone || 'N/A'}\n` +
      `• *Email:* ${provider.email || 'N/A'}\n` +
      `• *Tax ID:* ${provider.tax_id || 'N/A'}\n` +
      `• *Total Trips:* ${provider.total_trips || 0}`;
    setWhatsappMessageText(text);
    setWhatsappCustomPhone(provider.phone || '');
  };

  const handleWhatsappSend = () => {
    const cleanPhone = whatsappCustomPhone.trim().replace(/\+/g, '').replace(/\D/g, '');
    const shareUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(whatsappMessageText)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappMessageText)}`;
    window.open(shareUrl, '_blank');
    setWhatsappProvider(null);
  };

  const getProviderExportData = (rowsToExport: ThirdPartyProvider[]) => {
    const headers = [
      'Provider ID',
      'Provider Name',
      'Contact Person',
      'Phone Number',
      'Email',
      'Tax / CR ID',
      'Total Trips',
      'Active Trips',
      'Total Outlay (SAR)',
      'Status',
    ];

    const dataRows = rowsToExport.map((p) => [
      `3PL-${p.id.slice(0, 5).toUpperCase()}`,
      p.name,
      p.contact_person || 'N/A',
      p.phone || 'N/A',
      p.email || 'N/A',
      p.tax_id || 'N/A',
      p.total_trips || 0,
      p.active_trips || 0,
      p.total_cost || 0,
      p.isActive ? 'Active' : 'Inactive',
    ]);

    const totalTripsSum = rowsToExport.reduce((acc, p) => acc + (p.total_trips || 0), 0);
    const activeTripsSum = rowsToExport.reduce((acc, p) => acc + (p.active_trips || 0), 0);
    const totalOutlaySum = rowsToExport.reduce((acc, p) => acc + (p.total_cost || 0), 0);

    const totalsRow = [
      'TOTALS',
      '',
      '',
      '',
      '',
      '',
      totalTripsSum,
      activeTripsSum,
      totalOutlaySum,
      '',
    ];

    return { headers, rows: [...dataRows, totalsRow] };
  };

  const handleExportExcel = async (rowsToExport: ThirdPartyProvider[]) => {
    const { headers, rows } = getProviderExportData(rowsToExport);
    const dateStr = new Date().toISOString().slice(0, 10);
    await exportExcelTable(
      'MERCON Third-Party Providers',
      headers,
      rows,
      `third_party_providers_${dateStr}.xlsx`,
      {
        subtitle: `Generated on ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()} · MERCON Logistics Platform · ${rowsToExport.length} record${rowsToExport.length === 1 ? '' : 's'}`,
        sheetName: '3PL Providers',
      }
    );
  };

  const handleExportPDF = (rowsToExport: ThirdPartyProvider[]) => {
    const { headers, rows } = getProviderExportData(rowsToExport);
    const dateStr = new Date().toISOString().slice(0, 10);
    exportPDFTable(
      'MERCON Third-Party Providers',
      headers,
      rows,
      `third_party_providers_${dateStr}.pdf`,
      {
        subtitle: `Generated on ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()} · MERCON Logistics Platform · ${rowsToExport.length} record${rowsToExport.length === 1 ? '' : 's'}`,
      }
    );
  };

  const handleDeleteSingle = (provider: ThirdPartyProvider) => {
    setConfirmModal({
      isOpen: true,
      title: 'Remove Third-Party Provider',
      message: `Are you sure you want to permanently delete "${provider.name}"? This action cannot be undone.`,
      isDestructive: true,
      onConfirm: async () => {
        try {
          await thirdPartyService.delete(provider.id);
          toast.success(`Deleted provider "${provider.name}"`);
          queryClient.invalidateQueries({ queryKey: ['third-party-providers'] });
        } catch (err: any) {
          toast.error(err?.message || 'Failed to delete provider');
        }
      },
    });
  };

  const columns: Column<ThirdPartyProvider>[] = [
    {
      header: 'Provider ID & Ref',
      accessor: (row: ThirdPartyProvider) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs font-bold text-brand">
            3PL-{row.id.slice(0, 5).toUpperCase()}
          </span>
          <span className="text-[10px] text-slate-400 font-medium">
            Reg: {formatInDeploymentTz(row.createdAt, tz, 'MM/dd/yyyy')}
          </span>
        </div>
      ),
    },
    {
      header: 'Company & Representative',
      accessor: (row: ThirdPartyProvider) => (
        <div className="flex items-center gap-3">
          <Building2 className="w-4 h-4 text-purple-600 shrink-0" />
          <div className="flex flex-col">
            <span
              className="font-bold text-slate-900 dark:text-slate-100 text-xs hover:text-brand transition-colors cursor-pointer"
              onClick={() => navigate(`/third-party/${row.id}`)}
            >
              {row.name}
            </span>
            {row.contact_person ? (
              <span className="text-[11px] text-slate-500 font-medium">{row.contact_person}</span>
            ) : (
              <span className="text-[10px] text-slate-400 italic">—</span>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'Contact Info',
      accessor: (row: ThirdPartyProvider) => (
        <div className="flex flex-col gap-0.5 text-xs">
          {row.phone && (
            <PhoneDisplay phone={row.phone} showActions={false} variant="compact" />
          )}
          {row.email && (
            <span className="flex items-center gap-1 text-[11px] text-slate-500 truncate">
              <Mail className="w-3 h-3 text-slate-400 shrink-0" />
              {row.email}
            </span>
          )}
          {!row.phone && !row.email && <span className="text-slate-400 italic">—</span>}
        </div>
      ),
    },
    {
      header: 'Subcontract Fleet & Trips',
      accessor: (row: ThirdPartyProvider) => (
        <div className="flex items-center gap-2">
          <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-none font-bold text-[11px]">
            {row.total_trips || 0} Trips
          </Badge>
          {(row.active_trips || 0) > 0 && (
            <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 text-[10px] font-bold">
              {row.active_trips} Active
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: 'Total Outlay',
      accessor: (row: ThirdPartyProvider) => (
        <div className="flex flex-col">
          <span className="font-bold text-xs text-slate-900 dark:text-slate-100 font-mono">
            SAR {(row.total_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-slate-400">Total paid capacity</span>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (row: ThirdPartyProvider) => (
        <StatusBadge status={row.isActive ? 'Active' : 'Inactive'} />
      ),
    },
    {
      header: 'Actions',
      accessor: (row: ThirdPartyProvider) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-900">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuLabel className="text-[11px] text-slate-400 font-bold uppercase">
              Manage Provider
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setSelectedProviderForEdit(row);
              }}
              className="text-xs font-medium cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5 mr-2 text-brand" /> Edit Provider Details
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                openWhatsappShare(row);
              }}
              className="text-xs font-medium text-emerald-600 cursor-pointer"
            >
              <WhatsAppIcon className="w-3.5 h-3.5 mr-2" /> Share Profile via WhatsApp
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteSingle(row);
              }}
              className="text-xs font-medium text-rose-600 dark:text-rose-400 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete Provider
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const gridPageSizeOptions = [10, 25, 50, 100];
  const gridFromIndex = totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const gridToIndex = totalRecords === 0 ? 0 : gridFromIndex + providers.length - 1;

  const bulkActions: BulkAction<ThirdPartyProvider>[] = [
    {
      label: 'Export Selected Excel',
      icon: <FileSpreadsheet size={13} className="text-emerald-600 dark:text-emerald-400" />,
      variant: 'success',
      onClick: (selectedRows) => {
        handleExportExcel(selectedRows);
      },
    },
    {
      label: 'Export Selected PDF',
      icon: <FileText size={13} className="text-rose-600 dark:text-rose-400" />,
      variant: 'warning',
      onClick: (selectedRows) => {
        handleExportPDF(selectedRows);
      },
    },
    {
      label: 'Export Documents',
      icon: <Download size={13} />,
      variant: 'secondary' as const,
      onClick: (selectedRows: ThirdPartyProvider[]) => {
        setSelectedProvidersForExport(selectedRows);
        setIsExportOpen(true);
      },
    },
    {
      label: 'Delete Selected',
      icon: <Trash2 size={13} />,
      variant: 'danger',
      onClick: (selectedRows) => {
        setConfirmModal({
          isOpen: true,
          title: 'Delete Selected Providers',
          message: `Are you sure you want to permanently delete ${selectedRows.length} third-party providers? This action cannot be undone.`,
          isDestructive: true,
          onConfirm: async () => {
            try {
              await Promise.all(selectedRows.map((p) => thirdPartyService.delete(p.id)));
              toast.success(`Deleted ${selectedRows.length} providers`);
              queryClient.invalidateQueries({ queryKey: ['third-party-providers'] });
            } catch (err: any) {
              toast.error('Failed to delete selected providers');
            }
          },
        });
      },
    },
  ];

  const thirdPartyFilters = (
    <div className="flex items-center gap-3">
      {/* Status Dropdown using shadcn Select */}
      <Select
        value={selectedStatus}
        onValueChange={(val: any) => {
          setSelectedStatus(val);
          setCurrentPage(1);
        }}
      >
        <SelectTrigger className="h-9 w-36 text-xs font-semibold border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus-visible:ring-brand/20">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent className="bg-white rounded-xl shadow-lg border border-slate-200">
          <SelectItem value="All" className="text-xs font-semibold">All Statuses</SelectItem>
          <SelectItem value="Active" className="text-xs font-semibold">Active Only</SelectItem>
          <SelectItem value="Inactive" className="text-xs font-semibold">Inactive Only</SelectItem>
        </SelectContent>
      </Select>

      <SortDropdown
        value={sortOrder}
        onChange={setSortOrder}
        options={THIRD_PARTY_SORT_OPTIONS}
      />

      {/* View Mode Switcher */}
      <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200/80 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setViewMode('list')}
          className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
            viewMode === 'list'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <List className="w-3.5 h-3.5" />
          <span>List</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode('grid')}
          className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
            viewMode === 'grid'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          <span>Grid</span>
        </button>
      </div>
    </div>
  );

  const thirdPartyHeaderActions = (
    <div className="flex items-center gap-2.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs font-semibold border-slate-200 bg-white hover:bg-slate-50 shadow-2xs dark:bg-slate-900 dark:border-slate-800"
          >
            <Download className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
            Export / Import
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 p-1.5 shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl">
          <DropdownMenuLabel className="text-[10px] font-bold tracking-wider uppercase text-slate-400 px-2 py-1">
            Export Data
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => handleExportExcel(providers)}
            className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md"
          >
            <FileSpreadsheet className="mr-2 h-3.5 w-3.5 text-emerald-600" />
            Export Excel (.xlsx)
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleExportPDF(providers)}
            className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md"
          >
            <FileText className="mr-2 h-3.5 w-3.5 text-rose-600" />
            Export PDF (.pdf)
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => {
              setSelectedProvidersForExport([]);
              setIsExportOpen(true);
            }}
            className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md text-brand hover:bg-orange-50 dark:hover:bg-orange-950/40"
          >
            <Filter className="mr-2 h-3.5 w-3.5 text-brand" />
            Custom Export Settings...
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1 border-slate-100 dark:border-slate-800" />

          <DropdownMenuLabel className="text-[10px] font-bold tracking-wider uppercase text-slate-400 px-2 py-1">
            Import Data
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => setIsImportOpen(true)}
            className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
          >
            <UploadCloud className="mr-2 h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            Import from Excel
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        size="sm"
        className="h-9 gap-1.5 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-xs rounded-md px-4"
        onClick={() => setIsCreateModalOpen(true)}
      >
        <Plus className="h-4 w-4" />
        Add Provider
      </Button>
    </div>
  );

  return (
    <DashboardLayout active="/third-party" title="Third-Party Fleet">
      <div className="px-4 sm:px-6 pb-6 w-full flex flex-col animate-fade-in gap-5">
        {/* 2. Instrument-Panel KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 shrink-0">
          <KpiCard
            title="TOTAL 3PL PROVIDERS"
            className="kpi-tint-third-party"
            value={
              <span>
                {totalCount}
                <span className="text-[16px] font-semibold ml-1.5 opacity-85 font-mono">Partners</span>
              </span>
            }
            variant="slate"
            trend="up"
            trendValue={`${activeCount} Active`}
            description="Subcontract & rental partners"
            icon={CustomerBuilding}
            progressSegments={[
              { label: `Active (${activeCount})`, value: activePct, color: 'bg-emerald-500' },
              { label: `Inactive (${inactiveCount})`, value: inactivePct, color: 'bg-slate-400' },
            ]}
          />

          <KpiCard
            title="3PL FINANCIAL PERFORMANCE"
            className="kpi-tint-third-party"
            value={
              <div className="flex flex-col space-y-1.5 pt-0.5 w-full">
                <div className="flex items-center justify-between gap-2 border-b border-emerald-100 dark:border-emerald-900/40 pb-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Revenue:</span>
                  <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-100 font-mono">
                    SAR {totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 border-b border-emerald-100 dark:border-emerald-900/40 pb-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Rental:</span>
                  <span className="text-xs sm:text-sm font-extrabold text-slate-700 dark:text-slate-300 font-mono">
                    SAR {totalRentalOutlay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Total Net Profit:</span>
                  <span className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                    SAR {totalNetProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            }
            variant="emerald"
            trend={totalNetProfit >= 0 ? "up" : "down"}
            trendValue={totalNetProfit >= 0 ? "Positive Net Margin" : "Net Margin Deficit"}
            description="Subcontract 3PL revenue, rental outlay & profit breakdown"
            icon={DollarSign}
          />
        </div>

        {/* 4. Data Table Ledger & Cards View */}
        {viewMode === 'list' ? (
          <DataTable
              title={
                <span className="flex items-center gap-2 text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  <Building2 className="w-5 h-5 text-teal-600" />
                  <span>Third-Party Fleet Ledger</span>
                </span>
              }
            columns={columns}
            data={sortedProviders}
            onRowClick={(row: ThirdPartyProvider) => navigate(`/third-party/${row.id}`)}
            sortAccessor={(row: ThirdPartyProvider) => row.createdAt}
            isLoading={isLoading}
            isError={isError}
            enableSelection={true}
            bulkActions={bulkActions}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            pageSize={pageSize}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            totalRecords={totalRecords}
          />
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col w-full animate-fade-in">
            {/* Toolbar: matches the list view's search bar & filters, placed above the grid */}
            <div className="shrink-0 p-3 sm:p-4 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-col gap-3">
              <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 w-full">
                <div className="flex items-center gap-2.5 sm:gap-3 flex-1 flex-wrap min-w-0">
                  <div className="flex items-center gap-2 shrink-0">
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-teal-600" />
                      <span>Third-Party Fleet Ledger</span>
                    </h3>
                    <Badge variant="outline" className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 text-[11px] font-mono font-bold px-2 py-0.5">
                      {totalRecords} {totalRecords === 1 ? 'record' : 'records'}
                    </Badge>
                  </div>

                  <div className="relative w-full sm:w-72 lg:w-88 shrink-0">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="Search provider name, contact, phone, tax ID..."
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                      className="w-full pl-8.5 pr-8 h-9 text-xs bg-white dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700 focus-visible:ring-brand/20 focus-visible:border-brand rounded-md font-medium"
                      aria-label="Search Providers"
                    />
                    {search && (
                      <button
                        onClick={() => { setSearch(''); setCurrentPage(1); }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                        aria-label="Clear search"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex w-full xl:w-auto items-center flex-wrap gap-2 sm:shrink-0 xl:ml-auto rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-950/30 p-1.5">
                  {thirdPartyFilters}
                  {thirdPartyHeaderActions}
                </div>
              </div>
            </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 sm:p-5">
            {sortedProviders.map((p: ThirdPartyProvider) => (
              <div key={p.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <Building2 className="w-5 h-5 text-purple-600 shrink-0" />
                    <div>
                      <h4
                        className="font-bold text-sm text-slate-900 dark:text-slate-100 hover:text-brand transition-colors cursor-pointer"
                        onClick={() => navigate(`/third-party/${p.id}`)}
                      >
                        {p.name}
                      </h4>
                      {p.contact_person && <p className="text-xs text-slate-500 font-medium">{p.contact_person}</p>}
                    </div>
                  </div>

                  <StatusBadge status={p.isActive ? 'Active' : 'Inactive'} />
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {p.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{p.phone}</span>
                    </div>
                  )}
                  {p.email && (
                    <div className="flex items-center gap-2 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">{p.email}</span>
                    </div>
                  )}
                  {p.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">{p.address}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Trips</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{p.total_trips || 0}</span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Outlay</span>
                    <span className="font-bold text-brand font-mono">SAR {(p.total_cost || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

            {/* Pagination Footer — mirrors the list view's pagination */}
            <div className="shrink-0 p-3 sm:p-4 sm:px-5 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/60 text-xs font-semibold text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">
                    <span className="hidden sm:inline">Rows per page:</span>
                    <span className="sm:hidden">Rows:</span>
                  </span>
                  <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                    className="h-8 px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand/20 cursor-pointer shadow-xs"
                    aria-label="Rows per page"
                  >
                    {gridPageSizeOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <span className="text-slate-500 dark:text-slate-400 font-medium border-l border-slate-200 dark:border-slate-700 pl-4 hidden sm:inline">
                  Showing <span className="font-extrabold text-slate-900 dark:text-slate-100">{gridFromIndex}</span> to <span className="font-extrabold text-slate-900 dark:text-slate-100">{gridToIndex}</span> of <span className="font-extrabold text-slate-900 dark:text-slate-100">{totalRecords}</span> entries
                </span>
              </div>

              <div className="flex items-center gap-1.5 ml-auto" role="navigation" aria-label="Pagination Navigation">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1 || isLoading}
                  aria-label="First page"
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  <ChevronsLeft size={14} />
                </button>

                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || isLoading}
                  aria-label="Previous page"
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  <ChevronLeft size={14} />
                </button>

                <div className="flex items-center gap-1 px-2" aria-live="polite">
                  <span className="px-2.5 py-1 text-xs font-extrabold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 shadow-2xs">
                    {currentPage}
                  </span>
                  <span className="text-slate-400 text-xs font-medium">/</span>
                  <span className="text-slate-600 dark:text-slate-400 text-xs font-bold">{totalPages}</span>
                </div>

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages || isLoading}
                  aria-label="Next page"
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  <ChevronRight size={14} />
                </button>

                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage >= totalPages || isLoading}
                  aria-label="Last page"
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  <ChevronsRight size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals & Dialogs */}
      <CreateThirdPartyModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />

      <ThirdPartyPreviewModal
        provider={previewProvider}
        isOpen={!!previewProvider}
        onClose={() => setPreviewProvider(null)}
        onEdit={(p) => setSelectedProviderForEdit(p)}
      />

      {selectedProviderForEdit && (
        <EditThirdPartyModal
          isOpen={!!selectedProviderForEdit}
          provider={selectedProviderForEdit}
          onClose={() => setSelectedProviderForEdit(null)}
        />
      )}

      {/* Excel Import Dialog */}
      <ExcelImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        entityLabel="Third-Party Providers"
        columns={THIRD_PARTY_COLUMNS}
        requiredFields={['name']}
        preferSheet="Providers"
        templateUrl="/templates/MERCON_Third_Party_Import_Template.xlsx"
        matchLabel="provider name"
        onImport={(rows: any[]) => thirdPartyService.bulkImport(rows)}
        invalidateKeys={[['third-party-providers']]}
      />

      {/* WhatsApp Share Dialog */}
      {whatsappProvider && (
        <Dialog open={!!whatsappProvider} onOpenChange={(open) => !open && setWhatsappProvider(null)}>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <WhatsAppIcon className="w-4 h-4 text-emerald-600" /> Share Provider via WhatsApp
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Recipient Phone Number</label>
                <Input
                  placeholder="e.g. 966501234567"
                  value={whatsappCustomPhone}
                  onChange={(e) => setWhatsappCustomPhone(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Message Preview</label>
                <textarea
                  value={whatsappMessageText}
                  onChange={(e) => setWhatsappMessageText(e.target.value)}
                  className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-xs h-28 font-mono"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setWhatsappProvider(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleWhatsappSend} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5">
                <WhatsAppIcon className="w-3.5 h-3.5 text-white" /> Send via WhatsApp
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirm Action Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onClose={() => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} })}
        isDestructive={confirmModal.isDestructive}
      />

      {/* ── Universal Export Modal ────────────────────────────────────── */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title="Export 3PL Carriers & Subcontractors"
        description="Choose your export preferences, filters, and columns."
        fileNamePrefix="third_party_providers"
        sheetName="3PL Providers"
        subtitle="MERCON Logistics Third-Party Logistics Partners"
        filteredData={providers}
        allData={providers}
        selectedData={selectedProvidersForExport}
        totalCount={totalRecords}
        columns={THIRD_PARTY_EXPORT_COLUMNS}
        filters={THIRD_PARTY_EXPORT_FILTERS}
        formats={['xlsx', 'csv', 'pdf']}
        rowDateAccessor={(p) => p.createdAt}
      />
    </DashboardLayout>
  );
}
