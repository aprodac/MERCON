import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { toast } from 'sonner';
import {
  ArrowLeft, Edit2, AlertTriangle, Plus, RotateCw, ShieldCheck, Truck, Download, Trash2, MoreHorizontal,
  ReceiptText, Tag, User, Navigation, Wallet,
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
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';
import { exportExcelTable } from '@/utils/exportUtils';
import { cn } from '@/lib/utils';
import { Badge, Count, CustomerAvatar, PhoneLine, StatCell, ui, type CustomerTabId } from '@/components/customers/customerUi';

/** ?tab= values, including the older names other pages still link with. */
const TAB_ALIASES: Record<string, CustomerTabId> = {
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

const PAGE = 'mx-auto w-full max-w-[1680px] px-4 pt-2 pb-8 sm:px-6 flex flex-col gap-4';

// Borders between the four figures: 2 × 2 on phones, one row from lg.
const CELL_BORDER = ['', 'border-l', 'border-t lg:border-t-0 lg:border-l', 'border-l border-t lg:border-t-0'];

export default function CustomerDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tz = useDeploymentTimezone();
  const queryClient = useQueryClient();
  const exportsEnabled = useModuleEnabled('company-reports');
  const financeEnabled = useModuleEnabled('finance');

  const [searchParams, setSearchParams] = useSearchParams();
  const requested = TAB_ALIASES[searchParams.get('tab') ?? ''] ?? 'overview';
  const activeTab: CustomerTabId = requested === 'exports' && !exportsEnabled ? 'overview' : requested;
  const setActiveTab = (tab: CustomerTabId) => {
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
      <DashboardLayout active="Customers" title="Customer Details" compactHeader>
        <div className={cn(PAGE, 'animate-pulse')}>
          <div className="h-[148px] rounded-xl bg-slate-100 dark:bg-slate-800" />
          <div className="h-9 w-2/3 rounded-lg bg-slate-100 dark:bg-slate-800" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="h-[420px] rounded-xl bg-slate-100 dark:bg-slate-800" />
            <div className="h-[420px] rounded-xl bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !customer) {
    return (
      <DashboardLayout active="Customers" title="Customer Details" compactHeader>
        <div className="px-4 sm:px-6 pb-6 w-full flex flex-col items-center justify-center text-center h-[60vh] gap-3">
          <AlertTriangle className="size-7 text-rose-500" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Customer not found</h2>
          <p className={ui.muted}>This customer doesn't exist or has been deleted.</p>
          <Button size="sm" onClick={() => navigate('/customers')} className={cn(ui.btnSm, 'mt-2')}>
            <ArrowLeft /> Back to customers
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
  const delayedCount = liveTrips.filter((t) => t.status === 'Delayed').length;
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
  const hasContact = !!(customer.primary_contact_person || contactPhone?.trim() || customer.whatsapp_group_link);

  const newTrip = () => navigate(`/trips/new?customer_id=${customer.id}`);
  const editCustomer = () => navigate(`/customers/${customer.id}/edit`);

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

  const tabs: { id: CustomerTabId; label: string; count?: number; dot?: boolean }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'trips', label: 'Trips', count: totalTripsCount },
    { id: 'tracking', label: 'Live tracking', dot: true },
    ...(exportsEnabled ? [{ id: 'exports' as CustomerTabId, label: 'Trip sheets' }] : []),
    { id: 'financials', label: 'Invoices', count: openInvoicesCount || undefined },
    { id: 'quotations', label: 'Quotations', count: customerQuotations.length },
    { id: 'locations', label: 'Locations', count: customerLocations.length },
  ];

  const stats = [
    <StatCell
      key="trips"
      label="Trips"
      icon={Truck}
      value={totalTripsCount.toLocaleString('en-US')}
      sub="all time"
      active={activeTab === 'trips'}
      onClick={() => setActiveTab('trips')}
    />,
    <StatCell
      key="live"
      label="On the road"
      icon={Navigation}
      value={liveTrips.length}
      sub={delayedCount > 0 ? `${delayedCount} delayed` : liveTrips.length > 0 ? 'loading or moving' : 'none right now'}
      subTone={delayedCount > 0 ? 'rose' : liveTrips.length > 0 ? 'emerald' : undefined}
      onClick={() => setActiveTab('overview')}
    />,
    <StatCell
      key="ontime"
      label="On-time delivery"
      icon={ShieldCheck}
      value={finishedTrips.length > 0 ? `${onTimeRatio}%` : '—'}
      sub={finishedTrips.length > 0 ? `${onTimeTripsCount} of ${finishedTrips.length} recent` : 'no finished trips yet'}
    />,
    <StatCell
      key="owed"
      label="Outstanding"
      icon={Wallet}
      unit="SAR"
      value={statement ? money(statement.total_outstanding) : '—'}
      sub={!statement ? (isStatementLoading ? 'loading…' : undefined) : overdueAmount > 0 ? `${money(overdueAmount)} overdue` : `${openInvoicesCount} open invoice${openInvoicesCount === 1 ? '' : 's'}`}
      subTone={overdueAmount > 0 ? 'rose' : undefined}
      active={activeTab === 'financials'}
      onClick={() => setActiveTab('financials')}
    />,
  ];

  return (
    <DashboardLayout active="Customers" title={customer.name} breadcrumb="Customers" compactHeader>
      <div className={PAGE}>

        {/* ── Header: who they are, how to reach them, what you can do — and the four figures ── */}
        <section className={cn(ui.card, 'overflow-hidden')}>
          <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <CustomerAvatar name={customer.name} logo={customer.logo_url} size="lg" />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-white" title={customer.name}>{customer.name}</h1>
                  {customer.isActive !== false ? <Badge tone="emerald" dot>Active</Badge> : <Badge tone="slate" dot>Inactive</Badge>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-slate-500 dark:text-slate-400">
                  {customer.primary_contact_person && (
                    <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                      <User className="size-3.5 text-slate-400" /> {customer.primary_contact_person}
                    </span>
                  )}
                  <PhoneLine phone={contactPhone} className="-ml-1" />
                  {customer.whatsapp_group_link && (
                    <a
                      href={customer.whatsapp_group_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      <WhatsAppIcon className="size-3.5" /> {customer.whatsapp_group_name || 'WhatsApp group'}
                    </a>
                  )}
                  {!hasContact && (
                    <button type="button" onClick={editCustomer} className="font-medium text-[#E5533F] hover:underline cursor-pointer">
                      Add a contact
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" onClick={editCustomer} className={ui.btnSm}>
                <Edit2 /> Edit
              </Button>
              <Button size="sm" onClick={newTrip} className={cn(ui.btnSm, 'flex-1 lg:flex-none')}>
                <Plus /> New trip
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className={ui.iconSm} aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => setIsAddQuotationOpen(true)} className="text-[13px]">
                    <Tag className="mr-2 size-4 text-slate-500" /> Add quotation
                  </DropdownMenuItem>
                  {financeEnabled && (
                    <DropdownMenuItem onClick={() => setIsStatementOpen(true)} className="text-[13px]">
                      <ReceiptText className="mr-2 size-4 text-slate-500" /> Statement of account
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={handleExportLedger} disabled={customerTrips.length === 0} className="text-[13px]">
                    <Download className="mr-2 size-4 text-slate-500" /> Export trip ledger (Excel)
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

          <div className="grid grid-cols-2 border-t border-slate-100 lg:grid-cols-4 dark:border-slate-800">
            {stats.map((cell, i) => (
              <div key={i} className={cn('min-w-0 border-slate-100 dark:border-slate-800', CELL_BORDER[i])}>{cell}</div>
            ))}
          </div>
        </section>

        {/* ── Sections (kept in the URL, so ?tab=tracking / ?tab=exports links land here) ── */}
        <TabsPrimitive.Root value={activeTab} onValueChange={(v) => setActiveTab(v as CustomerTabId)} className="flex min-w-0 flex-col gap-4">
          <TabsPrimitive.List aria-label="Customer sections" className="flex gap-5 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
            {tabs.map((tab) => (
              <TabsPrimitive.Trigger
                key={tab.id}
                value={tab.id}
                className={cn(
                  'group relative inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-slate-500 outline-none transition-colors cursor-pointer',
                  'hover:text-slate-900 focus-visible:text-slate-900 dark:hover:text-white',
                  'data-[state=active]:text-slate-900 dark:data-[state=active]:text-white',
                  'after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-[#FA634E]',
                )}
              >
                {tab.label}
                {tab.count !== undefined && <Count>{tab.count}</Count>}
                {tab.dot && <span className={cn('size-1.5 rounded-full', trackingOn ? 'bg-emerald-500' : 'bg-slate-300')} title={trackingOn ? 'On' : 'Off'} />}
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>

          <TabsPrimitive.Content value="overview" className="outline-none">
            <CustomerOverviewTab
              customer={customer}
              trips={customerTrips}
              liveTrips={liveTrips}
              quotations={customerQuotations}
              onTab={setActiveTab}
              onNewTrip={newTrip}
              onEditQuotation={setEditQuotationTarget}
              onAddQuotation={() => setIsAddQuotationOpen(true)}
            />
          </TabsPrimitive.Content>

          <TabsPrimitive.Content value="trips" className="outline-none">
            <CustomerTripsTab customerId={customer.id} customerName={customer.name} />
          </TabsPrimitive.Content>

          <TabsPrimitive.Content value="tracking" className="outline-none">
            <CustomerTrackingTab customer={customer} />
          </TabsPrimitive.Content>

          {exportsEnabled && (
            <TabsPrimitive.Content value="exports" className="outline-none">
              <CustomerExportsTab customerId={customer.id} customerName={customer.name} />
            </TabsPrimitive.Content>
          )}

          <TabsPrimitive.Content value="financials" className="outline-none">
            <CustomerFinancialsTab
              customerId={customer.id}
              statement={statement}
              isLoading={isStatementLoading}
              overdueAmount={overdueAmount}
              financeEnabled={financeEnabled}
              onOpenStatement={() => setIsStatementOpen(true)}
            />
          </TabsPrimitive.Content>

          <TabsPrimitive.Content value="quotations" className="outline-none">
            <CustomerQuotationsTab
              customerId={customer.id}
              onOpenAddQuotation={() => setIsAddQuotationOpen(true)}
              onOpenEditQuotation={(q) => setEditQuotationTarget(q)}
            />
          </TabsPrimitive.Content>

          <TabsPrimitive.Content value="locations" className="outline-none">
            <CustomerLocationsTab customerId={customer.id} locations={customerLocations} />
          </TabsPrimitive.Content>
        </TabsPrimitive.Root>
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
            <Button variant="ghost" size="sm" onClick={() => setIsDeleteModalOpen(false)} className={ui.btnSm}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteCustomer} className={ui.btnSm}>Delete customer</Button>
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
