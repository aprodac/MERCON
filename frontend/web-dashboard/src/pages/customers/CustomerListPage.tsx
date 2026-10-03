import { useState } from 'react';
import { toast } from 'sonner';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Edit2, FileText, Download, Building2, Search, Eye, Trash2, ChevronDown, Filter, List, LayoutGrid, X,
  FileSpreadsheet, UploadCloud, MoreHorizontal, ChevronLeft, ChevronRight, Truck, MapPinned, ReceiptText,
  Navigation, Wallet, CalendarClock, Check, ArrowUpDown, AlertCircle,
} from 'lucide-react';

import { downloadCSV, exportExcelTable, exportPDFTable } from '@/utils/exportUtils';
import { CUSTOMER_COLUMNS } from '@/utils/importUtils';
import ExcelImportDialog from '@/components/fleet/ExcelImportDialog';
import ExportModal, { ExportColumn, ExportFilter } from '@/components/ui/ExportModal';
import CustomerPreviewModal from '@/components/customers/CustomerPreviewModal';
import CreateCustomerModal from '@/components/customers/CreateCustomerModal';
import EditCustomerModal from '@/components/customers/EditCustomerModal';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { useModuleEnabled } from '@/components/auth/RequireModule';
import { Badge, CustomerAvatar, EmptyBlock, PhoneLine, Stat, ui } from '@/components/customers/customerUi';
import { customerService, Customer, CustomerFilters } from '@/services/customerService';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/fleetLive';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const custRef = (c: Customer) => `CUST-${c.id.slice(0, 5).toUpperCase()}`;
const contactPhone = (c: Customer) => c.primary_contact_phone || c.contact_phone || c.phone || '';
const money = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 });

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

type CustomerSort = 'trips' | 'latest' | 'oldest' | 'name_asc' | 'name_desc';

const SORTS: { value: CustomerSort; label: string; params: Pick<CustomerFilters, 'sort_by' | 'sort_dir'> }[] = [
  { value: 'trips', label: 'Most trips', params: { sort_by: 'trips', sort_dir: 'desc' } },
  { value: 'name_asc', label: 'Name A–Z', params: { sort_by: 'name', sort_dir: 'asc' } },
  { value: 'name_desc', label: 'Name Z–A', params: { sort_by: 'name', sort_dir: 'desc' } },
  { value: 'latest', label: 'Newest first', params: { sort_by: 'createdAt', sort_dir: 'desc' } },
  { value: 'oldest', label: 'Oldest first', params: { sort_by: 'createdAt', sort_dir: 'asc' } },
];

