import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapPinned, Plus, Truck } from 'lucide-react';
import { getLegEndpoints, isRoundTrip, parseTripRouteNodes } from '@mercon/shared-types';

import { tripService, Trip } from '@/services/tripService';
import { Button } from '@/components/ui/button';
import { formatInDeploymentTz, useDeploymentTimezone } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { EmptyRow, Pager, SearchField, Segmented, SkeletonRows, Toolbar, TripStatusBadge, ui } from '@/components/customers/customerUi';

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
    <section className={cn(ui.card, 'min-w-0 overflow-hidden')}>
      <Toolbar>
        <Segmented label="Trip stage" value={filter} onChange={(id) => { setFilter(id); setPage(1); }} options={chips.map((c) => ({ ...c, count: counts[c.id] }))} />
        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          <SearchField value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Trip, driver, plate, place or AWB" className="flex-1 sm:w-72 sm:flex-none" />
          <Button size="sm" onClick={() => navigate(`/trips/new?customer_id=${customerId}`)} className={ui.btnSm}>
            <Plus /> New trip
          </Button>
        </div>
      </Toolbar>

      {isError ? (
        <EmptyRow icon={Truck}>Couldn't load trips — try again in a moment.</EmptyRow>
      ) : isLoading ? (
        <SkeletonRows rows={6} />
      ) : rows.length === 0 ? (
        <EmptyRow icon={Truck}>{search || filter !== 'all' ? 'No trips match — try another stage or search.' : `No trips yet. Create the first trip for ${customerName}.`}</EmptyRow>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-[13px]">
            <thead className={ui.thead}>
              <tr>
                <th className={cn(ui.thc, 'pl-4')}>Trip</th>
                <th className={ui.thc}>Route</th>
                <th className={ui.thc}>Driver & truck</th>
                <th className={ui.thc}>Status</th>
                <th className={cn(ui.thc, 'text-right')}>Value (SAR)</th>
                <th className={cn(ui.thc, 'w-24 pr-4')}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className={ui.tbody}>
              {rows.map((t) => {
                const r = routeLabel(t);
                const driver = driverLabel(t);
                const plate = t.vehicle?.plate_number || (t as any).third_party_vehicle_plate;
                const value = Number(t.billing_amount || (t as any).applied_rate || 0);
                const live = GROUPS.live.includes(t.status);
                return (
                  <tr key={t.id} onClick={() => navigate(`/trips/${t.id}`)} className={ui.row}>
                    <td className={cn(ui.tdc, 'whitespace-nowrap pl-4')}>
                      <p className={ui.link}>{t.ref_id || t.id.slice(0, 8).toUpperCase()}</p>
                      <p className="text-xs text-slate-500 tabular-nums">{formatInDeploymentTz((t as any).planned_start || t.createdAt, tz, 'd MMM yyyy, HH:mm')}</p>
                    </td>
                    <td className={cn(ui.tdc, 'max-w-[320px]')}>
                      <p className="truncate text-slate-800 dark:text-slate-200" title={`${r.origin} → ${r.dest}`}>
                        {r.origin} <span className="text-slate-400">{r.round ? '⇄' : '→'}</span> {r.dest}
                      </p>
                      {r.via && <p className="truncate text-xs text-slate-500">via {r.via}</p>}
                    </td>
                    <td className={cn(ui.tdc, 'max-w-[200px]')}>
                      <p className={cn('truncate', driver ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400')}>{driver || 'No driver yet'}</p>
                      {plate && <p className="text-xs text-slate-500 tabular-nums">{plate}</p>}
                    </td>
                    <td className={ui.tdc}><TripStatusBadge status={t.status} /></td>
                    <td className={cn(ui.tdc, 'text-right font-medium text-slate-900 tabular-nums dark:text-white')}>
                      {value > 0 ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : <span className="font-normal text-slate-300">—</span>}
                    </td>
                    <td className={cn(ui.tdc, 'pr-4 text-right')}>
                      {live && (
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/trips/${t.id}/track`); }} className={cn(ui.btnSm, 'h-7 px-2.5')}>
                          <MapPinned className="text-emerald-600" /> Track
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={current} pages={pages} total={shown.length} size={PAGE_SIZE} onPage={setPage} />
      {trips.length >= 200 && (
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-800">Showing the latest 200 trips — older ones are in Trips, filtered by customer.</p>
      )}
    </section>
  );
}
