import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Eye, MapPinned, Plus, Settings2, Truck, X } from 'lucide-react';

import type { Customer } from '@/services/customerService';
import type { Quotation } from '@/services/quotationService';
import { trackingService } from '@/services/trackingService';
import { Button } from '@/components/ui/button';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { whatsAppLink } from '@/lib/share';
import { timeAgo } from '@/lib/fleetLive';
import { formatInDeploymentTz, useDeploymentTimezone } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { fmtDate, personName, routeOf } from '@/components/details/DetailKit';
import {
  Badge, Count, EmptyRow, PhoneLine, Section, TripStatusBadge, ui, type CustomerTabId,
} from '@/components/customers/customerUi';
import { copyText, opensLabel } from '@/components/customers/trackingLinks';

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

/** What the customer's tracking page shows (Live tracking tab has the switches). */
const SEES: { key: keyof Customer; label: string; fallback: boolean }[] = [
  { key: 'tracking_auto_link', label: 'Link in messages', fallback: true },
  { key: 'tracking_show_deadline', label: 'Arrival times', fallback: false },
  { key: 'tracking_show_delay_reason', label: 'Delay reason', fallback: false },
  { key: 'tracking_show_photos', label: 'Photos', fallback: true },
];

/**
 * Customer → Overview: what's happening now (trucks on the road, each with its
 * tracking link) and the latest trips; on the side, the account details, the
 * live-tracking status and the prices used for new trips.
 */
