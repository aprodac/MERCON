import type { ElementType, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, CreditCard, FileSpreadsheet, MapPin, MapPinned, MessageCircle, Navigation, Phone, Plus, ReceiptText,
  Smartphone, Tag, Truck, User, Users,
} from 'lucide-react';

import { LIVE_TRIP_STATUSES, type Customer, type CustomerStatementData } from '@/services/customerService';
import type { Quotation } from '@/services/quotationService';
import { useDeploymentTimezone } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { fmtDate, personName, routeOf } from '@/components/details/DetailKit';
import { Badge, EmptyBlock, IconTile, Panel, TripStatusBadge, ui, type UiTone } from '@/components/customers/customerUi';

type TabId = 'overview' | 'trips' | 'quotations' | 'locations' | 'financials' | 'tracking' | 'exports';

const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : null;
};

function assignedTo(trip: any): string {
  if (trip.is_third_party) return trip.third_party_driver_name || trip.thirdPartyProvider?.name || '3rd party';
  return personName(trip.driver) || 'No driver yet';
}

function plateOf(trip: any): string | null {
  return trip.is_third_party ? trip.third_party_vehicle_plate || null : trip.vehicle?.plate_number || null;
}

function tripRef(trip: any) {
  return trip.ref_id || trip.id.slice(0, 8).toUpperCase();
}

function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-[13px] font-medium text-[#E5533F] hover:text-[#C2412D] hover:underline cursor-pointer">
      {children}
    </button>
  );
}

function ShortcutRow({ icon, tone, title, sub, right, onClick }: { icon: ElementType; tone: UiTone; title: string; sub: ReactNode; right?: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
      <IconTile icon={icon} tone={tone} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{title}</span>
        <span className="block truncate text-[13px] text-slate-500 dark:text-slate-400">{sub}</span>
      </span>
      {right}
      <ChevronRight className="size-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
    </button>
  );
}

