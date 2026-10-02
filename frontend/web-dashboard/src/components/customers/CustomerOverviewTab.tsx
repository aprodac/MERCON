import type { ElementType, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, ChevronRight, FileSpreadsheet, MapPin, MapPinned, MessageCircle, Navigation, Phone, Plus, ReceiptText,
  Sparkles, Tag, Truck, User, CreditCard, Users,
} from 'lucide-react';

import { LIVE_TRIP_STATUSES, type Customer, type CustomerStatementData } from '@/services/customerService';
import type { Quotation } from '@/services/quotationService';
import { Button } from '@/components/ui/button';
import { useDeploymentTimezone } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { dk, EMPTY, fmtDate, fmtSar, personName, routeOf, StatusPill, TripStatusPill } from '@/components/details/DetailKit';


type TabId = 'overview' | 'trips' | 'quotations' | 'locations' | 'financials' | 'tracking' | 'exports';

function assignedTo(trip: any): string {
  if (trip.is_third_party) return trip.third_party_driver_name || trip.thirdPartyProvider?.name || '3rd party';
  return personName(trip.driver) || 'No driver';
}

function plateOf(trip: any): string | null {
  return trip.is_third_party ? trip.third_party_vehicle_plate || null : trip.vehicle?.plate_number || null;
}

