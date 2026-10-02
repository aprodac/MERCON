import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Marker, type MapRef } from 'react-map-gl/maplibre';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { AlertTriangle, Check, ChevronRight, Clock, Loader2, MapPinOff, RefreshCw, Search, Truck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SAUDI_CENTER, DEFAULT_SAUDI_ZOOM } from '@/utils/saudiMapConfig';
import { trackingService, type CustomerFleetTracking, type DeliveredTrip, type FleetTruck } from '@/services/trackingService';
import { filterFleet, routesOf } from './fleetFilters';
import { SheetHandle, useBottomSheet } from './bottomSheet';
import { PublicMap } from './publicMap';
import { useTrackingText, type TrackingText } from './trackingI18n';
import { AskButton, BrandMark, Centered, Chip, LangToggle, Photo, TRACK_BLUE, TruckPuck } from './trackingParts';

/**
 * The customer-wide tracking page (/c/:token): every truck of one customer
 * that is on the road or about to load, and their deliveries of the last 7
 * days — for monthly contracts, so the customer pins one link in their
 * WhatsApp group. Search by plate / trip / place, filter by route; each card
 * opens that trip's own tracking page. No login: the token is the permission.
 */
const REFRESH_MS = 60_000;

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
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [route, setRoute] = useState<string | null>(null);
  const sheet = useBottomSheet(0.42);

  // A truck tapped on the map: bring its card into view.
  useEffect(() => {
    if (selected) document.getElementById(`truck-${selected}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selected]);

  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (data) document.title = `${data.customer.name} · ${data.brand.name}`;
  }, [data]);

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

  const count = (phase: string) => data.trucks.filter((x) => x.phase === phase).length;
  const deliveredToday = data.delivered.filter((d) => d.finished_at && Date.now() - new Date(d.finished_at).getTime() < 86_400_000).length;
  const routes = routesOf(data.trucks);
  const shown = filterFleet(data.trucks, query, route);
  const shownDelivered = filterFleet(data.delivered, query, route);

  return (
    <div dir={text.rtl ? 'rtl' : 'ltr'} className="relative flex h-[100dvh] flex-col overflow-hidden bg-[#f6f4ef] text-slate-900 md:block">
      <div dir="ltr" className={cn('relative shrink-0 overflow-hidden md:absolute md:inset-0', sheet.mapBox.className)} style={sheet.mapBox.style}>
        <FleetMap data={{ ...data, trucks: shown }} selected={selected} onSelect={setSelected} text={text} />
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2 md:top-4 md:right-4 md:left-auto">
          <span className="pointer-events-auto flex h-9 items-center rounded-xl border border-black/5 bg-white/90 px-3 shadow-sm backdrop-blur md:hidden">
            <BrandMark brand={data.brand} className="block max-w-[150px] truncate whitespace-nowrap" />
          </span>
          <LangToggle text={text} />
        </div>
      </div>

      <section
        className={cn(
          'relative z-10 flex-1 overflow-y-auto bg-white px-4 pt-3 pb-6 shadow-[0_-8px_30px_rgba(0,0,0,0.10)]',
          sheet.expanded ? 'mt-0' : '-mt-5 rounded-t-3xl',
          'md:absolute md:top-4 md:bottom-4 md:mt-0 md:w-[400px] md:flex-none md:rounded-3xl md:pt-5 md:shadow-[0_8px_30px_rgba(0,0,0,0.15)]',
          text.rtl ? 'md:right-4' : 'md:left-4',
        )}
      >
        <SheetHandle handle={sheet.handle} expanded={sheet.expanded} label={sheet.expanded ? text.t.showMap : text.t.showMore} />
        <header className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <Photo url={data.customer.logo_url} name={data.customer.name} kind="logo" size={48} />
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">{text.t.liveTrucks}</p>
              <h1 className="truncate text-xl font-semibold text-slate-900">{data.customer.name}</h1>
            </div>
          </div>
          <span className="hidden shrink-0 md:block"><BrandMark brand={data.brand} className="h-6" /></span>
        </header>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip tone="blue"><Truck className="size-3.5" /> {text.t.trucksOnRoad(count('active'))}</Chip>
          {count('planned') > 0 && <Chip tone="violet">{text.t.loadingSoon(count('planned'))}</Chip>}
          {deliveredToday > 0 && <Chip tone="green"><Check className="size-3.5" strokeWidth={3} /> {text.t.deliveredToday(deliveredToday)}</Chip>}
        </div>

        <FleetFilters text={text} routes={routes} query={query} onQuery={setQuery} route={route} onRoute={setRoute} />

        {data.trucks.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{text.t.noTrucks}</p>
        ) : shown.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{text.t.noMatch}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {shown.map((x) => (
              <TruckCard key={x.token} truck={x} text={text} selected={selected === x.token} fleetToken={token} />
            ))}
          </ul>
        )}

        <DeliveredList trips={shownDelivered} total={data.delivered.length} text={text} fleetToken={token} />

        <div className="mt-4"><AskButton brand={data.brand} text={text} about={data.customer.name} /></div>

        <footer className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-400">
          <span>{text.t.updated(text.ago(new Date(dataUpdatedAt).toISOString()))}</span>
          <button type="button" onClick={() => refetch()} className="flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-slate-600 hover:bg-slate-100">
            <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} /> {text.t.refresh}
          </button>
        </footer>
        <p className="mt-2 text-center text-[11px] text-slate-400">{text.t.sharedBy(data.brand.name)}</p>
      </section>
    </div>
  );
}

/** The trip page for a truck, remembering this page for its back button. */
const tripLink = (tripToken: string, fleetToken: string) => `/t/${tripToken}?c=${encodeURIComponent(fleetToken)}`;

/** One truck. Tapping anywhere on it opens its trip page. */
function TruckCard({ truck: x, text, selected, fleetToken }: { truck: FleetTruck; text: TrackingText; selected: boolean; fleetToken: string }) {
  const { t, clock, duration } = text;
  const status = x.phase === 'done' ? <Chip tone="green"><Check className="size-3.5" strokeWidth={3} /> {t.delivered}</Chip>
    : x.phase === 'planned' ? <Chip tone="violet">{t.scheduled}</Chip>
    : x.position?.fresh && !x.position.moving ? <Chip tone="amber">{t.stopped}</Chip>
    : <Chip tone="blue">{t.onTheWay}</Chip>;

  let when: string;
  if (x.phase === 'done') when = x.finished_at ? `${t.delivered} ${clock(x.finished_at)}` : t.delivered;
  else if (x.eta) when = `${x.phase === 'planned' ? t.arrivesForLoading : t.arrivesAt} ${x.next_stop_name ?? ''} · ${clock(x.eta.arrival)}`;
  else if (x.phase === 'planned') when = x.planned_start ? `${t.startsAt} ${clock(x.planned_start)}` : t.soon;
  else if (x.eta_gap === 'stale' && x.position) when = `${t.lastSeen} ${text.ago(x.position.recorded_at)}`;
  else when = x.next_stop_name ? `${t.to} ${x.next_stop_name}` : t.onTheWay;

  return (
    <li id={`truck-${x.token}`}>
      <Link
        to={tripLink(x.token, fleetToken)}
        className={cn(
          'block rounded-2xl border p-3 transition-colors active:bg-slate-100',
          selected ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 bg-white hover:bg-slate-50',
        )}
      >
        <div className="block w-full text-start">
          <div className="flex items-start gap-3">
            <CrewPhoto truck={x} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-slate-900">{x.route_label ?? x.ref}</span>
                {status}
              </div>
              <p className="truncate text-xs text-slate-500" dir="ltr" style={{ textAlign: text.rtl ? 'right' : 'left' }}>
                {[x.plate, x.type, x.ref].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <p className="mt-1.5 truncate text-sm text-slate-700">{when}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>{t.stopsDone(x.stops_done, x.stops_total)}</span>
            {x.driver_first_name && <span>· {t.driver} {x.driver_first_name}</span>}
            {/* A quiet truck's card already says "Last seen …"; only live ones need this. */}
            {x.position?.fresh && <span>· {t.updatedAgo(text.ago(x.position.recorded_at))}</span>}
            {x.punctuality && (x.punctuality.late_min > 0
              ? <span className="inline-flex items-center gap-1 font-medium text-rose-700"><Clock className="size-3" /> {t.expectedLate(duration(x.punctuality.late_min * 60))}</span>
              : <span className="font-medium text-emerald-700">· {t.onTime}</span>)}
            {x.delay && <span className="inline-flex items-center gap-1 font-medium text-amber-700"><AlertTriangle className="size-3" /> {text.delayReason(x.delay.reason)}</span>}
          </div>
          {x.phase === 'active' && x.progress_pct != null && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${Math.max(3, x.progress_pct)}%`, backgroundColor: TRACK_BLUE }} />
            </div>
          )}
        </div>
        <span className="mt-2 flex items-center justify-end gap-0.5 text-xs font-semibold text-blue-700">
          {t.openTrip} <ChevronRight className={cn('size-3.5', text.rtl && 'rotate-180')} />
        </span>
      </Link>
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

