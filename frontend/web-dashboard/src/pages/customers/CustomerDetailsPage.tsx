import { useState, useEffect, type ElementType } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, Edit2, AlertTriangle, Plus, RotateCw, ShieldCheck, Truck, Download, Trash2, MoreVertical,
  LayoutDashboard, ReceiptText, Tag, MapPin, MapPinned, FileSpreadsheet, User, CreditCard, Calendar, Radio,
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { customerService, LIVE_TRIP_STATUSES } from '@/services/customerService';
import { quotationService, Quotation } from '@/services/quotationService';
import { locationService } from '@/services/locationService';
import QuotationFormDialog from '@/components/quotations/QuotationFormDialog';
import CustomerQuotationsTab from '@/components/customers/CustomerQuotationsTab';
import CustomerTripsTab from '@/components/customers/CustomerTripsTab';
import CustomerExportsTab from '@/components/customers/CustomerExportsTab';
import CustomerTrackingTab from '@/components/customers/CustomerTrackingTab';
import CustomerOverviewTab from '@/components/customers/CustomerOverviewTab';
import CustomerFinancialsTab from '@/components/customers/CustomerFinancialsTab';
import CustomerLocationsTab from '@/components/customers/CustomerLocationsTab';
import { CustomerStatementSheet } from '@/components/finance/receivables';
import { useModuleEnabled } from '@/components/auth/RequireModule';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import PhoneDisplay from '@/components/ui/PhoneDisplay';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';
import { exportExcelTable } from '@/utils/exportUtils';
import { cn } from '@/lib/utils';
import { dk, EMPTY, fmtDate, fmtSar, StatusPill } from '@/components/details/DetailKit';

type TabId = 'overview' | 'trips' | 'quotations' | 'locations' | 'financials' | 'tracking' | 'exports';

/** ?tab= values, including the older names other pages still link with. */
const TAB_ALIASES: Record<string, TabId> = {
  overview: 'overview',
  trips: 'trips',
  dispatches: 'trips',
  quotations: 'quotations',
  locations: 'locations',
  saved_places: 'locations',
  financials: 'financials',
  invoices: 'financials',
  tracking: 'tracking',
  exports: 'exports',
  'trip-sheets': 'exports',
  trip_sheets: 'exports',
};

