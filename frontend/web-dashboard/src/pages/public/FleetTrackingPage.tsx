import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, ChevronRight, Clock, Loader2, MapPinOff, RefreshCw, Search, Truck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { trackingService, type DeliveredTrip, type FleetTruck } from '@/services/trackingService';
import { filterFleet, routesOf } from './fleetFilters';
import { useTrackingText, type TrackingText } from './trackingI18n';
import { AskButton, BrandMark, Centered, Chip, LangToggle, Photo, TRACK_BLUE } from './trackingParts';

/**
 * The customer-wide tracking page (/c/:token): every truck of one customer
 * that is on the road or about to load, and their deliveries of the last 30
 * days — for monthly contracts, so the customer pins one link in their
 * WhatsApp group. A list, not a map (owner, 2026-10-03: the map is noise
 * here); each truck opens its own trip page, which has the map.
 * One card per truck: a truck with several queued trips shows its current trip
 * and the rest as "Next". No login: the token is the permission.
 */
const REFRESH_MS = 60_000;
const DAYS_SHOWN_FIRST = 3;

/** A truck and its trips on this page: the one it's doing now, then the ones queued after it. */
interface TruckGroup {
  key: string;
  current: FleetTruck;
  next: FleetTruck[];
}

const quiet = (x: FleetTruck) => x.phase === 'active' && (x.eta_gap === 'stale' || x.eta_gap === 'no_position');

function groupByTruck(trucks: FleetTruck[]): TruckGroup[] {
  const groups = new Map<string, FleetTruck[]>();
  for (const x of trucks) {
    const key = x.plate || x.token;
    groups.set(key, [...(groups.get(key) ?? []), x]);
  }
  const rank = (x: FleetTruck) => (x.phase === 'active' ? (quiet(x) ? 1 : 0) : 2);
  const startOf = (x: FleetTruck) => (x.planned_start ? new Date(x.planned_start).getTime() : Infinity);
  return [...groups.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => rank(a) - rank(b) || startOf(a) - startOf(b));
      return { key, current: sorted[0], next: sorted.slice(1) };
    })
    .sort((a, b) => rank(a.current) - rank(b.current) || startOf(a.current) - startOf(b.current));
}

export default function FleetTrackingPage() {
  const { token = '' } = useParams();
  const counted = useRef(false);
  const { data, error, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ['public-fleet-tracking', token],
    queryFn: () => {
      const view = !counted.current;
      counted.current = true;
      return trackingService.getPublicFleet(token, view);
    },
    retry: (n, err: any) => n < 2 && !err?.response?.status,
    refetchInterval: REFRESH_MS,
  });
  const text = useTrackingText(data?.timezone ?? 'Asia/Riyadh');
  const [query, setQuery] = useState('');
  const [route, setRoute] = useState<string | null>(null);

  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (data) document.title = `${data.customer.name} · ${data.brand.name}`;
  }, [data]);

  const shownGroups = useMemo(() => (data ? groupByTruck(filterFleet(data.trucks, query, route)) : []), [data, query, route]);

  if (isLoading) {
    return (
      <Centered>
        <Loader2 className="size-5 animate-spin text-slate-400" />
        <p className="text-sm text-slate-500">{text.t.finding}</p>
      </Centered>
    );
  }
  if (error || !data) {
    return (
      <Centered>
        <MapPinOff className="size-6 text-slate-400" />
        <p className="max-w-xs text-center text-sm text-slate-600">{(error as any)?.response?.data?.error?.message || text.t.loadFailed}</p>
      </Centered>
    );
  }

  const allGroups = groupByTruck(data.trucks);
  const onRoad = allGroups.filter((g) => g.current.phase === 'active').length;
  const soon = allGroups.filter((g) => g.current.phase === 'planned').length;
  const deliveredToday = data.delivered.filter((d) => d.finished_at && Date.now() - new Date(d.finished_at).getTime() < 86_400_000).length;
  const routes = routesOf(data.trucks);
  const shownDelivered = filterFleet(data.delivered, query, route);

  return (
    <div dir={text.rtl ? 'rtl' : 'ltr'} className="min-h-[100dvh] bg-[#f6f4ef] text-slate-900">
      <div className="mx-auto w-full max-w-2xl px-4 pt-4 pb-10 sm:pt-8">
        <div className="mb-4 flex items-center justify-between gap-2">
          <BrandMark brand={data.brand} className="h-7 max-w-[140px] opacity-90" />
          <LangToggle text={text} />
        </div>

        <main className="rounded-3xl bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.06)] sm:p-6">
          <header className="flex items-center gap-3.5">
            <Photo url={data.customer.logo_url} name={data.customer.name} kind="logo" size={56} />
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">{text.t.liveTrucks}</p>
              <h1 className="text-xl leading-tight font-semibold text-balance text-slate-900 sm:text-2xl">{data.customer.name}</h1>
            </div>
          </header>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Chip tone="blue"><Truck className="size-3.5" /> {text.t.trucksOnRoad(onRoad)}</Chip>
            {soon > 0 && <Chip tone="violet">{text.t.loadingSoon(soon)}</Chip>}
            {deliveredToday > 0 && <Chip tone="green"><Check className="size-3.5" strokeWidth={3} /> {text.t.deliveredToday(deliveredToday)}</Chip>}
          </div>

          <FleetFilters text={text} routes={routes} query={query} onQuery={setQuery} route={route} onRoute={setRoute} />

          {data.trucks.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{text.t.noTrucks}</p>
          ) : shownGroups.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{text.t.noMatch}</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {shownGroups.map((g) => <TruckCard key={g.key} group={g} text={text} fleetToken={token} />)}
            </ul>
          )}

          <DeliveredHistory trips={shownDelivered} total={data.delivered.length} text={text} fleetToken={token} timezone={data.timezone} />

          <div className="mt-5"><AskButton brand={data.brand} text={text} about={data.customer.name} /></div>

          <footer className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-400">
            <span>{text.t.updated(text.ago(new Date(dataUpdatedAt).toISOString()))}</span>
            <button type="button" onClick={() => refetch()} className="flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-slate-600 hover:bg-slate-100">
              <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} /> {text.t.refresh}
            </button>
          </footer>
        </main>
        <p className="mt-3 text-center text-[11px] text-slate-400">{text.t.sharedBy(data.brand.name)}</p>
      </div>
    </div>
  );
}

