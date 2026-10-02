import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, Edit2, AlertTriangle, Plus, RotateCw, ShieldCheck, Truck, Download, Trash2, MoreHorizontal,
  ReceiptText, Tag, MapPinned, FileSpreadsheet, User, Navigation, Wallet,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';
import { exportExcelTable } from '@/utils/exportUtils';
import { cn } from '@/lib/utils';
import { fmtDate } from '@/components/details/DetailKit';
import { Badge, CustomerAvatar, PhoneLine, Stat, ui } from '@/components/customers/customerUi';

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
        <div className={cn(ui.page, 'animate-pulse')}>
          <div className="h-36 rounded-xl bg-slate-100 dark:bg-slate-800" />
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 rounded-xl bg-slate-100 dark:bg-slate-800" />)}
          </div>
          <div className="h-[420px] rounded-xl bg-slate-100 dark:bg-slate-800" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !customer) {
    return (
      <DashboardLayout active="Customers" title="Customer Details">
        <div className="px-4 sm:px-6 pb-6 w-full flex flex-col items-center justify-center text-center h-[60vh] gap-3">
          <AlertTriangle className="size-7 text-rose-500" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Customer not found</h2>
          <p className={ui.muted}>This customer doesn't exist or has been deleted.</p>
          <button type="button" onClick={() => navigate('/customers')} className={cn(ui.btn, ui.btnPrimary, 'mt-2')}>
            <ArrowLeft className="size-4" /> Back to customers
          </button>
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
  const money = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 });
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

  const tabs: { id: TabId; label: string; count?: number; dot?: boolean }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'trips', label: 'Trips', count: totalTripsCount },
    { id: 'tracking', label: 'Live tracking', dot: true },
    ...(exportsEnabled ? [{ id: 'exports' as TabId, label: 'Excel trip sheets' }] : []),
    { id: 'financials', label: 'Invoices & balance', count: openInvoicesCount || undefined },
    { id: 'quotations', label: 'Quotations', count: customerQuotations.length },
    { id: 'locations', label: 'Locations', count: customerLocations.length },
  ];

  return (
    <DashboardLayout active="Customers" title={customer.name} breadcrumb="Customers">
      <div className={ui.page}>

        {/* ── Header: who they are, how to reach them, what you can do ── */}
        <section className={cn(ui.card, 'p-5 sm:p-6')}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <CustomerAvatar name={customer.name} logo={customer.logo_url} size="lg" />
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className={cn(ui.h1, 'truncate')}>{customer.name}</h1>
                  {customer.isActive !== false ? <Badge tone="emerald" dot>Active</Badge> : <Badge tone="slate" dot>Inactive</Badge>}
                </div>
                <p className={cn(ui.muted, 'flex flex-wrap items-center gap-x-2 tabular-nums')}>
                  <span>CUST-{customer.id.slice(0, 8).toUpperCase()}</span>
                  <span className="text-slate-300">·</span>
                  <span>Customer since {fmtDate(customer.createdAt, tz)}</span>
                  {customer.payment_terms && (<><span className="text-slate-300">·</span><span>{customer.payment_terms}</span></>)}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
                  {customer.primary_contact_person && (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                      <User className="size-4 text-slate-400" /> {customer.primary_contact_person}
                    </span>
                  )}
                  <PhoneLine phone={contactPhone} />
                  {customer.whatsapp_group_link && (
                    <a
                      href={customer.whatsapp_group_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      <WhatsAppIcon className="size-4" /> {customer.whatsapp_group_name || 'WhatsApp group'}
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <button type="button" onClick={newTrip} className={cn(ui.btn, ui.btnPrimary)}>
                <Plus className="size-4" /> New trip
              </button>
              <button type="button" onClick={() => setActiveTab('tracking')} className={cn(ui.btn, ui.btnOutline)}>
                <MapPinned className="size-4 text-slate-500" /> Live tracking
              </button>
              {exportsEnabled && (
                <button type="button" onClick={() => setActiveTab('exports')} className={cn(ui.btn, ui.btnOutline)}>
                  <FileSpreadsheet className="size-4 text-slate-500" /> Trip sheets
                </button>
              )}
              <button type="button" onClick={() => navigate(`/customers/${customer.id}/edit`)} className={cn(ui.btn, ui.btnOutline)}>
                <Edit2 className="size-4 text-slate-500" /> Edit
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={cn(ui.btn, ui.btnOutline, 'w-9 px-0')} aria-label="More actions">
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {financeEnabled && (
                    <DropdownMenuItem onClick={() => setIsStatementOpen(true)} className="text-[13px]">
                      <ReceiptText className="mr-2 size-4 text-slate-500" /> Statement of account
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={handleExportLedger} disabled={customerTrips.length === 0} className="text-[13px]">
                    <Download className="mr-2 size-4 text-slate-500" /> Export trip ledger (Excel)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsAddQuotationOpen(true)} className="text-[13px]">
                    <Tag className="mr-2 size-4 text-slate-500" /> Add quotation
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={refreshCustomer} disabled={isRefreshing} className="text-[13px]">
                    <RotateCw className={cn('mr-2 size-4 text-slate-500', isRefreshing && 'animate-spin')} /> Refresh
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setIsDeleteModalOpen(true)} className="text-[13px] text-rose-600 focus:bg-rose-50 focus:text-rose-600">
                    <Trash2 className="mr-2 size-4" /> Delete customer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </section>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <Stat label="Total trips" icon={Truck} tone="brand" value={totalTripsCount} sub="All time, excluding cancelled" onClick={() => setActiveTab('trips')} />
          <Stat
            label="On the road now"
            icon={Navigation}
            tone="blue"
            value={liveTrips.length}
            sub={liveTrips.length > 0 ? 'Loading, moving or delayed' : 'No trucks out right now'}
            subTone={liveTrips.length > 0 ? 'emerald' : undefined}
            onClick={() => setActiveTab(liveTrips.length > 0 ? 'tracking' : 'overview')}
          />
          <Stat
            label="On-time delivery"
            icon={ShieldCheck}
            tone="emerald"
            value={finishedTrips.length > 0 ? `${onTimeRatio}%` : '—'}
            sub={finishedTrips.length > 0 ? `${onTimeTripsCount} of ${finishedTrips.length} recent finished trips` : 'No finished trips yet'}
          />
          <Stat
            label="Outstanding"
            icon={Wallet}
            tone="amber"
            unit="SAR"
            value={statement ? money(statement.total_outstanding) : '—'}
            sub={!statement ? (isStatementLoading ? 'Loading…' : '—') : overdueAmount > 0 ? `SAR ${money(overdueAmount)} overdue` : `${openInvoicesCount} open invoice${openInvoicesCount === 1 ? '' : 's'}`}
            subTone={overdueAmount > 0 ? 'rose' : undefined}
            onClick={() => setActiveTab('financials')}
          />
        </div>

        {/* ── Tabs (kept in the URL, so ?tab=tracking / ?tab=exports links land here) ── */}
        <div className="-mb-2 border-b border-slate-200 dark:border-slate-800">
          <nav className="-mb-px flex gap-6 overflow-x-auto" role="tablist" aria-label="Customer sections">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'inline-flex items-center gap-2 whitespace-nowrap border-b-2 pb-3 pt-1 text-sm font-medium transition-colors cursor-pointer',
                    isActive ? 'border-[#FA634E] text-slate-900 dark:text-white' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:hover:text-slate-200',
                  )}
                >
                  {tab.label}
                  {tab.count !== undefined && (
                    <span className={cn('rounded-full px-1.5 py-px text-xs tabular-nums', isActive ? 'bg-orange-50 text-[#C2412D] dark:bg-orange-950/50' : 'bg-slate-100 text-slate-500 dark:bg-slate-800')}>
                      {tab.count}
                    </span>
                  )}
                  {tab.dot && <span className={cn('size-1.5 rounded-full', trackingOn ? 'bg-emerald-500' : 'bg-slate-300')} title={trackingOn ? 'On' : 'Off'} />}
                </button>
              );
            })}
          </nav>
        </div>

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
          <CustomerTripsTab customerId={customer.id} customerName={customer.name} />
        )}

        {activeTab === 'quotations' && (
          <CustomerQuotationsTab
            customerId={customer.id}
            customerName={customer.name}
            onOpenAddQuotation={() => setIsAddQuotationOpen(true)}
            onOpenEditQuotation={(q) => setEditQuotationTarget(q)}
          />
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

        {activeTab === 'tracking' && <CustomerTrackingTab customer={customer} liveTrips={liveTrips} />}

        {activeTab === 'exports' && exportsEnabled && <CustomerExportsTab customerId={customer.id} customerName={customer.name} />}
      </div>

      {/* ── DELETE CUSTOMER CONFIRMATION ── */}
      <Dialog open={isDeleteModalOpen} onOpenChange={(open) => !open && setIsDeleteModalOpen(false)}>
        <DialogContent className="max-w-md overflow-hidden rounded-xl p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="text-base font-semibold">Delete {customer.name}?</DialogTitle>
            <DialogDescription className="text-[13px] text-slate-500">
              Their trips and invoices stay, marked as from a deleted customer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-end gap-2 px-6 pt-2 pb-5">
            <button type="button" onClick={() => setIsDeleteModalOpen(false)} className={cn(ui.btn, ui.btnGhost)}>Cancel</button>
            <button type="button" onClick={handleDeleteCustomer} className={cn(ui.btn, 'bg-rose-600 text-white hover:bg-rose-700')}>Delete customer</button>
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