export default function CustomerOverviewTab({
  customer,
  trips,
  quotations,
  locationsCount,
  statement,
  overdueAmount,
  exportsEnabled,
  financeEnabled,
  onTab,
  onNewTrip,
  onOpenStatement,
  onEditQuotation,
  onAddQuotation,
}: {
  customer: Customer;
  trips: any[];
  quotations: Quotation[];
  locationsCount: number;
  statement?: CustomerStatementData;
  overdueAmount: number;
  exportsEnabled: boolean;
  financeEnabled: boolean;
  onTab: (tab: TabId) => void;
  onNewTrip: () => void;
  onOpenStatement: () => void;
  onEditQuotation: (q: Quotation) => void;
  onAddQuotation: () => void;
}) {
  const navigate = useNavigate();
  const tz = useDeploymentTimezone();

  const liveTrips = trips.filter((t) => LIVE_TRIP_STATUSES.includes(t.status));
  const recentTrips = trips.filter((t) => !LIVE_TRIP_STATUSES.includes(t.status)).slice(0, 6);
  const activeQuotations = quotations.filter((q: any) => q.is_active !== false);
  const trackingOn = customer.tracking_enabled ?? true;
  const owed = statement?.total_outstanding ?? 0;

  const details: { label: string; value?: string | null; icon: ElementType }[] = [
    { label: 'Primary contact', value: customer.primary_contact_person, icon: User },
    { label: 'Primary phone', value: customer.primary_contact_phone || customer.contact_phone, icon: Phone },
    { label: 'Secondary contact', value: customer.secondary_contact_person, icon: Users },
    { label: 'Secondary phone', value: customer.secondary_contact_phone, icon: Phone },
    { label: 'Payment terms', value: customer.payment_terms, icon: CreditCard },
    { label: 'Driver workflow', value: customer.driver_workflow === 'EXTERNAL_APP' ? 'External app (screenshots)' : 'MERCON Driver App', icon: Smartphone },
    { label: 'WhatsApp group', value: customer.whatsapp_group_name || (customer.whatsapp_group_link ? 'Linked' : null), icon: MessageCircle },
  ];
  const missing = details.filter((d) => !d.value);

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
      {/* ── Left: what's happening ── */}
      <div className="flex min-w-0 flex-col gap-6 xl:col-span-8">
        <Panel
          title="On the road now"
          description="Trucks loading, moving or delayed for this customer"
          icon={Navigation}
          tone="blue"
          action={liveTrips.length > 0 ? <Badge tone="emerald" dot pulse>{liveTrips.length} live</Badge> : undefined}
          flush={liveTrips.length > 0}
        >
          {liveTrips.length === 0 ? (
            <EmptyBlock
              icon={Truck}
              title="No trucks on the road"
              text="When a trip for this customer starts loading it shows up here with its live tracking."
              action={
                <button type="button" onClick={onNewTrip} className={cn(ui.btn, ui.btnPrimary, 'h-8')}>
                  <Plus className="size-4" /> New trip
                </button>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
              {liveTrips.map((trip) => {
                const route = routeOf(trip);
                const plate = plateOf(trip);
                return (
                  <li key={trip.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                    <button type="button" onClick={() => navigate(`/trips/${trip.id}`)} className="group min-w-0 flex-1 text-left cursor-pointer">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 tabular-nums group-hover:text-[#E5533F] dark:text-white">{tripRef(trip)}</span>
                        <TripStatusBadge status={trip.status} />
                      </div>
                      <p className="mt-1 truncate text-sm text-slate-800 dark:text-slate-200">
                        {route.origin} <span className="text-slate-400">→</span> {route.destination}
                      </p>
                      <p className="mt-0.5 truncate text-[13px] text-slate-500">
                        {assignedTo(trip)}{plate ? ` · ${plate}` : ''} · {fmtDate(trip.planned_start || trip.createdAt, tz, true)}
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <button type="button" onClick={() => navigate(`/trips/${trip.id}/track`)} className={cn(ui.btn, ui.btnOutline, 'h-8')}>
                        <MapPinned className="size-4 text-emerald-600" /> Track
                      </button>
                      <button type="button" onClick={() => navigate(`/trips/${trip.id}`)} className={cn(ui.btn, ui.btnGhost, 'h-8')}>
                        Open
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Recent trips" icon={Truck} tone="brand" action={<TextLink onClick={() => onTab('trips')}>View all trips</TextLink>} flush>
          {recentTrips.length === 0 ? (
            <div className="px-5 pb-5"><EmptyBlock icon={Truck} title="No finished or scheduled trips yet" /></div>
          ) : (
            <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-slate-50/80 dark:bg-slate-800/40">
                  <tr>
                    <th className={cn(ui.th, 'pl-5')}>Trip</th>
                    <th className={ui.th}>Route</th>
                    <th className={ui.th}>Driver</th>
                    <th className={ui.th}>Status</th>
                    <th className={cn(ui.th, 'pr-5 text-right')}>Value (SAR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentTrips.map((trip) => {
                    const route = routeOf(trip);
                    return (
                      <tr key={trip.id} onClick={() => navigate(`/trips/${trip.id}`)} className="group cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className={cn(ui.td, 'pl-5')}>
                          <p className="font-medium text-slate-900 tabular-nums group-hover:text-[#E5533F] dark:text-white">{tripRef(trip)}</p>
                          <p className="text-xs text-slate-500">{fmtDate(trip.planned_start || trip.createdAt, tz)}</p>
                        </td>
                        <td className={cn(ui.td, 'max-w-[260px]')}>
                          <p className="truncate text-slate-800 dark:text-slate-200" title={`${route.origin} → ${route.destination}`}>
                            {route.origin} <span className="text-slate-400">→</span> {route.destination}
                          </p>
                        </td>
                        <td className={cn(ui.td, 'max-w-[160px] truncate text-slate-600 dark:text-slate-300')}>{assignedTo(trip)}</td>
                        <td className={ui.td}><TripStatusBadge status={trip.status} /></td>
                        <td className={cn(ui.td, 'pr-5 text-right font-medium text-slate-900 tabular-nums dark:text-white')}>{money(trip.billing_amount) ?? <span className="text-slate-300">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* ── Right: shortcuts, account, prices ── */}
      <div className="flex min-w-0 flex-col gap-6 xl:col-span-4">
        <Panel title="Shortcuts" flush>
          <div className="divide-y divide-slate-100 border-t border-slate-100 pb-1 dark:divide-slate-800 dark:border-slate-800">
            <ShortcutRow
              icon={MapPinned}
              tone="emerald"
              title="Live tracking"
              sub={trackingOn ? 'Send their live link, choose what they see' : 'Tracking is off for this customer'}
              right={<Badge tone={trackingOn ? 'emerald' : 'slate'}>{trackingOn ? 'On' : 'Off'}</Badge>}
              onClick={() => onTab('tracking')}
            />
            {exportsEnabled && (
              <ShortcutRow icon={FileSpreadsheet} tone="emerald" title="Excel trip sheets" sub="Trips, statement and rates in their layout" onClick={() => onTab('exports')} />
            )}
            <ShortcutRow
              icon={ReceiptText}
              tone="indigo"
              title={financeEnabled ? 'Statement of account' : 'Invoices & balance'}
              sub={!statement ? 'Loading…' : owed > 0 ? `SAR ${money(owed)} owed${overdueAmount > 0 ? ` · ${money(overdueAmount)} overdue` : ''}` : 'Nothing owed'}
              onClick={financeEnabled ? onOpenStatement : () => onTab('financials')}
            />
            <ShortcutRow icon={Tag} tone="brand" title="Quotations" sub={`${activeQuotations.length} active price${activeQuotations.length === 1 ? '' : 's'}`} onClick={() => onTab('quotations')} />
            <ShortcutRow icon={MapPin} tone="blue" title="Saved locations" sub={`${locationsCount} pickup / delivery place${locationsCount === 1 ? '' : 's'}`} onClick={() => onTab('locations')} />
          </div>
        </Panel>

        <Panel title="Account details" action={<TextLink onClick={() => navigate(`/customers/${customer.id}/edit`)}>Edit</TextLink>}>
          <dl className="divide-y divide-slate-100 dark:divide-slate-800">
            {details.filter((d) => d.value).map((d) => {
              const Icon = d.icon;
              return (
                <div key={d.label} className="flex items-center justify-between gap-4 py-2.5 first:pt-0">
                  <dt className="flex shrink-0 items-center gap-2 text-[13px] text-slate-500">
                    <Icon className="size-4 text-slate-400" /> {d.label}
                  </dt>
                  <dd className="truncate text-right text-sm font-medium text-slate-900 tabular-nums dark:text-white" title={d.value || undefined}>{d.value}</dd>
                </div>
              );
            })}
          </dl>
          {missing.length > 0 && (
            <button
              type="button"
              onClick={() => navigate(`/customers/${customer.id}/edit`)}
              className="mt-3 flex w-full items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2.5 text-left text-[13px] text-amber-800 transition-colors hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 cursor-pointer"
            >
              <span className="truncate">Not set: {missing.map((f) => f.label.toLowerCase()).join(', ')}</span>
              <span className="shrink-0 font-medium">Add</span>
            </button>
          )}
        </Panel>

        <Panel
          title="Prices"
          description="Active quotations used to price new trips"
          action={
            <button type="button" onClick={onAddQuotation} className={cn(ui.btn, ui.btnOutline, 'h-8 px-2.5')} aria-label="Add quotation" title="Add quotation">
              <Plus className="size-4" />
            </button>
          }
        >
          {activeQuotations.length === 0 ? (
            <p className={ui.muted}>No active quotations yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {activeQuotations.slice(0, 5).map((q: any) => {
                const route = routeOf(q);
                return (
                  <li key={q.id}>
                    <button type="button" onClick={() => onEditQuotation(q)} className="group flex w-full items-center justify-between gap-3 py-2.5 text-left cursor-pointer first:pt-0">
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-slate-900 group-hover:text-[#E5533F] dark:text-white">{route.origin} → {route.destination}</span>
                        <span className="block truncate text-xs text-slate-500">{q.source_vehicle_label || q.vehicle_class || q.vehicle_type || `QUO-${q.quotation_number || q.id.slice(0, 6).toUpperCase()}`}</span>
                      </span>
                      <span className="shrink-0 text-sm font-medium text-slate-900 tabular-nums dark:text-white">
                        <span className="text-xs font-normal text-slate-400">SAR</span> {money(q.rate) ?? '—'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {activeQuotations.length > 5 && <div className="mt-2"><TextLink onClick={() => onTab('quotations')}>All {activeQuotations.length} quotations</TextLink></div>}
        </Panel>
      </div>
    </div>
  );
}
