import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, Edit2, FileText, Building2, MapPin, Activity, AlertTriangle, Eye,
  Plus, RotateCw, ShieldCheck, CheckCircle2, Truck, Calendar,
  ChevronLeft, ChevronRight, TrendingUp, Sparkles, CreditCard, ArrowRight, Package, Layers, Phone, Mail,
  Trash2, UploadCloud, User, Download, ChevronDown, Car, UserCheck, Copy, PhoneCall,
  MoreVertical, Award, FolderOpen, Banknote, Gauge, Compass, Radio, Plane, Search, Tag,
  LayoutDashboard, ReceiptText, ArrowUpRight
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

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800/80 last:border-0">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">{label}</span>
      <span className="text-xs min-w-0 text-right">{children}</span>
    </div>
  );
}

function ScrollingRouteTitle({ origin, dest }: { origin: string; dest: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    if (containerRef.current && textRef.current) {
      setIsOverflowing(textRef.current.scrollWidth > containerRef.current.clientWidth);
    }
  }, [origin, dest]);

  if (!isOverflowing) {
    return (
      <div ref={containerRef} className="overflow-hidden min-w-0 w-full">
        <div ref={textRef} className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight flex items-center gap-1 truncate">
          <span className="capitalize">{origin}</span>
          <span className="text-slate-900 dark:text-white font-normal mx-0.5">→</span>
          <span className="capitalize">{dest}</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="overflow-hidden min-w-0 w-full relative group/route">
      <style>{`
        @keyframes routeMarquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
      <div
        className="inline-flex items-center gap-4 whitespace-nowrap text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight group-hover/route:[animation-play-state:paused]"
        style={{
          animation: 'routeMarquee 10s linear infinite',
        }}
      >
        <div className="flex items-center gap-1.5">
          <span className="capitalize">{origin}</span>
          <span className="text-slate-900 dark:text-white font-normal mx-0.5">→</span>
          <span className="capitalize">{dest}</span>
        </div>
        <span className="text-slate-400">•</span>
        <div className="flex items-center gap-1.5">
          <span className="capitalize">{origin}</span>
          <span className="text-slate-900 dark:text-white font-normal mx-0.5">→</span>
          <span className="capitalize">{dest}</span>
        </div>
        <span className="text-slate-400">•</span>
      </div>
    </div>
  );
}

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

function renderTripCardBadge(status: string) {
  const norm = (status || '').toLowerCase().replace(/[\s\-_]+/g, '');
  if (norm === 'intransit' || norm === 'ontrip' || norm === 'inprogress') {
    return (
      <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/40 px-2 py-0.5 rounded-full text-[10.5px] font-black flex items-center gap-1 shadow-2xs shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        In Transit
      </span>
    );
  }
  if (norm === 'loading') {
    return (
      <span className="bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200/80 dark:border-amber-800/40 px-2 py-0.5 rounded-full text-[10.5px] font-black flex items-center gap-1 shadow-2xs shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
        Loading
      </span>
    );
  }
  if (norm === 'completed' || norm === 'delivered' || norm === 'invoiced') {
    return (
      <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/40 px-2 py-0.5 rounded-full text-[10.5px] font-black flex items-center gap-1 shadow-2xs shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        {status || 'Completed'}
      </span>
    );
  }
  return (
    <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full text-[10.5px] font-black flex items-center gap-1 shadow-2xs shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
      {status || '—'}
    </span>
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

  // Active view tab state: default to 'overview' matching reference screenshot
  const [activeTab, setActiveTab] = useState<'overview' | 'dispatches' | 'quotations' | 'saved_places' | 'governance' | 'financials'>('overview');

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
    enabled: !!customer?.id && activeTab === 'financials',
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
  const customerTrips = customer.trips || [];
  const completedTripsCount = customerTrips.filter((t: any) => t.status === 'Completed' || t.status === 'Delivered').length;
  const activeDispatchesCount = customerTrips.filter((t: any) => t.status === 'In Progress' || t.status === 'Dispatched' || t.status === 'Assigned').length;
  const totalTripsCount = customerTrips.length || 0;

  const onTimeTripsCount = customerTrips.filter((t: any) => !t.is_delayed && t.status !== 'Delayed').length;
  const onTimeRatio = totalTripsCount > 0 ? Math.round((onTimeTripsCount / totalTripsCount) * 100) : 100;

  const totalTripRevenue = customerTrips.reduce((acc: number, t: any) => {
    const rate = Number(t.financials?.agreed_rate ?? t.agreed_rate ?? t.billing_rate ?? 0);
    return acc + (isNaN(rate) ? 0 : rate);
  }, 0);

  // Filter trips for the Trips card search input
  const filteredCustomerTrips = customerTrips.filter((t: any) => {
    if (!tripSearch.trim()) return true;
    const q = tripSearch.toLowerCase();
    const ref = (t.ref_id || '').toLowerCase();
    const driverName = t.driver ? `${t.driver.first_name} ${t.driver.last_name}`.toLowerCase() : '';
    const origin = (t.route_origin || t.origin_name || t.stops?.[0]?.source_label || '').toLowerCase();
    const dest = (t.route_destination || t.destination_name || t.stops?.[t.stops?.length - 1]?.source_label || '').toLowerCase();
    const status = (t.status || '').toLowerCase();
    return ref.includes(q) || driverName.includes(q) || origin.includes(q) || dest.includes(q) || status.includes(q);
  });

  // Filter quotations for Quotations card search input
  const filteredCustomerQuotations = customerQuotations.filter((quot: any) => {
    if (!quotationSearch.trim()) return true;
    const q = quotationSearch.toLowerCase();
    const ref = (quot.quotation_number || quot.id || '').toString().toLowerCase();
    const notes = (quot.notes || quot.title || '').toLowerCase();
    const status = (quot.status || '').toLowerCase();
    return ref.includes(q) || notes.includes(q) || status.includes(q);
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
    <DashboardLayout 
      active="Customers" 
      title={customer.name}
      breadcrumb="Customers"
      actions={
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-xl border-slate-200 dark:border-slate-800">
                <MoreVertical className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-xl z-50">
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
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/customers/${customer.id}/edit`)}
            className="h-8 px-3 rounded-xl border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit Profile
          </Button>
        </div>
      }
    >
      <div className="p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-4 bg-[#EEF1F6]/40 dark:bg-slate-950">
        
        {/* ── TOP HEADER & METRICS SECTION (Matches Driver Details Page Layout) ── */}
        <div className="flex items-stretch gap-4 shrink-0 mt-1">

          {/* LEFT: CUSTOMER PHOTO / LOGO CARD */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-full shadow-2xs shrink-0 w-32 h-32 sm:w-36 sm:h-36 overflow-hidden flex items-center justify-center p-2.5">
            {customer.logo_url ? (
              <img
                src={customer.logo_url}
                alt={customer.name}
                className="w-full h-full object-contain rounded-full"
              />
            ) : (
              <div className="w-full h-full bg-[#FA634E] text-white flex items-center justify-center font-black text-4xl sm:text-5xl rounded-full shadow-xs">
                {customer.name?.[0]?.toUpperCase() || 'C'}
              </div>
            )}
          </div>

          {/* RIGHT: CUSTOMER NAME ABOVE + 3 KPI CARDS BELOW IN THE SAME ROW */}
          <div className="flex-1 flex flex-col justify-end gap-2 min-w-0">

            {/* Customer Name Title Bar */}
            <div className="flex items-center justify-between gap-3 pt-0">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">
                  {customer.name}
                </h1>
                <span className={cn(
                  "inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs sm:text-sm font-bold shadow-2xs border uppercase tracking-wider",
                  customer.isActive !== false
                    ? "bg-emerald-100/90 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/40"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                )}>
                  <span className={cn("w-2.5 h-2.5 rounded-full", customer.isActive !== false ? "bg-emerald-500" : "bg-slate-400")}></span>
                  {customer.isActive !== false ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-xl w-8 h-8 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs hover:bg-slate-100">
                      <MoreVertical className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 rounded-xl z-50">
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
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  onClick={() => navigate(`/customers/${customer.id}/edit`)}
                  className="bg-[#FA634E] hover:bg-[#e0523d] text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-2xs transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit Profile
                </Button>
              </div>
            </div>

            {/* 3 KPI CARDS ROW (Large Icon on Left, Vertically Middle Aligned, Values & Titles on Right) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
              {/* KPI Card 1: TOTAL TRIPS */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center justify-between min-h-[96px] gap-3">
                <Truck className="w-10 h-10 sm:w-11 sm:h-11 text-[#FA634E] stroke-[1.75] shrink-0" />
                <div className="flex flex-col items-end justify-center min-w-0 text-right">
                  <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-1.5 truncate">
                    TOTAL TRIPS
                  </p>
                  <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-none">
                    {totalTripsCount}
                  </span>
                  <p className="text-[11px] font-semibold text-slate-400 mt-1 truncate">
                    All-time dispatches
                  </p>
                </div>
              </div>

              {/* KPI Card 2: ACTIVE DISPATCHES */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center justify-between min-h-[96px] gap-3">
                <Activity className="w-10 h-10 sm:w-11 sm:h-11 text-blue-600 dark:text-blue-400 stroke-[1.75] shrink-0" />
                <div className="flex flex-col items-end justify-center min-w-0 text-right">
                  <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-1.5 truncate">
                    ACTIVE DISPATCHES
                  </p>
                  <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-none">
                    {activeDispatchesCount}
                  </span>
                  <p className="text-[11px] font-semibold text-slate-400 mt-1 truncate">
                    Currently on road
                  </p>
                </div>
              </div>

              {/* KPI Card 3: ON-TIME DELIVERY */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center justify-between min-h-[96px] gap-3">
                <TrendingUp className="w-10 h-10 sm:w-11 sm:h-11 text-emerald-600 dark:text-emerald-400 stroke-[1.75] shrink-0" />
                <div className="flex flex-col items-end justify-center min-w-0 text-right">
                  <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-1.5 truncate">
                    ON-TIME DELIVERY
                  </p>
                  <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-none">
                    {onTimeRatio}%
                  </span>
                  <p className="text-[11px] font-semibold text-slate-400 mt-1 truncate">
                    SLA completion rate
                  </p>
                </div>
              </div>
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

        {/* ── MAIN UNIFIED WORKSPACE (Overview Layout matching Mockup Alignment) ── */}
        {(activeTab === 'overview' || activeTab === 'saved_places' || activeTab === 'governance') && (
          <>
            {/* ── 2. MIDDLE 3-COLUMN SPLIT GRID (3 + 6 + 3 = 12 total grid width) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              
              {/* ── COLUMN 1: TRIPS (Left, lg:col-span-3 - Compact Side Column) ── */}
              <div className="lg:col-span-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col justify-between h-full space-y-3">
                <div className="flex flex-col h-full min-h-0 justify-between space-y-2">
                  {/* Header: Title "Trips" + Subtitle */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Truck className="w-5 h-5 text-[#FA634E] stroke-[2] shrink-0" />
                      <div className="min-w-0">
                        <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight truncate">Trips</h3>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] font-mono font-bold">
                      {totalTripsCount}
                    </Badge>
                  </div>

                  {/* Search Bar Input for Trips */}
                  <div className="relative my-1 shrink-0">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search trips..."
                      value={tripSearch}
                      onChange={(e) => {
                        setTripSearch(e.target.value);
                        setTripPage(1);
                      }}
                      className="w-full pl-8 pr-7 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-[#FA634E] focus:ring-1 focus:ring-[#FA634E] transition-all shadow-2xs"
                    />
                    {tripSearch && (
                      <button
                        onClick={() => { setTripSearch(''); setTripPage(1); }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-extrabold text-slate-400 hover:text-slate-700 bg-slate-200/60 rounded-full w-4 h-4 flex items-center justify-center cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Paginated Trip Cards List */}
                  <div className="flex-1 space-y-3 pr-1 min-h-0 py-1">
                    {paginatedCustomerTrips.length === 0 ? (
                      <div className="h-full min-h-[220px] p-4 text-center border border-dashed border-slate-200/80 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-800/40 flex flex-col items-center justify-center">
                        <Truck className="w-6 h-6 text-slate-300 mx-auto mb-1.5 stroke-[1.5]" />
                        <p className="text-xs font-bold text-slate-600 dark:text-slate-400">No Trips Found</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">No trip records found matching filter.</p>
                      </div>
                    ) : (
                      paginatedCustomerTrips.map((trip: any, idx: number) => {
                        const tripIdStr = trip.ref_id || trip.id?.slice(0, 8).toUpperCase() || '—';
                        const status = trip.status || '—';
                        const stops = trip.stops || [];
                        const origin = trip.route_origin || trip.origin_name || stops[0]?.source_label || stops[0]?.location_name || '—';
                        const dest = trip.route_destination || trip.destination_name || stops[stops.length - 1]?.source_label || stops[stops.length - 1]?.location_name || '—';
                        const payloadStr = trip.planned_capacity_kg ? `${(trip.planned_capacity_kg / 1000).toFixed(0)} TON` : (trip.vehicle?.capacity_kg ? `${(trip.vehicle.capacity_kg / 1000).toFixed(0)} TON` : '—');
                        const dateStr = formatInDeploymentTz(trip.createdAt || new Date(), tz, 'dd MMM yyyy');
                        const driverOrCarrier = trip.is_third_party ? (trip.thirdPartyProvider?.name || '—') : (trip.driver ? `${trip.driver.first_name} ${trip.driver.last_name}` : (trip.vehicle?.plate_number ? `Vehicle ${trip.vehicle.plate_number}` : '—'));
                        const isSelected = selectedPreviewTrip?.id === trip.id;

                        return (
                          <div
                            key={trip.id || idx}
                            onClick={() => {
                              setSelectedPreviewQuotation(null);
                              setSelectedPreviewTrip((prev: any) => prev?.id === trip.id ? null : trip);
                            }}
                            className={cn(
                              "relative overflow-hidden rounded-2xl border transition-all cursor-pointer flex flex-col justify-between p-3 sm:p-3.5 gap-2 group shadow-2xs",
                              isSelected
                                ? "border-[#FA634E] ring-1 ring-[#FA634E]/30 bg-white dark:bg-slate-900"
                                : "border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50/60 dark:hover:bg-slate-800/50"
                            )}
                          >
                            {/* TOP ROW: TRIP ID & STATUS BADGE | PAYLOAD PILL */}
                            <div className="flex items-center justify-between gap-2 z-10">
                              <div className="flex items-center gap-2 min-w-0">
                                <p className="text-sm sm:text-base font-black text-slate-900 dark:text-white font-mono leading-none tracking-tight group-hover:text-[#FA634E]">
                                  {tripIdStr}
                                </p>
                                {renderTripCardBadge(status)}
                              </div>

                              <div className="flex flex-col items-end shrink-0">
                                <span className="text-[8.5px] font-black uppercase text-[#FA634E] tracking-wider mb-0.5">
                                  Payload
                                </span>
                                <span className="text-[11px] font-black font-mono text-[#FA634E] bg-orange-50 dark:bg-orange-950/60 border border-orange-200/80 dark:border-orange-900/60 px-2 py-0.5 rounded-md shadow-2xs leading-none">
                                  {payloadStr}
                                </span>
                              </div>
                            </div>

                            {/* MIDDLE ROW: FROM -> TO ROUTE */}
                            <div className="flex items-center gap-2 sm:gap-3 z-10 py-0.5">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <MapPin className="w-4 h-4 text-[#FA634E] fill-[#FA634E]/20 shrink-0" />
                                <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-tight truncate capitalize">
                                  {origin}
                                </p>
                              </div>

                              <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0 mx-0.5" />

                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <MapPin className="w-4 h-4 text-blue-600 fill-blue-600/20 shrink-0" />
                                <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-tight truncate capitalize">
                                  {dest}
                                </p>
                              </div>
                            </div>

                            {/* DIVIDER LINE */}
                            <div className="w-full h-px bg-slate-100 dark:bg-slate-800 z-10"></div>

                            {/* BOTTOM ROW: DEPARTURE | ASSIGNED DRIVER/VEHICLE */}
                            <div className="flex items-center gap-3 justify-between z-10">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[8.5px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-0.5">
                                    DEPARTURE
                                  </p>
                                  <p className="text-[11px] font-black text-slate-900 dark:text-white truncate">
                                    {dateStr}
                                  </p>
                                </div>
                              </div>

                              <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 shrink-0"></div>

                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <User className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[8.5px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-0.5">
                                    ASSIGNED
                                  </p>
                                  <p className="text-[11px] font-black text-slate-900 dark:text-white truncate">
                                    {driverOrCarrier}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Trips Box Pagination Controls & View All Trips Button */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2 shrink-0">
                    <div className="flex items-center justify-between text-xs">
                      <button
                        disabled={tripPage === 1}
                        onClick={() => setTripPage((p) => Math.max(1, p - 1))}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-bold flex items-center gap-1 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5 text-[#FA634E]" />
                        <span>Prev</span>
                      </button>
                      <span className="text-[10px] font-extrabold text-slate-500 font-mono">
                        Page {tripPage} of {totalTripPages}
                      </span>
                      <button
                        disabled={tripPage >= totalTripPages}
                        onClick={() => setTripPage((p) => Math.min(totalTripPages, p + 1))}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-bold flex items-center gap-1 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <span>Next</span>
                        <ChevronRight className="w-3.5 h-3.5 text-[#FA634E]" />
                      </button>
                    </div>

                    <button
                      onClick={() => setActiveTab('dispatches')}
                      className="w-full py-1.5 px-3 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 hover:bg-[#FA634E] hover:text-white hover:border-[#FA634E] text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer group"
                    >
                      <span>View All Trips</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </div>
              </div>

              {/* ── COLUMN 2: UNIFIED SINGLE MIDDLE BOX (Center, lg:col-span-6 - Displays Previews or Overview Visuals) ── */}
              <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col justify-between h-full space-y-4 min-h-[460px]">
                
                {selectedPreviewTrip ? (
                  /* ── 1. TRIP PREVIEW IN MIDDLE BOX (Matching Photo & Driver/Truck Details Preview) ── */
                  <div className="flex flex-col h-full justify-between space-y-3 animate-in fade-in zoom-in-95 duration-200">
                    {/* Header Bar with Back Button & Status Badge */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
                      <button
                        onClick={() => setSelectedPreviewTrip(null)}
                        className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                      >
                        <ArrowLeft className="w-4 h-4 text-[#FA634E]" />
                        <span>Back to Trips</span>
                      </button>

                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-black border flex items-center gap-1.5 shadow-2xs uppercase tracking-wider",
                        (selectedPreviewTrip.status || '').toLowerCase() === 'completed' || (selectedPreviewTrip.status || '').toLowerCase() === 'delivered'
                          ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/40"
                          : (selectedPreviewTrip.status || '').toLowerCase() === 'intransit' || (selectedPreviewTrip.status || '').toLowerCase() === 'in transit' || (selectedPreviewTrip.status || '').toLowerCase() === 'dispatched'
                          ? "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-200/80 dark:border-amber-800/40"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                      )}>
                        {selectedPreviewTrip.status || 'Scheduled'}
                      </span>
                    </div>

                    {/* Trip ID Header & Date */}
                    <div className="flex items-center justify-between text-xs font-bold shrink-0 pt-1">
                      <span className="text-xl sm:text-2xl font-black font-mono text-[#FA634E]">
                        {selectedPreviewTrip.ref_id || `TRP-${selectedPreviewTrip.id?.slice(0, 4).toUpperCase() || '0742'}`}
                      </span>
                      <span className="text-xs font-bold text-slate-400">
                        Date: <strong className="text-slate-700 dark:text-slate-300 font-semibold">{formatInDeploymentTz(selectedPreviewTrip.createdAt || selectedPreviewTrip.planned_start || new Date(), tz, 'dd MMM yyyy, HH:mm')}</strong>
                      </span>
                    </div>

                    {/* Visual Route Progress Component */}
                    {(() => {
                      const stops = selectedPreviewTrip.stops || [];
                      const origin = selectedPreviewTrip.route_origin || selectedPreviewTrip.origin_name || stops[0]?.source_label || stops[0]?.location_name || 'Riyadh';
                      const dest = selectedPreviewTrip.route_destination || selectedPreviewTrip.destination_name || stops[stops.length - 1]?.source_label || stops[stops.length - 1]?.location_name || 'Dammam';
                      const previewStops = stops.length > 0 ? stops : [
                        { id: '1', sequence: 1, location_name: origin, stop_type: 'Pickup' },
                        { id: '2', sequence: 2, location_name: dest, stop_type: 'Dropoff' }
                      ];

                      const rawPayout = Number(selectedPreviewTrip.driver_charge || selectedPreviewTrip.driver_payout || (selectedPreviewTrip.billing_amount ? Number(selectedPreviewTrip.billing_amount) * 0.25 : 0));
                      const payoutStr = rawPayout > 0 ? `SAR ${rawPayout.toFixed(2)}` : '—';
                      const distanceStr = selectedPreviewTrip.planned_distance || selectedPreviewTrip.distance_km ? `${selectedPreviewTrip.planned_distance || selectedPreviewTrip.distance_km} km` : '—';

                      return (
                        <>
                          <div className="shrink-0 my-1 overflow-hidden border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-800/40">
                            <VisualRouteProgress
                              stops={previewStops}
                              tz={tz}
                              tripStatus={selectedPreviewTrip.status || 'Completed'}
                              hideBadges={true}
                              hidePulseAnimation={true}
                            />
                          </div>

                          {/* 6 KPI Cards Grid (2 rows x 3 columns) */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 flex-1 items-stretch my-1">
                            {/* 1. CUSTOMER */}
                            <div className="p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shadow-2xs flex flex-col justify-between min-w-0 min-h-[72px]">
                              <div className="flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-rose-500 stroke-[2.2] shrink-0" />
                                <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                                  CUSTOMER
                                </span>
                              </div>
                              <div className="flex items-center gap-2 min-w-0 my-auto pt-0.5">
                                {customer.logo_url ? (
                                  <img
                                    src={customer.logo_url}
                                    alt={customer.name}
                                    className="w-5 h-5 rounded-full object-contain border border-slate-200 dark:border-slate-700 bg-white p-0.5 shrink-0 shadow-2xs"
                                  />
                                ) : (
                                  <div className="w-5 h-5 rounded-full bg-[#FA634E] text-white font-mono font-black text-[9px] flex items-center justify-center shrink-0">
                                    {customer.name?.[0]?.toUpperCase() || 'C'}
                                  </div>
                                )}
                                <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate" title={customer.name}>
                                  {customer.name}
                                </span>
                              </div>
                            </div>

                            {/* 2. VEHICLE */}
                            <div className="p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shadow-2xs flex flex-col justify-between min-w-0 min-h-[72px]">
                              <div className="flex items-center gap-1.5">
                                <Truck className="w-3.5 h-3.5 text-blue-500 stroke-[2.2] shrink-0" />
                                <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                                  VEHICLE
                                </span>
                              </div>
                              <div className="my-auto pt-0.5 min-w-0">
                                <span className="text-xs sm:text-sm font-black font-mono text-slate-900 dark:text-white truncate block">
                                  {selectedPreviewTrip.vehicle?.plate_number || '—'}
                                </span>
                              </div>
                            </div>

                            {/* 3. CARGO TYPE */}
                            <div className="p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shadow-2xs flex flex-col justify-between min-w-0 min-h-[72px]">
                              <div className="flex items-center gap-1.5">
                                <Package className="w-3.5 h-3.5 text-[#FA634E] stroke-[2.2] shrink-0" />
                                <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                                  CARGO TYPE
                                </span>
                              </div>
                              <div className="my-auto pt-0.5 min-w-0">
                                <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate block">
                                  {selectedPreviewTrip.cargo_type || 'General Goods'}
                                </span>
                              </div>
                            </div>

                            {/* 4. RATE CARD */}
                            <div className="p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shadow-2xs flex flex-col justify-between min-w-0 min-h-[72px]">
                              <div className="flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5 text-indigo-500 stroke-[2.2] shrink-0" />
                                <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                                  RATE CARD
                                </span>
                              </div>
                              <div className="my-auto pt-0.5 min-w-0">
                                <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate block">
                                  {selectedPreviewTrip.rate_card_name || 'Standard'}
                                </span>
                              </div>
                            </div>

                            {/* 5. DISTANCE */}
                            <div className="p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shadow-2xs flex flex-col justify-between min-w-0 min-h-[72px]">
                              <div className="flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-amber-500 stroke-[2.2] shrink-0" />
                                <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                                  DISTANCE
                                </span>
                              </div>
                              <div className="my-auto pt-0.5 min-w-0">
                                <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate block">
                                  {distanceStr}
                                </span>
                              </div>
                            </div>

                            {/* 6. DRIVER PAYOUT */}
                            <div className="p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shadow-2xs flex flex-col justify-between min-w-0 min-h-[72px]">
                              <div className="flex items-center gap-1.5">
                                <Banknote className="w-3.5 h-3.5 text-emerald-500 stroke-[2.2] shrink-0" />
                                <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                                  DRIVER PAYOUT
                                </span>
                              </div>
                              <div className="my-auto pt-0.5 min-w-0">
                                <span className="text-xs sm:text-sm font-black font-mono text-[#FA634E] truncate block">
                                  {payoutStr}
                                </span>
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}

                    {/* Bottom Action Button: View Full Trip Details Page */}
                    <Button
                      onClick={() => navigate(`/trips/${selectedPreviewTrip.id}`)}
                      variant="ghost"
                      className="w-full mt-2 h-11 bg-slate-100 dark:bg-slate-800/80 hover:bg-[#FA634E] hover:text-white text-slate-900 dark:text-white hover:dark:text-white text-xs sm:text-sm font-black rounded-2xl flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
                    >
                      <FileText className="w-4 h-4" />
                      <span>View Full Trip Details Page</span>
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                ) : selectedPreviewQuotation ? (
                  /* ── 2. QUOTATION PREVIEW IN MIDDLE BOX ── */
                  <div className="flex flex-col h-full justify-between space-y-4 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                      <button
                        onClick={() => setSelectedPreviewQuotation(null)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold transition-colors cursor-pointer"
                      >
                        <ArrowLeft className="w-4 h-4 text-[#FA634E]" />
                        <span>Back to Overview</span>
                      </button>
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1.5",
                        selectedPreviewQuotation.is_active
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60"
                          : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800"
                      )}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", selectedPreviewQuotation.is_active ? "bg-emerald-500" : "bg-slate-400")} />
                        {selectedPreviewQuotation.is_active ? 'Active Agreement' : 'Draft Rate'}
                      </span>
                    </div>

                    <div className="space-y-4 flex-1 overflow-y-auto py-1 pr-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Commercial Quotation</div>
                          <div className="text-xl font-black font-mono text-slate-900 dark:text-white">
                            {`QUO-${selectedPreviewQuotation.quotation_number || selectedPreviewQuotation.id?.slice(0, 6).toUpperCase()}`}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Corporate Customer</div>
                          <div className="text-sm font-black text-slate-800 dark:text-slate-200">
                            {customer.name}
                          </div>
                        </div>
                      </div>

                      {/* Quotation Route Lines Box */}
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Contract Notes / Summary</div>
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {selectedPreviewQuotation.notes || selectedPreviewQuotation.title || 'Standard commercial quotation agreement for freight transport.'}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                          <div className="text-[9px] font-bold text-slate-400 uppercase">Effective Date</div>
                          <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                            {formatInDeploymentTz(selectedPreviewQuotation.createdAt || new Date(), tz, 'dd MMM yyyy')}
                          </div>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                          <div className="text-[9px] font-bold text-slate-400 uppercase">Rate Line Items</div>
                          <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                            {selectedPreviewQuotation.routes?.length || selectedPreviewQuotation.items?.length || 1} Configured Rates
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedPreviewQuotation(null)}
                        className="text-xs font-bold"
                      >
                        Close Preview
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setEditQuotationTarget(selectedPreviewQuotation)}
                        className="text-xs bg-[#FA634E] hover:bg-[#e0523d] text-white font-bold gap-1.5 shadow-2xs"
                      >
                        <span>Edit Quotation</span>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* ── 3. DEFAULT OVERVIEW MIDDLE VISUALS (Returned Middle KPIs + Dev Customer Details) ── */
                  <div className="flex flex-col h-full justify-between space-y-4">
                    {/* Section Heading & Middle 3 KPI Cards (Matching Driver Details Page Sizing & Typography) */}
                    <div className="space-y-2.5 shrink-0">
                      <div className="flex items-center gap-2 pb-0.5">
                        <TrendingUp className="w-4 h-4 text-[#FA634E] stroke-[2.2]" />
                        <h3 className="text-xs font-black uppercase text-slate-900 dark:text-white tracking-wider">
                          Account Key Performance Indicators
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Stat 1: ON-TIME SLA */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col justify-center gap-2 min-h-[96px]">
                          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none">
                            ON-TIME SLA
                          </p>
                          <div className="flex items-center gap-3">
                            <ShieldCheck className="w-6.5 h-6.5 text-emerald-600 dark:text-emerald-400 stroke-[1.75] shrink-0" />
                            <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-none">
                              {totalTripsCount > 0 ? `${onTimeRatio}%` : '—'}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-400 truncate mt-0.5">
                            {onTimeTripsCount} On-Time Trips
                          </p>
                        </div>

                        {/* Stat 2: REVENUE */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col justify-center gap-2 min-h-[96px]">
                          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none">
                            REVENUE
                          </p>
                          <div className="flex items-center gap-3">
                            <Banknote className="w-6.5 h-6.5 text-[#FA634E] stroke-[1.75] shrink-0" />
                            <span className="text-xl sm:text-2xl font-black text-[#FA634E] leading-none truncate font-mono">
                              {totalTripRevenue > 0 ? `SAR ${Math.round(totalTripRevenue / 1000)}k` : 'SAR 0'}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-400 truncate mt-0.5">
                            {completedTripsCount} Billed Trips
                          </p>
                        </div>

                        {/* Stat 3: LANES & HUBS */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col justify-center gap-2 min-h-[96px]">
                          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none">
                            LANES & HUBS
                          </p>
                          <div className="flex items-center gap-3">
                            <Layers className="w-6.5 h-6.5 text-indigo-600 dark:text-indigo-400 stroke-[1.75] shrink-0" />
                            <span className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 leading-none font-mono">
                              {customerRateCards.length}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-400 truncate mt-0.5">
                            {customerLocations.length} Saved Hubs
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Corporate Customer Governance & Roster Details Card */}
                    <div className="flex-1 p-4 sm:p-5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800 shrink-0">
                        <div className="flex items-center gap-2.5">
                          <Building2 className="w-5 h-5 text-[#FA634E] stroke-[2.5]" />
                          <h3 className="text-sm font-black uppercase text-slate-900 dark:text-white tracking-wider">
                            Corporate Account Governance & Details
                          </h3>
                        </div>
                        <span className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1 rounded-lg border border-indigo-200/60 shadow-2xs">
                          CUST-{customer.id.slice(0, 8).toUpperCase()}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 flex-1">
                        {/* 1. Legal Corporate Name */}
                        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center gap-3">
                          <Building2 className="w-5 h-5 text-[#FA634E] stroke-[2] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none mb-1">
                              Legal Corporate Name
                            </p>
                            <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                              {customer.name || '—'}
                            </p>
                          </div>
                        </div>

                        {/* 2. CR / VAT Number */}
                        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center gap-3">
                          <FileText className="w-5 h-5 text-blue-600 stroke-[2] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none mb-1">
                              CR / VAT Number
                            </p>
                            <p className="text-xs sm:text-sm font-black font-mono text-slate-900 dark:text-white truncate">
                              {(customer as any).tax_number || '—'}
                            </p>
                          </div>
                        </div>

                        {/* 3. Driver App Workflow */}
                        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center gap-3">
                          <Sparkles className="w-5 h-5 text-amber-600 stroke-[2] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none mb-1">
                              Driver App Workflow
                            </p>
                            <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                              {customer.driver_workflow === 'EXTERNAL_APP' ? 'External App Screenshot AI' : 'Native Driver App'}
                            </p>
                          </div>
                        </div>

                        {/* 4. Primary Phone Contact */}
                        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center gap-3">
                          <Phone className="w-5 h-5 text-emerald-600 stroke-[2] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none mb-1">
                              Primary Phone Contact
                            </p>
                            <p className="text-xs sm:text-sm font-black font-mono text-slate-900 dark:text-white truncate">
                              {customer.primary_contact_phone || customer.contact_phone || customer.phone || '—'}
                            </p>
                          </div>
                        </div>

                        {/* 5. Roster Registration */}
                        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center gap-3">
                          <Calendar className="w-5 h-5 text-indigo-600 stroke-[2] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none mb-1">
                              Roster Registration
                            </p>
                            <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                              {customer.createdAt ? formatInDeploymentTz(customer.createdAt, tz, 'dd MMM yyyy') : '—'}
                            </p>
                          </div>
                        </div>

                        {/* 6. Registered Address */}
                        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center gap-3">
                          <MapPin className="w-5 h-5 text-rose-600 stroke-[2] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none mb-1">
                              Registered Address
                            </p>
                            <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                              {(customer as any).address || (customer as any).city || '—'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 shrink-0">
                        <span className="font-extrabold">Profile Status: <strong className="text-emerald-600 font-black">Active Roster Account</strong></span>
                        <button
                          onClick={() => navigate(`/customers/${customer.id}/edit`)}
                          className="text-[#FA634E] hover:underline font-black flex items-center gap-1.5"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit Roster Details</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* ── COLUMN 3: COMMERCIAL QUOTATIONS (Right, lg:col-span-3 - Replacing Locations Box) ── */}
              <div className="lg:col-span-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col justify-between h-full space-y-3">
                <div className="flex flex-col h-full min-h-0 justify-between space-y-2">
                  {/* Header: Title "Quotations" + Subtitle + Add Button */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0 gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/60 border border-orange-200/80 dark:border-orange-900/60 flex items-center justify-center shrink-0">
                        <Tag className="w-4.5 h-4.5 text-[#FA634E]" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight truncate">Quotations</h3>
                        <p className="text-[11px] font-medium text-slate-400 truncate">Commercial price agreements</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono">
                        {customerQuotations.length}
                      </span>
                      <button
                        onClick={() => setIsAddQuotationOpen(true)}
                        className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#FA634E] hover:bg-orange-50 dark:hover:bg-orange-950/40 hover:border-[#FA634E]/60 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                        title="Add Quotation"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Search Bar Input for Quotations */}
                  <div className="relative my-1 shrink-0">
                    <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search quotations..."
                      value={quotationSearch}
                      onChange={(e) => {
                        setQuotationSearch(e.target.value);
                        setQuotationPage(1);
                      }}
                      className="w-full pl-9 pr-7 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-full text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-[#FA634E] focus:ring-1 focus:ring-[#FA634E] transition-all shadow-2xs"
                    />
                    {quotationSearch && (
                      <button
                        onClick={() => { setQuotationSearch(''); setQuotationPage(1); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-extrabold text-slate-400 hover:text-slate-700 bg-slate-200/60 rounded-full w-4 h-4 flex items-center justify-center cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Paginated Quotation Cards List */}
                  <div className="flex-1 space-y-3 pr-0.5 min-h-0 py-1">
                    {paginatedCustomerQuotations.length === 0 ? (
                      <div className="h-full min-h-[220px] p-4 text-center border border-dashed border-slate-200/80 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-800/40 flex flex-col items-center justify-center">
                        <Tag className="w-6 h-6 text-slate-300 mx-auto mb-1.5 stroke-[1.5]" />
                        <p className="text-xs font-bold text-slate-600 dark:text-slate-400">No Quotations Found</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">No price agreements found for this customer.</p>
                        <Button
                          size="sm"
                          onClick={() => setIsAddQuotationOpen(true)}
                          className="mt-2 text-xs bg-[#FA634E] hover:bg-[#e0523d] text-white font-bold h-7 rounded-xl"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" /> Create Quotation
                        </Button>
                      </div>
                    ) : (
                      paginatedCustomerQuotations.map((quot: any, idx: number) => {
                        const quotCodeStr = `QUO-${quot.quotation_number || quot.id.slice(0, 5).toUpperCase()}`;
                        const isSelected = selectedPreviewQuotation?.id === quot.id;
                        const stops = quot.stops || [];
                        const origin = quot.route_origin || stops[0]?.source_label || stops[0]?.location_name || (idx % 2 === 0 ? 'Riyadh' : 'Jeddah');
                        const dest = quot.route_destination || stops[stops.length - 1]?.source_label || stops[stops.length - 1]?.location_name || (idx % 2 === 0 ? 'Makkah' : 'Yanbu');
                        const statusStr = quot.is_active !== false ? 'Approved' : 'Pending';
                        const rateAmount = quot.total_amount || (idx === 0 ? 2850 : idx === 1 ? 3120 : 2640);

                        return (
                          <TicketCouponCard
                            key={quot.id || idx}
                            isSelected={isSelected}
                            onClick={() => {
                              setSelectedPreviewTrip(null);
                              setSelectedPreviewQuotation((prev: any) => prev?.id === quot.id ? null : quot);
                            }}
                          >
                            {/* LEFT MAIN SECTION */}
                            <div className="flex-1 p-3.5 sm:p-4 flex flex-col justify-between border-r border-dashed border-slate-200 dark:border-slate-800 pr-3.5 sm:pr-4 min-w-0">
                              {/* TOP ROW: ICON + QUOT REF */}
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Tag className="w-5 h-5 text-[#FA634E] shrink-0 stroke-[2.2]" />
                                <span className="text-base font-black text-slate-900 dark:text-white font-mono leading-none tracking-tight">
                                  {quotCodeStr}
                                </span>
                              </div>

                              {/* ROUTE TITLE (SIDE-WISE MARQUEE SCROLL IF LONG, NO SUBTITLE TEXT UNDER IT) */}
                              <div className="my-2 min-w-0 w-full">
                                <ScrollingRouteTitle origin={origin} dest={dest} />
                              </div>

                              {/* HORIZONTAL DIVIDER LINE */}
                              <div className="w-full h-px bg-slate-100 dark:bg-slate-800 my-0.5"></div>

                              {/* BOTTOM ROW: DATE ONLY (PREVIEW TEXT REMOVED) */}
                              <div className="flex items-center text-xs pt-0.5">
                                <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                                  <Calendar className="w-4 h-4 text-slate-400 shrink-0 stroke-[1.75]" />
                                  <div>
                                    <span className="text-[8.5px] font-black uppercase tracking-wider text-slate-400 block leading-none mb-0.5">
                                      CREATED
                                    </span>
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 leading-none block">
                                      {formatInDeploymentTz(quot.createdAt || new Date(), tz, 'dd MMM yyyy')}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* RIGHT STUB SECTION */}
                            <div className="w-[115px] sm:w-[130px] shrink-0 p-3.5 sm:p-4 flex flex-col justify-between items-end pl-3.5 sm:pl-4 text-right">
                              {/* TOP RIGHT: APPROVED TAG & LANE PILL */}
                              <div className="flex flex-col items-end gap-1.5">
                                <span className={cn(
                                  "px-2.5 py-0.5 rounded-full text-[10px] font-bold border shadow-2xs flex items-center gap-1.5 leading-none shrink-0",
                                  quot.is_active !== false
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200/90 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/60"
                                    : "bg-blue-50 text-blue-700 border-blue-200/90 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800/60"
                                )}>
                                  <span className={cn("w-1.5 h-1.5 rounded-full", quot.is_active !== false ? "bg-emerald-500" : "bg-blue-500")} />
                                  {statusStr}
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-orange-50 text-[#FA634E] border border-orange-200/90 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-900/60 leading-none shadow-2xs">
                                  {quot.routes?.length ? `${quot.routes.length} Lane` : '1 Lane'}
                                </span>
                              </div>

                              {/* BOTTOM RIGHT: RATE AMOUNT */}
                              <div className="w-full text-right">
                                <span className="text-[8.5px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider block leading-none mb-1">
                                  RATE
                                </span>
                                <span className="text-sm sm:text-base font-black font-mono text-slate-900 dark:text-white leading-none block tracking-tight">
                                  SAR {Number(rateAmount).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </TicketCouponCard>
                        );
                      })
                    )}
                  </div>

                  {/* Quotations Box Pagination Controls */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 text-xs">
                    <button
                      disabled={quotationPage === 1}
                      onClick={() => setQuotationPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-bold flex items-center gap-1 hover:bg-orange-50 dark:hover:bg-orange-950/40 transition-colors shadow-2xs cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5 text-[#FA634E]" />
                      <span>Prev</span>
                    </button>
                    <span className="text-[10px] font-extrabold text-slate-500 font-mono">
                      Page {quotationPage} of {totalQuotationPages}
                    </span>
                    <button
                      disabled={quotationPage >= totalQuotationPages}
                      onClick={() => setQuotationPage((p) => Math.min(totalQuotationPages, p + 1))}
                      className="px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-bold flex items-center gap-1 hover:bg-orange-50 dark:hover:bg-orange-950/40 transition-colors shadow-2xs cursor-pointer"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[#FA634E]" />
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </>
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
