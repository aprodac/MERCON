import { useState, useMemo, useEffect } from 'react';
import { formatQuotationRef } from '@mercon/shared-types';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { 
  Plus, 
  Edit2, 
  FileText, 
  Download, 
  Trash2, 
  RotateCw, 
  Filter,
  Search,
  Building2,
  MapPin,
  X,
  Truck,
  Calculator,
  Calendar,
  CheckCircle2,
  Zap,
  MoreHorizontal,
  Copy,
  Power,
  UploadCloud,
  ArrowRight,
  Tag,
  CreditCard,
  Route as RouteIcon,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Eye,
  ArrowDown,
  ArrowUp,
  List,
  Sparkles,
  ChevronLeft,
  SlidersHorizontal,
  Settings2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { TaxonomyBadge } from '@/components/common/TaxonomyBadge';
import { TaxonomySelect } from '@/components/common/TaxonomySelect';
import { quotationService, surchargeRuleService, Quotation } from '@/services/quotationService';
import { customerService } from '@/services/customerService';
import QuotationFormDialog from '@/components/quotations/RateCardFormDialog';
import { CustomerSurchargesSection } from '@/components/quotations/CustomerSurchargesSection';
import ExcelImportDialog from '@/components/fleet/ExcelImportDialog';
import { QuotationRouteDrawer } from './QuotationRouteDrawer';
import { QuotationRouteMatrix, quotationRef, quotationStopNames, quotationOffLabel, isMonthlyQuotation } from '@/components/quotations/QuotationRouteMatrix';
import { RATE_CARD_COLUMNS } from '@/utils/importUtils';
import { downloadQuotationWorkbook } from '@/utils/quotationWorkbook';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function CompanyLogo({ name, logoUrl, className = "w-8 h-8" }: { name: string; logoUrl?: string | null; className?: string }) {
  const [hasError, setHasError] = useState(false);

  if (logoUrl && !hasError) {
    return (
      <img
        src={logoUrl}
        alt={name}
        onError={() => setHasError(true)}
        className={cn("rounded-lg object-contain p-0.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0 shadow-2xs", className)}
      />
    );
  }

  const initials = name ? name.substring(0, 2).toUpperCase() : 'CU';

  return (
    <div className={cn("rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700", className)}>
      <span>{initials}</span>
    </div>
  );
}

function getVehicleClassBadge(vehicleClass?: string | null) {
  return <TaxonomyBadge category="VEHICLE_CLASS" value={vehicleClass} fallbackText="Standard" />;
}

function RouteStopsCell({ quotation }: { quotation: Quotation }) {
  const names = quotationStopNames(quotation);
  const off = quotationOffLabel(quotation);
  return (
    <div className="min-w-[200px]">
      <div className="flex flex-wrap items-center gap-1 font-semibold text-[#3E3C3D] dark:text-slate-100">
        {names.map((n, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            {i > 0 && <ArrowRight className="h-3 w-3 text-slate-400" />}
            {n}
          </span>
        ))}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
        <span>{quotationRef(quotation)}</span>
        {names.length > 2 && <span>· {names.length} stops</span>}
        {off && <span className={cn('font-sans font-semibold', off === 'Expired' ? 'text-rose-600' : 'text-amber-600')}>· {off}</span>}
      </div>
    </div>
  );
}

export default function QuotationListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const urlCustomerId = searchParams.get('customer_id');

  // Customer Workspace Sub-Tab State ('routes' | 'surcharges')
  const [customerWorkspaceTab, setCustomerWorkspaceTab] = useState<'routes' | 'surcharges'>('routes');

  // 'list' = one row per quotation (always the default, owner 2026-10-04); 'routes' = one row per route with a price per truck.
  const [ledgerView, setLedgerView] = useState<'routes' | 'list'>('list');

  const handleOpenCustomerSurcharges = (id: string, _name: string) => {
    setSelectedCustomerId(id);
    setCustomerWorkspaceTab('surcharges');
  };

  // Customer Navigator Search (Left panel)
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(urlCustomerId);

  const handleSelectCustomer = (id: string) => {
    setSelectedCustomerId(id);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('customer_id', id);
      return next;
    }, { replace: true });
  };

  // Global Route Workspace Filters (Right panel toolbar)
  const [search, setSearch] = useState('');
  const [billingTypeFilter, setBillingTypeFilter] = useState('ALL');
  const [vehicleClassFilter, setVehicleClassFilter] = useState('ALL');
  const [lineTypeFilter, setLineTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Route Workspace Pagination
  const [workspacePage, setWorkspacePage] = useState(1);
  const [workspacePerPage, setWorkspacePerPage] = useState(20);

  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Right-side Route Details Drawer State
  const [drawerQuotation, setDrawerQuotation] = useState<Quotation | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleOpenDrawer = (q: Quotation) => {
    setDrawerQuotation(q);
    setIsDrawerOpen(true);
  };

  // Fetch Quotations list (Full dataset for workspace navigator and customer grouping)
  const { data: quotationsRes, isLoading, refetch } = useQuery({
    queryKey: ['quotations'],
    queryFn: () => quotationService.getAll({ per_page: 'all' }),
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const rawQuotations = quotationsRes?.data || [];

  // Fetch Customers lookup for left panel list
  const { data: customersRes } = useQuery({
    queryKey: ['customers-select'],
    queryFn: () => customerService.getAll({ per_page: 200, mode: 'lookup' }),
  });
  const sortedCustomers = customersRes?.data || [];

  // Group Quotations by Customer Company (Populating from sortedCustomers + rawQuotations)
  const companyGroups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; logoUrl?: string | null; quotations: Quotation[]; monthlyCount: number; extraCount: number }>();

    // 1. Populate all customer master records
    sortedCustomers.forEach((cust) => {
      map.set(cust.id, {
        id: cust.id,
        name: cust.name,
        logoUrl: (cust as any).logo_url || (cust as any).avatar_url || null,
        quotations: [],
        monthlyCount: 0,
        extraCount: 0,
      });
    });

    // 2. Attach commercial quotation routes
    rawQuotations.forEach((q) => {
      const custId = q.customerId || 'unassigned';
      const custName = q.customer?.name || 'Unassigned / General Customer';
      const logoUrl = (q.customer as any)?.logo_url || (q.customer as any)?.avatar_url || null;

      if (!map.has(custId)) {
        map.set(custId, { id: custId, name: custName, logoUrl, quotations: [], monthlyCount: 0, extraCount: 0 });
      }
      const entry = map.get(custId)!;
      entry.quotations.push(q);
      const opType = (q.operation_type || q.billing_type || '').toUpperCase();
      if (opType === 'MONTHLY') {
        entry.monthlyCount++;
      } else {
        entry.extraCount++;
      }
    });

    const groups = Array.from(map.values());
    return groups.sort((a, b) => a.name.localeCompare(b.name));
  }, [rawQuotations, sortedCustomers]);

  // Auto-select customer from URL or first customer
  useEffect(() => {
    if (companyGroups.length > 0) {
      if (urlCustomerId && companyGroups.some((g) => g.id === urlCustomerId)) {
        if (selectedCustomerId !== urlCustomerId) {
          setSelectedCustomerId(urlCustomerId);
        }
      } else if (!selectedCustomerId || !companyGroups.some((g) => g.id === selectedCustomerId)) {
        setSelectedCustomerId(companyGroups[0].id);
      }
    }
  }, [companyGroups, urlCustomerId, selectedCustomerId]);

  // Filtered customer navigator list for left panel search
  const navCustomerGroups = useMemo(() => {
    if (!customerSearchTerm.trim()) return companyGroups;
    const term = customerSearchTerm.toLowerCase();
    return companyGroups.filter((g) => g.name.toLowerCase().includes(term));
  }, [companyGroups, customerSearchTerm]);

  // Active selected customer group
  const selectedGroup = useMemo(() => {
    if (!selectedCustomerId) return companyGroups[0] || null;
    return companyGroups.find((g) => g.id === selectedCustomerId) || companyGroups[0] || null;
  }, [companyGroups, selectedCustomerId]);

  // Filtered route ledger for selected customer
  const filteredWorkspaceRoutes = useMemo(() => {
    if (!selectedGroup) return [];

    return selectedGroup.quotations.filter((q) => {
      // Route search filter
      if (search.trim()) {
        const term = search.toLowerCase();
        const stopsText = (q.stops || []).map((s: any) => s.source_label || s.location?.name || '').join(' ').toLowerCase();
        const matchRoute = (q.route_origin || '').toLowerCase().includes(term) || (q.route_destination || '').toLowerCase().includes(term) || stopsText.includes(term);
        const matchVehicle = (q.vehicle_class || '').toLowerCase().includes(term);
        const matchRef = (q.agreement_ref || '').toLowerCase().includes(term);
        const matchName = (q.name || '').toLowerCase().includes(term);
        const qNum = (q as any).quotation_number != null ? String((q as any).quotation_number) : '';
        const qCode = qNum ? `${(formatQuotationRef(qNum) || '').toLowerCase()} qt-${qNum}` : `qt-${q.id.substring(0, 8).toLowerCase()}`;
        const matchQNum = qNum.includes(term) || qCode.includes(term) || (q.id || '').toLowerCase().includes(term);
        if (!matchRoute && !matchVehicle && !matchRef && !matchName && !matchQNum) return false;
      }

      // Operation Type Filter
      if (billingTypeFilter !== 'ALL') {
        const opType = (q.operation_type || q.billing_type || '').toUpperCase();
        if (opType !== billingTypeFilter) return false;
      }

      // Vehicle Class Filter
      if (vehicleClassFilter !== 'ALL') {
        if ((q.vehicle_class || '').toUpperCase() !== vehicleClassFilter.toUpperCase()) return false;
      }

      // Line Type Filter
      if (lineTypeFilter !== 'ALL') {
        if ((q.line_type || q.rate_category || '').toUpperCase() !== lineTypeFilter.toUpperCase()) return false;
      }

      // Status Filter
      if (statusFilter !== 'ALL') {
        const now = new Date();
        const isValidFromFuture = q.valid_from ? new Date(q.valid_from) > now : false;
        const isExpired = q.valid_to ? new Date(q.valid_to) < now : false;

        if (statusFilter === 'ACTIVE' && (!q.is_active || isExpired || isValidFromFuture)) return false;
        if (statusFilter === 'INACTIVE' && q.is_active) return false;
        if (statusFilter === 'EXPIRED' && !isExpired) return false;
        if (statusFilter === 'FUTURE' && !isValidFromFuture) return false;
      }

      return true;
    });
  }, [selectedGroup, search, billingTypeFilter, vehicleClassFilter, lineTypeFilter, statusFilter]);

  // Paginated workspace routes
  const paginatedWorkspaceRoutes = useMemo(() => {
    const start = (workspacePage - 1) * workspacePerPage;
    return filteredWorkspaceRoutes.slice(start, start + workspacePerPage);
  }, [filteredWorkspaceRoutes, workspacePage, workspacePerPage]);

  const totalWorkspacePages = Math.ceil(filteredWorkspaceRoutes.length / workspacePerPage) || 1;

  // Reset workspace filters when changing selected customer
  useEffect(() => {
    setSearch('');
    setBillingTypeFilter('ALL');
    setVehicleClassFilter('ALL');
    setLineTypeFilter('ALL');
    setStatusFilter('ALL');
    setWorkspacePage(1);
  }, [selectedCustomerId]);

  // Reset selection on customer change or filter change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedCustomerId, search, billingTypeFilter, vehicleClassFilter, lineTypeFilter, statusFilter]);

  const isAllSelected = useMemo(() => {
    if (filteredWorkspaceRoutes.length === 0) return false;
    return filteredWorkspaceRoutes.every((q) => selectedIds.has(q.id));
  }, [filteredWorkspaceRoutes, selectedIds]);

  const isSomeSelected = useMemo(() => {
    if (isAllSelected || filteredWorkspaceRoutes.length === 0) return false;
    return filteredWorkspaceRoutes.some((q) => selectedIds.has(q.id));
  }, [filteredWorkspaceRoutes, selectedIds, isAllSelected]);

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set<string>();
      filteredWorkspaceRoutes.forEach((q) => next.add(q.id));
      setSelectedIds(next);
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    try {
      const idsArray = Array.from(selectedIds);
      await quotationService.bulkDelete(idsArray);
      toast.success(`Deleted ${idsArray.length} commercial route(s) successfully`);
      setSelectedIds(new Set());
      setIsBulkDeleteModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete selected quotations');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedQuotation) return;
    try {
      await quotationService.delete(selectedQuotation.id);
      toast.success('Quotation deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      setIsDeleteModalOpen(false);
      setSelectedQuotation(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete quotation');
    }
  };

  const handleToggleActive = async (q: Quotation) => {
    try {
      await quotationService.update(q.id, { is_active: !q.is_active });
      toast.success(`Quotation ${q.is_active ? 'deactivated' : 'activated'} successfully`);
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to update quotation status');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setBillingTypeFilter('ALL');
    setVehicleClassFilter('ALL');
    setLineTypeFilter('ALL');
    setStatusFilter('ALL');
    setWorkspacePage(1);
  };

  const isFiltersActive =
    search !== '' ||
    billingTypeFilter !== 'ALL' ||
    vehicleClassFilter !== 'ALL' ||
    lineTypeFilter !== 'ALL' ||
    statusFilter !== 'ALL';

  // Styled workbook: one sheet per customer (+ an "All customers" summary when exporting everyone).
  const handleExportExcel = async (scope: 'customer' | 'all') => {
    const groups = scope === 'customer' && selectedGroup ? [selectedGroup] : companyGroups;
    setIsExporting(true);
    const toastId = toast.loading('Preparing the Excel file…');
    try {
      const rules = await surchargeRuleService.list().catch(() => []);
      const customers = groups.map((g) => ({
        name: g.name,
        quotations: g.quotations,
        charges: rules.filter((r) => r.customerId === g.id && r.is_active !== false),
      }));
      const day = new Date().toISOString().slice(0, 10);
      const who = scope === 'customer' && selectedGroup ? selectedGroup.name.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') : 'All_customers';
      await downloadQuotationWorkbook(customers, `MERCON_Quotations_${who}_${day}.xlsx`);
      toast.success('Excel file ready', { id: toastId });
    } catch {
      toast.error("Couldn't create the Excel file. Try again.", { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DashboardLayout active="Quotations" title="Quotations">
      <div className="px-4 sm:px-6 pb-10 w-full flex flex-col animate-fade-in gap-4">
        
        {/* 1. Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 shrink-0 pb-4 border-b border-slate-200/80 dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <Calculator className="w-7 h-7 text-[#FA634E] shrink-0" />
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-[#3E3C3D] dark:text-slate-100 tracking-tight uppercase">
                QUOTATIONS
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-normal">
                Customer rates, route terms, and surcharge rules.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isExporting || rawQuotations.length === 0}
                  className="h-9 gap-1.5 text-xs font-medium border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-50 dark:bg-slate-900 text-[#3E3C3D] dark:text-slate-200 rounded-lg px-3.5 cursor-pointer transition-all"
                >
                  <Download className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{isExporting ? 'Exporting…' : 'Export Excel'}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-1.5 z-[9999]">
                {selectedGroup && (
                  <DropdownMenuItem onClick={() => handleExportExcel('customer')} className="cursor-pointer flex-col items-start gap-0.5 py-2 text-xs">
                    <span className="font-semibold">This customer</span>
                    <span className="text-[11px] text-slate-500">{selectedGroup.name} · {selectedGroup.quotations.length} quotations</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => handleExportExcel('all')} className="cursor-pointer flex-col items-start gap-0.5 py-2 text-xs">
                  <span className="font-semibold">All customers</span>
                  <span className="text-[11px] text-slate-500">A sheet per customer + a summary · {rawQuotations.length} quotations</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Excel Direct Import Action */}
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-1.5 text-xs font-medium border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-50 dark:bg-slate-900 text-[#3E3C3D] dark:text-slate-200 rounded-lg px-3.5 cursor-pointer transition-all"
              onClick={() => setIsImportModalOpen(true)}
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Import Excel</span>
            </Button>

            {/* AI Import Action */}
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-1.5 text-xs font-medium border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-50 dark:bg-slate-900 text-[#3E3C3D] dark:text-slate-200 rounded-lg px-3.5 cursor-pointer transition-all"
              onClick={() => navigate('/quotations/import')}
            >
              <Sparkles className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              <span>AI Studio</span>
            </Button>

            {/* + New Commercial Route Action (Primary Coral Red #FA634E) */}
            <Button
              size="sm"
              className="h-9 gap-1.5 text-xs font-bold bg-[#FA634E] hover:bg-[#DF4834] text-white shadow-xs rounded-lg px-4 cursor-pointer transition-all border-0"
              onClick={() => navigate(selectedGroup ? `/quotations/new?customer_id=${selectedGroup.id}` : '/quotations/new')}
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>New quotation</span>
            </Button>
          </div>
        </div>

        {/* 2. TWO-PANEL WORKSPACE (COMPANY VIEW ONLY) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            
            {/* LEFT PANEL: CUSTOMER NAVIGATOR */}
            <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden flex flex-col max-h-[calc(100vh-170px)] min-h-[540px]">
              <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2 shrink-0">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-black uppercase tracking-wider text-[#3E3C3D] dark:text-slate-300">
                    CUSTOMERS ({navCustomerGroups.length})
                  </h2>
                </div>
                {/* Left Panel Customer Search Input */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    placeholder="Search customers..."
                    value={customerSearchTerm}
                    onChange={(e) => setCustomerSearchTerm(e.target.value)}
                    className="h-8 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 pl-8 rounded-lg focus-visible:ring-1 focus-visible:ring-[#FA634E]"
                  />
                </div>
              </div>

              {/* Scrollable Customer List */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-1.5 space-y-0.5">
                {isLoading ? (
                  <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                    <RotateCw className="w-4 h-4 animate-spin text-slate-400" />
                    <span>Loading customers...</span>
                  </div>
                ) : navCustomerGroups.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No customers found
                  </div>
                ) : (
                  navCustomerGroups.map((group) => {
                    const isSelected = selectedCustomerId === group.id;

                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => handleSelectCustomer(group.id)}
                        className={cn(
                          "w-full text-left p-2.5 rounded-lg transition-all flex items-center justify-between gap-2.5 cursor-pointer group border-l-4",
                          isSelected
                            ? "bg-[#FA634E]/5 border-l-[#FA634E] border-y-transparent border-r-transparent text-[#3E3C3D] font-bold"
                            : "border-l-transparent text-[#3E3C3D] dark:text-slate-300 hover:bg-[#EEF1F6]"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CompanyLogo
                            name={group.name}
                            logoUrl={group.logoUrl || (sortedCustomers.find((c) => c.id === group.id) as any)?.logo_url || (sortedCustomers.find((c) => c.id === group.id) as any)?.avatar_url}
                            className="w-7 h-7"
                          />
                          <div className="min-w-0">
                            <div className="text-xs truncate font-bold text-[#3E3C3D] dark:text-slate-100">
                              {group.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-normal truncate mt-0.5">
                              {group.quotations.length} {group.quotations.length === 1 ? 'route' : 'routes'} · {group.monthlyCount} Monthly · {group.extraCount} Extra
                            </div>
                          </div>
                        </div>
                        <ChevronRight className={cn("w-3.5 h-3.5 shrink-0 transition-transform", isSelected ? "text-[#FA634E]" : "text-slate-300 group-hover:text-[#FA634E]")} />
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* RIGHT PANEL: SELECTED CUSTOMER ROUTE WORKSPACE */}
            <div className="lg:col-span-9 space-y-3">
              {selectedGroup ? (
                <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden flex flex-col min-h-[540px]">
                  
                  {/* Selected Customer Workspace Header */}
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <CompanyLogo
                          name={selectedGroup.name}
                          logoUrl={selectedGroup.logoUrl || (sortedCustomers.find((c) => c.id === selectedGroup.id) as any)?.logo_url || (sortedCustomers.find((c) => c.id === selectedGroup.id) as any)?.avatar_url}
                          className="w-10 h-10 shrink-0"
                        />
                        <div>
                          <h2 className="text-base font-black text-[#3E3C3D] dark:text-slate-100 tracking-tight">
                            {selectedGroup.name}
                          </h2>
                          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            {(() => {
                              const qs = selectedGroup.quotations;
                              const monthly = qs.filter(isMonthlyQuotation).length;
                              const withPay = qs.filter((q) => q.driver_payout != null).length;
                              return `${qs.length} quotation${qs.length === 1 ? '' : 's'} · ${qs.length - monthly} per trip · ${monthly} monthly · ${withPay} with driver pay`;
                            })()}
                          </p>
                        </div>
                      </div>

                      {/* Customer Workspace View Controller (Commercial Routes vs Standing Surcharges) */}
                      <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700/60">
                        <button
                          type="button"
                          onClick={() => setCustomerWorkspaceTab('routes')}
                          className={cn(
                            "px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer",
                            customerWorkspaceTab === 'routes'
                              ? "bg-white dark:bg-slate-900 text-[#3E3C3D] dark:text-slate-100 shadow-2xs"
                              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                          )}
                        >
                          <RouteIcon className="w-3.5 h-3.5 text-[#FA634E]" />
                          <span>Quotations</span>
                          <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded font-bold">
                            {selectedGroup.quotations.length}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setCustomerWorkspaceTab('surcharges')}
                          className={cn(
                            "px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer",
                            customerWorkspaceTab === 'surcharges'
                              ? "bg-white dark:bg-slate-900 text-[#3E3C3D] dark:text-slate-100 shadow-2xs"
                              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                          )}
                        >
                          <Tag className="w-3.5 h-3.5 text-amber-500" />
                          <span>Extra charges</span>
                        </button>
                      </div>
                    </div>

                    {/* Integrated Filter Bar (Visible when in Routes view) */}
                    {customerWorkspaceTab === 'routes' && (
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <div className="relative flex-1 min-w-[200px]">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                          <Input
                            placeholder="Search route, vehicle class..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-8.5 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 pl-9 rounded-lg focus-visible:ring-1 focus-visible:ring-[#FA634E]"
                          />
                        </div>

                        {/* Operation Type Filter */}
                        <div className="w-[140px]">
                          <TaxonomySelect
                            category="OPERATION_TYPE"
                            value={billingTypeFilter === 'ALL' ? '' : billingTypeFilter}
                            onValueChange={(val: string) => { setBillingTypeFilter(val || 'ALL'); setWorkspacePage(1); }}
                            placeholder="All Operations"
                            clearLabel="All Operations"
                            size="sm"
                          />
                        </div>

                        {/* Vehicle Class Filter */}
                        <div className="w-[145px]">
                          <TaxonomySelect
                            category="VEHICLE_CLASS"
                            value={vehicleClassFilter === 'ALL' ? '' : vehicleClassFilter}
                            onValueChange={(val: string) => { setVehicleClassFilter(val || 'ALL'); setWorkspacePage(1); }}
                            placeholder="All Vehicles"
                            clearLabel="All Vehicles"
                            size="sm"
                          />
                        </div>

                        {/* Line Type Filter */}
                        <div className="w-[150px]">
                          <TaxonomySelect
                            category="LINE_TYPE"
                            value={lineTypeFilter === 'ALL' ? '' : lineTypeFilter}
                            onValueChange={(val: string) => { setLineTypeFilter(val || 'ALL'); setWorkspacePage(1); }}
                            placeholder="All Line Types"
                            clearLabel="All Line Types"
                            size="sm"
                          />
                        </div>

                        <div className="flex items-center rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" role="group" aria-label="Layout">
                          {([['list', 'List'], ['routes', 'By route']] as const).map(([v, label]) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => { setLedgerView(v); setSelectedIds(new Set()); }}
                              className={cn(
                                'h-7 rounded-md px-2.5 text-xs font-semibold transition-colors',
                                ledgerView === v ? 'bg-[#3E3C3D] text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        {isFiltersActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearFilters}
                            className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg px-2.5 shrink-0 font-medium"
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            <span>Clear Filters</span>
                          </Button>
                        )}

                        {/* Bulk Action Controls */}
                        {selectedIds.size > 0 && (
                          <div className="flex items-center gap-2 ml-auto pl-2 border-l border-slate-200 dark:border-slate-700">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                              {selectedIds.size} selected
                            </span>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setIsBulkDeleteModalOpen(true)}
                              className="h-8 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg px-3 flex items-center gap-1.5 cursor-pointer shadow-xs border-0"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Delete Selected ({selectedIds.size})</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedIds(new Set())}
                              className="h-8 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 rounded-lg px-2 cursor-pointer"
                            >
                              Deselect
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Workspace Content: Routes Ledger OR Standing Surcharges Section */}
                  {customerWorkspaceTab === 'surcharges' ? (
                    <CustomerSurchargesSection
                      customerId={selectedGroup.id}
                      customerName={selectedGroup.name}
                    />
                  ) : (
                    <>
                      {/* Dense Route Ledger Table */}
                  <div className="flex-1 overflow-x-auto">
                    {filteredWorkspaceRoutes.length === 0 ? (
                      /* Empty State */
                      <div className="p-12 text-center flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                        <RouteIcon className="w-5 h-5 text-slate-400 shrink-0" />
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">No quotations yet</h3>
                        <p className="text-xs text-slate-400">
                          {isFiltersActive ? 'No routes match your current active filters.' : 'This customer does not have any agreed commercial routes.'}
                        </p>
                        {isFiltersActive ? (
                          <Button variant="outline" size="sm" onClick={clearFilters} className="mt-2 h-8 text-xs font-semibold rounded-lg">
                            Clear Filters
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => navigate(`/quotations/new?customer_id=${selectedGroup.id}`)}
                            className="mt-2 h-8 px-3 text-xs font-semibold bg-[#FA634E] hover:bg-[#DF4834] text-white rounded-lg border-0"
                          >
                            <Plus size={13} className="mr-1" /> New quotation
                          </Button>
                        )}
                      </div>
                    ) : ledgerView === 'routes' ? (
                      <QuotationRouteMatrix quotations={filteredWorkspaceRoutes} onOpen={handleOpenDrawer} />
                    ) : (
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 bg-slate-50/50 dark:bg-slate-800/20">
                            <th className="py-2.5 px-3.5 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={isAllSelected ? true : isSomeSelected ? "indeterminate" : false}
                                onCheckedChange={handleToggleSelectAll}
                                aria-label="Select all quotations"
                                className="translate-y-[1px]"
                              />
                            </th>
                            <th className="py-2.5 px-3.5">Route</th>
                            <th className="py-2.5 px-3.5">Truck</th>
                            <th className="py-2.5 px-3.5">Line type</th>
                            <th className="py-2.5 px-3.5">Operation</th>
                            <th className="py-2.5 px-3.5 text-right">Price</th>
                            <th className="py-2.5 px-3.5 text-right">Driver pay</th>
                            <th className="py-2.5 px-3.5 w-10"><span className="sr-only">Actions</span></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
                          {paginatedWorkspaceRoutes.map((row) => {
                            const isSelectedRow = selectedIds.has(row.id);
                            const rawRate = Number(row.rate ?? row.base_price ?? 0);
                            const monthly = isMonthlyQuotation(row);
                            const pay = row.driver_payout != null && !isNaN(Number(row.driver_payout)) ? Number(row.driver_payout) : null;

                            return (
                              <tr
                                key={row.id}
                                onClickCapture={(e) => {
                                  if (selectedIds.size > 0) {
                                    const target = e.target as HTMLElement;
                                    if (target.tagName.toLowerCase() === 'input' && (target as HTMLInputElement).type === 'checkbox') {
                                      return;
                                    }
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleToggleSelectRow(row.id);
                                  }
                                }}
                                onClick={() => {
                                  if (selectedIds.size === 0) {
                                    handleOpenDrawer(row);
                                  }
                                }}
                                className={cn(
                                  "hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors",
                                  isSelectedRow && "bg-rose-50/30 dark:bg-rose-950/20 hover:bg-rose-50/50"
                                )}
                              >
                                <td className="py-2.5 px-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={isSelectedRow}
                                    onCheckedChange={() => handleToggleSelectRow(row.id)}
                                    aria-label={`Select ${quotationRef(row)}`}
                                    className="translate-y-[1px]"
                                  />
                                </td>

                                <td className="py-2.5 px-3.5">
                                  <RouteStopsCell quotation={row} />
                                </td>

                                <td className="py-2.5 px-3.5">
                                  {getVehicleClassBadge(row.vehicle_class)}
                                </td>

                                <td className="py-2.5 px-3.5">
                                  <TaxonomyBadge category="LINE_TYPE" value={row.line_type || row.rate_category} fallbackText="Single Trip" />
                                </td>

                                <td className="py-2.5 px-3.5">
                                  <TaxonomyBadge category="OPERATION_TYPE" value={row.operation_type || row.billing_type} fallbackText="Extra" />
                                </td>

                                <td className="py-2.5 px-3.5 text-right font-mono whitespace-nowrap">
                                  <span className="font-bold text-slate-900 dark:text-slate-100">{rawRate.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                  <span className="ml-1 text-[10px] font-semibold text-slate-500">{monthly ? '/mo' : '/trip'}</span>
                                  {monthly && rawRate > 0 && (
                                    <div className="text-[10px] text-slate-400">≈ {(rawRate / 30).toLocaleString(undefined, { maximumFractionDigits: 0 })} / day</div>
                                  )}
                                </td>

                                <td className="py-2.5 px-3.5 text-right font-mono whitespace-nowrap">
                                  {pay != null
                                    ? <span className="text-slate-700 dark:text-slate-300">{pay.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                    : <span className="font-sans text-[11px] text-slate-400">set at booking</span>}
                                </td>

                                <td className="py-2.5 px-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-md cursor-pointer" aria-label={`Actions for ${quotationRef(row)}`}>
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48 p-1.5 shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg z-[9999]">
                                      <DropdownMenuItem onClick={() => handleOpenDrawer(row)} className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
                                        <Eye className="h-3.5 w-3.5 mr-2 text-slate-500" />
                                        <span>Open</span>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => navigate(`/quotations/${row.id}/edit`)} className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
                                        <Edit2 className="h-3.5 w-3.5 mr-2 text-blue-600" />
                                        <span>Edit</span>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => navigate(`/quotations/new?customer_id=${row.customerId}&origin_id=${row.originLocationId || ''}&dest_id=${row.destinationLocationId || ''}`)} className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
                                        <Copy className="h-3.5 w-3.5 mr-2 text-slate-500" />
                                        <span>Duplicate</span>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleToggleActive(row)} className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
                                        <Power className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                                        <span>{row.is_active ? 'Switch off' : 'Switch on'}</span>
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator className="my-1 border-slate-100 dark:border-slate-800" />
                                      <DropdownMenuItem
                                        onSelect={(e) => e.preventDefault()}
                                        onClick={() => { setSelectedQuotation(row); setIsDeleteModalOpen(true); }}
                                        className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                      >
                                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                                        <span>Delete</span>
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Pagination Footer */}
                  {filteredWorkspaceRoutes.length > 0 && ledgerView === 'list' && (
                    <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex items-center justify-between text-xs text-slate-500">
                      <div>
                        Showing <span className="font-semibold text-slate-900 dark:text-slate-100">{(workspacePage - 1) * workspacePerPage + 1}–{Math.min(workspacePage * workspacePerPage, filteredWorkspaceRoutes.length)}</span> of <span className="font-semibold text-slate-900 dark:text-slate-100">{filteredWorkspaceRoutes.length}</span> routes
                      </div>

                      <div className="flex items-center gap-2">
                        <Select value={String(workspacePerPage)} onValueChange={(val) => setWorkspacePerPage(Number(val))}>
                          <SelectTrigger className="h-7 text-xs border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent align="end" className="w-24 bg-white p-1">
                            <SelectItem value="10" className="text-xs">10 / page</SelectItem>
                            <SelectItem value="20" className="text-xs">20 / page</SelectItem>
                            <SelectItem value="50" className="text-xs">50 / page</SelectItem>
                          </SelectContent>
                        </Select>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={workspacePage <= 1}
                            onClick={() => setWorkspacePage((p) => p - 1)}
                            className="h-7 w-7 rounded-lg border-slate-200 dark:border-slate-700"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </Button>

                          <span className="px-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {workspacePage} / {totalWorkspacePages}
                          </span>

                          <Button
                            variant="outline"
                            size="icon"
                            disabled={workspacePage >= totalWorkspacePages}
                            onClick={() => setWorkspacePage((p) => p + 1)}
                            className="h-7 w-7 rounded-lg border-slate-200 dark:border-slate-700"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
              ) : (
                <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                  Select a customer from the left list to view their commercial routes.
                </div>
              )}
            </div>
          </div>
        </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete quotation"
        message="Are you sure you want to delete this commercial route quotation? Historical trips billed with this quotation will retain their commercial snapshot."
        confirmLabel="Delete Route"
        isDestructive
      />

      {/* Bulk Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isBulkDeleteModalOpen}
        onClose={() => setIsBulkDeleteModalOpen(false)}
        onConfirm={handleBulkDelete}
        title={`Delete ${selectedIds.size} quotations`}
        message={`Are you sure you want to delete ${selectedIds.size} selected commercial route(s)? Historical trips billed with these quotations will retain their commercial rate snapshots.`}
        confirmLabel={isBulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size} Routes`}
        isDestructive
      />

      {/* Excel Import Modal */}
      <ExcelImportDialog
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        entityLabel="Quotations"
        columns={RATE_CARD_COLUMNS}
        requiredFields={['price']}
        preferSheet="Quotations"
        templateUrl="/templates/MERCON_RateCards_Import_Template.xlsx"
        onImport={(rows) => quotationService.importRows(rows as any)}
        invalidateKeys={[['quotations']]}
      />

      {/* Right-Side Route Details Inspection Drawer */}
      <QuotationRouteDrawer
        quotation={drawerQuotation}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        customerName={selectedGroup?.name}
        onOpenCustomerSurcharges={() => {
          if (drawerQuotation?.customerId || selectedGroup?.id) {
            handleOpenCustomerSurcharges(
              drawerQuotation?.customerId || selectedGroup!.id,
              selectedGroup?.name || 'Customer'
            );
          }
        }}
      />
    </DashboardLayout>
  );
}

export const RateCardListPage = QuotationListPage;
