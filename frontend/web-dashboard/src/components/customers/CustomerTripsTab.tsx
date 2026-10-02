import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, MapPinned, Plus, Search, Truck, X } from 'lucide-react';
import { getLegEndpoints, isRoundTrip, parseTripRouteNodes } from '@mercon/shared-types';

import { tripService, Trip } from '@/services/tripService';
import { Input } from '@/components/ui/input';
import { formatInDeploymentTz, useDeploymentTimezone } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { EmptyBlock, Panel, TripStatusBadge, ui } from '@/components/customers/customerUi';

interface CustomerTripsTabProps {
  customerId: string;
  customerName: string;
}

type Filter = 'all' | 'live' | 'upcoming' | 'done' | 'cancelled';

const GROUPS: Record<Exclude<Filter, 'all'>, string[]> = {
  live: ['Loading', 'InTransit', 'Delayed', 'Dispatched', 'AtPickup', 'AtDelivery'],
  upcoming: ['Draft', 'Scheduled'],
  done: ['Completed', 'Invoiced'],
  cancelled: ['Cancelled'],
};

const PAGE_SIZE = 20;

function routeLabel(t: Trip) {
  const nodes = Array.isArray((t as any).route_timeline) && (t as any).route_timeline.length >= 2 ? (t as any).route_timeline : parseTripRouteNodes(t);
  const leg = getLegEndpoints(t, 0);
  const origin = nodes[0]?.name || (t as any).origin_city || '—';
  const dest = (leg.delivery as any)?.name || leg.delivery?.location_name || leg.delivery?.location?.name || nodes[nodes.length - 1]?.name || (t as any).destination_city || '—';
  const via = leg.intermediates.map((n: any) => n.name).filter(Boolean).join(', ');
  return { origin, dest, via, round: isRoundTrip(t) };
}

function driverLabel(t: Trip) {
  if ((t as any).is_third_party) return (t as any).third_party_driver_name || (t as any).thirdPartyProvider?.name || '3rd party';
  return t.driver ? `${t.driver.first_name} ${t.driver.last_name}`.trim() : null;
}

