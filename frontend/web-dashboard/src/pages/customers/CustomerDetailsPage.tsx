import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, Edit2, FileText, Building2, MapPin, Activity, AlertTriangle, Eye,
  Plus, RotateCw, ShieldCheck, CheckCircle2, Truck, Calendar,
  ChevronLeft, ChevronRight, TrendingUp, Sparkles, CreditCard, ArrowRight, Package, Layers, Phone, Mail,
  Trash2, UploadCloud, User, Download, ChevronDown, Car, UserCheck, Copy, PhoneCall,
  MoreVertical, Award, FolderOpen, Banknote, Gauge, Compass, Radio, Plane, Search, Tag,
  LayoutDashboard, ReceiptText, ArrowUpRight, MessageCircle, FileSpreadsheet, MapPinned
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import StatusBadge from '@/components/ui/StatusBadge';
import DeletedBadge from '@/components/ui/DeletedBadge';
import { customerService } from '@/services/customerService';
import { rateCardService, RateCard } from '@/services/rateCardService';
import { quotationService, Quotation } from '@/services/quotationService';
import { locationService, Location } from '@/services/locationService';
import QuotationFormDialog from '@/components/quotations/QuotationFormDialog';
import LocationFormDialog from '@/components/locations/LocationFormDialog';
import CustomerQuotationsTab from '@/components/customers/CustomerQuotationsTab';
import CustomerTripsTab from '@/components/customers/CustomerTripsTab';
import CustomerTripSheetsTab from '@/components/customers/CustomerTripSheetsTab';
import CustomerTrackingTab from '@/components/customers/CustomerTrackingTab';
import { useModuleEnabled } from '@/components/auth/RequireModule';
import VisualRouteProgress from '@/components/trips/VisualRouteProgress';
import ExcelImportDialog from '@/components/fleet/ExcelImportDialog';
import { LOCATION_COLUMNS } from '@/utils/importUtils';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import DataTable from '@/components/ui/DataTable';

import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';
import PhoneDisplay from '@/components/ui/PhoneDisplay';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { exportExcelTable } from '@/utils/exportUtils';
import { cn } from '@/lib/utils';
import {
  dk, EMPTY, fmtDate, fmtSar, toNum, personName, routeOf, humanize, tripFacts,
  StatusPill, DetailTitleRow, KpiCard, MetricCard, PanelHeader, PanelSearch, EmptyState, ListPager, ViewAllButton, TripCard, TripPreview,
} from '@/components/details/DetailKit';