export default function CustomerListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = useDeploymentTimezone();
  const exportsEnabled = useModuleEnabled('company-reports');
  const financeEnabled = useModuleEnabled('finance');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [view, setView] = useState<CustomerView>('all');
  const [sort, setSort] = useState<CustomerSort>('trips');
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState<'list' | 'grid'>('list');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportRowsSelected, setExportRowsSelected] = useState<Customer[]>([]);
  const [previewCustomer, setPreviewCustomer] = useState<Customer | null>(null);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void | Promise<void> }>({
    open: false, title: '', message: '', onConfirm: () => {},
  });

  const debouncedSearch = useDebouncedValue(search, 300);
  const sortParams = SORTS.find((s) => s.value === sort)!.params;

  const { data: res, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['customers', debouncedSearch, page, pageSize, view, sort],
    queryFn: () => customerService.getAll({ search: debouncedSearch || undefined, page, per_page: pageSize, ...VIEW_FILTERS[view], ...sortParams }),
    placeholderData: keepPreviousData,
  });
  const { data: summary } = useQuery({ queryKey: ['customers', 'summary'], queryFn: () => customerService.getSummary() });

  const customers = res?.data || [];
  const totalPages = res?.meta?.total_pages || 1;
  const totalCount = res?.meta?.total ?? customers.length;
  const selectedRows = customers.filter((c) => selected.has(c.id));

  const resetPaging = () => { setPage(1); setSelected(new Set()); };
  const changeView = (v: CustomerView) => { setView((prev) => (prev === v && v !== 'all' ? 'all' : v)); resetPaging(); };
  const openCustomer = (c: Customer, tab?: string) => navigate(`/customers/${c.id}${tab ? `?tab=${tab}` : ''}`);
  const newTrip = (c: Customer) => navigate(`/trips/new?customer_id=${c.id}`);

  const toggleRow = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allOnPage = customers.length > 0 && customers.every((c) => selected.has(c.id));
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(customers.map((c) => c.id)));

  const EXPORT_HEADERS = ['Customer ID', 'Company Name', 'Phone', 'Contact Person', 'Payment Terms', 'Status'];
  const exportRows = (rows: Customer[]) =>
    rows.map((c) => [custRef(c), c.name, contactPhone(c) || 'N/A', c.primary_contact_person || '—', c.payment_terms || '—', c.isActive ? 'Active' : 'Inactive']);
  const stamp = () => new Date().toISOString().slice(0, 10);
  const exportExcel = (rows: Customer[]) => exportExcelTable('MERCON Customer Accounts', EXPORT_HEADERS, exportRows(rows), `customers_${stamp()}.xlsx`);
  const exportPdf = (rows: Customer[]) => exportPDFTable('MERCON Customer Accounts', EXPORT_HEADERS, exportRows(rows), `customers_${stamp()}.pdf`);
  const exportCsv = (rows: Customer[]) =>
    downloadCSV(
      rows.map((c) => ({
        customer_id: custRef(c), customer_name: c.name, phone: contactPhone(c), contact_person: c.primary_contact_person || '',
        payment_terms: c.payment_terms || '', status: c.isActive ? 'Active' : 'Inactive',
      })),
      `customers_${stamp()}.csv`,
    );

  const askDelete = (rows: Customer[]) => {
    setConfirm({
      open: true,
      title: rows.length === 1 ? 'Delete customer?' : `Delete ${rows.length} customers?`,
      message: `${rows.length === 1 ? rows[0].name : `These ${rows.length} customers`} will be removed. Their past trips, quotations and invoices stay. You can restore them from Settings → Recycle bin.`,
      onConfirm: async () => {
        try {
          await Promise.all(rows.map((c) => customerService.delete(c.id)));
          queryClient.invalidateQueries({ queryKey: ['customers'] });
          setSelected(new Set());
          toast.success(rows.length === 1 ? 'Customer deleted' : `${rows.length} customers deleted`);
        } catch (err: any) {
          queryClient.invalidateQueries({ queryKey: ['customers'] });
          toast.error(err?.response?.data?.error?.message || "Couldn't delete the customer.");
        }
      },
    });
  };

  const rowMenu = (c: Customer) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" onClick={(e) => e.stopPropagation()} aria-label={`More actions for ${c.name}`} className={ui.iconBtn}>
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => openCustomer(c)} className="text-[13px]"><Eye className="mr-2 size-4 text-slate-500" /> Open customer</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setPreviewCustomer(c)} className="text-[13px]"><Eye className="mr-2 size-4 text-slate-400" /> Quick preview</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => newTrip(c)} className="text-[13px]"><Plus className="mr-2 size-4 text-slate-500" /> New trip</DropdownMenuItem>
        <DropdownMenuItem onClick={() => openCustomer(c, 'trips')} className="text-[13px]"><Truck className="mr-2 size-4 text-slate-500" /> Trips</DropdownMenuItem>
        <DropdownMenuItem onClick={() => openCustomer(c, 'tracking')} className="text-[13px]"><MapPinned className="mr-2 size-4 text-slate-500" /> Live tracking</DropdownMenuItem>
        {exportsEnabled && (
          <DropdownMenuItem onClick={() => openCustomer(c, 'exports')} className="text-[13px]"><FileSpreadsheet className="mr-2 size-4 text-slate-500" /> Excel trip sheets</DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => openCustomer(c, 'financials')} className="text-[13px]"><ReceiptText className="mr-2 size-4 text-slate-500" /> Invoices & balance</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setEditCustomer(c)} className="text-[13px]"><Edit2 className="mr-2 size-4 text-slate-500" /> Quick edit</DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate(`/customers/${c.id}/edit`)} className="text-[13px]"><Edit2 className="mr-2 size-4 text-slate-500" /> Edit full profile</DropdownMenuItem>
        <DropdownMenuItem onClick={() => askDelete([c])} className="text-[13px] text-rose-600 focus:bg-rose-50 focus:text-rose-600"><Trash2 className="mr-2 size-4" /> Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  /** Shortcuts shown on hover (always visible on touch screens). */
  const quickActions = (c: Customer) => (
    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      <button type="button" title="New trip" aria-label="New trip" onClick={() => newTrip(c)} className={ui.iconBtn}><Plus className="size-4" /></button>
      <button type="button" title="Live tracking" aria-label="Live tracking" onClick={() => openCustomer(c, 'tracking')} className={ui.iconBtn}><MapPinned className="size-4" /></button>
      {exportsEnabled && (
        <button type="button" title="Excel trip sheets" aria-label="Excel trip sheets" onClick={() => openCustomer(c, 'exports')} className={ui.iconBtn}><FileSpreadsheet className="size-4" /></button>
      )}
      {rowMenu(c)}
    </div>
  );

  const views: { id: CustomerView; label: string; count?: number }[] = [
    { id: 'all', label: 'All', count: summary?.total },
    { id: 'active', label: 'Active', count: summary?.active },
    { id: 'inactive', label: 'Inactive', count: summary?.inactive },
    { id: 'live', label: 'On the road', count: summary?.live_customers },
    { id: 'balance', label: 'Owe money', count: summary?.outstanding.customers },
  ];

  const emptyText =
    view === 'live' ? 'No customer has a truck on the road right now.'
      : view === 'balance' ? 'No customer owes money on issued invoices.'
        : debouncedSearch ? `Nothing matches “${debouncedSearch}”.`
          : 'Add your first customer to start creating trips.';

  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(totalCount, from + customers.length - 1);

  return (
    <DashboardLayout active="Customers" title="Customers">
      <div className={ui.page}>

        {/* ── KPIs — each opens the matching view ── */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <Stat
            label="Customers"
            icon={Building2}
            tone="brand"
            value={summary?.total ?? '—'}
            sub={summary ? `${summary.active} active · ${summary.new_this_month} new this month` : 'Loading…'}
            active={view === 'all'}
            onClick={() => changeView('all')}
          />
          <Stat
            label="On the road now"
            icon={Navigation}
            tone="blue"
            value={summary?.live_customers ?? '—'}
            sub={summary ? `${summary.live_trips} truck${summary.live_trips === 1 ? '' : 's'} loading or moving` : 'Loading…'}
            active={view === 'live'}
            onClick={() => changeView('live')}
          />
          <Stat
            label="Outstanding"
            icon={Wallet}
            tone="amber"
            unit="SAR"
            value={summary ? money(summary.outstanding.amount) : '—'}
            sub={summary ? `${summary.outstanding.customers} ${summary.outstanding.customers === 1 ? 'customer owes' : 'customers owe'} on issued invoices` : 'Loading…'}
            active={view === 'balance'}
            onClick={() => changeView('balance')}
          />
          <Stat
            label="Overdue"
            icon={CalendarClock}
            tone="rose"
            unit="SAR"
            value={summary ? money(summary.overdue.amount) : '—'}
            sub={summary ? (summary.overdue.amount > 0 ? `${summary.overdue.customers} customer${summary.overdue.customers === 1 ? '' : 's'} past due` : 'Nothing past due') : 'Loading…'}
            subTone={summary && summary.overdue.amount > 0 ? 'rose' : undefined}
            onClick={financeEnabled ? () => navigate('/finance/invoices?tab=overdue') : undefined}
          />
        </div>

        {/* ── Customer table ── */}
        <section className={cn(ui.card, 'overflow-hidden')}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4">
            <div>
              <h2 className={ui.h2}>Customer accounts</h2>
              <p className={ui.muted}>{isLoading ? 'Loading…' : `${totalCount} ${totalCount === 1 ? 'customer' : 'customers'}`}</p>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={cn(ui.btn, ui.btnOutline)}>
                    <Download className="size-4" /> Export / import <ChevronDown className="size-3.5 text-slate-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs font-medium text-slate-500">Export this page</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => exportExcel(customers)} className="text-[13px]"><FileSpreadsheet className="mr-2 size-4 text-emerald-600" /> Excel (.xlsx)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportPdf(customers)} className="text-[13px]"><FileText className="mr-2 size-4 text-rose-600" /> PDF</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportCsv(customers)} className="text-[13px]"><FileText className="mr-2 size-4 text-slate-500" /> CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setExportRowsSelected([]); setIsExportOpen(true); }} className="text-[13px]"><Filter className="mr-2 size-4 text-slate-500" /> Custom export…</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setImportDialogOpen(true)} className="text-[13px]"><UploadCloud className="mr-2 size-4 text-slate-500" /> Import from Excel</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button type="button" onClick={() => setIsCreateOpen(true)} className={cn(ui.btn, ui.btnPrimary)}>
                <Plus className="size-4" /> Add customer
              </button>
            </div>
          </div>

          {/* Toolbar: views · search · sort · layout */}
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
            <div className="flex max-w-full items-center gap-1 overflow-x-auto" role="tablist" aria-label="Customer views">
              {views.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={view === v.id}
                  onClick={() => changeView(v.id)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors cursor-pointer',
                    view === v.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                  )}
                >
                  {v.label}
                  {v.count !== undefined && <span className={cn('tabular-nums', view === v.id ? 'text-white/70 dark:text-slate-500' : 'text-slate-400')}>{v.count}</span>}
                </button>
              ))}
            </div>

            <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <div className="relative flex-1 sm:w-64 sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); resetPaging(); }}
                  placeholder="Search name or phone"
                  aria-label="Search customers"
                  className={cn(ui.input, 'w-full pl-9 pr-8')}
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700">
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={cn(ui.btn, ui.btnOutline, 'px-3')}>
                    <ArrowUpDown className="size-4 text-slate-500" />
                    <span className="hidden sm:inline">{SORTS.find((s) => s.value === sort)!.label}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {SORTS.map((s) => (
                    <DropdownMenuItem key={s.value} onClick={() => { setSort(s.value); resetPaging(); }} className="justify-between text-[13px]">
                      {s.label} {sort === s.value && <Check className="size-4 text-[#FA634E]" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex items-center rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
                {([['list', List, 'Table'], ['grid', LayoutGrid, 'Cards']] as const).map(([mode, Icon, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setLayout(mode)}
                    title={label}
                    aria-label={`${label} view`}
                    aria-pressed={layout === mode}
                    className={cn('inline-flex size-8 items-center justify-center rounded-md transition-colors cursor-pointer', layout === mode ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white' : 'text-slate-400 hover:text-slate-700')}
                  >
                    <Icon className="size-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {selectedRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-t border-orange-100 bg-orange-50/60 px-5 py-2.5 text-[13px] dark:border-orange-900/40 dark:bg-orange-950/20">
              <span className="font-medium text-slate-900 dark:text-white">{selectedRows.length} selected</span>
              <button type="button" onClick={() => { setExportRowsSelected(selectedRows); setIsExportOpen(true); }} className={cn(ui.btn, ui.btnOutline, 'h-8')}>
                <Download className="size-4" /> Export
              </button>
              <button type="button" onClick={() => askDelete(selectedRows)} className={cn(ui.btn, 'h-8 border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 dark:bg-slate-900')}>
                <Trash2 className="size-4" /> Delete
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-[13px] font-medium text-slate-500 hover:text-slate-900">Clear</button>
            </div>
          )}

          {isError ? (
            <div className="border-t border-slate-100 p-5 dark:border-slate-800">
              <EmptyBlock icon={AlertCircle} title="Couldn't load customers" text={(error as Error)?.message || 'Try again in a moment.'} />
            </div>
          ) : !isLoading && customers.length === 0 ? (
            <div className="border-t border-slate-100 p-5 dark:border-slate-800">
              <EmptyBlock icon={Building2} title="No customers here" text={emptyText} />
            </div>
          ) : layout === 'list' ? (
            <div className={cn('overflow-x-auto border-t border-slate-100 dark:border-slate-800 transition-opacity', isFetching && !isLoading && 'opacity-60')}>
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-slate-50/80 dark:bg-slate-800/40">
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="w-10 py-2.5 pl-5 pr-0">
                      <input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Select all on this page" className="size-4 cursor-pointer rounded border-slate-300 accent-[#FA634E]" />
                    </th>
                    <th className={ui.th}>Customer</th>
                    <th className={ui.th}>Contact</th>
                    <th className={cn(ui.th, 'text-right')}>Trips</th>
                    <th className={ui.th}>Last trip</th>
                    <th className={cn(ui.th, 'text-right')}>Outstanding</th>
                    <th className={ui.th}>Status</th>
                    <th className={cn(ui.th, 'pr-5')}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {isLoading
                    ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={8} className="px-5 py-4"><div className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></td>
                      </tr>
                    ))
                    : customers.map((c) => {
                      const owed = c.stats?.outstanding ?? 0;
                      const overdue = c.stats?.overdue ?? 0;
                      const live = c.stats?.live_trips ?? 0;
                      return (
                        <tr
                          key={c.id}
                          onClick={() => openCustomer(c)}
                          className={cn('group cursor-pointer transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40', selected.has(c.id) && 'bg-orange-50/40')}
                        >
                          <td className="py-3.5 pl-5 pr-0" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleRow(c.id)} aria-label={`Select ${c.name}`} className="size-4 cursor-pointer rounded border-slate-300 accent-[#FA634E]" />
                          </td>
                          <td className={ui.td}>
                            <div className="flex min-w-0 items-center gap-3">
                              <CustomerAvatar name={c.name} logo={c.logo_url} />
                              <div className="min-w-0">
                                <p className="max-w-[240px] truncate font-medium text-slate-900 group-hover:text-[#E5533F] dark:text-white" title={c.name}>{c.name}</p>
                                <p className="text-xs text-slate-400 tabular-nums">{custRef(c)}</p>
                              </div>
                            </div>
                          </td>
                          <td className={ui.td}>
                            <p className={cn('truncate', c.primary_contact_person ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400')}>
                              {c.primary_contact_person || 'No contact person'}
                            </p>
                            <PhoneLine phone={contactPhone(c)} className="-ml-0.5" />
                          </td>
                          <td className={cn(ui.td, 'text-right')}>
                            <div className="flex items-center justify-end gap-2">
                              {live > 0 && <Badge tone="emerald" dot pulse>{live} live</Badge>}
                              <span className="font-medium text-slate-900 tabular-nums dark:text-white">{c._count?.trips ?? 0}</span>
                            </div>
                          </td>
                          <td className={ui.td}>
                            {c.stats?.last_trip_at ? (
                              <>
                                <p className="text-slate-900 dark:text-slate-100">{formatInDeploymentTz(c.stats.last_trip_at, tz, 'd MMM yyyy')}</p>
                                <p className="text-xs text-slate-400">{timeAgo(c.stats.last_trip_at)}</p>
                              </>
                            ) : (
                              <span className="text-slate-400">No trips yet</span>
                            )}
                          </td>
                          <td className={cn(ui.td, 'text-right tabular-nums')}>
                            {owed > 0 ? (
                              <>
                                <p className="font-medium text-slate-900 dark:text-white"><span className="text-xs font-normal text-slate-400">SAR</span> {money(owed)}</p>
                                {overdue > 0 && <p className="text-xs font-medium text-rose-600">{money(overdue)} overdue</p>}
                              </>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600">—</span>
                            )}
                          </td>
                          <td className={ui.td}>
                            {c.isActive ? <Badge tone="emerald" dot>Active</Badge> : <Badge tone="slate" dot>Inactive</Badge>}
                          </td>
                          <td className={cn(ui.td, 'pr-5')}>
                            <div className="opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">{quickActions(c)}</div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={cn('grid grid-cols-1 gap-4 border-t border-slate-100 bg-slate-50/50 p-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 dark:border-slate-800 dark:bg-slate-950/30', isFetching && !isLoading && 'opacity-60')}>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-[196px] animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)
                : customers.map((c) => {
                  const owed = c.stats?.outstanding ?? 0;
                  const overdue = c.stats?.overdue ?? 0;
                  const live = c.stats?.live_trips ?? 0;
                  return (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openCustomer(c)}
                      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openCustomer(c); } }}
                      className={cn(ui.card, 'group flex cursor-pointer flex-col transition-all hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FA634E]/30')}
                    >
                      <div className="flex items-start gap-3 p-4">
                        <CustomerAvatar name={c.name} logo={c.logo_url} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-900 group-hover:text-[#E5533F] dark:text-white" title={c.name}>{c.name}</p>
                          <p className="truncate text-[13px] text-slate-500">{c.primary_contact_person || custRef(c)}</p>
                        </div>
                        {c.isActive ? <Badge tone="emerald" dot>Active</Badge> : <Badge tone="slate" dot>Inactive</Badge>}
                      </div>
                      <dl className="grid grid-cols-3 gap-px border-y border-slate-100 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
                        {[
                          { label: 'Trips', value: c._count?.trips ?? 0 },
                          { label: 'Live', value: live, className: live > 0 ? 'text-emerald-600' : undefined },
                          { label: 'Owes (SAR)', value: owed > 0 ? money(owed) : '—', className: overdue > 0 ? 'text-rose-600' : undefined },
                        ].map((s) => (
                          <div key={s.label} className="bg-white px-3 py-2.5 dark:bg-slate-900">
                            <dt className={ui.label}>{s.label}</dt>
                            <dd className={cn('mt-0.5 font-semibold text-slate-900 tabular-nums dark:text-white', s.className)}>{s.value}</dd>
                          </div>
                        ))}
                      </dl>
                      <div className="flex items-center justify-between gap-2 py-1.5 pl-4 pr-2">
                        <span className="truncate text-xs text-slate-500">{c.stats?.last_trip_at ? `Last trip ${timeAgo(c.stats.last_trip_at)}` : 'No trips yet'}</span>
                        {quickActions(c)}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Pagination */}
          {totalCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-[13px] text-slate-500 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span>Rows</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); resetPaging(); }}
                  aria-label="Rows per page"
                  className="h-8 cursor-pointer rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span className="ml-2 tabular-nums">{from}–{to} of {totalCount}</span>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => { setPage((p) => Math.max(1, p - 1)); setSelected(new Set()); }} disabled={page <= 1} className={cn(ui.btn, ui.btnOutline, 'h-8 px-2.5')} aria-label="Previous page">
                  <ChevronLeft className="size-4" />
                </button>
                <span className="px-2 tabular-nums">Page {page} of {totalPages}</span>
                <button type="button" onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); setSelected(new Set()); }} disabled={page >= totalPages} className={cn(ui.btn, ui.btnOutline, 'h-8 px-2.5')} aria-label="Next page">
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          )}
        </section>

        <ConfirmModal
          isOpen={confirm.open}
          onClose={() => setConfirm((p) => ({ ...p, open: false }))}
          onConfirm={async () => { await confirm.onConfirm(); setConfirm((p) => ({ ...p, open: false })); }}
          title={confirm.title}
          message={confirm.message}
          isDestructive
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
          selectedData={exportRowsSelected}
          totalCount={totalCount}
          columns={CUSTOMER_EXPORT_COLUMNS}
          filters={CUSTOMER_EXPORT_FILTERS}
          rowDateAccessor={(c) => c.createdAt}
        />

        <CustomerPreviewModal
          customer={previewCustomer}
          isOpen={!!previewCustomer}
          onClose={() => setPreviewCustomer(null)}
          onCreateTrip={newTrip}
          onEdit={(c) => setEditCustomer(c)}
        />
        <EditCustomerModal customer={editCustomer} isOpen={!!editCustomer} onClose={() => setEditCustomer(null)} />
        <CreateCustomerModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
      </div>
    </DashboardLayout>
  );
}