/** Customer → Trips: every trip for this customer, filterable by stage, with tracking for the ones on the road. */
export default function CustomerTripsTab({ customerId, customerName }: CustomerTripsTabProps) {
  const navigate = useNavigate();
  const tz = useDeploymentTimezone();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);

  const { data: tripsRes, isLoading, isError } = useQuery({
    queryKey: ['trips', 'customer-tab', customerId],
    queryFn: () => tripService.getAll({ customer_id: customerId, per_page: 200 }),
    enabled: !!customerId,
  });

  const trips: Trip[] = useMemo(() => {
    const raw = Array.isArray(tripsRes) ? tripsRes : (tripsRes as any)?.data || [];
    return raw.filter((t: Trip) => t.customer_id === customerId || (t as any).customerId === customerId || t.customer?.id === customerId);
  }, [tripsRes, customerId]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: trips.length, live: 0, upcoming: 0, done: 0, cancelled: 0 };
    for (const t of trips) for (const [k, list] of Object.entries(GROUPS)) if (list.includes(t.status)) c[k as Filter]++;
    return c;
  }, [trips]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return trips.filter((t) => {
      if (filter !== 'all' && !GROUPS[filter].includes(t.status)) return false;
      if (!term) return true;
      const r = routeLabel(t);
      return [t.ref_id || t.id, driverLabel(t) || '', t.vehicle?.plate_number || (t as any).third_party_vehicle_plate || '', r.origin, r.dest, r.via, (t as any).awb_number || '']
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [trips, filter, search]);

  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const chips: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'live', label: 'On the road' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'done', label: 'Completed' },
    ...(counts.cancelled > 0 ? [{ id: 'cancelled' as Filter, label: 'Cancelled' }] : []),
  ];

  return (
    <Panel
      title="Trips"
      description={`Every trip for ${customerName}${trips.length >= 200 ? ' (latest 200)' : ''}`}
      icon={Truck}
      tone="brand"
      flush
      action={
        <button type="button" onClick={() => navigate(`/trips/new?customer_id=${customerId}`)} className={cn(ui.btn, ui.btnPrimary, 'h-8')}>
          <Plus className="size-4" /> New trip
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
        <div className="flex max-w-full items-center gap-1 overflow-x-auto" role="tablist" aria-label="Trip stage">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={filter === c.id}
              onClick={() => { setFilter(c.id); setPage(1); }}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors cursor-pointer',
                filter === c.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              {c.label}
              <span className={cn('tabular-nums', filter === c.id ? 'text-white/70 dark:text-slate-500' : 'text-slate-400')}>{counts[c.id]}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Trip, driver, plate, place or AWB" aria-label="Search trips" className={cn(ui.input, 'w-full pl-9 pr-8')} />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {isError ? (
        <div className="p-5"><EmptyBlock icon={Truck} title="Couldn't load trips" text="Try again in a moment." /></div>
      ) : !isLoading && rows.length === 0 ? (
        <div className="p-5">
          <EmptyBlock icon={Truck} title={search || filter !== 'all' ? 'No trips match' : 'No trips yet'} text={search || filter !== 'all' ? 'Try another stage or search.' : `Create the first trip for ${customerName}.`} />
        </div>
      ) : (
        <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50/80 dark:bg-slate-800/40">
              <tr>
                <th className={cn(ui.th, 'pl-5')}>Trip</th>
                <th className={ui.th}>Route</th>
                <th className={ui.th}>Driver & truck</th>
                <th className={cn(ui.th, 'text-right')}>Value (SAR)</th>
                <th className={ui.th}>Status</th>
                <th className={cn(ui.th, 'pr-5')}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-5 py-4"><div className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></td></tr>
                ))
                : rows.map((t) => {
                  const r = routeLabel(t);
                  const driver = driverLabel(t);
                  const plate = t.vehicle?.plate_number || (t as any).third_party_vehicle_plate;
                  const value = Number(t.billing_amount || (t as any).applied_rate || 0);
                  const live = GROUPS.live.includes(t.status);
                  return (
                    <tr key={t.id} onClick={() => navigate(`/trips/${t.id}`)} className="group cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className={cn(ui.td, 'pl-5')}>
                        <p className="font-medium text-slate-900 tabular-nums group-hover:text-[#E5533F] dark:text-white">{t.ref_id || t.id.slice(0, 8).toUpperCase()}</p>
                        <p className="text-xs text-slate-500">{formatInDeploymentTz((t as any).planned_start || t.createdAt, tz, 'd MMM yyyy, HH:mm')}</p>
                      </td>
                      <td className={cn(ui.td, 'max-w-[300px]')}>
                        <p className="truncate text-slate-800 dark:text-slate-200" title={`${r.origin} → ${r.dest}`}>
                          {r.origin} <span className="text-slate-400">{r.round ? '⇄' : '→'}</span> {r.dest}
                        </p>
                        {r.via && <p className="truncate text-xs text-slate-500">via {r.via}</p>}
                      </td>
                      <td className={ui.td}>
                        <p className={cn('truncate', driver ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400')}>{driver || 'No driver yet'}</p>
                        {plate && <p className="text-xs text-slate-500 tabular-nums">{plate}</p>}
                      </td>
                      <td className={cn(ui.td, 'text-right font-medium text-slate-900 tabular-nums dark:text-white')}>
                        {value > 0 ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : <span className="font-normal text-slate-300">—</span>}
                      </td>
                      <td className={ui.td}><TripStatusBadge status={t.status} /></td>
                      <td className={cn(ui.td, 'pr-5 text-right')}>
                        {live && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`/trips/${t.id}/track`); }} className={cn(ui.btn, ui.btnOutline, 'h-8')}>
                            <MapPinned className="size-4 text-emerald-600" /> Track
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {shown.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-[13px] text-slate-500 dark:border-slate-800">
          <span className="tabular-nums">{(current - 1) * PAGE_SIZE + 1}–{Math.min(shown.length, current * PAGE_SIZE)} of {shown.length}</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage(current - 1)} disabled={current <= 1} className={cn(ui.btn, ui.btnOutline, 'h-8 px-2.5')} aria-label="Previous page"><ChevronLeft className="size-4" /></button>
            <span className="px-2 tabular-nums">Page {current} of {pages}</span>
            <button type="button" onClick={() => setPage(current + 1)} disabled={current >= pages} className={cn(ui.btn, ui.btnOutline, 'h-8 px-2.5')} aria-label="Next page"><ChevronRight className="size-4" /></button>
          </div>
        </div>
      )}
    </Panel>
  );
}
