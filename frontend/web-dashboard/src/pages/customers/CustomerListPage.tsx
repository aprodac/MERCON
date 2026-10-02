import { useState } from 'react';
import { toast } from 'sonner';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Edit2,
  FileText,
  Download,
  Building2,
  Search,
  Eye,
  Trash2,
  ChevronDown,
  Filter,
  List,
  LayoutGrid,
  XCircle,
  X,
  FileSpreadsheet,
  UploadCloud,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowDown,
  ArrowUp,
  Truck,
  MapPinned,
  ReceiptText,
  User,
  Clock,
} from 'lucide-react';
import { CustomerBuilding, TruckMotion, MoneyBills, CalendarAlert } from '@/components/ui/kpi-icons';

import { downloadCSV, exportExcelTable, exportPDFTable } from '@/utils/exportUtils';
import { CUSTOMER_COLUMNS } from '@/utils/importUtils';
import ExcelImportDialog from '@/components/fleet/ExcelImportDialog';
import ExportModal, { ExportColumn, ExportFilter } from '@/components/ui/ExportModal';
import { SortDropdown, SortOption } from '@/components/ui/SortDropdown';
import CustomerPreviewModal from '@/components/customers/CustomerPreviewModal';
import CreateCustomerModal from '@/components/customers/CreateCustomerModal';
import EditCustomerModal from '@/components/customers/EditCustomerModal';
import PhoneDisplay from '@/components/ui/PhoneDisplay';
import DashboardLayout from '@/components/layout/DashboardLayout';
import DataTable from '@/components/ui/DataTable';
import KpiCard from '@/components/ui/KpiCard';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { useModuleEnabled } from '@/components/auth/RequireModule';
import { customerService, Customer, CustomerFilters } from '@/services/customerService';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/fleetLive';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const custRef = (c: Customer) => `CUST-${c.id.slice(0, 5).toUpperCase()}`;
const contactPhone = (c: Customer) => c.primary_contact_phone || c.contact_phone || c.phone || '';
const sar = (v: number) => `SAR ${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const sarCompact = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 10_000 ? `${Math.round(v / 1000)}K` : v.toLocaleString('en-US', { maximumFractionDigits: 0 });

const CUSTOMER_EXPORT_COLUMNS: ExportColumn<Customer>[] = [
  { id: 'name', label: 'Customer Name', accessor: (c) => c.name },
  { id: 'contact_person', label: 'Primary Contact', accessor: (c) => c.primary_contact_person || '—' },
  { id: 'contact_phone', label: 'Contact Phone', accessor: (c) => contactPhone(c) || '—' },
  { id: 'status', label: 'Status', accessor: (c) => (c.isActive !== false ? 'Active' : 'Inactive') },
  { id: 'trips_count', label: 'Total Trips', accessor: (c) => c._count?.trips ?? 0 },
  { id: 'outstanding', label: 'Outstanding (SAR)', accessor: (c) => c.stats?.outstanding ?? 0 },
  { id: 'created_at', label: 'Created Date', accessor: (c) => (c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—') },
];

const CUSTOMER_EXPORT_FILTERS: ExportFilter<Customer>[] = [
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

/** Quick views across the whole customer list (filtered server-side). */
type CustomerView = 'all' | 'active' | 'inactive' | 'live' | 'balance';

const VIEW_FILTERS: Record<CustomerView, Partial<CustomerFilters>> = {
  all: {},
  active: { is_active: true },
  inactive: { is_active: false },
  live: { live: true },
  balance: { has_balance: true },
};

type CustomerSortOption = 'trips' | 'latest' | 'oldest' | 'name_asc' | 'name_desc';

const CUSTOMER_SORT_OPTIONS: SortOption<CustomerSortOption>[] = [
  { value: 'trips', label: 'Most trips', icon: <Truck className="w-3.5 h-3.5 text-brand" /> },
  { value: 'latest', label: 'Newest added', icon: <ArrowDown className="w-3.5 h-3.5 text-blue-600" /> },
  { value: 'oldest', label: 'Oldest added', icon: <ArrowUp className="w-3.5 h-3.5 text-amber-600" /> },
  { value: 'name_asc', label: 'Name (A → Z)', icon: <Building2 className="w-3.5 h-3.5 text-purple-600" /> },
  { value: 'name_desc', label: 'Name (Z → A)', icon: <Building2 className="w-3.5 h-3.5 text-purple-600" /> },
];

const SORT_PARAMS: Record<CustomerSortOption, Pick<CustomerFilters, 'sort_by' | 'sort_dir'>> = {
  trips: { sort_by: 'trips', sort_dir: 'desc' },
  latest: { sort_by: 'createdAt', sort_dir: 'desc' },
  oldest: { sort_by: 'createdAt', sort_dir: 'asc' },
  name_asc: { sort_by: 'name', sort_dir: 'asc' },
  name_desc: { sort_by: 'name', sort_dir: 'desc' },
};

function CustomerLogo({ customer, size = 'md' }: { customer: Customer; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'w-11 h-11 text-base' : 'w-9 h-9 text-sm';
  return customer.logo_url ? (
    <img
      src={customer.logo_url}
      alt=""
      className={cn(box, 'object-contain shrink-0 rounded-lg bg-white border border-slate-200/80 dark:border-slate-700 p-0.5')}
    />
  ) : (
    <div className={cn(box, 'rounded-lg bg-orange-100/80 dark:bg-orange-950/50 border border-orange-200/80 dark:border-orange-900/50 flex items-center justify-center font-extrabold text-brand shrink-0')}>
      {customer.name?.[0]?.toUpperCase() || 'C'}
    </div>
  );
}

function LiveBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      {count} live
    </span>
  );
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={label}
      title={label}
      className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-brand hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors cursor-pointer"
    >
      {children}
    </button>
  );
}

export default function CustomerListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = useDeploymentTimezone();
  const exportsEnabled = useModuleEnabled('company-reports');
  const financeEnabled = useModuleEnabled('finance');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [view, setView] = useState<CustomerView>('all');
  const [sortOrder, setSortOrder] = useState<CustomerSortOption>('trips');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [selectedCustomersForExport, setSelectedCustomersForExport] = useState<Customer[]>([]);
  const [previewCustomer, setPreviewCustomer] = useState<Customer | null>(null);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [isCreateCustomerOpen, setIsCreateCustomerOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const debouncedSearch = useDebouncedValue(search, 300);

  const { data: customersRes, isLoading, isError, error } = useQuery({
    queryKey: ['customers', debouncedSearch, currentPage, pageSize, view, sortOrder],
    queryFn: () => customerService.getAll({
      search: debouncedSearch || undefined,
      page: currentPage,
      per_page: pageSize,
      ...VIEW_FILTERS[view],
      ...SORT_PARAMS[sortOrder],
    }),
    // Keep the previous rows on screen while a new search/page loads.
    placeholderData: keepPreviousData,
  });

  const { data: summary } = useQuery({
    queryKey: ['customers', 'summary'],
    queryFn: () => customerService.getSummary(),
  });

  const customers = customersRes?.data || [];
  const totalPages = customersRes?.meta?.total_pages || 1;
  const totalCount = customersRes?.meta?.total ?? customers.length;

  const changeView = (v: CustomerView) => {
    setView((prev) => (prev === v && v !== 'all' ? 'all' : v));
    setCurrentPage(1);
  };

  const openCustomer = (c: Customer, tab?: string) => navigate(`/customers/${c.id}${tab ? `?tab=${tab}` : ''}`);

  const exportRows = (rows: Customer[]) =>
    rows.map((c) => [
      custRef(c),
      c.name,
      contactPhone(c) || 'N/A',
      c.primary_contact_person || '—',
      c.payment_terms || '—',
      c.isActive ? 'Active' : 'Inactive',
    ]);
  const EXPORT_HEADERS = ['Customer ID', 'Company Name', 'Phone', 'Contact Person', 'Payment Terms', 'Status'];

  const handleExportExcel = async (rows: Customer[]) => {
    await exportExcelTable('MERCON Customer Accounts', EXPORT_HEADERS, exportRows(rows), `customers_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const handleExportPDF = (rows: Customer[]) => {
    exportPDFTable('MERCON Customer Accounts', EXPORT_HEADERS, exportRows(rows), `customers_${new Date().toISOString().slice(0, 10)}.pdf`);
  };
  const handleExportCSV = (rows: Customer[]) => {
    downloadCSV(
      rows.map((c) => ({
        customer_id: custRef(c),
        customer_name: c.name,
        phone: contactPhone(c),
        contact_person: c.primary_contact_person || '',
        payment_terms: c.payment_terms || '',
        status: c.isActive ? 'Active' : 'Inactive',
      })),
      `customers_${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };

  const askDelete = (rows: Customer[]) => {
    setConfirmModal({
      isOpen: true,
      title: rows.length === 1 ? 'Delete customer' : 'Delete selected customers',
      message:
        rows.length === 1
          ? `Delete ${rows[0].name}? Their trips and invoices stay, marked as from a deleted customer.`
          : `Delete ${rows.length} customers? Their trips and invoices stay, marked as from a deleted customer.`,
      onConfirm: async () => {
        try {
          await Promise.all(rows.map((c) => customerService.delete(c.id)));
          queryClient.invalidateQueries({ queryKey: ['customers'] });
          toast.success(rows.length === 1 ? 'Customer deleted' : `${rows.length} customers deleted`);
        } catch {
          toast.error('Failed to delete customer');
        }
      },
    });
  };

  /** Everything you can do with a customer, in one menu (row ⋮ and grid card ⋮). */
  const customerMenu = (c: Customer) => (
    <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
      <DropdownMenuItem onClick={() => openCustomer(c)} className="text-xs font-semibold">
        <Eye size={13} className="mr-2 text-indigo-500" /> Open customer
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setPreviewCustomer(c)} className="text-xs font-semibold">
        <Eye size={13} className="mr-2 text-slate-400" /> Quick preview
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-[10px] font-bold uppercase text-slate-400">Work</DropdownMenuLabel>
      <DropdownMenuItem onClick={() => navigate(`/trips/new?customer_id=${c.id}`)} className="text-xs font-semibold">
        <Plus size={13} className="mr-2 text-brand" /> New trip
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => openCustomer(c, 'trips')} className="text-xs font-semibold">
        <Truck size={13} className="mr-2 text-blue-600" /> Trips
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => openCustomer(c, 'tracking')} className="text-xs font-semibold">
        <MapPinned size={13} className="mr-2 text-emerald-600" /> Tracking link
      </DropdownMenuItem>
      {exportsEnabled && (
        <DropdownMenuItem onClick={() => openCustomer(c, 'exports')} className="text-xs font-semibold">
          <FileSpreadsheet size={13} className="mr-2 text-emerald-700" /> Excel trip sheets
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onClick={() => openCustomer(c, 'financials')} className="text-xs font-semibold">
        <ReceiptText size={13} className="mr-2 text-indigo-600" /> Invoices & balance
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => setEditCustomer(c)} className="text-xs font-semibold">
        <Edit2 size={13} className="mr-2 text-amber-500" /> Quick edit
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => navigate(`/customers/${c.id}/edit`)} className="text-xs font-semibold">
        <Edit2 size={13} className="mr-2 text-amber-600" /> Edit full profile
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => askDelete([c])} className="text-xs font-semibold text-rose-600 focus:text-rose-600 focus:bg-rose-50">
        <Trash2 size={13} className="mr-2 text-rose-500" /> Delete
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  const quickActions = (c: Customer) => (
    <>
      <IconAction label="New trip" onClick={() => navigate(`/trips/new?customer_id=${c.id}`)}>
        <Plus size={15} />
      </IconAction>
      <IconAction label="Tracking link" onClick={() => openCustomer(c, 'tracking')}>
        <MapPinned size={15} />
      </IconAction>
      {exportsEnabled && (
        <IconAction label="Excel trip sheets" onClick={() => openCustomer(c, 'exports')}>
          <FileSpreadsheet size={15} />
        </IconAction>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            aria-label={`More actions for ${c.name}`}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <MoreVertical size={15} />
          </button>
        </DropdownMenuTrigger>
        {customerMenu(c)}
      </DropdownMenu>
    </>
  );

  const columns = [
    {
      header: 'Customer',
      mobilePriority: 'primary' as const,
      accessor: (row: Customer) => (
        <div className="flex items-center gap-3 min-w-0">
          <CustomerLogo customer={row} />
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-slate-900 dark:text-slate-100 text-[13px] truncate max-w-[220px]" title={row.name}>
              {row.name}
            </span>
            <span className="font-mono text-[10.5px] font-semibold text-slate-400">{custRef(row)}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Contact',
      mobilePriority: 'secondary' as const,
      accessor: (row: Customer) => {
        const phone = contactPhone(row);
        return (
          <div className="flex flex-col gap-0.5 min-w-0">
            {row.primary_contact_person ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                {row.primary_contact_person}
              </span>
            ) : (
              <span className="text-xs text-slate-400">No contact person</span>
            )}
            {phone ? <PhoneDisplay phone={phone} showActions variant="inline" /> : null}
          </div>
        );
      },
    },
    {
      header: 'Trips',
      mobilePriority: 'meta' as const,
      accessor: (row: Customer) => (
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-slate-900 dark:text-slate-100 tabular-nums">{row._count?.trips ?? 0}</span>
          <LiveBadge count={row.stats?.live_trips ?? 0} />
        </div>
      ),
    },
    {
      header: 'Last trip',
      mobilePriority: 'hidden' as const,
      accessor: (row: Customer) =>
        row.stats?.last_trip_at ? (
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {formatInDeploymentTz(row.stats.last_trip_at, tz, 'dd MMM yyyy')}
            </span>
            <span className="text-[10.5px] text-slate-400">{timeAgo(row.stats.last_trip_at)}</span>
          </div>
        ) : (
          <span className="text-xs text-slate-400">No trips yet</span>
        ),
    },
    {
      header: 'Outstanding',
      headerClassName: 'text-right',
      className: 'text-right',
      mobilePriority: 'meta' as const,
      accessor: (row: Customer) => {
        const owed = row.stats?.outstanding ?? 0;
        const overdue = row.stats?.overdue ?? 0;
        if (owed <= 0) return <span className="text-xs text-slate-400">—</span>;
        return (
          <div className="flex flex-col items-end">
            <span className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100">{sar(owed)}</span>
            {overdue > 0 && <span className="text-[10.5px] font-semibold text-rose-600 dark:text-rose-400">{sar(overdue)} overdue</span>}
          </div>
        );
      },
    },
    {
      header: 'Status',
      mobilePriority: 'hidden' as const,
      accessor: (row: Customer) => <StatusBadge status={row.isActive ? 'Active' : 'Inactive'} />,
    },
    {
      header: <span className="sr-only">Actions</span>,
      headerClassName: 'text-right',
      accessor: (row: Customer) => (
        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          {quickActions(row)}
        </div>
      ),
    },
  ];

  const viewChips: { id: CustomerView; label: string; count?: number; dot: string }[] = [
    { id: 'all', label: 'All', count: summary?.total, dot: 'bg-slate-400' },
    { id: 'active', label: 'Active', count: summary?.active, dot: 'bg-emerald-500' },
    { id: 'inactive', label: 'Inactive', count: summary?.inactive, dot: 'bg-slate-300' },
    { id: 'live', label: 'On the road', count: summary?.live_customers, dot: 'bg-blue-500' },
    { id: 'balance', label: 'Owe money', count: summary?.outstanding.customers, dot: 'bg-amber-500' },
  ];

  const filterBar = (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200/80 dark:border-slate-700 overflow-x-auto max-w-full" role="tablist" aria-label="Customer views">
        {viewChips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={view === chip.id}
            onClick={() => changeView(chip.id)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-all cursor-pointer',
              view === chip.id
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100',
            )}
          >
            <span className={cn('w-1.5 h-1.5 rounded-full', chip.dot)} />
            {chip.label}
            {chip.count !== undefined && <span className="text-[10.5px] font-bold text-slate-400 tabular-nums">{chip.count}</span>}
          </button>
        ))}
      </div>

      <SortDropdown value={sortOrder} onChange={(v) => { setSortOrder(v); setCurrentPage(1); }} options={CUSTOMER_SORT_OPTIONS} />

      <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200/80 dark:border-slate-700">
        {([['list', List, 'List view'], ['grid', LayoutGrid, 'Card view']] as const).map(([mode, Icon, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={cn(
              'p-1.5 rounded-md transition-all cursor-pointer',
              viewMode === mode ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100',
            )}
            title={label}
            aria-label={label}
            aria-pressed={viewMode === mode}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
    </div>
  );

  const bulkActions = [
    {
      label: 'Export',
      icon: <Download size={13} />,
      variant: 'secondary' as const,
      onClick: (rows: Customer[]) => {
        setSelectedCustomersForExport(rows);
        setIsExportOpen(true);
      },
    },
    {
      label: 'Delete Selected',
      icon: <Trash2 size={13} />,
      variant: 'danger' as const,
      onClick: (rows: Customer[]) => askDelete(rows),
    },
  ];

  const headerActions = (
    <div className="flex items-center gap-2 shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-semibold border-slate-200 bg-white hover:bg-slate-50 shadow-2xs dark:bg-slate-900 dark:border-slate-800">
            <Download className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
            Export / Import
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 p-1.5 rounded-xl">
          <DropdownMenuLabel className="text-[10px] font-bold tracking-wider uppercase text-slate-400 px-2 py-1">Export this page</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => handleExportExcel(customers)} className="cursor-pointer text-xs font-semibold">
            <FileSpreadsheet className="mr-2 h-3.5 w-3.5 text-emerald-600" /> Excel (.xlsx)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportPDF(customers)} className="cursor-pointer text-xs font-semibold">
            <FileText className="mr-2 h-3.5 w-3.5 text-rose-600" /> PDF (.pdf)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportCSV(customers)} className="cursor-pointer text-xs font-semibold">
            <FileText className="mr-2 h-3.5 w-3.5 text-slate-500" /> CSV (.csv)
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => { setSelectedCustomersForExport([]); setIsExportOpen(true); }}
            className="cursor-pointer text-xs font-medium text-brand"
          >
            <Filter className="mr-2 h-3.5 w-3.5 text-brand" /> Custom export…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] font-bold tracking-wider uppercase text-slate-400 px-2 py-1">Import</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setImportDialogOpen(true)} className="cursor-pointer text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <UploadCloud className="mr-2 h-3.5 w-3.5" /> Import from Excel
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button size="sm" className="h-8 gap-1.5 text-xs font-bold bg-brand hover:bg-brand/90 text-white shadow-xs rounded-md px-3.5" onClick={() => setIsCreateCustomerOpen(true)}>
        <Plus className="h-4 w-4" />
        Add Customer
      </Button>
    </div>
  );

  const gridFromIndex = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const gridToIndex = totalCount === 0 ? 0 : gridFromIndex + customers.length - 1;
  const pagerButton = 'p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs';

  const emptyText =
    view === 'live' ? 'No customer has a truck on the road right now.'
      : view === 'balance' ? 'No customer owes money on issued invoices.'
        : debouncedSearch ? `No customers match "${debouncedSearch}".`
          : 'No customers match this view.';

  return (
    <DashboardLayout active="Customers" title="Customers">
      <div className="px-4 sm:px-6 pb-6 w-full flex flex-col animate-fade-in gap-5">

        {/* ── KPI cards: real figures from GET /customers/summary; each one opens its view ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 shrink-0">
          <KpiCard
            title="CUSTOMERS"
            className="kpi-tint-customers"
            value={
              <span>
                {summary?.total ?? '—'}
                <span className="text-[16px] font-semibold ml-1.5 opacity-85">Accounts</span>
              </span>
            }
            variant="slate"
            trend={summary && summary.new_this_month > 0 ? 'up' : 'neutral'}
            trendValue={summary ? `${summary.new_this_month} new this month` : undefined}
            description={summary ? `${summary.active} active · ${summary.inactive} inactive` : 'Loading…'}
            icon={CustomerBuilding}
            isActive={view === 'all'}
            onClick={() => changeView('all')}
          />
          <KpiCard
            title="ON THE ROAD NOW"
            className="kpi-tint-customers"
            value={
              <span>
                {summary?.live_customers ?? '—'}
                <span className="text-[16px] font-semibold ml-1.5 opacity-85">Customers</span>
              </span>
            }
            variant="blue"
            trend="neutral"
            trendValue={summary ? `${summary.live_trips} truck${summary.live_trips === 1 ? '' : 's'} loading or moving` : undefined}
            description="Click to see who"
            icon={TruckMotion}
            isActive={view === 'live'}
            onClick={() => changeView('live')}
          />
          <KpiCard
            title="OUTSTANDING"
            className="kpi-tint-customers"
            value={
              <span>
                <span className="text-[16px] font-semibold mr-1 opacity-85">SAR</span>
                {summary ? sarCompact(summary.outstanding.amount) : '—'}
              </span>
            }
            variant="amber"
            trend="neutral"
            trendValue={summary ? `${summary.outstanding.customers} customer${summary.outstanding.customers === 1 ? '' : 's'} owe` : undefined}
            description="Issued invoices not yet paid"
            icon={MoneyBills}
            isActive={view === 'balance'}
            onClick={() => changeView('balance')}
          />
          <KpiCard
            title="OVERDUE"
            className="kpi-tint-customers"
            value={
              <span>
                <span className="text-[16px] font-semibold mr-1 opacity-85">SAR</span>
                {summary ? sarCompact(summary.overdue.amount) : '—'}
              </span>
            }
            variant="rose"
            trend={summary && summary.overdue.amount > 0 ? 'down' : 'neutral'}
            trendValue={summary ? `${summary.overdue.customers} customer${summary.overdue.customers === 1 ? '' : 's'} past due` : undefined}
            description={financeEnabled ? 'Open overdue invoices' : 'Past the invoice due date'}
            icon={CalendarAlert}
            onClick={financeEnabled ? () => navigate('/finance/invoices?tab=overdue') : undefined}
          />
        </div>

        {viewMode === 'list' ? (
          <DataTable
            title={
              <span className="flex items-center gap-2 text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight">
                <Building2 className="w-5 h-5 text-indigo-600" />
                <span>Customers</span>
              </span>
            }
            columns={columns}
            data={customers}
            bulkActions={bulkActions}
            enableSelection={true}
            compact={true}
            isLoading={isLoading}
            isError={isError}
            errorMessage={(error as Error)?.message || 'Failed to load customers.'}
            emptyTitle="No customers"
            emptyMessage={emptyText}
            searchPlaceholder="Search name or phone…"
            searchValue={search}
            onSearchChange={(val) => { setSearch(val); setCurrentPage(1); }}
            filterElement={filterBar}
            actionsElement={headerActions}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
            totalRecords={totalCount}
            onPageChange={setCurrentPage}
            onRowClick={(row) => openCustomer(row)}
          />
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col w-full animate-fade-in">
            <div className="shrink-0 p-3 sm:p-4 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-col gap-3">
              <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 w-full">
                <div className="relative w-full sm:w-72 lg:w-88 shrink-0">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Search name or phone…"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                    className="w-full pl-8.5 pr-8 h-9 text-xs bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 rounded-md font-medium"
                    aria-label="Search customers"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5" aria-label="Clear search">
                      <X size={12} />
                    </button>
                  )}
                </div>
                {headerActions}
              </div>
              {filterBar}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4 sm:p-5">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <div key={i} className="rounded-xl border border-slate-100 h-[188px] skeleton" />)
              ) : isError ? (
                <div className="col-span-full py-16 flex flex-col items-center justify-center gap-1">
                  <XCircle className="w-8 h-8 text-rose-500" />
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Data unavailable</p>
                  <p className="text-xs text-slate-500">{(error as Error)?.message || 'Failed to load customers.'}</p>
                </div>
              ) : customers.length === 0 ? (
                <div className="col-span-full py-16 flex flex-col items-center justify-center gap-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">No customers</p>
                  <p className="text-xs text-slate-500">{emptyText}</p>
                </div>
              ) : customers.map((c) => {
                const phone = contactPhone(c);
                const owed = c.stats?.outstanding ?? 0;
                const overdue = c.stats?.overdue ?? 0;
                return (
                  <div
                    key={c.id}
                    className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col hover:border-brand/40 hover:shadow-xs transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                    tabIndex={0}
                    role="button"
                    aria-label={`Open ${c.name}`}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCustomer(c); }
                    }}
                    onClick={() => openCustomer(c)}
                  >
                    <div className="p-4 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <CustomerLogo customer={c} size="lg" />
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-slate-900 dark:text-slate-50 text-sm truncate" title={c.name}>{c.name}</span>
                          <span className="font-mono text-[10.5px] font-semibold text-slate-400">{custRef(c)}</span>
                        </div>
                      </div>
                      <StatusBadge status={c.isActive ? 'Active' : 'Inactive'} />
                    </div>

                    <div className="px-4 pb-3 flex flex-col gap-1 min-h-[40px]" onClick={(e) => e.stopPropagation()}>
                      {c.primary_contact_person && (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" /> {c.primary_contact_person}
                        </span>
                      )}
                      {phone ? <PhoneDisplay phone={phone} showActions variant="inline" /> : <span className="text-xs text-slate-400">No phone</span>}
                    </div>

                    <div className="grid grid-cols-3 border-y border-slate-100 dark:border-slate-800 text-center">
                      <div className="py-2.5 flex flex-col items-center gap-0.5">
                        <span className="text-sm font-black text-slate-900 dark:text-slate-100 tabular-nums">{c._count?.trips ?? 0}</span>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Trips</span>
                      </div>
                      <div className="py-2.5 flex flex-col items-center gap-0.5 border-x border-slate-100 dark:border-slate-800">
                        <span className={cn('text-sm font-black tabular-nums', (c.stats?.live_trips ?? 0) > 0 ? 'text-emerald-600' : 'text-slate-900 dark:text-slate-100')}>
                          {c.stats?.live_trips ?? 0}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Live</span>
                      </div>
                      <div className="py-2.5 flex flex-col items-center gap-0.5" title={overdue > 0 ? `${sar(overdue)} overdue` : undefined}>
                        <span className={cn('text-sm font-black tabular-nums', overdue > 0 ? 'text-rose-600' : 'text-slate-900 dark:text-slate-100')}>
                          {owed > 0 ? sarCompact(owed) : '—'}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Owes (SAR)</span>
                      </div>
                    </div>

                    <div className="px-3 py-2 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1 text-[10.5px] text-slate-400 truncate">
                        <Clock className="w-3 h-3 shrink-0" />
                        {c.stats?.last_trip_at ? `Last trip ${timeAgo(c.stats.last_trip_at)}` : 'No trips yet'}
                      </span>
                      <div className="flex items-center" onClick={(e) => e.stopPropagation()}>{quickActions(c)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="shrink-0 p-3 sm:px-5 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/60 text-xs font-semibold text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-slate-500 font-medium">Rows:</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                  className="h-8 px-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-bold cursor-pointer"
                  aria-label="Rows per page"
                >
                  {[10, 25, 50, 100].map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                <span className="text-slate-500 font-medium hidden sm:inline">
                  {gridFromIndex}–{gridToIndex} of {totalCount}
                </span>
              </div>
              <div className="flex items-center gap-1.5 ml-auto" role="navigation" aria-label="Pagination">
                <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1 || isLoading} aria-label="First page" className={pagerButton}><ChevronsLeft size={14} /></button>
                <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1 || isLoading} aria-label="Previous page" className={pagerButton}><ChevronLeft size={14} /></button>
                <span className="px-2 text-xs" aria-live="polite">{currentPage} / {totalPages}</span>
                <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages || isLoading} aria-label="Next page" className={pagerButton}><ChevronRight size={14} /></button>
                <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages || isLoading} aria-label="Last page" className={pagerButton}><ChevronsRight size={14} /></button>
              </div>
            </div>
          </div>
        )}

        <ConfirmModal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
          onConfirm={async () => {
            await confirmModal.onConfirm();
            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          }}
          title={confirmModal.title}
          message={confirmModal.message}
          isDestructive={true}
        />

        <ExcelImportDialog
          isOpen={importDialogOpen}
          onClose={() => setImportDialogOpen(false)}
          entityLabel="Customers"
          columns={CUSTOMER_COLUMNS}
          requiredFields={['name', 'contact_phone']}
          preferSheet="customer"
          templateUrl="/templates/MERCON_Customers_Import_Template.xlsx"
          onImport={(rows) => customerService.importRows(rows)}
          invalidateKeys={[['customers']]}
        />

        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          title="Export customers"
          description="Choose your export preferences, filters, and columns."
          fileNamePrefix="customers"
          sheetName="Customers"
          subtitle="MERCON Logistics Customer Accounts"
          filteredData={customers}
          allData={customers}
          selectedData={selectedCustomersForExport}
          totalCount={totalCount}
          columns={CUSTOMER_EXPORT_COLUMNS}
          filters={CUSTOMER_EXPORT_FILTERS}
          rowDateAccessor={(c) => c.createdAt}
        />

        <CustomerPreviewModal
          customer={previewCustomer}
          isOpen={!!previewCustomer}
          onClose={() => setPreviewCustomer(null)}
          onCreateTrip={(c) => navigate(`/trips/new?customer_id=${c.id}`)}
          onEdit={(c) => setEditCustomer(c)}
        />

        <EditCustomerModal customer={editCustomer} isOpen={!!editCustomer} onClose={() => setEditCustomer(null)} />

        <CreateCustomerModal isOpen={isCreateCustomerOpen} onClose={() => setIsCreateCustomerOpen(false)} />
      </div>
    </DashboardLayout>
  );
}