function Card({ title, icon: Icon, action, children, className }: { title: string; icon: ElementType; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn(dk.card, 'p-4 sm:p-5 flex flex-col gap-3 min-w-0', className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
          <Icon className="w-4 h-4 text-[#FA634E]" /> {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function LinkButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-xs font-bold text-[#FA634E] hover:underline cursor-pointer shrink-0">
      {children} <ArrowRight className="w-3.5 h-3.5" />
    </button>
  );
}

function ToolRow({ icon: Icon, iconClass, title, sub, onClick, right }: { icon: ElementType; iconClass: string; title: string; sub: ReactNode; onClick: () => void; right?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer group"
    >
      <span className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', iconClass)}>
        <Icon className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">{title}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{sub}</span>
      </span>
      {right}
      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0" />
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

  const details: { label: string; value?: string | null; icon: ElementType; mono?: boolean }[] = [
    { label: 'Primary contact', value: customer.primary_contact_person, icon: User },
    { label: 'Primary phone', value: customer.primary_contact_phone || customer.contact_phone, icon: Phone, mono: true },
    { label: 'Secondary contact', value: customer.secondary_contact_person, icon: Users },
    { label: 'Secondary phone', value: customer.secondary_contact_phone, icon: Phone, mono: true },
    { label: 'Payment terms', value: customer.payment_terms, icon: CreditCard },
    { label: 'Driver workflow', value: customer.driver_workflow === 'EXTERNAL_APP' ? 'External app (screenshots)' : 'MERCON Driver App', icon: Sparkles },
    { label: 'WhatsApp group', value: customer.whatsapp_group_name || (customer.whatsapp_group_link ? 'Linked' : null), icon: MessageCircle },
  ];
  const missing = details.filter((d) => !d.value);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
      {/* ── LEFT: what's happening for this customer ── */}
      <div className="xl:col-span-8 flex flex-col gap-4 min-w-0">
        <Card
          title="On the road now"
          icon={Navigation}
          action={liveTrips.length > 0 ? <StatusPill tone="green" pulse>{liveTrips.length} live</StatusPill> : undefined}
        >
          {liveTrips.length === 0 ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 px-4 py-5">
              <div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No trucks on the road for {customer.name}</p>
                <p className="text-xs text-slate-500">Trips that are loading, moving or delayed show up here with a live tracking link.</p>
              </div>
              <Button size="sm" onClick={onNewTrip} className="h-8 rounded-xl bg-[#FA634E] hover:bg-[#e0523d] text-white text-xs font-bold gap-1.5 shrink-0">
                <Plus className="w-3.5 h-3.5" /> New trip
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
              {liveTrips.map((trip) => {
                const route = routeOf(trip);
                const plate = plateOf(trip);
                return (
                  <li key={trip.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 first:pt-0 last:pb-0">
                    <button onClick={() => navigate(`/trips/${trip.id}`)} className="flex-1 min-w-0 text-left cursor-pointer group">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-black text-slate-900 dark:text-white group-hover:text-[#FA634E]">
                          {trip.ref_id || trip.id.slice(0, 8).toUpperCase()}
                        </span>
                        <TripStatusPill status={trip.status} />
                      </div>
                      <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white truncate capitalize">
                        {route.origin} <span className="text-slate-400 font-normal">→</span> {route.destination}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {assignedTo(trip)}{plate ? ` · ${plate}` : ''}
                      </p>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => navigate(`/trips/${trip.id}/track`)} className="h-8 rounded-xl text-xs font-bold gap-1.5">
                        <MapPinned className="w-3.5 h-3.5 text-emerald-600" /> Track
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/trips/${trip.id}`)} className="h-8 rounded-xl text-xs font-bold">
                        Open
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Recent trips" icon={Truck} action={<LinkButton onClick={() => onTab('trips')}>All trips</LinkButton>}>
          {recentTrips.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No trips yet.</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="py-2 px-1 font-extrabold">Trip</th>
                    <th className="py-2 px-1 font-extrabold">Route</th>
                    <th className="py-2 px-1 font-extrabold hidden md:table-cell">Driver</th>
                    <th className="py-2 px-1 font-extrabold">Status</th>
                    <th className="py-2 px-1 font-extrabold text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentTrips.map((trip) => {
                    const route = routeOf(trip);
                    return (
                      <tr key={trip.id} onClick={() => navigate(`/trips/${trip.id}`)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 group">
                        <td className="py-2.5 px-1">
                          <span className="block font-mono font-black text-slate-900 dark:text-white group-hover:text-[#FA634E]">{trip.ref_id || trip.id.slice(0, 8).toUpperCase()}</span>
                          <span className="block text-[10.5px] text-slate-400">{fmtDate(trip.planned_start || trip.createdAt, tz)}</span>
                        </td>
                        <td className="py-2.5 px-1 max-w-[260px]">
                          <span className="block truncate font-semibold text-slate-800 dark:text-slate-200 capitalize" title={`${route.origin} → ${route.destination}`}>
                            {route.origin} → {route.destination}
                          </span>
                        </td>
                        <td className="py-2.5 px-1 hidden md:table-cell text-slate-600 dark:text-slate-400 truncate max-w-[160px]">{assignedTo(trip)}</td>
                        <td className="py-2.5 px-1"><TripStatusPill status={trip.status} /></td>
                        <td className="py-2.5 px-1 text-right font-mono font-bold text-slate-900 dark:text-white">{fmtSar(trip.billing_amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ── RIGHT: tools, account, prices ── */}
      <div className="xl:col-span-4 flex flex-col gap-4 min-w-0">
        <Card title="Customer tools" icon={Sparkles}>
          <div className="flex flex-col -mx-1">
            <ToolRow
              icon={MapPinned}
              iconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40"
              title="Live tracking link"
              sub={trackingOn ? 'Send the all-trucks page or change what they see' : 'Tracking is off for this customer'}
              right={<StatusPill tone={trackingOn ? 'green' : 'slate'}>{trackingOn ? 'On' : 'Off'}</StatusPill>}
              onClick={() => onTab('tracking')}
            />
            {exportsEnabled && (
              <ToolRow
                icon={FileSpreadsheet}
                iconClass="bg-green-50 text-green-700 dark:bg-green-950/40"
                title="Excel trip sheets"
                sub="Their own Excel layouts for trips, statement and rates"
                onClick={() => onTab('exports')}
              />
            )}
            <ToolRow
              icon={ReceiptText}
              iconClass="bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40"
              title={financeEnabled ? 'Statement of account' : 'Invoices & balance'}
              sub={
                statement
                  ? overdueAmount > 0
                    ? `${fmtSar(statement.total_outstanding, { allowZero: true })} owed · ${fmtSar(overdueAmount)} overdue`
                    : `${fmtSar(statement.total_outstanding, { allowZero: true })} owed`
                  : 'Loading…'
              }
              onClick={financeEnabled ? onOpenStatement : () => onTab('financials')}
            />
            <ToolRow
              icon={Tag}
              iconClass="bg-orange-50 text-[#FA634E] dark:bg-orange-950/40"
              title="Quotations"
              sub={`${activeQuotations.length} active price agreement${activeQuotations.length === 1 ? '' : 's'}`}
              onClick={() => onTab('quotations')}
            />
            <ToolRow
              icon={MapPin}
              iconClass="bg-blue-50 text-blue-600 dark:bg-blue-950/40"
              title="Saved locations"
              sub={`${locationsCount} pickup / delivery place${locationsCount === 1 ? '' : 's'}`}
              onClick={() => onTab('locations')}
            />
          </div>
        </Card>

        <Card title="Account details" icon={User} action={<LinkButton onClick={() => navigate(`/customers/${customer.id}/edit`)}>Edit</LinkButton>}>
          <dl className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {details.filter((d) => d.value).map((d) => {
              const Icon = d.icon;
              return (
                <div key={d.label} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                  <dt className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 shrink-0">
                    <Icon className="w-3.5 h-3.5" /> {d.label}
                  </dt>
                  <dd className={cn('text-xs font-bold text-slate-900 dark:text-white truncate text-right', d.mono && 'font-mono')} title={d.value || undefined}>
                    {d.value || EMPTY}
                  </dd>
                </div>
              );
            })}
          </dl>
          {missing.length > 0 && (
            <button
              onClick={() => navigate(`/customers/${customer.id}/edit`)}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-dashed border-amber-300/80 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/20 text-left cursor-pointer hover:bg-amber-50 transition-colors"
            >
              <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 truncate">Missing: {missing.map((f) => f.label.toLowerCase()).join(', ')}</span>
              <span className="text-xs font-bold text-[#FA634E] shrink-0">Add</span>
            </button>
          )}
        </Card>

        <Card
          title="Prices"
          icon={Tag}
          action={
            <button onClick={onAddQuotation} className={cn(dk.iconButton, 'w-7 h-7 text-[#FA634E]')} title="Add quotation" aria-label="Add quotation">
              <Plus className="w-4 h-4" />
            </button>
          }
        >
          {activeQuotations.length === 0 ? (
            <p className="text-xs text-slate-500">No active quotations. Add one so new trips price themselves.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
              {activeQuotations.slice(0, 5).map((q: any) => {
                const route = routeOf(q);
                return (
                  <li key={q.id}>
                    <button onClick={() => onEditQuotation(q)} className="w-full flex items-center justify-between gap-3 py-2 text-left cursor-pointer group">
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-slate-900 dark:text-white truncate capitalize group-hover:text-[#FA634E]">
                          {route.origin} → {route.destination}
                        </span>
                        <span className="block text-[10.5px] text-slate-400 truncate">
                          {q.source_vehicle_label || q.vehicle_class || q.vehicle_type || `QUO-${q.quotation_number || q.id.slice(0, 6).toUpperCase()}`}
                        </span>
                      </span>
                      <span className="font-mono text-xs font-black text-slate-900 dark:text-white shrink-0">{fmtSar(q.rate)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {activeQuotations.length > 5 && <LinkButton onClick={() => onTab('quotations')}>All {activeQuotations.length} quotations</LinkButton>}
        </Card>
      </div>
    </div>
  );
}
