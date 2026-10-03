import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, Check, ChevronRight, Clock, Loader2, MapPinOff, RefreshCw, Search, Timer, Truck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveFileUrl } from '@/lib/documents';
import { trackingService, type DeliveredTrip, type FleetTruck, type MonthSummary } from '@/services/trackingService';
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
const SOON_SECONDS = 60 * 60;

type Tab = 'all' | 'road' | 'scheduled' | 'late' | 'delivered';

/** A truck and its trips on this page: the one it's doing now, then the ones queued after it. */
interface TruckGroup {
  key: string;
  current: FleetTruck;
  next: FleetTruck[];
}

const quiet = (x: FleetTruck) => x.phase === 'active' && (x.eta_gap === 'stale' || x.eta_gap === 'no_position');
/** Running late — only what the customer's settings show (expected lateness, or a delay reason). */
const late = (x: FleetTruck) => x.phase === 'active' && ((x.punctuality?.late_min ?? 0) > 0 || Boolean(x.delay));
const arrivingSoon = (x: FleetTruck) => x.phase === 'active' && !quiet(x) && x.eta != null && x.eta.seconds <= SOON_SECONDS;

function groupByTruck(trucks: FleetTruck[]): TruckGroup[] {
  const groups = new Map<string, FleetTruck[]>();
  for (const x of trucks) {
    const key = x.plate || x.token;
    groups.set(key, [...(groups.get(key) ?? []), x]);
  }
  const rank = (x: FleetTruck) => (x.phase === 'active' ? (quiet(x) ? 1 : 0) : 2);
  // Soonest first: arrival time on the road, start time when scheduled.
  const startOf = (x: FleetTruck) => (x.eta ? new Date(x.eta.arrival).getTime() : x.planned_start ? new Date(x.planned_start).getTime() : Infinity);
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
  const [tab, setTab] = useState<Tab>('all');

  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (data) document.title = `${data.customer.name} · ${data.brand.name}`;
  }, [data]);

  const filteredGroups = useMemo(() => (data ? groupByTruck(filterFleet(data.trucks, query, route)) : []), [data, query, route]);
  const shownGroups = filteredGroups.filter((g) =>
    tab === 'road' ? g.current.phase === 'active' : tab === 'scheduled' ? g.current.phase === 'planned' : tab === 'late' ? late(g.current) : tab === 'delivered' ? false : true);

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
  const lateGroups = allGroups.filter((g) => late(g.current));
  const soonGroups = allGroups.filter((g) => arrivingSoon(g.current));
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: text.t.tabAll, count: allGroups.length },
    { key: 'road', label: text.t.tabOnRoad, count: onRoad },
    { key: 'scheduled', label: text.t.tabScheduled, count: soon },
    ...(lateGroups.length > 0 ? [{ key: 'late' as Tab, label: text.t.tabLate, count: lateGroups.length }] : []),
    { key: 'delivered', label: text.t.tabDelivered, count: data.delivered.length },
  ];

  const card = 'rounded-3xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)]';
  const history = <DeliveredHistory trips={shownDelivered} total={data.delivered.length} text={text} fleetToken={token} timezone={data.timezone} />;

  // Phone: one column. Desktop: the customer and this month across the top, trucks
  // in a grid on the left, deliveries and "Ask" in a sidebar on the right.
  return (
    <div dir={text.rtl ? 'rtl' : 'ltr'} className="min-h-[100dvh] bg-[#f6f4ef] text-slate-900">
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 pb-10 sm:px-6 sm:pt-6 lg:px-8">
        <div className="mb-4 flex items-center justify-between gap-2">
          <BrandMark brand={data.brand} className="h-7 max-w-[140px] opacity-90" />
          <LangToggle text={text} />
        </div>

        <header className={cn(card, 'flex flex-col gap-4 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between')}>
          <div className="min-w-0">
            <div className="flex items-center gap-3.5">
              <Photo url={data.customer.logo_url} name={data.customer.name} kind="logo" size={56} />
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500">{text.t.liveTrucks}</p>
                <h1 className="text-xl leading-tight font-semibold text-balance text-slate-900 sm:text-2xl">{data.customer.name}</h1>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <Chip tone="blue"><Truck className="size-3.5" /> {text.t.trucksOnRoad(onRoad)}</Chip>
              {soon > 0 && <Chip tone="violet">{text.t.loadingSoon(soon)}</Chip>}
              {deliveredToday > 0 && <Chip tone="green"><Check className="size-3.5" strokeWidth={3} /> {text.t.deliveredToday(deliveredToday)}</Chip>}
            </div>
          </div>
          {data.month && data.month.trips > 0 && <MonthCard month={data.month} text={text} timezone={data.timezone} className="lg:w-[440px] lg:shrink-0" />}
        </header>

        <div className="mt-4 grid gap-4 lg:mt-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-5">
          <main className={cn(card, 'min-w-0 p-4 sm:p-6 [&>*:first-child]:mt-0')}>
            {lateGroups.length > 0 && tab !== 'late' && (
              <button
                type="button"
                onClick={() => setTab('late')}
                className="mt-4 flex w-full items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-start text-sm text-rose-900 hover:bg-rose-100/70"
              >
                <AlertTriangle className="size-4 shrink-0 text-rose-600" />
                <span className="min-w-0 flex-1 font-semibold">{text.t.runningLate(lateGroups.length)}</span>
                <span className="shrink-0 text-xs font-semibold text-rose-700">{text.t.seeLate}</span>
                <ChevronRight className={cn('size-4 shrink-0 text-rose-500', text.rtl && 'rotate-180')} />
              </button>
            )}

            {soonGroups.length > 0 && <ArrivingSoon groups={soonGroups} text={text} fleetToken={token} />}

            <FleetFilters text={text} routes={routes} query={query} onQuery={setQuery} route={route} onRoute={setRoute} />

            <div role="tablist" className="mt-4 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tabs.map((tb) => (
                <button
                  key={tb.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === tb.key}
                  onClick={() => setTab(tb.key)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors',
                    tab === tb.key ? 'bg-[#3E3C3D] text-white' : 'text-slate-600 hover:bg-slate-100',
                    tb.key === 'late' && tab !== tb.key && 'text-rose-700',
                  )}
                >
                  {tb.label}
                  <span className={cn('rounded-full px-1.5 text-[11px] font-semibold', tab === tb.key ? 'bg-white/20' : 'bg-slate-100 text-slate-500')}>{tb.count}</span>
                </button>
              ))}
            </div>

            {tab === 'delivered' ? (
              history
            ) : data.trucks.length === 0 ? (
              <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{text.t.noTrucks}</p>
            ) : shownGroups.length === 0 ? (
              <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{query || route ? text.t.noMatch : text.t.noneInTab}</p>
            ) : (
              <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {shownGroups.map((g) => <TruckCard key={g.key} group={g} text={text} fleetToken={token} />)}
              </ul>
            )}
          </main>

          <aside className="space-y-4 lg:sticky lg:top-6">
            {tab !== 'delivered' && (
              <section className={cn(card, 'p-4 sm:p-5 [&>section]:mt-0', tab === 'all' ? 'block' : 'hidden lg:block')}>{history}</section>
            )}
            <div className={cn(card, 'p-4 sm:p-5')}>
              <AskButton brand={data.brand} text={text} about={data.customer.name} />
              <footer className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-400">
                <span>{text.t.updated(text.ago(new Date(dataUpdatedAt).toISOString()))}</span>
                <button type="button" onClick={() => refetch()} className="flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-slate-600 hover:bg-slate-100">
                  <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} /> {text.t.refresh}
                </button>
              </footer>
            </div>
            <p className="text-center text-[11px] text-slate-400">{text.t.sharedBy(data.brand.name)}</p>
          </aside>
        </div>
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
    <li className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <Link to={tripLink(x.token, fleetToken)} className="block flex-1 p-3.5 transition-colors hover:bg-slate-50 active:bg-slate-100">
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

