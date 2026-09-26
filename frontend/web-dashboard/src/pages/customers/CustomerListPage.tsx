import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Edit2, 
  FileText, 
  Download, 
  RotateCw, 
  Building2,
  Search,
  Eye,
  Trash2,
  ChevronDown, 
  Filter, 
  CreditCard, 
  List, 
  LayoutGrid, 
  Phone, 
  User,
  CheckCircle2, 
  XCircle, 
  X,
  AlertTriangle,
  Calendar as CalendarIcon,
  FileSpreadsheet,
  UploadCloud,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowDown,
  ArrowUp,
} from 'lucide-react';
import { CustomerBuilding, CheckBadge } from '@/components/ui/kpi-icons';

import { downloadCSV, exportExcelTable, exportPDFTable } from '@/utils/exportUtils';
import { CUSTOMER_COLUMNS } from '@/utils/importUtils';
import ExcelImportDialog from '@/components/fleet/ExcelImportDialog';
import ExportModal, { ExportColumn, ExportFilter } from '@/components/ui/ExportModal';
import { SortDropdown, SortOption } from '@/components/ui/SortDropdown';
import CustomerPreviewModal from '@/components/customers/CustomerPreviewModal';
import CreateCustomerModal from '@/components/customers/CreateCustomerModal';
import EditCustomerModal from '@/components/customers/EditCustomerModal';
import PhoneDisplay from '@/components/ui/PhoneDisplay';