function TicketCouponCard({
  children,
  isSelected,
  onClick,
  className
}: {
  children: React.ReactNode;
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        setSize({
          w: containerRef.current.clientWidth,
          h: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const w = size.w || 300;
  const h = size.h || 128;
  const r = 16;
  const nr = 9;
  const cy = h / 2;

  const pathD = w > 0 ? `
    M ${r} 0
    L ${w - r} 0
    A ${r} ${r} 0 0 1 ${w} ${r}
    L ${w} ${cy - nr}
    A ${nr} ${nr} 0 0 0 ${w} ${cy + nr}
    L ${w} ${h - r}
    A ${r} ${r} 0 0 1 ${w - r} ${h}
    L ${r} ${h}
    A ${r} ${r} 0 0 1 0 ${h - r}
    L 0 ${cy + nr}
    A ${nr} ${nr} 0 0 0 0 ${cy - nr}
    L 0 ${r}
    A ${r} ${r} 0 0 1 ${r} 0
    Z
  `.replace(/\s+/g, ' ').trim() : '';

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      className={cn(
        "relative transition-all cursor-pointer flex group shadow-2xs min-h-[128px] rounded-2xl bg-white dark:bg-slate-900 overflow-hidden",
        className
      )}
      style={{
        clipPath: size.w > 0 ? `path('${pathD}')` : undefined,
        WebkitClipPath: size.w > 0 ? `path('${pathD}')` : undefined,
      }}
    >
      {/* SVG Vector Ticket Contour Border Overlay */}
      {size.w > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-30 overflow-visible"
          viewBox={`0 0 ${w} ${h}`}
        >
          <path
            d={pathD}
            fill="none"
            stroke={isSelected ? "#FA634E" : "rgba(226, 232, 240, 0.9)"}
            strokeWidth={isSelected ? "2.5" : "1.5"}
            className="transition-colors duration-200"
          />
        </svg>
      )}
      {children}
    </div>
  );
}

function renderLocationPrecisionBadge(precision?: string | null, hasCoords?: boolean) {
  const p = precision || (hasCoords ? 'EXACT' : 'UNKNOWN');
  if (p === 'EXACT') {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 shadow-none font-bold px-2 py-0.5 text-[9px] rounded-full flex items-center gap-1">
        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
        Exact GPS
      </Badge>
    );
  }
  if (p === 'APPROXIMATE') {
    return (
      <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 shadow-none font-bold px-2 py-0.5 text-[9px] rounded-full flex items-center gap-1">
        Area Hub
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[9px] font-bold border rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 border-amber-200">
      Unpinned
    </Badge>
  );
}

export default function CustomerDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tz = useDeploymentTimezone();
  const queryClient = useQueryClient();

  const [isAddRateOpen, setIsAddRateOpen] = useState(false);
  const [editRateTarget, setEditRateTarget] = useState<RateCard | null>(null);
  const [isAddQuotationOpen, setIsAddQuotationOpen] = useState(false);
  const [editQuotationTarget, setEditQuotationTarget] = useState<Quotation | null>(null);
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [isImportLocationsOpen, setIsImportLocationsOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Search query & pagination for Trips box
  const [tripSearch, setTripSearch] = useState('');
  const [tripPage, setTripPage] = useState(1);

  // Search query & pagination for Quotations box (Right Column)
  const [quotationSearch, setQuotationSearch] = useState('');
  const [quotationPage, setQuotationPage] = useState(1);

  // Selected item previews in Middle Box
  const [selectedPreviewTrip, setSelectedPreviewTrip] = useState<any | null>(null);
  const [selectedPreviewQuotation, setSelectedPreviewQuotation] = useState<any | null>(null);

  // Active view tab state: default to 'overview'; ?tab=trip-sheets opens Trip sheets (linked from an invoice)
  const [searchParams] = useSearchParams();
  const tripSheetsEnabled = useModuleEnabled('company-reports');
  const [activeTab, setActiveTab] = useState<'overview' | 'dispatches' | 'quotations' | 'saved_places' | 'governance' | 'financials' | 'trip_sheets' | 'tracking'>(
    searchParams.get('tab') === 'trip-sheets' ? 'trip_sheets' : searchParams.get('tab') === 'tracking' ? 'tracking' : 'overview'
  );

  // Fetch Customer details
  const { data: customer, isLoading, error } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customerService.getById(id!),
    enabled: !!id,
  });

  // Customer financial statement summary
  const { data: statement, isLoading: isStatementLoading } = useQuery({
    queryKey: ['customer-statement', customer?.id],
    queryFn: () => customerService.getStatement(customer!.id),
    enabled: !!customer?.id,
  });

  // URL normalization: if navigated using name/id, replace with canonical UUID
  useEffect(() => {
    if (customer && customer.id && id !== customer.id) {
      navigate(`/customers/${customer.id}`, { replace: true });
    }
  }, [customer?.id, id, navigate]);

  // Customer rate cards
  const { data: rateCardsResponse } = useQuery({
    queryKey: ['rate-cards', 'customer', id],
    queryFn: () => rateCardService.getAll({ customerId: id! }),
    enabled: !!id,
  });

  // Customer quotations
  const { data: quotationsResponse } = useQuery({
    queryKey: ['quotations', 'customer', id],
    queryFn: () => quotationService.getAll({ customerId: id!, per_page: 'all' }),
    enabled: !!id,
  });

  // Customer canonical locations
  const { data: locationsRes } = useQuery({
    queryKey: ['locations', id],
    queryFn: () => locationService.getAll({ customerId: id! }),
    enabled: !!id,
  });
  const customerLocations = locationsRes?.data || [];
  const customerQuotations = quotationsResponse?.data || [];

  const deleteLocationMutation = useMutation({
    mutationFn: (locId: string) => locationService.delete(locId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['locations', id] }),
  });

  const refreshCustomer = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['customer', id] });
    await queryClient.invalidateQueries({ queryKey: ['customer-statement', customer?.id] });
    await queryClient.invalidateQueries({ queryKey: ['rate-cards', 'customer', id] });
    await queryClient.invalidateQueries({ queryKey: ['quotations', 'customer', id] });
    await queryClient.invalidateQueries({ queryKey: ['locations', id] });
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleDeleteCustomer = async () => {
    try {
      await customerService.delete(id!);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      navigate('/customers');
    } catch {
      toast.error('Failed to delete customer account.');
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout active="Customers" title="Customer Details">
        <div className="px-4 sm:px-6 pb-6 max-w-[1600px] mx-auto w-full space-y-6 animate-pulse">
          <div className="h-36 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-3 h-[400px] bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
            <div className="lg:col-span-6 h-[400px] bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
            <div className="lg:col-span-3 h-[400px] bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          </div>
          <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !customer) {
    return (
      <DashboardLayout active="Customers" title="Customer Details">
        <div className="px-4 sm:px-6 pb-6 max-w-[1600px] mx-auto w-full flex flex-col items-center justify-center text-center h-[60vh] gap-3">
          <AlertTriangle className="w-8 h-8 text-rose-600 shrink-0" />
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">Customer Account Not Found</h2>
          <p className="text-xs text-slate-500 max-w-md">
            The requested corporate customer account does not exist or may have been archived from the MERCON roster.
          </p>
          <Button onClick={() => navigate('/customers')} size="sm" className="mt-2 text-xs font-bold bg-[#FA634E] hover:bg-[#e0523d] text-white shadow-sm">
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Return to Customers Directory
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const customerRateCards = rateCardsResponse?.data || [];
  const customerTrips: any[] = customer.trips || [];
  const statusOf = (t: any) => (t.status || '').toLowerCase();
  // The API returns the latest 100 trips; _count carries the true total.
  const totalTripsCount = (customer as any)._count?.trips ?? customerTrips.length;
  const activeDispatchesCount = customerTrips.filter((t) => ['loading', 'intransit', 'delayed'].includes(statusOf(t))).length;
  const finishedTrips = customerTrips.filter((t) => ['completed', 'invoiced', 'delivered'].includes(statusOf(t)));
  const finishedTripsCount = finishedTrips.length;
  // A finished trip never flagged Delayed on the way counts as on time.
  const onTimeTripsCount = finishedTrips.filter((t) => !t.is_delayed).length;
  const onTimeRatio = finishedTripsCount > 0 ? Math.round((onTimeTripsCount / finishedTripsCount) * 100) : 0;

  const billedTrips = customerTrips.filter((t) => toNum(t.billing_amount) > 0);
  const totalTripRevenue = billedTrips.reduce((acc: number, t: any) => acc + toNum(t.billing_amount), 0);
  const openInvoicesCount = (statement?.invoices || []).filter((inv) => inv.balance_due > 0 && inv.status !== 'Draft' && inv.status !== 'Void').length;

  // Filter trips for the Trips card search input
  const filteredCustomerTrips = customerTrips.filter((t: any) => {
    if (!tripSearch.trim()) return true;
    const q = tripSearch.toLowerCase();
    const route = routeOf(t);
    return (
      (t.ref_id || '').toLowerCase().includes(q) ||
      personName(t.driver).toLowerCase().includes(q) ||
      (t.vehicle?.plate_number || '').toLowerCase().includes(q) ||
      route.origin.toLowerCase().includes(q) ||
      route.destination.toLowerCase().includes(q) ||
      statusOf(t).includes(q)
    );
  });

  // Filter quotations for Quotations card search input
  const filteredCustomerQuotations = customerQuotations.filter((quot: any) => {
    if (!quotationSearch.trim()) return true;
    const q = quotationSearch.toLowerCase();
    const route = routeOf(quot);
    const ref = (quot.quotation_number || quot.id || '').toString().toLowerCase();
    return (
      ref.includes(q) ||
      (quot.name || '').toLowerCase().includes(q) ||
      route.origin.toLowerCase().includes(q) ||
      route.destination.toLowerCase().includes(q)
    );
  });

  // Pagination constants & slicing (3 per page, removing scroll)
  const ITEMS_PER_PAGE = 3;

  const totalTripPages = Math.max(1, Math.ceil(filteredCustomerTrips.length / ITEMS_PER_PAGE));
  const paginatedCustomerTrips = filteredCustomerTrips.slice((tripPage - 1) * ITEMS_PER_PAGE, tripPage * ITEMS_PER_PAGE);

  const totalQuotationPages = Math.max(1, Math.ceil(filteredCustomerQuotations.length / ITEMS_PER_PAGE));
  const paginatedCustomerQuotations = filteredCustomerQuotations.slice((quotationPage - 1) * ITEMS_PER_PAGE, quotationPage * ITEMS_PER_PAGE);

  const handleExportLedger = async () => {
    if (!customerTrips || customerTrips.length === 0) return;
    
    const headers = [
      'S/L', 'DATE', 'JOB #', 'DRIVER NAME', 'VEHICLE NO:', 'VEHICLE TYPE',
      'MOBILE NUMBER', 'ASTOOL AL SHAHLA OR 3RD PARTY', 'SENDER/CUSTOMER',
      'RECEIVER', 'EXTRA CHARGES', 'BILLING RATE',
      'TOTAL AMOUNT', 'DRIVER CHARGE', 'BALANCE', 'COMPANY NAME'
    ];

    let sumExtraCharges = 0;
    let sumBilling = 0;
    let sumTotal = 0;
    let sumTripCharges = 0;
    let sumBalance = 0;

    const rows = customerTrips.map((t: any, index: number) => {
      const extraCharges = (t.charges || []).reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);
      const billing = Number(t.billing_amount || 0);
      const total = Number(t.total_amount || 0);
      const tripCharges = Number(t.trip_charges || 0);
      const balance = Number(t.balance_amount || total - tripCharges);

      sumExtraCharges += extraCharges;
      sumBilling += billing;
      sumTotal += total;
      sumTripCharges += tripCharges;
      sumBalance += balance;

      return [
        index + 1,
        formatInDeploymentTz(t.createdAt, tz, 'dd/MM/yyyy'),
        t.ref_id || 'N/A',
        t.is_third_party ? (t.third_party_driver_name || t.thirdPartyProvider?.name || '3PL Driver') : (t.driver ? `${t.driver.first_name} ${t.driver.last_name}` : 'Unassigned'),
        t.is_third_party ? (t.third_party_vehicle_plate || '3PL Vehicle') : (t.vehicle?.plate_number || 'Unassigned'),
        t.vehicle ? `${(t.vehicle.capacity_kg / 1000).toFixed(0)} TON` : (t.third_party_vehicle_type || '10 TON'),
        t.is_third_party ? (t.third_party_driver_phone || t.thirdPartyProvider?.phone || '') : (t.driver?.phone_primary || ''),
        t.is_third_party ? (t.thirdPartyProvider?.name || t.carrier_name || '3PL Provider') : (t.carrier_name || 'MERCON LOGISTICS'),
        customer.name,
        'Dropoff',
        extraCharges,
        billing,
        total,
        tripCharges,
        balance,
        customer.name
      ];
    });

    const summaryRow = [
      'TOTALS', '', '', '', '', '', '', '', '', '',
      sumExtraCharges, sumBilling, sumTotal, sumTripCharges, sumBalance, ''
    ];

    await exportExcelTable(
      `MERCON Customer Ledger - ${customer.name}`,
      headers,
      [...rows, summaryRow],
      `${customer.name.toLowerCase().replace(/\s+/g, '_')}_trip_ledger_${new Date().toISOString().slice(0,10)}.xlsx`
    );
  };

  return (
    <DashboardLayout active="Customers" title={customer.name} breadcrumb="Customers">
      <div className={dk.page}>

        {/* ── HEADER: logo, name, 3 KPI cards (same layout as Driver / Truck details) ── */}
        <div className="flex items-stretch gap-4 shrink-0">
          <div className={cn(dk.avatar, 'p-2.5')}>
            {customer.logo_url ? (
              <img src={customer.logo_url} alt={customer.name} className="w-full h-full object-contain rounded-full" />
            ) : (
              <div className="w-full h-full bg-[#FA634E] text-white flex items-center justify-center font-black text-4xl rounded-full">
                {customer.name?.[0]?.toUpperCase() || 'C'}
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col justify-end gap-2 min-w-0">
            <DetailTitleRow
              title={customer.name}
              status={
                <StatusPill tone={customer.isActive !== false ? 'green' : 'slate'} size="lg">
                  {customer.isActive !== false ? 'Active' : 'Inactive'}
                </StatusPill>
              }
              onEdit={() => navigate(`/customers/${customer.id}/edit`)}
              menu={
                <>
                  <DropdownMenuItem onClick={refreshCustomer} disabled={isRefreshing} className="font-semibold cursor-pointer text-xs">
                    <RotateCw className={cn("w-3.5 h-3.5 mr-2", isRefreshing && "animate-spin text-[#FA634E]")} />
                    Refresh Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportLedger} disabled={customerTrips.length === 0} className="font-semibold cursor-pointer text-xs">
                    <Download className="w-3.5 h-3.5 mr-2 text-slate-500" />
                    Export Ledger (Excel)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setIsDeleteModalOpen(true)} className="text-rose-600 font-semibold cursor-pointer text-xs">
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    Delete Account
                  </DropdownMenuItem>
                </>
              }
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
              <KpiCard icon={Truck} iconClass="text-[#FA634E]" label="Total Trips" value={totalTripsCount} sub="All-time dispatches" />
              <KpiCard icon={Activity} iconClass="text-blue-600 dark:text-blue-400" label="Active Trips" value={activeDispatchesCount} sub="Loading or on the road" />
              <KpiCard
                icon={ShieldCheck}
                iconClass="text-emerald-600 dark:text-emerald-400"
                label="On-Time Delivery"
                value={finishedTripsCount > 0 ? `${onTimeRatio}%` : EMPTY}
                sub={finishedTripsCount > 0 ? `${onTimeTripsCount} of ${finishedTripsCount} finished trips` : 'No finished trips yet'}
              />
            </div>
          </div>
        </div>

        {/* ── NAVIGATION TABS BAR ── */}
        <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2 shrink-0">
          {[
            { id: 'overview', label: 'Overview', icon: LayoutDashboard },
            { id: 'financials', label: 'Financial Summary', icon: ReceiptText },
            { id: 'dispatches', label: 'Dispatches', icon: Truck },
            { id: 'quotations', label: 'Quotations', icon: Tag },
            ...(tripSheetsEnabled ? [{ id: 'trip_sheets', label: 'Trip sheets', icon: FileSpreadsheet }] : []),
            { id: 'tracking', label: 'Tracking', icon: MapPinned },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-2xs",
                  isActive
                    ? "bg-[#FA634E] text-white"
                    : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── FINANCIAL SUMMARY TAB ── */}
        {activeTab === 'financials' && (
          <div className="space-y-4">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1: Total Outstanding */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-2xs flex items-center justify-between min-h-[96px] gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-orange-50 dark:bg-orange-950/60 border border-orange-200/80 dark:border-orange-900/60 flex items-center justify-center shrink-0">
                    <ReceiptText className="w-6 h-6 text-[#FA634E]" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider leading-none mb-1">
                      Total Outstanding
                    </p>
                    <span className="text-xl sm:text-2xl font-black text-[#FA634E] font-mono leading-none">
                      SAR {(statement?.total_outstanding ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Total Invoiced */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-2xs flex items-center justify-between min-h-[96px] gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-900/60 flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider leading-none mb-1">
                      Total Invoiced
                    </p>
                    <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono leading-none">
                      SAR {(statement?.total_invoiced ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 3: Total Paid */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-2xs flex items-center justify-between min-h-[96px] gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-900/60 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider leading-none mb-1">
                      Total Paid
                    </p>
                    <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono leading-none">
                      SAR {(statement?.total_paid ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Invoices Table */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-[#FA634E]" />
                  <h3 className="text-base font-black text-slate-900 dark:text-white">Customer Invoices</h3>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/finance/invoices')}
                  className="text-xs font-bold gap-1.5 rounded-xl text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100"
                >
                  <span>View All Invoices</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#FA634E]" />
                </Button>
              </div>

              {isStatementLoading ? (
                <div className="py-12 text-center text-xs font-bold text-slate-400 animate-pulse">
                  Loading financial summary statement...
                </div>
              ) : !statement?.invoices || statement.invoices.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-800/40">
                  <ReceiptText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No Invoices Found</p>
                  <p className="text-xs text-slate-400 mt-0.5">No invoices have been generated for this customer yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                        <th className="py-3 px-4">Invoice Ref</th>
                        <th className="py-3 px-4">Invoice Date</th>
                        <th className="py-3 px-4">Due Date</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Total Amount</th>
                        <th className="py-3 px-4 text-right">Balance Due</th>
                        <th className="py-3 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {statement.invoices.map((inv) => {
                        const isDraft = inv.status === 'Draft';
                        return (
                          <tr
                            key={inv.id}
                            onClick={() => navigate('/finance/invoices')}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
                          >
                            <td className="py-3.5 px-4 font-mono font-black text-slate-900 dark:text-white group-hover:text-[#FA634E]">
                              {inv.ref_id || 'Draft'}
                            </td>
                            <td className="py-3.5 px-4 font-medium text-slate-600 dark:text-slate-400">
                              {inv.invoice_date ? formatInDeploymentTz(inv.invoice_date, tz, 'dd MMM yyyy') : '—'}
                            </td>
                            <td className="py-3.5 px-4 font-medium text-slate-600 dark:text-slate-400">
                              {inv.due_date ? formatInDeploymentTz(inv.due_date, tz, 'dd MMM yyyy') : '—'}
                            </td>
                            <td className="py-3.5 px-4">
                              {isDraft ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold bg-amber-50 text-amber-700 border border-dashed border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                  Draft (Unissued)
                                </span>
                              ) : inv.status === 'Paid' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  Paid
                                </span>
                              ) : inv.status === 'PartiallyPaid' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800/60">
                                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                                  Partially Paid
                                </span>
                              ) : inv.status === 'Issued' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/60">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                  Issued
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                  Void
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                              SAR {inv.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-bold">
                              <span className={inv.balance_due > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-600 dark:text-slate-400"}>
                                SAR {inv.balance_due.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 group-hover:bg-[#FA634E] group-hover:text-white transition-colors">
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Render Tab Specific Ledgers when explicit tabs selected */}
        {activeTab === 'dispatches' && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 shadow-2xs">
            <CustomerTripsTab customerId={id!} customerName={customer.name} />
          </div>
        )}

        {activeTab === 'quotations' && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 shadow-2xs">
            <CustomerQuotationsTab
              customerId={id!}
              customerName={customer.name}
              onOpenAddQuotation={() => setIsAddQuotationOpen(true)}
              onOpenEditQuotation={(q) => setEditQuotationTarget(q)}
            />
          </div>
        )}

        {activeTab === 'tracking' && <CustomerTrackingTab customer={customer} />}

        {activeTab === 'trip_sheets' && tripSheetsEnabled && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 shadow-2xs">
            <CustomerTripSheetsTab customerId={id!} customerName={customer.name} />
          </div>
        )}

        {/* ── OVERVIEW: Trips | Performance & Account | Quotations (same 3 + 6 + 3 grid as Driver / Truck) ── */}
        {(activeTab === 'overview' || activeTab === 'saved_places' || activeTab === 'governance') && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">

            {/* ── COLUMN 1: TRIPS ── */}
            <div className={cn(dk.panel, 'xl:col-span-3')}>
              <PanelHeader icon={Truck} title="Trips" count={totalTripsCount} />
              <PanelSearch
                value={tripSearch}
                onChange={(v) => { setTripSearch(v); setTripPage(1); }}
                placeholder="Search customer trips..."
              />

              <div className="flex-1 space-y-3 pr-1 min-h-0 py-1">
                {paginatedCustomerTrips.length === 0 ? (
                  <EmptyState icon={Truck} title="No Trips Found" text="No trip records match this filter." />
                ) : (
                  paginatedCustomerTrips.map((trip: any) => {
                    const route = routeOf(trip);
                    const assigned = trip.is_third_party
                      ? (trip.third_party_driver_name || trip.thirdPartyProvider?.name || '3rd party')
                      : (personName(trip.driver) || trip.vehicle?.plate_number || 'Unassigned');
                    return (
                      <TripCard
                        key={trip.id}
                        refId={trip.ref_id || trip.id?.slice(0, 8).toUpperCase()}
                        status={trip.status}
                        amountLabel="Trip Value"
                        amount={fmtSar(trip.billing_amount)}
                        origin={route.origin}
                        destination={route.destination}
                        date={fmtDate(trip.planned_start || trip.createdAt, tz)}
                        footLabel="Assigned"
                        footValue={assigned}
                        footIcon={User}
                        selected={selectedPreviewTrip?.id === trip.id}
                        onClick={() => {
                          setSelectedPreviewQuotation(null);
                          setSelectedPreviewTrip((prev: any) => prev?.id === trip.id ? null : trip);
                        }}
                      />
                    );
                  })
                )}
              </div>

              <ListPager page={tripPage} totalPages={totalTripPages} onPage={setTripPage} />
              <ViewAllButton onClick={() => setActiveTab('dispatches')} />
            </div>

            {/* ── COLUMN 2: trip preview / quotation preview / performance & account ── */}
            <div className={cn(dk.panel, 'xl:col-span-6')}>
              {selectedPreviewTrip ? (
                <TripPreview
                  facts={tripFacts(selectedPreviewTrip, tz, { customerName: customer.name, customerLogo: customer.logo_url })}
                  stops={selectedPreviewTrip.stops || []}
                  tz={tz}
                  onBack={() => setSelectedPreviewTrip(null)}
                  backLabel="Back to Overview"
                  onOpen={() => navigate(`/trips/${selectedPreviewTrip.id}`)}
                />
              ) : selectedPreviewQuotation ? (
                (() => {
                  const q = selectedPreviewQuotation;
                  const route = routeOf(q);
                  return (
                    <div className="flex flex-col h-full gap-3">
                      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0 min-h-[40px]">
                        <button onClick={() => setSelectedPreviewQuotation(null)} className={dk.backButton}>
                          <ArrowLeft className="w-4 h-4 text-[#FA634E]" />
                          <span>Back to Overview</span>
                        </button>
                        <StatusPill tone={q.is_active ? 'green' : 'slate'} size="lg">{q.is_active ? 'Active' : 'Inactive'}</StatusPill>
                      </div>

                      <div className="flex items-baseline justify-between gap-3 shrink-0">
                        <span className="text-xl font-black font-mono text-[#FA634E] tracking-tight">
                          {`QUO-${q.quotation_number || q.id?.slice(0, 6).toUpperCase()}`}
                        </span>
                        <span className="text-xs font-medium text-slate-400">Created {fmtDate(q.createdAt, tz)}</span>
                      </div>

                      <div className="flex items-center gap-2 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-sm font-bold text-slate-900 dark:text-white shrink-0">
                        <MapPin className="w-4 h-4 text-[#FA634E] shrink-0" />
                        <span className="truncate capitalize" title={route.origin}>{route.origin}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
                        <span className="truncate capitalize" title={route.destination}>{route.destination}</span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 flex-1 content-start">
                        {[
                          { label: 'Rate', value: fmtSar(q.rate), mono: true, accent: true },
                          { label: 'Driver Payout', value: fmtSar(q.driver_payout), mono: true },
                          { label: 'Vehicle Class', value: q.source_vehicle_label || q.vehicle_class || q.vehicle_type || EMPTY },
                          { label: 'Billing', value: q.billing_type ? humanize(q.billing_type) : EMPTY },
                          { label: 'Valid From', value: fmtDate(q.valid_from, tz) },
                          { label: 'Valid To', value: fmtDate(q.valid_to, tz) },
                        ].map((f) => (
                          <div key={f.label} className={dk.tile}>
                            <span className={dk.label}>{f.label}</span>
                            <span className={cn(dk.value, 'block pt-1', f.mono && 'font-mono', f.accent && 'text-[#FA634E] dark:text-[#FA634E]')}>{f.value}</span>
                          </div>
                        ))}
                      </div>

                      <Button
                        onClick={() => setEditQuotationTarget(q)}
                        className="w-full h-10 bg-[#FA634E] hover:bg-[#e0523d] text-white text-xs font-black rounded-xl flex items-center justify-center gap-2 shrink-0"
                      >
                        <Edit2 className="w-4 h-4" />
                        <span>Edit Quotation</span>
                      </Button>
                    </div>
                  );
                })()
              ) : (
                <div className="flex flex-col h-full gap-3">
                  <PanelHeader icon={TrendingUp} title="Account Performance" />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 shrink-0 -mt-1">
                    <MetricCard
                      tone="coral"
                      label="Trip Revenue"
                      icon={Banknote}
                      value={fmtSar(totalTripRevenue, { allowZero: true })}
                      pill={`${billedTrips.length} of ${customerTrips.length} trips priced`}
                    />
                    <MetricCard
                      tone="indigo"
                      label="Invoiced"
                      icon={ReceiptText}
                      value={statement ? fmtSar(statement.total_invoiced, { allowZero: true }) : EMPTY}
                      pill={statement ? `${fmtSar(statement.total_paid, { allowZero: true })} paid` : 'Loading…'}
                    />
                    <MetricCard
                      tone="blue"
                      label="Outstanding"
                      icon={CreditCard}
                      value={statement ? fmtSar(statement.total_outstanding, { allowZero: true }) : EMPTY}
                      pill={statement ? `${openInvoicesCount} open invoice${openInvoicesCount === 1 ? '' : 's'}` : 'Loading…'}
                    />
                  </div>

                  {/* Account details — real customer fields only; empty ones collapse into one line */}
                  {(() => {
                    const contactPhone = customer.primary_contact_phone || customer.contact_phone;
                    const fields = [
                      { key: 'contact', label: 'Primary Contact', icon: User, iconClass: 'text-rose-500', value: customer.primary_contact_person, sub: contactPhone },
                      { key: 'phone', label: 'Phone', icon: Phone, iconClass: 'text-emerald-600', value: contactPhone, mono: true },
                      { key: 'terms', label: 'Payment Terms', icon: CreditCard, iconClass: 'text-indigo-600', value: customer.payment_terms },
                      { key: 'workflow', label: 'Driver Workflow', icon: Sparkles, iconClass: 'text-amber-600', value: customer.driver_workflow === 'EXTERNAL_APP' ? 'External app (screenshots)' : 'MERCON Driver App' },
                      { key: 'whatsapp', label: 'WhatsApp Group', icon: MessageCircle, iconClass: 'text-emerald-600', value: customer.whatsapp_group_name },
                      { key: 'since', label: 'Customer Since', icon: Calendar, iconClass: 'text-blue-600', value: customer.createdAt ? fmtDate(customer.createdAt, tz) : null },
                    ];
                    const filled = fields.filter((f) => f.value);
                    const missing = fields.filter((f) => !f.value);
                    return (
                      <div className="flex-1 flex flex-col min-h-0 gap-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className={dk.label}>Account Details</p>
                          <span className="font-mono text-[10.5px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                            CUST-{customer.id.slice(0, 8).toUpperCase()}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 content-start">
                          {filled.map((f) => {
                            const Icon = f.icon;
                            return (
                              <div key={f.key} className={dk.tile}>
                                <div className="flex items-center gap-1.5">
                                  <Icon className={cn('w-3.5 h-3.5 stroke-[2.2] shrink-0', f.iconClass)} />
                                  <span className={dk.label}>{f.label}</span>
                                </div>
                                <p className={cn(dk.value, 'pt-1', f.mono && 'font-mono')} title={String(f.value)}>{f.value}</p>
                              </div>
                            );
                          })}
                        </div>
                        {missing.length > 0 && (
                          <button
                            onClick={() => navigate(`/customers/${customer.id}/edit`)}
                            className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-dashed border-amber-300/80 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/20 text-left cursor-pointer hover:bg-amber-50 transition-colors"
                          >
                            <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 truncate">
                              Missing: {missing.map((f) => f.label).join(', ')}
                            </span>
                            <span className="text-xs font-bold text-[#FA634E] shrink-0 flex items-center gap-1">
                              Complete profile <ArrowRight className="w-3.5 h-3.5" />
                            </span>
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* ── COLUMN 3: QUOTATIONS ── */}
            <div className={cn(dk.panel, 'xl:col-span-3')}>
              <PanelHeader
                icon={Tag}
                title="Quotations"
                count={customerQuotations.length}
                right={
                  <button
                    onClick={() => setIsAddQuotationOpen(true)}
                    className={cn(dk.iconButton, 'w-8 h-8 text-[#FA634E]')}
                    title="Add Quotation"
                    aria-label="Add Quotation"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                }
              />
              <PanelSearch
                value={quotationSearch}
                onChange={(v) => { setQuotationSearch(v); setQuotationPage(1); }}
                placeholder="Search quotations..."
              />

              <div className="flex-1 space-y-3 pr-0.5 min-h-0 py-1">
                {paginatedCustomerQuotations.length === 0 ? (
                  <EmptyState
                    icon={Tag}
                    title="No Quotations Found"
                    text="No price agreements for this customer yet."
                    action={
                      <Button size="sm" onClick={() => setIsAddQuotationOpen(true)} className="mt-2 text-xs bg-[#FA634E] hover:bg-[#e0523d] text-white font-bold h-7 rounded-xl">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Create Quotation
                      </Button>
                    }
                  />
                ) : (
                  paginatedCustomerQuotations.map((quot: any) => {
                    const route = routeOf(quot);
                    const isSelected = selectedPreviewQuotation?.id === quot.id;
                    return (
                      <TicketCouponCard
                        key={quot.id}
                        isSelected={isSelected}
                        onClick={() => {
                          setSelectedPreviewTrip(null);
                          setSelectedPreviewQuotation((prev: any) => prev?.id === quot.id ? null : quot);
                        }}
                      >
                        {/* LEFT MAIN SECTION */}
                        <div className="flex-1 p-3.5 flex flex-col justify-between border-r border-dashed border-slate-200 dark:border-slate-800 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <Tag className="w-4 h-4 text-[#FA634E] shrink-0 stroke-[2.2]" />
                            <span className="text-sm font-black text-slate-900 dark:text-white font-mono leading-none tracking-tight">
                              {`QUO-${quot.quotation_number || quot.id.slice(0, 5).toUpperCase()}`}
                            </span>
                          </div>
                          <p className="my-2 text-sm font-bold text-slate-900 dark:text-white truncate capitalize" title={`${route.origin} → ${route.destination}`}>
                            {route.origin} <span className="text-slate-400 font-normal">→</span> {route.destination}
                          </p>
                          <div className="w-full h-px bg-slate-100 dark:bg-slate-800" />
                          <div className="flex items-center gap-2 pt-1.5">
                            <Calendar className="w-4 h-4 text-slate-400 shrink-0 stroke-[1.75]" />
                            <div className="min-w-0">
                              <span className={cn(dk.micro, 'block mb-1')}>Created</span>
                              <span className="text-[11px] font-bold text-slate-900 dark:text-white leading-none block">{fmtDate(quot.createdAt, tz)}</span>
                            </div>
                          </div>
                        </div>

                        {/* RIGHT STUB SECTION */}
                        <div className="w-[112px] shrink-0 p-3.5 flex flex-col justify-between items-end text-right">
                          <StatusPill tone={quot.is_active !== false ? 'green' : 'slate'}>
                            {quot.is_active !== false ? 'Active' : 'Inactive'}
                          </StatusPill>
                          <div className="w-full text-right">
                            <span className={cn(dk.micro, 'block mb-1')}>Rate</span>
                            <span className="text-sm font-black font-mono text-slate-900 dark:text-white leading-none block tracking-tight truncate">
                              {fmtSar(quot.rate)}
                            </span>
                          </div>
                        </div>
                      </TicketCouponCard>
                    );
                  })
                )}
              </div>

              <ListPager page={quotationPage} totalPages={totalQuotationPages} onPage={setQuotationPage} />
              <ViewAllButton label="View All Quotations" onClick={() => setActiveTab('quotations')} />
            </div>

          </div>
        )}

      </div>

      {/* Helper icon for Ship */}
      <ShipIcon className="hidden" />

      {/* ── DELETE CUSTOMER CONFIRMATION MODAL ────────────────────────────── */}
      <Dialog open={isDeleteModalOpen} onOpenChange={(open) => !open && setIsDeleteModalOpen(false)}>
        <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden border-slate-200 dark:border-slate-800">
          <DialogHeader className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-rose-50/50 dark:bg-rose-950/20">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <DialogTitle className="text-base font-black">Delete Customer Account</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              Deleting customer <strong className="text-slate-900 dark:text-slate-100">{customer.name}</strong> will revoke account access and archive their profile records.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-4 text-xs text-slate-600 dark:text-slate-400">
            <p>Are you sure you want to delete this corporate customer account? Active dispatches and invoice history will remain preserved with deleted status indicator.</p>
          </div>
          <DialogFooter className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsDeleteModalOpen(false)}
              className="text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleDeleteCustomer}
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 shadow-xs"
            >
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExcelImportDialog
        isOpen={isImportLocationsOpen}
        onClose={() => setIsImportLocationsOpen(false)}
        entityLabel="Locations"
        columns={LOCATION_COLUMNS}
        requiredFields={['customer_name', 'name']}
        preferSheet="locations"
        templateUrl="/templates/MERCON_Locations_Import_Template.xlsx"
        matchLabel="customer + name"
        onImport={(rows) => locationService.importRows(rows)}
        invalidateKeys={[['locations', id || '']]}
      />

      <LocationFormDialog
        isOpen={isAddLocationOpen}
        onClose={() => setIsAddLocationOpen(false)}
        defaultCustomerId={id!}
      />

      <QuotationFormDialog
        isOpen={isAddQuotationOpen || !!editQuotationTarget}
        onClose={() => {
          setIsAddQuotationOpen(false);
          setEditQuotationTarget(null);
        }}
        quotation={editQuotationTarget}
        lockedCustomerId={id!}
        lockedCustomerName={customer?.name}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['quotations'] });
          queryClient.invalidateQueries({ queryKey: ['rate-cards'] });
        }}
      />

      <QuotationFormDialog
        isOpen={isAddRateOpen}
        onClose={() => setIsAddRateOpen(false)}
        lockedCustomerId={id || ''}
        lockedCustomerName={customer?.name}
      />

      <QuotationFormDialog
        isOpen={!!editRateTarget}
        quotation={editRateTarget}
        onClose={() => setEditRateTarget(null)}
        lockedCustomerId={id}
        lockedCustomerName={customer?.name}
      />

    </DashboardLayout>
  );
}

function ShipIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.03" />
      <path d="M12 10V4" />
      <path d="M8 8h8" />
    </svg>
  );
}