/** This month so far — "October so far · 312 trips delivered · 94% on time · 18 delayed, mostly waiting at the site". */
function MonthCard({ month, text, timezone, className }: { month: MonthSummary; text: TrackingText; timezone: string; className?: string }) {
  const { t } = text;
  const name = new Intl.DateTimeFormat(text.rtl ? 'ar-SA' : 'en-GB', { month: 'long', timeZone: timezone }).format(new Date(`${month.month}-15T12:00:00Z`));
  const pct = month.measured && month.on_time != null ? Math.round((month.on_time / month.measured) * 100) : null;
  return (
    <section className={cn('rounded-2xl bg-slate-50 px-4 py-3', className)}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><CalendarDays className="size-3.5" /> {t.monthSoFar(name)}</p>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-lg font-semibold text-slate-900">{t.monthTrips(month.trips)}</span>
        {pct != null && <span className={cn('text-sm font-semibold', pct >= 90 ? 'text-emerald-700' : pct >= 75 ? 'text-amber-700' : 'text-rose-700')}>{t.onTimePct(pct)}</span>}
        {month.delayed != null && month.delayed > 0 && (
          <span className="text-sm text-slate-600">
            {t.delayedTrips(month.delayed)}{month.top_reason ? ` · ${t.mostly(text.delayReason(month.top_reason))}` : ''}
          </span>
        )}
      </div>
    </section>
  );
}

/** Trucks arriving within the hour — what a receiving warehouse plans around. */
function ArrivingSoon({ groups, text, fleetToken }: { groups: TruckGroup[]; text: TrackingText; fleetToken: string }) {
  const { t, clock } = text;
  const list = [...groups].sort((a, b) => (a.current.eta?.seconds ?? 0) - (b.current.eta?.seconds ?? 0));
  return (
    <section className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-blue-900"><Timer className="size-4" /> {t.arrivingSoon(list.length)}</p>
      <div className="mt-2 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {list.map((g) => (
          <Link
            key={g.key}
            to={tripLink(g.current.token, fleetToken)}
            className="flex shrink-0 items-center gap-2.5 rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-blue-100 hover:ring-blue-300"
          >
            <span className="text-base font-semibold tabular-nums text-blue-700">{clock(g.current.eta!.arrival)}</span>
            <span className="min-w-0">
              <span className="block max-w-[150px] truncate text-xs font-semibold text-slate-900">{g.current.next_stop_name ?? g.current.route_label}</span>
              <span className="block text-[11px] text-slate-500" dir="ltr">{g.current.plate}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
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
                      {d.pod_url ? (
                        <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-black/5">
                          <img src={resolveFileUrl(d.pod_url)} alt="" loading="lazy" className="size-full object-cover" />
                          <span className="absolute right-0.5 bottom-0.5 flex size-4 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white">
                            <Check className="size-2.5" strokeWidth={3.5} />
                          </span>
                        </span>
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                          <Check className="size-4" strokeWidth={3} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{d.route_label ?? d.ref}</p>
                        <p className="truncate text-xs text-slate-500">
                          {[d.finished_at && t.deliveredAt(clock(d.finished_at)), d.plate, d.ref, d.pod_count ? `POD · ${t.podPhotos(d.pod_count)}` : null].filter(Boolean).join(' · ')}
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