/** The trip page for a truck, remembering this page for its back button. */
const tripLink = (tripToken: string, fleetToken: string) => `/t/${tripToken}?c=${encodeURIComponent(fleetToken)}`;

/** One truck: what it's doing now, and the trips queued after it. */
function TruckCard({ group, text, fleetToken }: { group: TruckGroup; text: TrackingText; fleetToken: string }) {
  const { t, clock, duration } = text;
  const x = group.current;
  const status = x.phase === 'planned' ? <Chip tone="violet">{t.scheduled}</Chip>
    : quiet(x) ? <Chip tone="slate">{t.notReporting}</Chip>
    : x.position?.fresh && !x.position.moving ? <Chip tone="amber">{t.stopped}</Chip>
    : <Chip tone="blue">{t.onTheWay}</Chip>;

  let when: string;
  if (x.eta) when = `${x.phase === 'planned' ? t.arrivesForLoading : t.arrivesAt} ${x.next_stop_name ?? ''} · ${clock(x.eta.arrival)}`;
  else if (x.phase === 'planned') when = x.planned_start ? `${t.startsAt} ${clock(x.planned_start)}` : t.soon;
  else if (quiet(x) && x.position) when = `${t.lastSeen} ${text.ago(x.position.recorded_at)}`;
  else when = x.next_stop_name ? `${t.to} ${x.next_stop_name}` : t.onTheWay;

  return (
    <li className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <Link to={tripLink(x.token, fleetToken)} className="block p-3.5 transition-colors hover:bg-slate-50 active:bg-slate-100">
        <div className="flex items-start gap-3">
          <CrewPhoto truck={x} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm leading-snug font-semibold text-slate-900">{x.route_label ?? x.ref}</span>
              {status}
            </div>
            <p className="truncate text-xs text-slate-500" dir="ltr" style={{ textAlign: text.rtl ? 'right' : 'left' }}>
              {[x.plate, x.type, x.ref].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <p className="mt-2 truncate text-sm text-slate-700">{when}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>{t.stopsDone(x.stops_done, x.stops_total)}</span>
          {x.driver_first_name && <span>· {t.driver} {x.driver_first_name}</span>}
          {x.position?.fresh && <span>· {t.updatedAgo(text.ago(x.position.recorded_at))}</span>}
          {x.punctuality && (x.punctuality.late_min > 0
            ? <span className="inline-flex items-center gap-1 font-medium text-rose-700"><Clock className="size-3" /> {t.expectedLate(duration(x.punctuality.late_min * 60))}</span>
            : <span className="font-medium text-emerald-700">· {t.onTime}</span>)}
          {x.delay && <span className="inline-flex items-center gap-1 font-medium text-amber-700"><AlertTriangle className="size-3" /> {text.delayReason(x.delay.reason)}</span>}
        </div>
        {x.phase === 'active' && x.progress_pct != null && !quiet(x) && (
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${Math.max(3, x.progress_pct)}%`, backgroundColor: TRACK_BLUE }} />
          </div>
        )}
      </Link>

      {group.next.length > 0 && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-3.5 py-2">
          {group.next.slice(0, 2).map((n) => (
            <Link key={n.token} to={tripLink(n.token, fleetToken)} className="flex items-center gap-2 py-1 text-xs text-slate-600 hover:text-slate-900">
              <span className="rounded-md bg-white px-1.5 py-0.5 font-semibold text-slate-500 ring-1 ring-slate-200">{t.nextTrip}</span>
              <span className="min-w-0 flex-1 truncate">{[n.route_label, n.ref].filter(Boolean).join(' · ')}</span>
              {n.planned_start && <span className="shrink-0 text-slate-400">{clock(n.planned_start)}</span>}
              <ChevronRight className={cn('size-3.5 shrink-0 text-slate-400', text.rtl && 'rotate-180')} />
            </Link>
          ))}
          {group.next.length > 2 && <p className="py-1 text-xs text-slate-400">{t.moreTrips(group.next.length - 2)}</p>}
        </div>
      )}
    </li>
  );
}

/** The driver's photo with the truck's photo as a small badge — who and what, at a glance. */
function CrewPhoto({ truck: x }: { truck: FleetTruck }) {
  return (
    <span className="relative shrink-0">
      <Photo url={x.driver_photo_url} name={x.driver_first_name} kind={x.driver_first_name ? 'person' : 'truck'} size={44} />
      {x.driver_first_name && (
        <Photo url={x.vehicle_photo_url} name={x.plate} kind="truck" size={20} className="absolute -right-1 -bottom-1 ring-2 ring-white" />
      )}
    </span>
  );
}

/** Search box and route chips. */
function FleetFilters({ text, routes, query, onQuery, route, onRoute }: {
  text: TrackingText; routes: string[]; query: string; onQuery: (q: string) => void; route: string | null; onRoute: (r: string | null) => void;
}) {
  const chip = (active: boolean) => cn(
    'shrink-0 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap',
    active ? 'border-[#3E3C3D] bg-[#3E3C3D] text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
  );
  return (
    <div className="mt-4 space-y-2">
      <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-slate-400">
        <Search className="size-4 shrink-0 text-slate-400" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={text.t.search}
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
        />
        {query && (
          <button type="button" onClick={() => onQuery('')} aria-label={text.t.close} className="text-slate-400"><X className="size-4" /></button>
        )}
      </label>
      {routes.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => onRoute(null)} className={chip(route === null)}>{text.t.allRoutes}</button>
          {routes.map((r) => (
            <button key={r} type="button" onClick={() => onRoute(route === r ? null : r)} className={chip(route === r)}>{r}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Did yesterday's truck reach?" — the last 30 days of deliveries, by day, newest first. */
function DeliveredHistory({ trips, total, text, fleetToken, timezone }: {
  trips: DeliveredTrip[]; total: number; text: TrackingText; fleetToken: string; timezone: string;
}) {
  const { t, clock } = text;
  const [showAll, setShowAll] = useState(false);
  const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  const label = (key: string, iso: string) =>
    key === today ? t.today : key === yesterday ? t.yesterday
      : new Intl.DateTimeFormat(text.rtl ? 'ar-SA' : 'en-GB', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));

  const days: { key: string; label: string; trips: DeliveredTrip[] }[] = [];
  for (const d of trips) {
    if (!d.finished_at) continue;
    const key = dayKey(d.finished_at);
    const day = days.find((x) => x.key === key);
    if (day) day.trips.push(d);
    else days.push({ key, label: label(key, d.finished_at), trips: [d] });
  }
  const visible = showAll ? days : days.slice(0, DAYS_SHOWN_FIRST);

  return (
    <section className="mt-7">
      <h2 className="text-sm font-semibold text-slate-900">{t.deliveredRecently}</h2>
      {total === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{t.noDelivered}</p>
      ) : days.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{t.noMatch}</p>
      ) : (
        <div className="mt-3 space-y-4">
          {visible.map((day) => (
            <div key={day.key}>
              <p className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-500">
                <span>{day.label}</span>
                <span className="text-slate-400">{t.trips(day.trips.length)}</span>
              </p>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
                {day.trips.map((d) => (
                  <li key={d.token}>
                    <Link to={tripLink(d.token, fleetToken)} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{d.route_label ?? d.ref}</p>
                        <p className="truncate text-xs text-slate-500">
                          {[d.finished_at && t.deliveredAt(clock(d.finished_at)), d.plate, d.ref].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <ChevronRight className={cn('size-4 shrink-0 text-slate-400', text.rtl && 'rotate-180')} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!showAll && days.length > DAYS_SHOWN_FIRST && (
            <button type="button" onClick={() => setShowAll(true)} className="w-full rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              {t.showEarlier}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