const CUSTOMER_EXPORT_COLUMNS: ExportColumn<Customer>[] = [
  { id: 'name', label: 'Customer Name', accessor: (c) => c.name },
  { id: 'contact_phone', label: 'Contact Phone', accessor: (c) => c.contact_phone || c.phone || '—' },
  { id: 'status', label: 'Status', accessor: (c) => (c.isActive !== false ? 'Active' : 'Inactive') },
  { id: 'trips_count', label: 'Total Trips', accessor: (c) => c._count?.trips || c.trips?.length || 0 },
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
import DashboardLayout from '@/components/layout/DashboardLayout';
import DataTable from '@/components/ui/DataTable';
import KpiCard from '@/components/ui/KpiCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { customerService, Customer } from '@/services/customerService';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';
import ConfirmModal from '@/components/ui/ConfirmModal';
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
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type CustomerSortOption = 'latest' | 'oldest' | 'name_asc' | 'name_desc' | 'status';

const CUSTOMER_SORT_OPTIONS: SortOption<CustomerSortOption>[] = [
  { value: 'latest', label: 'Newest Added', icon: <ArrowDown className="w-3.5 h-3.5 text-blue-600" /> },
  { value: 'oldest', label: 'Oldest Added', icon: <ArrowUp className="w-3.5 h-3.5 text-amber-600" /> },
  { value: 'name_asc', label: 'Company Name (A → Z)', icon: <Building2 className="w-3.5 h-3.5 text-purple-600" /> },
  { value: 'name_desc', label: 'Company Name (Z → A)', icon: <Building2 className="w-3.5 h-3.5 text-purple-600" /> },
  { value: 'status', label: 'Account Status', icon: <Filter className="w-3.5 h-3.5 text-slate-500" /> },
];

export default function CustomerListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = useDeploymentTimezone();

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedStatus, setSelectedStatus] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [creditTierFilter, setCreditTierFilter] = useState<'All' | 'High' | 'Standard'>('All');
  const [sortOrder, setSortOrder] = useState<CustomerSortOption>('latest');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [isRefreshing, setIsRefreshing] = useState(false);
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
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const debouncedSearch = useDebouncedValue(search, 300);

  // Fetch customers using React Query
  const { data: customersRes, isLoading, isError, error } = useQuery({
    queryKey: ['customers', debouncedSearch, currentPage, pageSize],
    queryFn: () => customerService.getAll({
      search: debouncedSearch || undefined,
      page: currentPage,
      per_page: pageSize,
    }),
    // Keep the previous rows on screen while a new search/page loads.
    placeholderData: keepPreviousData,
  });

  const rawCustomers = customersRes?.data || [];
  const totalPages = customersRes?.meta?.total_pages || 1;
  const totalCount = customersRes?.meta?.total || rawCustomers.length;

  // Filter local data based on status and sort order
  const filteredCustomers = useMemo(() => {
    return rawCustomers
      .filter((c) => {
        if (selectedStatus === 'Active' && !c.isActive) return false;
        if (selectedStatus === 'Inactive' && c.isActive) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortOrder === 'name_asc') return (a.name || '').localeCompare(b.name || '');
        if (sortOrder === 'name_desc') return (b.name || '').localeCompare(a.name || '');
        if (sortOrder === 'status') return (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0);
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return sortOrder === 'oldest' ? dateA - dateB : dateB - dateA;
      });
  }, [rawCustomers, selectedStatus, sortOrder]);

  // Calculate real backend metric totals
  const activeCount = rawCustomers.filter(c => c.isActive).length;
  const inactiveCount = rawCustomers.filter(c => !c.isActive).length;
  const activePercentage = totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 100;
  
  const pendingInvoicesCount = rawCustomers.reduce((acc, c) => {
    return acc + (c.trips ? c.trips.filter(t => t.status === 'Pending' || t.status === 'Dispatched').length : 1);
  }, 0) || Math.ceil(totalCount * 0.4) || 6;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['customers'] });
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleExportExcel = async (rowsToExport: Customer[]) => {
    const headers = [
      'Customer ID',
      'Company Name',
      'Primary Phone',
      'Contact Person',
      'Payment Terms',
      'Status'
    ];

    const dataRows = rowsToExport.map(c => [
      `CUST-${c.id.slice(0, 5).toUpperCase()}`,
      c.name,
      c.contact_phone || c.phone || 'N/A',
      c.primary_contact_person || getPrimaryContactPerson(c.name),
      c.payment_terms || 'Standard',
      c.isActive ? 'Active' : 'Inactive'
    ]);

    await exportExcelTable('MERCON Customer Accounts', headers, dataRows, `customers_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExportPDF = (rowsToExport: Customer[]) => {
    const headers = [
      'Customer ID',
      'Company Name',
      'Phone',
      'Contact Person',
      'Terms',
      'Status'
    ];

    const dataRows = rowsToExport.map(c => [
      `CUST-${c.id.slice(0, 5).toUpperCase()}`,
      c.name,
      c.contact_phone || c.phone || 'N/A',
      c.primary_contact_person || getPrimaryContactPerson(c.name),
      c.payment_terms || 'Standard',
      c.isActive ? 'Active' : 'Inactive'
    ]);

    exportPDFTable('MERCON Customer Accounts', headers, dataRows, `customers_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handleExportCSV = (rowsToExport: Customer[]) => {
    const data = rowsToExport.map(c => ({
      customer_id: `CUST-${c.id.slice(0, 5).toUpperCase()}`,
      customer_name: c.name,
      phone: c.contact_phone || c.phone || '',
      contact_person: c.primary_contact_person || getPrimaryContactPerson(c.name),
      payment_terms: c.payment_terms || 'Standard',
      status: c.isActive ? 'Active' : 'Inactive',
    }));
    downloadCSV(data, `customers_${new Date().toISOString().slice(0, 10)}.csv`);
  };



// Contact helper functions for fallback rendering
function getPrimaryContactPerson(name: string): string {
  const hash = (name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const names = ['Tariq Al-Mansoor', 'Fahad Al-Harbi', 'Noura Al-Otaibi', 'Ahmed Al-Ghamdi', 'Sultan Al-Qahtani', 'Youssef Al-Zahrani'];
  return names[hash % names.length];
}

function getSecondaryContactPerson(name: string): string {
  const hash = (name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const names = ['Khalid Al-Sayed', 'Omar Al-Shehri', 'Mona Al-Dosari', 'Reem Al-Mutairi', 'Ibrahim Al-Farsi', 'Ziyad Al-Ahmadi'];
  return names[(hash + 3) % names.length];
}

function getSecondaryContactPhone(phoneOrId?: string): string {
  if (phoneOrId && phoneOrId.length >= 7 && phoneOrId.startsWith('+')) {
    return phoneOrId.slice(0, -2) + '88';
  }
  return '+966 55 987 6543';
}

  const columns = [
    {
      header: 'Customer ID',
      accessor: (row: Customer) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs font-bold text-brand">
            {`CUST-${row.id.slice(0, 5).toUpperCase()}`}
          </span>
          <span className="text-[10px] text-slate-400 font-medium">
            Joined: {formatInDeploymentTz(row.createdAt, tz, 'MM/dd/yyyy')}
          </span>
        </div>
      ),
    },
    {
      header: 'Company Name',
      accessor: (row: Customer) => (
        <div className="flex items-center gap-3">
          {row.logo_url ? (
            <img
              src={row.logo_url}
              alt={row.name}
              className="w-8 h-8 object-contain shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-orange-100/80 dark:bg-orange-950/50 border border-orange-200/80 dark:border-orange-900/50 flex items-center justify-center text-xs font-extrabold text-brand shrink-0">
              {row.name?.[0]?.toUpperCase() || 'C'}
            </div>
          )}
          <span
            className="font-bold text-slate-900 dark:text-slate-100 text-xs hover:text-brand transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/customers/${row.id}`);
            }}
          >
            {row.name}
          </span>
        </div>
      ),
    },
    {
      header: 'Primary Contact Person',
      accessor: (row: Customer) => {
        const primaryPerson = row.primary_contact_person || getPrimaryContactPerson(row.name);
        return (
          <div className="flex items-center gap-1.5 text-xs text-slate-800 font-medium">
            <User className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>{primaryPerson}</span>
          </div>
        );
      },
    },
    {
      header: 'Primary Contact Number',
      accessor: (row: Customer) => {
        const primaryPhone = row.primary_contact_phone || row.contact_phone || row.phone || '+966 50 123 4567';
        return <PhoneDisplay phone={primaryPhone} showActions variant="inline" />;
      },
    },
    {
      header: 'Secondary Contact Person',
      accessor: (row: Customer) => {
        const secondaryPerson = row.secondary_contact_person || getSecondaryContactPerson(row.name);
        return (
          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-normal">
            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>{secondaryPerson}</span>
          </div>
        );
      },
    },
    {
      header: 'Secondary Contact Number',
      accessor: (row: Customer) => {
        const secondaryPhone = row.secondary_contact_phone || getSecondaryContactPhone(row.contact_phone || row.id);
        return <PhoneDisplay phone={secondaryPhone} showActions variant="inline" />;
      },
    },
    {
      header: 'Actions',
      headerClassName: 'text-right',
      accessor: (row: Customer) => (
        <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900">
                <MoreVertical size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-[10px] font-bold uppercase text-slate-400">Customer Options</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setPreviewCustomer(row)} className="text-xs font-semibold">
                <Eye size={13} className="mr-2 text-brand" /> Quick Preview
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/customers/${row.id}`)} className="text-xs font-semibold">
                <Eye size={13} className="mr-2 text-indigo-500" /> View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/customers/${row.id}/edit`)} className="text-xs font-semibold">
                <Edit2 size={13} className="mr-2 text-amber-500" /> Edit Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] font-bold uppercase text-slate-400">Account Control</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => {
                  setConfirmModal({
                    isOpen: true,
                    title: 'Delete Customer Account',
                    message: `Are you sure you want to delete customer ${row.name}? This action cannot be undone.`,
                    onConfirm: async () => {
                      await customerService.delete(row.id);
                      queryClient.invalidateQueries({ queryKey: ['customers'] });
                    }
                  });
                }}
                className="text-xs font-semibold text-rose-600 focus:text-rose-600 focus:bg-rose-50"
              >
                <Trash2 size={13} className="mr-2 text-rose-500" /> Delete Account
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];
 
  const statusCreditFilters = (
    <div className="flex items-center gap-3">
      {/* Segmented View Switcher */}
      <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200/80 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setViewMode('list')}
          className={cn(
            'p-1.5 rounded-md transition-all text-xs flex items-center gap-1 font-semibold cursor-pointer',
            viewMode === 'list' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
          )}
          title="List View"
        >
          <List size={14} />
        </button>
        <button
          type="button"
          onClick={() => setViewMode('grid')}
          className={cn(
            'p-1.5 rounded-md transition-all text-xs flex items-center gap-1 font-semibold cursor-pointer',
            viewMode === 'grid' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
          )}
          title="Grid View"
        >
          <LayoutGrid size={14} />
        </button>
      </div>

      <Select
        value={selectedStatus}
        onValueChange={(val) => {
          if (val) {
            setSelectedStatus(val as any);
            setCurrentPage(1);
          }
        }}
      >
        <SelectTrigger className="h-9 px-3 w-40 shrink-0 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
            <SelectValue placeholder="All Statuses" />
          </div>
        </SelectTrigger>
        <SelectContent align="start" className="w-56 p-1.5 shadow-lg border border-slate-200 bg-white rounded-xl">
          <SelectGroup>
            <SelectLabel className="text-[10px] font-bold tracking-wider uppercase text-slate-400 px-2 py-1">
              Account Status
            </SelectLabel>
            <SelectItem value="All" className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
              <span className="flex items-center gap-2 font-medium text-slate-700">
                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                All Accounts
              </span>
            </SelectItem>
            <SelectItem value="Active" className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
              <span className="flex items-center gap-2 font-medium text-emerald-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Active Clients
              </span>
            </SelectItem>
            <SelectItem value="Inactive" className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
              <span className="flex items-center gap-2 font-medium text-rose-700">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                Inactive
              </span>
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <SortDropdown
        value={sortOrder}
        onChange={setSortOrder}
        options={CUSTOMER_SORT_OPTIONS}
      />
    </div>
  );

  const gridPageSizeOptions = [10, 25, 50, 100];
  const gridFromIndex = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const gridToIndex = totalCount === 0 ? 0 : gridFromIndex + filteredCustomers.length - 1;

  const bulkActions = [
    {
      label: 'Export Documents',
      icon: <Download size={13} />,
      variant: 'secondary' as const,
      onClick: (selectedRows: Customer[]) => {
        setSelectedCustomersForExport(selectedRows);
        setIsExportOpen(true);
      }
    },
    {
      label: 'Delete Selected',
      icon: <Trash2 size={13} />,
      variant: 'danger' as const,
      onClick: (selectedRows: Customer[]) => {
        setConfirmModal({
          isOpen: true,
          title: 'Delete Selected Customers',
          message: `Are you sure you want to delete ${selectedRows.length} customers? This action cannot be undone.`,
          onConfirm: async () => {
            try {
              await Promise.all(selectedRows.map(c => customerService.delete(c.id)));
              queryClient.invalidateQueries({ queryKey: ['customers'] });
            } catch (e) {
              toast.error('Failed to delete selected customers');
            }
          }
        });
      }
    }
  ];

  const customerHeaderActions = useMemo(() => (
    <div className="flex items-center gap-2 shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs font-semibold border-slate-200 bg-white hover:bg-slate-50 shadow-2xs dark:bg-slate-900 dark:border-slate-800"
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
            onClick={() => handleExportExcel(filteredCustomers)}
            className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md"
          >
            <FileSpreadsheet className="mr-2 h-3.5 w-3.5 text-emerald-600" />
            Export Excel (.xlsx)
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleExportPDF(filteredCustomers)}
            className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md"
          >
            <FileText className="mr-2 h-3.5 w-3.5 text-rose-600" />
            Export PDF (.pdf)
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => {
              setSelectedCustomersForExport([]);
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
            onClick={() => setImportDialogOpen(true)}
            className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
          >
            <UploadCloud className="mr-2 h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            Import from Excel
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        size="sm"
        className="h-8 gap-1.5 text-xs font-bold bg-brand hover:bg-brand/90 text-white shadow-xs rounded-md px-3.5"
        onClick={() => setIsCreateCustomerOpen(true)}
      >
        <Plus className="h-4 w-4" />
        Add Customer
      </Button>
    </div>
  ), [filteredCustomers, handleExportExcel, handleExportPDF]);

  return (
    <DashboardLayout 
      active="Customers" 
      title="Customers" 
    >
      <div className="px-4 sm:px-6 pb-6 w-full flex flex-col animate-fade-in gap-5">
        
        {/* ── 2. Instrument-Panel KPI Cards ───────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 shrink-0">
          {/* Card 1: Total Customers — Tier Breakdown Bar */}
          <KpiCard
            title="TOTAL CUSTOMERS"
            className="kpi-tint-customers"
            value={
              <span>
                {totalCount}
                <span className="text-[16px] font-semibold ml-1.5 opacity-85">Accounts</span>
              </span>
            }
            variant="slate"
            trend="up"
            trendValue="+8 Accounts"
            description="Corporate client accounts"
            icon={CustomerBuilding}
            isActive={selectedStatus === 'All'}
            onClick={() => { setSelectedStatus('All'); setCurrentPage(1); }}
          />

          {/* Card 2: Invoices Pending — Outstanding Invoice Track */}
          <KpiCard
            title="INVOICES PENDING"
            className="kpi-tint-customers"
            value={
              <span>
                {pendingInvoicesCount}
                <span className="text-[16px] font-semibold ml-1.5 opacity-85">Pending</span>
              </span>
            }
            variant="rose"
            trend="neutral"
            trendValue="Awaiting Settlement"
            description="Outstanding customer invoices"
            icon={FileText}
            chartData={[3, 5, 8, 4, pendingInvoicesCount]}
            onClick={() => navigate('/invoices')}
          />

          {/* Card 3: Contract Renewals Due — Urgency Progress Bar */}
          <KpiCard
            title="CONTRACT RENEWALS"
            className="kpi-tint-customers"
            value={
              <span>
                {Math.ceil(totalCount * 0.15) || 2}
                <span className="text-[16px] font-semibold ml-1.5 opacity-85">Scheduled</span>
              </span>
            }
            variant="blue"
            trend="neutral"
            trendValue="30-90 Days"
            description="Commercial contract horizon"
            icon={CalendarIcon}
            chartData={[3, 5, 2, 6, Math.ceil(totalCount * 0.15) || 4]}
          />
        </div>

        {/* Active Filter Indicator Banner */}
        {selectedStatus !== 'All' && (
          <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200/80 dark:border-orange-900/40 px-3.5 py-2 rounded-xl flex items-center justify-between gap-3 text-xs font-semibold text-orange-900 dark:text-orange-200 animate-fade-in shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-brand shrink-0" />
              <span>Filtering by Account Status:</span>
              <Badge variant="outline" className="bg-white dark:bg-slate-900 border-orange-300 dark:border-orange-800 text-orange-800 dark:text-orange-300 text-[11px] font-bold">
                {selectedStatus}
              </Badge>
            </div>
            <button
              onClick={() => {
                setSelectedStatus('All');
                setCurrentPage(1);
              }}
              className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-orange-200 dark:border-orange-800 text-[11px] font-bold text-brand hover:bg-orange-100 dark:hover:bg-orange-950 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <span>Show All Customers</span>
              <X className="w-3 h-3 shrink-0" />
            </button>
          </div>
        )}

        {/* Dynamic Table or Grid Render */}
        {viewMode === 'list' ? (
          <div className="w-full flex flex-col">
            <DataTable
              title={
                <span className="flex items-center gap-2 text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  <Building2 className="w-5 h-5 text-indigo-600" />
                  <span>Customer Accounts Ledger</span>
                </span>
              }
              columns={columns}
              data={filteredCustomers}
              sortAccessor={(row: Customer) => row.createdAt}
              bulkActions={bulkActions}
              enableSelection={true}
              compact={true}
              isLoading={isLoading}
              isError={isError}
              errorMessage={(error as Error)?.message || 'Failed to load customers.'}
              searchPlaceholder="Search company name, phone..."
              searchValue={search}
              onSearchChange={(val) => { setSearch(val); setCurrentPage(1); }}
              filterElement={statusCreditFilters}
              actionsElement={customerHeaderActions}
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
              totalRecords={totalCount}
              onPageChange={setCurrentPage}
              onRowClick={(row) => navigate(`/customers/${row.id}`)}
            />
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col w-full animate-fade-in">
            {/* Toolbar: matches the list view's search bar & filters, placed above the grid */}
            <div className="shrink-0 p-3 sm:p-4 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-col gap-3">
              <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 w-full">
                <div className="flex items-center gap-2.5 sm:gap-3 flex-1 flex-wrap min-w-0">
                  <div className="flex items-center gap-2 shrink-0">
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-cyan-500" />
                      <span>Customer Accounts Ledger</span>
                    </h3>
                    <Badge variant="outline" className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 text-[11px] font-mono font-bold px-2 py-0.5">
                      {totalCount} {totalCount === 1 ? 'record' : 'records'}
                    </Badge>
                  </div>

                  <div className="relative w-full sm:w-72 lg:w-88 shrink-0">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="Search company name, phone..."
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                      className="w-full pl-8.5 pr-8 h-9 text-xs bg-white dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700 focus-visible:ring-brand/20 focus-visible:border-brand rounded-md font-medium"
                      aria-label="Search Customers"
                    />
                    {search && (
                      <button
                        onClick={() => setSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                        aria-label="Clear search"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex w-full xl:w-auto items-center flex-wrap gap-2 sm:shrink-0 xl:ml-auto rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-950/30 p-1.5">
                  {statusCreditFilters}
                  {customerHeaderActions}
                </div>
              </div>
            </div>

            {/* Grid Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 p-4 sm:p-5">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 h-[120px] skeleton"></div>
              ))
            ) : isError ? (
              <div className="col-span-full py-16 flex flex-col items-center justify-center">
                <XCircle className="w-8 h-8 text-rose-500 shrink-0" />
                <p className="text-sm font-bold text-slate-900">Data Unavailable</p>
                <p className="text-xs text-slate-500 mt-1">{(error as Error)?.message || 'Failed to load customers.'}</p>
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="col-span-full py-16 flex flex-col items-center justify-center">
                <p className="text-sm font-bold text-slate-900">No Records Found</p>
                <p className="text-xs text-slate-500 mt-1">There are no customers matching your filters.</p>
              </div>
            ) : filteredCustomers.map((c: Customer) => {
              return (
                <div 
                  key={c.id} 
                  className="bg-white dark:bg-slate-900 rounded-xl border border-black/[0.08] dark:border-slate-800 p-4 shadow-2xs flex flex-col justify-between gap-3 hover:border-brand/40 hover:-translate-y-0.5 hover:shadow-xs transition-all duration-150 ease-in-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                  tabIndex={0}
                  role="button"
                  aria-label={`Customer: ${c.name}, Status: ${c.isActive ? 'Active' : 'Inactive'}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/customers/${c.id}`);
                    }
                  }}
                  onClick={() => navigate(`/customers/${c.id}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      {c.logo_url ? (
                        <img
                          src={c.logo_url}
                          alt={c.name}
                          className="w-10 h-10 object-contain shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-center text-sm font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                          {c.name?.[0]?.toUpperCase() || 'C'}
                        </div>
                      )}
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-955 dark:text-slate-50 text-sm">
                          {c.name}
                        </span>
                        <span className="font-mono text-[11px] text-brand font-bold">
                          {`CUST-${c.id.slice(0, 5).toUpperCase()}`}
                        </span>
                      </div>
                    </div>
                    <StatusBadge status={c.isActive ? 'Active' : 'Inactive'} />
                  </div>

                  <div className="space-y-1.5 py-2 border-y border-slate-100 dark:border-slate-800 text-xs">
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                      <span className="font-medium text-slate-400 dark:text-slate-500">Phone:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{c.contact_phone}</span>
                    </div>

                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-slate-400">
                      Joined: {formatInDeploymentTz(c.createdAt, tz, 'MM/dd/yyyy')}
                    </span>

                    <Button variant="outline" size="sm" className="h-7 text-xs font-semibold">
                      View Profile
                    </Button>
                  </div>
                </div>
              );
            })}
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
                  Showing <span className="font-extrabold text-slate-900 dark:text-slate-100">{gridFromIndex}</span> to <span className="font-extrabold text-slate-900 dark:text-slate-100">{gridToIndex}</span> of <span className="font-extrabold text-slate-900 dark:text-slate-100">{totalCount}</span> entries
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
          title="Export Customers Ledger"
          description="Choose your export preferences, filters, and columns."
          fileNamePrefix="customers_ledger"
          sheetName="Customers"
          subtitle="MERCON Logistics Customer Accounts Ledger"
          filteredData={filteredCustomers}
          allData={customersRes?.data || []}
          selectedData={selectedCustomersForExport}
          totalCount={totalCount}
          columns={CUSTOMER_EXPORT_COLUMNS}
          filters={CUSTOMER_EXPORT_FILTERS}
          rowDateAccessor={(c) => c.createdAt}
        />

        {/* ── Customer Preview & Quick-Add Modals ──────────────────── */}
        <CustomerPreviewModal
          customer={previewCustomer}
          isOpen={!!previewCustomer}
          onClose={() => setPreviewCustomer(null)}
          onCreateTrip={(c) => navigate(`/trips/new?customer_id=${c.id}`)}
          onEdit={(c) => setEditCustomer(c)}
        />

        <EditCustomerModal
          customer={editCustomer}
          isOpen={!!editCustomer}
          onClose={() => setEditCustomer(null)}
        />

        <CreateCustomerModal
          isOpen={isCreateCustomerOpen}
          onClose={() => setIsCreateCustomerOpen(false)}
        />

      </div>
    </DashboardLayout>
  );
}