export default function CustomerOverviewTab({
  customer,
  trips,
  liveTrips,
  quotations,
  onTab,
  onNewTrip,
  onEditQuotation,
  onAddQuotation,
}: {
  customer: Customer;
  trips: any[];
  liveTrips: any[];
  quotations: Quotation[];
  onTab: (tab: CustomerTabId) => void;
  onNewTrip: () => void;
  onEditQuotation: (q: Quotation) => void;
  onAddQuotation: () => void;
}) {
  const navigate = useNavigate();
  const tz = useDeploymentTimezone();
  const trackingOn = customer.tracking_enabled ?? true;

  const liveIds = liveTrips.map((t) => t.id);
  const { data: tripLinks, isLoading: tripLinksLoading } = useQuery({
    queryKey: ['customer-trip-links', customer.id, liveIds],
    queryFn: () => trackingService.getTripLinks(liveIds),
    enabled: trackingOn && liveIds.length > 0,
    staleTime: 30_000,
  });
  // Newest open only — the count and "last opened" for the side card.
  const { data: opens } = useQuery({
    queryKey: ['customer-tracking-opens', customer.id, 'latest'],
    queryFn: () => trackingService.getCustomerOpens(customer.id, 1),
    enabled: trackingOn,
    staleTime: 60_000,
  });

  const liveSet = new Set(liveIds);
  const latestTrips = trips.filter((t) => !liveSet.has(t.id)).slice(0, 8);
  const activeQuotations = quotations.filter((q: any) => q.is_active !== false);
  const delayed = liveTrips.filter((t) => t.status === 'Delayed').length;
  const todayKey = formatInDeploymentTz(new Date(), tz, 'yyyy-MM-dd');
  const when = (iso: string) => formatInDeploymentTz(iso, tz, formatInDeploymentTz(iso, tz, 'yyyy-MM-dd') === todayKey ? 'HH:mm' : 'd MMM, HH:mm');
  const totalOpens = opens ? opens.total + opens.earlier_opens : 0;

  const sendTrip = (trip: any, url: string) => {
    const route = routeOf(trip);
    window.open(whatsAppLink(customer.whatsapp_number ?? null, `*${customer.name} · ${trip.ref_id || 'Trip'}*\n${route.origin} → ${route.destination}\nTrack live: ${url}`), '_blank', 'noopener');
  };

  const details: { label: string; value: ReactNode; missing: boolean }[] = [
    {
      label: 'Second contact',
      value: customer.secondary_contact_person || customer.secondary_contact_phone ? (
        <span className="flex min-w-0 flex-wrap items-center justify-end gap-x-1.5">
          {customer.secondary_contact_person && <span className="truncate">{customer.secondary_contact_person}</span>}
          <PhoneLine phone={customer.secondary_contact_phone} className="-mr-1" />
        </span>
      ) : null,
      missing: !customer.secondary_contact_person && !customer.secondary_contact_phone,
    },
    { label: 'Payment terms', value: customer.payment_terms, missing: !customer.payment_terms },
    { label: 'Driver app', value: customer.driver_workflow === 'EXTERNAL_APP' ? 'External app (screenshots)' : 'MERCON Driver App', missing: false },
    { label: 'Customer since', value: fmtDate(customer.createdAt, tz), missing: false },
    { label: 'Customer ID', value: `CUST-${customer.id.slice(0, 8).toUpperCase()}`, missing: false },
  ];
  const missing = [
    ...(!customer.primary_contact_person ? ['contact person'] : []),
    ...(!(customer.primary_contact_phone || customer.contact_phone) ? ['phone'] : []),
    ...(!customer.whatsapp_group_link ? ['WhatsApp group'] : []),
    ...details.filter((d) => d.missing).map((d) => d.label.toLowerCase()),
  ];

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      {/* ── Main: what's happening ── */}
      <div className="flex min-w-0 flex-col gap-4">
        <Section
          title="On the road"
          meta={
            <>
              <Count>{liveTrips.length}</Count>
              {delayed > 0 && <Badge tone="rose" dot>{delayed} delayed</Badge>}
            </>
          }
          action={
            liveTrips.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={onNewTrip} className={cn(ui.btnSm, 'text-slate-600')}>
                <Plus /> New trip
              </Button>
            ) : undefined
          }
        >
          {liveTrips.length === 0 ? (
            <EmptyRow
              icon={Truck}
              action={
                <Button variant="outline" size="sm" onClick={onNewTrip} className={ui.btnSm}>
                  <Plus /> New trip
                </Button>
              }
            >
              No trucks on the road right now.
            </EmptyRow>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {liveTrips.map((trip) => {
                const route = routeOf(trip);
                const plate = plateOf(trip);
                const tl = tripLinks?.[trip.id];
                const url = tl?.enabled ? tl.url : null;
                const due = trip.planned_end as string | null;
                const late = !!due && new Date(due).getTime() < Date.now();
                return (
                  <li key={trip.id} className="flex flex-col gap-1.5 px-4 py-2.5 lg:flex-row lg:items-center lg:gap-4">
                    <div className="flex items-center justify-between gap-2 lg:contents">
                      <button type="button" onClick={() => navigate(`/trips/${trip.id}`)} className="group min-w-0 text-left cursor-pointer lg:w-28 lg:shrink-0">
                        <span className="block truncate text-[13px] font-semibold text-slate-900 tabular-nums group-hover:text-[#E5533F] dark:text-white">{tripRef(trip)}</span>
                        <span className={cn('block text-xs tabular-nums', late ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-slate-500')}>
                          {due ? `Due ${when(due)}` : trip.planned_start ? `Start ${when(trip.planned_start)}` : '—'}
                        </span>
                      </button>
                      <span className="lg:w-24 lg:shrink-0"><TripStatusBadge status={trip.status} /></span>
                    </div>
                    <div className="min-w-0 lg:flex-1">
                      <p className="truncate text-[13px] text-slate-800 dark:text-slate-200" title={`${route.origin} → ${route.destination}`}>
                        {route.origin} <span className="text-slate-400">→</span> {route.destination}
                      </p>
                      <p className="truncate text-xs text-slate-500">{assignedTo(trip)}{plate ? ` · ${plate}` : ''}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2 lg:contents">
                      {trackingOn ? (
                        <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500 lg:w-36 lg:shrink-0">
                          <Eye className="size-3.5 shrink-0" />
                          <span className="truncate">{tripLinksLoading ? '…' : tl ? opensLabel(tl.open_count, tl.last_opened_at) : '—'}</span>
                        </span>
                      ) : <span />}
                      <div className="flex shrink-0 items-center gap-0.5">
                        {trackingOn && (
                          <>
                            <Button variant="ghost" size="icon" disabled={!url} onClick={() => url && sendTrip(trip, url)} className={cn(ui.iconSm, 'text-emerald-600 hover:text-emerald-700')} title="Send tracking link on WhatsApp" aria-label="Send tracking link on WhatsApp">
                              <WhatsAppIcon className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" disabled={!url} onClick={() => url && copyText(url)} className={cn(ui.iconSm, 'text-slate-500')} title="Copy tracking link" aria-label="Copy tracking link">
                              <Copy />
                            </Button>
                          </>
                        )}
                        <Button variant="outline" size="sm" onClick={() => navigate(`/trips/${trip.id}/track`)} className={cn(ui.btnSm, 'ml-1 px-2.5')}>
                          <MapPinned className="text-emerald-600" /> Track
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section
          title="Latest trips"
          action={
            <Button variant="ghost" size="sm" onClick={() => onTab('trips')} className={cn(ui.btnSm, 'text-slate-600')}>
              View all
            </Button>
          }
        >
          {latestTrips.length === 0 ? (
            <EmptyRow icon={Truck}>No finished or scheduled trips yet.</EmptyRow>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] sm:min-w-[600px]">
                <thead className={ui.thead}>
                  <tr>
                    <th className={cn(ui.thc, 'pl-4')}>Trip</th>
                    <th className={ui.thc}>Route</th>
                    <th className={cn(ui.thc, 'hidden md:table-cell')}>Driver</th>
                    <th className={cn(ui.thc, 'hidden sm:table-cell')}>Status</th>
                    <th className={cn(ui.thc, 'pr-4 text-right')}>Value (SAR)</th>
                  </tr>
                </thead>
                <tbody className={ui.tbody}>
                  {latestTrips.map((trip) => {
                    const route = routeOf(trip);
                    return (
                      <tr key={trip.id} onClick={() => navigate(`/trips/${trip.id}`)} className={ui.row}>
                        <td className={cn(ui.tdc, 'whitespace-nowrap pl-4')}>
                          <p className={ui.link}>{tripRef(trip)}</p>
                          <p className="text-xs text-slate-500 tabular-nums">{fmtDate(trip.planned_start || trip.createdAt, tz)}</p>
                        </td>
                        <td className={cn(ui.tdc, 'w-full max-w-0 sm:w-auto sm:max-w-[280px]')}>
                          <p className="truncate text-slate-800 dark:text-slate-200" title={`${route.origin} → ${route.destination}`}>
                            {route.origin} <span className="text-slate-400">→</span> {route.destination}
                          </p>
                        </td>
                        <td className={cn(ui.tdc, 'hidden max-w-[160px] truncate text-slate-600 md:table-cell dark:text-slate-300')}>{assignedTo(trip)}</td>
                        <td className={cn(ui.tdc, 'hidden sm:table-cell')}><TripStatusBadge status={trip.status} /></td>
                        <td className={cn(ui.tdc, 'pr-4 text-right font-medium text-slate-900 tabular-nums dark:text-white')}>{money(trip.billing_amount) ?? <span className="font-normal text-slate-300">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>

      {/* ── Side: account, tracking status, prices ── */}
      <aside className="grid min-w-0 grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-1">
        <Section
          title="Details"
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate(`/customers/${customer.id}/edit`)} className={cn(ui.btnSm, 'h-7 px-2 text-slate-600')}>
              Edit
            </Button>
          }
        >
          <dl className="divide-y divide-slate-100 dark:divide-slate-800">
            {details.filter((d) => d.value).map((d) => (
              <div key={d.label} className="flex items-center justify-between gap-4 px-4 py-2 text-[13px]">
                <dt className="shrink-0 text-slate-500 dark:text-slate-400">{d.label}</dt>
                <dd className="min-w-0 truncate text-right font-medium text-slate-900 tabular-nums dark:text-white">{d.value}</dd>
              </div>
            ))}
          </dl>
          {missing.length > 0 && (
            <button
              type="button"
              onClick={() => navigate(`/customers/${customer.id}/edit`)}
              className="flex w-full items-center justify-between gap-3 border-t border-amber-100 bg-amber-50/70 px-4 py-2 text-left text-xs text-amber-800 transition-colors hover:bg-amber-100/70 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300 cursor-pointer"
            >
              <span className="truncate" title={`Not set: ${missing.join(', ')}`}>Not set: {missing.join(', ')}</span>
              <span className="shrink-0 font-semibold">Add</span>
            </button>
          )}
        </Section>

        <Section
          title="Live tracking"
          meta={<Badge tone={trackingOn ? 'emerald' : 'slate'} dot>{trackingOn ? 'On' : 'Off'}</Badge>}
          action={
            <Button variant="ghost" size="sm" onClick={() => onTab('tracking')} className={cn(ui.btnSm, 'h-7 px-2 text-slate-600')}>
              <Settings2 /> Manage
            </Button>
          }
        >
          {trackingOn ? (
            <div className="space-y-2.5 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[13px] text-slate-600 dark:text-slate-300">
                <Eye className="size-3.5 text-slate-400" />
                {!opens ? 'Checking link opens…' : totalOpens > 0 ? (
                  <span>Links opened <b className="font-semibold text-slate-900 tabular-nums dark:text-white">{totalOpens}×</b>{opens.opens[0] ? ` · last ${timeAgo(opens.opens[0].opened_at)}` : ''}</span>
                ) : 'No link opened yet'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SEES.map((s) => {
                  const on = (customer[s.key] as boolean | undefined) ?? s.fallback;
                  return (
                    <span
                      key={s.key}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs',
                        on ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-400 line-through decoration-slate-300 dark:bg-slate-800',
                      )}
                      title={on ? 'The customer sees this' : 'Hidden from the customer'}
                    >
                      {on ? <Check className="size-3" /> : <X className="size-3" />} {s.label}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="px-4 py-3 text-[13px] text-slate-500">Tracking links are off for this customer.</p>
          )}
        </Section>

        <Section
          title="Quotations"
          meta={<Count>{activeQuotations.length}</Count>}
          className="md:col-span-2 xl:col-span-1"
          action={
            <>
              <Button variant="ghost" size="icon" onClick={onAddQuotation} className={cn(ui.iconSm, 'size-7 text-slate-600')} aria-label="Add quotation" title="Add quotation">
                <Plus />
              </Button>
              {activeQuotations.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => onTab('quotations')} className={cn(ui.btnSm, 'h-7 px-2 text-slate-600')}>
                  View all
                </Button>
              )}
            </>
          }
        >
          {activeQuotations.length === 0 ? (
            <EmptyRow>No active quotations yet.</EmptyRow>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {activeQuotations.slice(0, 5).map((q: any) => {
                const route = routeOf(q);
                const monthly = String(q.pricing_basis || '').toUpperCase().replace(' ', '_') === 'PER_MONTH';
                return (
                  <li key={q.id}>
                    <button type="button" onClick={() => onEditQuotation(q)} className="group flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer">
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-slate-900 group-hover:text-[#E5533F] dark:text-white">{route.origin} → {route.destination}</span>
                        <span className="block truncate text-xs text-slate-500">{q.vehicle_class || q.source_vehicle_label || q.vehicle_type || `QUO-${q.quotation_number || q.id.slice(0, 6).toUpperCase()}`}</span>
                      </span>
                      <span className="shrink-0 text-right text-[13px] font-medium text-slate-900 tabular-nums dark:text-white">
                        {money(q.rate) ?? '—'}
                        <span className="block text-[11px] font-normal text-slate-400">SAR / {monthly ? 'month' : 'trip'}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </aside>
    </div>
  );
}
