import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import MapGL, { Marker, type MapRef } from 'react-map-gl/maplibre';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AlertTriangle, Check, ChevronRight, Clock, Loader2, MapPinOff, RefreshCw, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LIVE_MAP_STYLES, applyMapPalette } from '@/components/maps/live/liveMapStyle';
import { SAUDI_CENTER, DEFAULT_SAUDI_ZOOM } from '@/utils/saudiMapConfig';
import { trackingService, type CustomerFleetTracking, type FleetTruck } from '@/services/trackingService';
import { useTrackingText, type TrackingText } from './trackingI18n';
import { AskButton, BrandMark, Centered, Chip, LangToggle, TRACK_BLUE, TruckPuck } from './trackingParts';

/**
 * The customer-wide tracking page (/c/:token): every truck of one customer
 * that is on the road, about to load, or just delivered — for monthly
 * contracts, so the customer bookmarks one page. Each card opens that trip's
 * own tracking page. No login: the token is the permission.
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

  return (
    <div dir={text.rtl ? 'rtl' : 'ltr'} className="relative flex h-[100dvh] flex-col overflow-hidden bg-[#f6f4ef] text-slate-900 md:block">
      <div dir="ltr" className="relative h-[42dvh] shrink-0 md:absolute md:inset-0 md:h-auto">
        <FleetMap data={data} selected={selected} onSelect={setSelected} text={text} />
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2 md:top-4 md:right-4 md:left-auto">
          <span className="pointer-events-auto flex h-9 items-center rounded-xl border border-black/5 bg-white/90 px-3 shadow-sm backdrop-blur md:hidden">
            <BrandMark brand={data.brand} />
          </span>
          <LangToggle text={text} />
        </div>
      </div>

      <section
        className={cn(
          'relative z-10 -mt-5 flex-1 overflow-y-auto rounded-t-3xl bg-white px-4 pt-3 pb-6 shadow-[0_-8px_30px_rgba(0,0,0,0.10)]',
          'md:absolute md:top-4 md:bottom-4 md:mt-0 md:w-[400px] md:flex-none md:rounded-3xl md:pt-5 md:shadow-[0_8px_30px_rgba(0,0,0,0.15)]',
          text.rtl ? 'md:right-4' : 'md:left-4',
        )}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 md:hidden" />
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">{text.t.liveTrucks}</p>
            <h1 className="truncate text-xl font-semibold text-slate-900">{data.customer.name}</h1>
          </div>
          <span className="hidden shrink-0 md:block"><BrandMark brand={data.brand} className="h-6" /></span>
        </header>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip tone="blue"><Truck className="size-3.5" /> {text.t.trucksOnRoad(count('active'))}</Chip>
          {count('planned') > 0 && <Chip tone="violet">{text.t.loadingSoon(count('planned'))}</Chip>}
          {count('done') > 0 && <Chip tone="green"><Check className="size-3.5" strokeWidth={3} /> {text.t.deliveredToday(count('done'))}</Chip>}
        </div>

        {data.trucks.length === 0 ? (
          <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{text.t.noTrucks}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {data.trucks.map((x) => (
              <TruckCard key={x.token} truck={x} text={text} selected={selected === x.token} onSelect={() => setSelected(x.token)} />
            ))}
          </ul>
        )}

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

function TruckCard({ truck: x, text, selected, onSelect }: { truck: FleetTruck; text: TrackingText; selected: boolean; onSelect: () => void }) {
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
    <li>
      <div
        className={cn(
          'rounded-2xl border p-3 transition-colors',
          selected ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 bg-white hover:bg-slate-50',
        )}
      >
        <button type="button" onClick={onSelect} className="block w-full text-start">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-slate-900" dir="ltr">{[x.plate, x.type].filter(Boolean).join(' · ') || x.ref}</span>
            {status}
          </div>
          <p className="mt-1 truncate text-sm text-slate-700">{when}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>{t.stopsDone(x.stops_done, x.stops_total)}</span>
            {x.driver_first_name && <span>· {t.driver} {x.driver_first_name}</span>}
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
        </button>
        <a href={`/t/${x.token}`} className="mt-2 flex items-center justify-end gap-0.5 text-xs font-semibold text-blue-700">
          {t.openTrip} <ChevronRight className={cn('size-3.5', text.rtl && 'rotate-180')} />
        </a>
      </div>
    </li>
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
    applyMapPalette(map, 'light');
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
    <div className="absolute inset-0">
      <MapGL
        ref={mapRef}
        mapStyle={LIVE_MAP_STYLES.light}
        initialViewState={initialView}
        minZoom={3.5}
        maxZoom={18}
        dragRotate={false}
        pitchWithRotate={false}
        attributionControl={false}
        onLoad={onLoad}
        onResize={onResize}
        onDragStart={() => { userMoved.current = true; }}
        onZoomStart={(e) => { if (e.originalEvent) userMoved.current = true; }}
        style={{ width: '100%', height: '100%' }}
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
      </MapGL>
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="absolute right-3 bottom-8 rounded bg-white/70 px-1.5 text-[10px] text-slate-500 md:bottom-4"
      >
        © OpenStreetMap · OpenFreeMap
      </a>
    </div>
  );
}