/** Search box and route chips — shown once there's enough on the page to need them. */
function FleetFilters({ text, routes, query, onQuery, route, onRoute }: {
  text: TrackingText; routes: string[]; query: string; onQuery: (q: string) => void; route: string | null; onRoute: (r: string | null) => void;
}) {
  const chip = (active: boolean) => cn(
    'shrink-0 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap',
    active ? 'border-[#3E3C3D] bg-[#3E3C3D] text-white' : 'border-slate-200 bg-white text-slate-600',
  );
  return (
    <div className="mt-3 space-y-2">
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
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" onClick={() => onRoute(null)} className={chip(route === null)}>{text.t.allRoutes}</button>
          {routes.map((r) => (
            <button key={r} type="button" onClick={() => onRoute(route === r ? null : r)} className={chip(route === r)}>{r}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Did yesterday's truck reach?" — deliveries of the last 7 days, newest first, each opening its trip page. */
function DeliveredList({ trips, total, text, fleetToken }: { trips: DeliveredTrip[]; total: number; text: TrackingText; fleetToken: string }) {
  const { t, clock } = text;
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-slate-900">{t.deliveredRecently}</h2>
      {total === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{t.noDelivered}</p>
      ) : trips.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{t.noMatch}</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {trips.map((d) => (
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
      )}
    </section>
  );
}

function FleetMap({ data, selected, onSelect, text }: {
  data: CustomerFleetTracking; selected: string | null; onSelect: (token: string) => void; text: TrackingText;
}) {
  const mapRef = useRef<MapRef>(null);
  const placed = data.trucks.filter((x) => x.position);

  // Every placed truck, and room for the top bar, the plate label under each
  // truck and the card (beside the map on a wide screen, overlapping it on a phone).
  const frame = useCallback(() => {
    if (placed.length === 0) return null;
    const lngs = placed.map((x) => x.position!.lng);
    const lats = placed.map((x) => x.position!.lat);
    const wide = window.matchMedia('(min-width: 768px)').matches;
    const side = wide ? 460 : 60;
    return {
      bounds: [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]] as [[number, number], [number, number]],
      options: {
        padding: wide
          ? { top: 90, bottom: 60, left: text.rtl ? 80 : side, right: text.rtl ? side : 80 }
          : { top: 80, bottom: 80, left: side, right: side },
        maxZoom: 11,
      },
    };
  }, [placed, text.rtl]);

  // Framed from the data when the map is created — not on the map's load event,
  // which waits for the basemap tiles and may come late (or never) on a slow line.
  const [initialView] = useState(() => {
    const f = frame();
    return f
      ? { bounds: f.bounds, fitBoundsOptions: f.options }
      : { longitude: SAUDI_CENTER[1], latitude: SAUDI_CENTER[0], zoom: DEFAULT_SAUDI_ZOOM };
  });

  // `target`: the map from its own load event — on load the component ref isn't attached yet.
  const fit = useCallback((animate: boolean, target?: MapLibreMap) => {
    const map = target ?? mapRef.current?.getMap();
    const f = frame();
    if (!map || !f) return;
    map.fitBounds(f.bounds, { ...f.options, duration: animate ? 900 : 0 });
  }, [frame]);

  const userMoved = useRef(false);
  const onLoad = useCallback((e: { target: MapLibreMap }) => {
    const map = e.target;
    fit(false, map);
    // Once more after the page has settled — the map's box can still change size right after load.
    setTimeout(() => { if (!userMoved.current) fit(false, map); }, 400);
  }, [fit]);
  const onResize = useCallback(() => {
    if (!userMoved.current) fit(false);
  }, [fit]);

  // Selecting a card flies to that truck.
  useEffect(() => {
    const x = data.trucks.find((tr) => tr.token === selected);
    if (x?.position) {
      userMoved.current = true;
      mapRef.current?.easeTo({ center: [x.position.lng, x.position.lat], zoom: Math.max(mapRef.current.getZoom(), 8), duration: 800 });
    }
  }, [selected, data.trucks]);

  return (
    <PublicMap
      ref={mapRef}
      initialViewState={initialView}
      onLoad={onLoad}
      onResize={onResize}
      onDragStart={() => { userMoved.current = true; }}
      onZoomStart={(e) => { if (e.originalEvent) userMoved.current = true; }}
    >
      {placed.map((x) => (
        <Marker
          key={x.token}
          longitude={x.position!.lng}
          latitude={x.position!.lat}
          anchor="center"
          style={{ zIndex: selected === x.token ? 30 : 20, cursor: 'pointer' }}
          onClick={(e) => { e.originalEvent.stopPropagation(); onSelect(x.token); }}
        >
          <TruckPuck heading={x.position!.moving ? x.position!.heading_deg : null} live={x.position!.fresh && x.phase !== 'done'} label={x.plate} />
        </Marker>
      ))}
    </PublicMap>
  );
}