export default function CustomerDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tz = useDeploymentTimezone();
  const queryClient = useQueryClient();
  const exportsEnabled = useModuleEnabled('company-reports');
  const financeEnabled = useModuleEnabled('finance');

  const [searchParams, setSearchParams] = useSearchParams();
  const requested = TAB_ALIASES[searchParams.get('tab') ?? ''] ?? 'overview';
  const activeTab: TabId = requested === 'exports' && !exportsEnabled ? 'overview' : requested;
  const setActiveTab = (tab: TabId) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === 'overview') next.delete('tab');
      else next.set('tab', tab);
      return next;
    }, { replace: true });
  };

  const [isAddQuotationOpen, setIsAddQuotationOpen] = useState(false);
  const [editQuotationTarget, setEditQuotationTarget] = useState<Quotation | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customerService.getById(id!),
    enabled: !!id,
  });

  const { data: statement, isLoading: isStatementLoading } = useQuery({
    queryKey: ['customer-statement', customer?.id],
    queryFn: () => customerService.getStatement(customer!.id),
    enabled: !!customer?.id,
  });

  // URL normalization: if navigated using name/id, replace with canonical UUID (keeping ?tab=)
  useEffect(() => {
    if (customer && customer.id && id !== customer.id) {
      navigate(`/customers/${customer.id}${window.location.search}`, { replace: true });
    }
  }, [customer?.id, id, navigate]);

  const { data: quotationsResponse } = useQuery({
    queryKey: ['quotations', 'customer', id],
    queryFn: () => quotationService.getAll({ customerId: id!, per_page: 'all' }),
    enabled: !!id,
  });
  const { data: locationsRes } = useQuery({
    queryKey: ['locations', id],
    queryFn: () => locationService.getAll({ customerId: id! }),
    enabled: !!id,
  });
  const customerQuotations = quotationsResponse?.data || [];
  const customerLocations = locationsRes?.data || [];

  const refreshCustomer = async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['customer', id] }),
      queryClient.invalidateQueries({ queryKey: ['customer-statement', customer?.id] }),
      queryClient.invalidateQueries({ queryKey: ['quotations', 'customer', id] }),
      queryClient.invalidateQueries({ queryKey: ['locations', id] }),
    ]);
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
        <div className={cn(dk.page, 'animate-pulse')}>
          <div className="h-44 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
          <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-xl" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-8 h-[420px] bg-slate-200 dark:bg-slate-800 rounded-2xl" />
            <div className="lg:col-span-4 h-[420px] bg-slate-200 dark:bg-slate-800 rounded-2xl" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !customer) {
    return (
      <DashboardLayout active="Customers" title="Customer Details">
        <div className="px-4 sm:px-6 pb-6 w-full flex flex-col items-center justify-center text-center h-[60vh] gap-3">
          <AlertTriangle className="w-8 h-8 text-rose-600 shrink-0" />
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">Customer not found</h2>
          <p className="text-xs text-slate-500 max-w-md">This customer doesn't exist or has been deleted.</p>
          <Button onClick={() => navigate('/customers')} size="sm" className="mt-2 text-xs font-bold bg-[#FA634E] hover:bg-[#e0523d] text-white shadow-sm">
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to Customers
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const customerTrips: any[] = customer.trips || [];
  const statusOf = (t: any) => (t.status || '').toLowerCase();
  // The API returns the latest 100 trips; _count carries the true total.
  const totalTripsCount = customer._count?.trips ?? customerTrips.length;
  const liveTrips = customerTrips.filter((t) => LIVE_TRIP_STATUSES.includes(t.status));
  const finishedTrips = customerTrips.filter((t) => ['completed', 'invoiced', 'delivered'].includes(statusOf(t)));
  // A finished trip never flagged Delayed on the way counts as on time.
  const onTimeTripsCount = finishedTrips.filter((t) => !t.is_delayed).length;
  const onTimeRatio = finishedTrips.length > 0 ? Math.round((onTimeTripsCount / finishedTrips.length) * 100) : 0;
  const today = new Date().toISOString().slice(0, 10);
  const overdueAmount = (statement?.invoices || [])
    .filter((inv) => (inv.status === 'Issued' || inv.status === 'PartiallyPaid') && inv.due_date && inv.due_date.slice(0, 10) < today)
    .reduce((acc, inv) => acc + inv.balance_due, 0);
  const openInvoicesCount = (statement?.invoices || []).filter((inv) => inv.balance_due > 0 && inv.status !== 'Draft' && inv.status !== 'Void').length;
  const trackingOn = customer.tracking_enabled ?? true;
  const contactPhone = customer.primary_contact_phone || customer.contact_phone;

  const newTrip = () => navigate(`/trips/new?customer_id=${customer.id}`);

  const handleExportLedger = async () => {
    if (customerTrips.length === 0) return;
    const headers = [
      'S/L', 'DATE', 'JOB #', 'DRIVER NAME', 'VEHICLE NO:', 'VEHICLE TYPE',
      'MOBILE NUMBER', 'ASTOOL AL SHAHLA OR 3RD PARTY', 'SENDER/CUSTOMER',
      'RECEIVER', 'EXTRA CHARGES', 'BILLING RATE',
      'TOTAL AMOUNT', 'DRIVER CHARGE', 'BALANCE', 'COMPANY NAME',
    ];
    let sumExtraCharges = 0, sumBilling = 0, sumTotal = 0, sumTripCharges = 0, sumBalance = 0;
    const rows = customerTrips.map((t: any, index: number) => {
      const extraCharges = (t.charges || []).reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);
      const billing = Number(t.billing_amount || 0);
      const total = Number(t.total_amount || 0);
      const tripCharges = Number(t.trip_charges || 0);
      const balance = Number(t.balance_amount || total - tripCharges);
      sumExtraCharges += extraCharges; sumBilling += billing; sumTotal += total; sumTripCharges += tripCharges; sumBalance += balance;
      return [
        index + 1,
        formatInDeploymentTz(t.createdAt, tz, 'dd/MM/yyyy'),
        t.ref_id || 'N/A',
        t.is_third_party ? (t.third_party_driver_name || t.thirdPartyProvider?.name || '3PL Driver') : (t.driver ? `${t.driver.first_name} ${t.driver.last_name}` : 'Unassigned'),
        t.is_third_party ? (t.third_party_vehicle_plate || '3PL Vehicle') : (t.vehicle?.plate_number || 'Unassigned'),
        t.vehicle ? `${(t.vehicle.capacity_kg / 1000).toFixed(0)} TON` : (t.third_party_vehicle_type || ''),
        t.is_third_party ? (t.third_party_driver_phone || t.thirdPartyProvider?.phone || '') : (t.driver?.phone_primary || ''),
        t.is_third_party ? (t.thirdPartyProvider?.name || t.carrier_name || '3PL Provider') : (t.carrier_name || 'MERCON LOGISTICS'),
        customer.name,
        'Dropoff',
        extraCharges, billing, total, tripCharges, balance,
        customer.name,
      ];
    });
    const summaryRow = ['TOTALS', '', '', '', '', '', '', '', '', '', sumExtraCharges, sumBilling, sumTotal, sumTripCharges, sumBalance, ''];
    await exportExcelTable(
      `MERCON Customer Ledger - ${customer.name}`,
      headers,
      [...rows, summaryRow],
      `${customer.name.toLowerCase().replace(/\s+/g, '_')}_trip_ledger_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  const tabs: { id: TabId; label: string; icon: ElementType; badge?: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'trips', label: 'Trips', icon: Truck, badge: totalTripsCount },
    { id: 'tracking', label: 'Tracking', icon: MapPinned, badge: <span className={cn('w-1.5 h-1.5 rounded-full', trackingOn ? 'bg-emerald-500' : 'bg-slate-300')} /> },
    ...(exportsEnabled ? [{ id: 'exports' as TabId, label: 'Excel trip sheets', icon: FileSpreadsheet }] : []),
    { id: 'financials', label: 'Invoices & balance', icon: ReceiptText, badge: openInvoicesCount || undefined },
    { id: 'quotations', label: 'Quotations', icon: Tag, badge: customerQuotations.length },
    { id: 'locations', label: 'Locations', icon: MapPin, badge: customerLocations.length },
  ];

  const kpis: { label: string; value: React.ReactNode; sub: string; icon: ElementType; tone: string; tab: TabId }[] = [
    { label: 'Total trips', value: totalTripsCount, sub: 'All time, excluding cancelled', icon: Truck, tone: 'text-[#FA634E]', tab: 'trips' },
    {
      label: 'On the road now',
      value: liveTrips.length,
      sub: liveTrips.length > 0 ? 'Loading, moving or delayed' : 'No trucks out right now',
      icon: Radio,
      tone: liveTrips.length > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400',
      tab: 'overview',
    },
    {
      label: 'On-time delivery',
      value: finishedTrips.length > 0 ? `${onTimeRatio}%` : EMPTY,
      sub: finishedTrips.length > 0 ? `${onTimeTripsCount} of ${finishedTrips.length} recent finished trips` : 'No finished trips yet',
      icon: ShieldCheck,
      tone: 'text-blue-600 dark:text-blue-400',
      tab: 'trips',
    },
    {
      label: 'Outstanding',
      value: statement ? fmtSar(statement.total_outstanding, { allowZero: true }) : EMPTY,
      sub: !statement ? (isStatementLoading ? 'Loading…' : EMPTY) : overdueAmount > 0 ? `${fmtSar(overdueAmount)} overdue` : `${openInvoicesCount} open invoice${openInvoicesCount === 1 ? '' : 's'}`,
      icon: CreditCard,
      tone: overdueAmount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-indigo-600 dark:text-indigo-400',
      tab: 'financials',
    },
  ];

  return (
    <DashboardLayout active="Customers" title={customer.name} breadcrumb="Customers">
      <div className={dk.page}>

        {/* ── HEADER: identity, contact, primary actions, KPIs ── */}
        <section className={cn(dk.card, 'p-4 sm:p-5 flex flex-col gap-4 shrink-0')}>
          <div className="flex flex-col lg:flex-row lg:items-start gap-4">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white overflow-hidden flex items-center justify-center shrink-0">
                {customer.logo_url ? (
                  <img src={customer.logo_url} alt="" className="w-full h-full object-contain p-1.5" />
                ) : (
                  <div className="w-full h-full bg-[#FA634E] text-white flex items-center justify-center font-black text-3xl">
                    {customer.name?.[0]?.toUpperCase() || 'C'}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 flex flex-col gap-2">
                <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-tight truncate">{customer.name}</h1>
                  <StatusPill tone={customer.isActive !== false ? 'green' : 'slate'}>
                    {customer.isActive !== false ? 'Active' : 'Inactive'}
                  </StatusPill>
                </div>
                <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono font-semibold">CUST-{customer.id.slice(0, 8).toUpperCase()}</span>
                  <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Since {fmtDate(customer.createdAt, tz)}</span>
                  {customer.payment_terms && <span className="flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" /> {customer.payment_terms}</span>}
                </div>
                <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap">
                  {customer.primary_contact_person && (
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                      <User className="w-4 h-4 text-slate-400" /> {customer.primary_contact_person}
                    </span>
                  )}
                  {contactPhone && <PhoneDisplay phone={contactPhone} showActions variant="inline" />}
                  {customer.whatsapp_group_link && (
                    <a
                      href={customer.whatsapp_group_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100"
                    >
                      <WhatsAppIcon className="w-3.5 h-3.5" /> {customer.whatsapp_group_name || 'WhatsApp group'}
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <Button onClick={newTrip} className="h-9 px-4 bg-[#FA634E] hover:bg-[#e0523d] text-white font-bold rounded-xl text-xs gap-1.5 shadow-2xs">
                <Plus className="w-4 h-4" /> New trip
              </Button>
              <Button variant="outline" onClick={() => setActiveTab('tracking')} className="h-9 px-3.5 rounded-xl text-xs font-bold gap-1.5">
                <MapPinned className="w-4 h-4 text-emerald-600" /> Tracking link
              </Button>
              {exportsEnabled && (
                <Button variant="outline" onClick={() => setActiveTab('exports')} className="h-9 px-3.5 rounded-xl text-xs font-bold gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-700" /> Trip sheets
                </Button>
              )}
              <Button variant="outline" onClick={() => navigate(`/customers/${customer.id}/edit`)} className="h-9 px-3.5 rounded-xl text-xs font-bold gap-1.5">
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={dk.iconButton} aria-label="More actions">
                    <MoreVertical className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 rounded-xl z-50">
                  {financeEnabled && (
                    <DropdownMenuItem onClick={() => setIsStatementOpen(true)} className="font-semibold cursor-pointer text-xs">
                      <ReceiptText className="w-3.5 h-3.5 mr-2 text-indigo-600" /> Statement of account
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={handleExportLedger} disabled={customerTrips.length === 0} className="font-semibold cursor-pointer text-xs">
                    <Download className="w-3.5 h-3.5 mr-2 text-slate-500" /> Export trip ledger (Excel)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsAddQuotationOpen(true)} className="font-semibold cursor-pointer text-xs">
                    <Tag className="w-3.5 h-3.5 mr-2 text-[#FA634E]" /> Add quotation
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={refreshCustomer} disabled={isRefreshing} className="font-semibold cursor-pointer text-xs">
                    <RotateCw className={cn('w-3.5 h-3.5 mr-2', isRefreshing && 'animate-spin text-[#FA634E]')} /> Refresh
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setIsDeleteModalOpen(true)} className="text-rose-600 font-semibold cursor-pointer text-xs">
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete customer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {kpis.map((k) => {
              const Icon = k.icon;
              return (
                <button
                  key={k.label}
                  type="button"
                  onClick={() => setActiveTab(k.tab)}
                  className="text-left rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 px-3.5 py-3 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer min-w-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={dk.label}>{k.label}</span>
                    <Icon className={cn('w-4 h-4 shrink-0', k.tone)} />
                  </div>
                  <p className={cn('mt-1.5 text-lg sm:text-xl font-black leading-tight truncate', k.tone === 'text-slate-400' ? 'text-slate-900 dark:text-white' : k.tone)}>{k.value}</p>
                  <p className={cn(dk.sub, 'mt-0.5')}>{k.sub}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── TABS (kept in the URL, so ?tab=tracking / ?tab=exports links land here) ── */}
        <nav className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800 -mb-1 shrink-0" role="tablist" aria-label="Customer sections">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-colors cursor-pointer',
                  isActive
                    ? 'border-[#FA634E] text-slate-900 dark:text-white'
                    : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200',
                )}
              >
                <Icon className={cn('w-4 h-4', isActive && 'text-[#FA634E]')} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  typeof tab.badge === 'number'
                    ? <span className={cn('rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums', isActive ? 'bg-orange-100 text-[#c2412d] dark:bg-orange-950/50' : 'bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-400')}>{tab.badge}</span>
                    : tab.badge
                )}
              </button>
            );
          })}
        </nav>

        {activeTab === 'overview' && (
          <CustomerOverviewTab
            customer={customer}
            trips={customerTrips}
            quotations={customerQuotations}
            locationsCount={customerLocations.length}
            statement={statement}
            overdueAmount={overdueAmount}
            exportsEnabled={exportsEnabled}
            financeEnabled={financeEnabled}
            onTab={setActiveTab}
            onNewTrip={newTrip}
            onOpenStatement={() => setIsStatementOpen(true)}
            onEditQuotation={setEditQuotationTarget}
            onAddQuotation={() => setIsAddQuotationOpen(true)}
          />
        )}

        {activeTab === 'trips' && (
          <div className={cn(dk.card, 'p-4')}>
            <CustomerTripsTab customerId={customer.id} customerName={customer.name} />
          </div>
        )}

        {activeTab === 'quotations' && (
          <div className={cn(dk.card, 'p-4')}>
            <CustomerQuotationsTab
              customerId={customer.id}
              customerName={customer.name}
              onOpenAddQuotation={() => setIsAddQuotationOpen(true)}
              onOpenEditQuotation={(q) => setEditQuotationTarget(q)}
            />
          </div>
        )}

        {activeTab === 'locations' && <CustomerLocationsTab customerId={customer.id} locations={customerLocations} />}

        {activeTab === 'financials' && (
          <CustomerFinancialsTab
            customerId={customer.id}
            statement={statement}
            isLoading={isStatementLoading}
            overdueAmount={overdueAmount}
            financeEnabled={financeEnabled}
            onOpenStatement={() => setIsStatementOpen(true)}
          />
        )}

        {activeTab === 'tracking' && <CustomerTrackingTab customer={customer} />}

        {activeTab === 'exports' && exportsEnabled && (
          <div className={dk.card}>
            <CustomerExportsTab customerId={customer.id} customerName={customer.name} />
          </div>
        )}
      </div>

      {/* ── DELETE CUSTOMER CONFIRMATION ── */}
      <Dialog open={isDeleteModalOpen} onOpenChange={(open) => !open && setIsDeleteModalOpen(false)}>
        <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden border-slate-200 dark:border-slate-800">
          <DialogHeader className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-rose-50/50 dark:bg-rose-950/20">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <DialogTitle className="text-base font-black">Delete customer</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              Delete <strong className="text-slate-900 dark:text-slate-100">{customer.name}</strong>? Their trips and invoices stay, marked as from a deleted customer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsDeleteModalOpen(false)} className="text-xs font-bold">Cancel</Button>
            <Button type="button" size="sm" onClick={handleDeleteCustomer} className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 shadow-xs">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {financeEnabled && (
        <CustomerStatementSheet open={isStatementOpen} onOpenChange={setIsStatementOpen} customerId={customer.id} asOf={today} />
      )}

      <QuotationFormDialog
        isOpen={isAddQuotationOpen || !!editQuotationTarget}
        onClose={() => {
          setIsAddQuotationOpen(false);
          setEditQuotationTarget(null);
        }}
        quotation={editQuotationTarget}
        lockedCustomerId={customer.id}
        lockedCustomerName={customer.name}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['quotations'] });
          queryClient.invalidateQueries({ queryKey: ['rate-cards'] });
        }}
      />
    </DashboardLayout>
  );
}
