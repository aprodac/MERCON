import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import MapGL, { Layer, Marker, Source, type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Check, Focus, Loader2, MapPinOff, RefreshCw, Truck, UserRound, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatInDeploymentTz } from '@/lib/datetime';
import { resolveFileUrl } from '@/lib/documents';
import { formatDuration, formatKm, timeAgo, type StopGroup } from '@/lib/fleetLive';
import { StopPin } from '@/components/maps/live/LiveMapBits';
import { LIVE_MAP_STYLES, ROUTE_COLOR, applyMapPalette } from '@/components/maps/live/liveMapStyle';
import { SAUDI_CENTER, DEFAULT_SAUDI_ZOOM } from '@/utils/saudiMapConfig';
import { trackingService, type PublicTracking, type PublicTrackingStop } from '@/services/trackingService';

/**
 * The customer tracking page (/t/:token) — what a customer opens from the
 * WhatsApp status update. No login: the unguessable token is the permission.
 *
 * Answers, in this order: where is my truck (map), when does it arrive (big
 * ETA), what's done (stop timeline). Built for a phone first; on a wide screen
 * the card floats over a full-screen map. A truck that stopped reporting is
 * shown as "last seen", never as if it were live.
 */
const LIVE_REFRESH_MS = 30_000;
const IDLE_REFRESH_MS = 120_000;
const BLUE = ROUTE_COLOR.light.line;

export default function TrackingPage() {
  const { token = '' } = useParams();
  const { data, error, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ['public-tracking', token],
    queryFn: () => trackingService.getPublic(token),
    retry: (n, err: any) => n < 2 && !err?.response?.status,
    refetchInterval: (q) => {
      const phase = q.state.data?.trip.phase;
      return phase === 'active' ? LIVE_REFRESH_MS : phase === 'planned' ? IDLE_REFRESH_MS : false;
    },
  });

  // Re-render every 15 s so "updated 40s ago" stays honest between fetches.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    document.title = data?.vehicle.plate ? `Track ${data.vehicle.plate} · ${data.brand.name}` : 'Track your shipment';
  }, [data?.vehicle.plate, data?.brand.name]);

  if (isLoading) {
    return (
      <Centered>
        <Loader2 className="size-5 animate-spin text-slate-400" />
        <p className="text-sm text-slate-500">Finding your truck…</p>
      </Centered>
    );
  }
  if (error || !data) {
    const msg = (error as any)?.response?.data?.error?.message || "We couldn't load this tracking link. Check your connection and try again.";
    return (
      <Centered>
        <MapPinOff className="size-6 text-slate-400" />
        <p className="max-w-xs text-center text-sm text-slate-600">{msg}</p>
      </Centered>
    );
  }

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-[#f6f4ef] text-slate-900 md:block">
      <div className="relative h-[46dvh] shrink-0 md:absolute md:inset-0 md:h-auto">
        <TrackingMap data={data} />
        <MapTopBar data={data} />
      </div>
      <section
        className={cn(
          'relative z-10 -mt-5 flex-1 overflow-y-auto rounded-t-3xl bg-white px-4 pt-3 pb-6 shadow-[0_-8px_30px_rgba(0,0,0,0.10)]',
          'md:absolute md:top-4 md:bottom-4 md:left-4 md:mt-0 md:w-[390px] md:flex-none md:rounded-3xl md:pt-5 md:shadow-[0_8px_30px_rgba(0,0,0,0.15)]',
        )}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 md:hidden" />
        <Headline data={data} />
        <Progress data={data} />
        <Timeline data={data} />
        <Footer data={data} updatedAt={dataUpdatedAt} refreshing={isFetching} onRefresh={() => refetch()} />
      </section>
    </div>
  );
}

// ── Time helpers ────────────────────────────────────────────────────────────

function useClock(tz: string) {
  return useCallback((iso: string) => {
    const sameDay = formatInDeploymentTz(iso, tz, 'yyyy-MM-dd') === formatInDeploymentTz(new Date(), tz, 'yyyy-MM-dd');
    return formatInDeploymentTz(iso, tz, sameDay ? 'HH:mm' : 'EEE d MMM, HH:mm');
  }, [tz]);
}

// ── Map ─────────────────────────────────────────────────────────────────────

type Pt = { lat: number; lng: number };
const line = (coords: [number, number][]) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } });

function TrackingMap({ data }: { data: PublicTracking }) {
  const mapRef = useRef<MapRef>(null);
  const phase = data.trip.phase;
  const pos = data.position;

  const groups = useMemo<StopGroup[]>(() => {
    const out = new Map<string, StopGroup>();
    data.stops.forEach((s, i) => {
      if (s.lat == null || s.lng == null) return;
      const k = `${s.lat.toFixed(3)},${s.lng.toFixed(3)}`;
      const g = out.get(k);
      if (g) {
        g.numbers.push(i + 1);
        g.done = g.done && s.state === 'done';
        g.isNext = g.isNext || s.state === 'next';
      } else {
        out.set(k, { lat: s.lat, lng: s.lng, numbers: [i + 1], name: s.name, done: s.state === 'done', isNext: s.state === 'next' });
      }
    });
    return [...out.values()];
  }, [data.stops]);

  const fit = useCallback((animate: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    const pts: Pt[] = [...groups, ...(pos ? [pos] : [])];
    if (pts.length === 0) return;
    const lngs = pts.map((p) => p.lng);
    const lats = pts.map((p) => p.lat);
    const wide = window.matchMedia('(min-width: 768px)').matches;
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], {
      // Room for the pin labels (drawn above each pin), the top bar and, on a phone, the card's rounded overlap.
      padding: wide ? { top: 110, bottom: 60, left: 450, right: 80 } : { top: 110, bottom: 50, left: 50, right: 50 },
      maxZoom: 13,
      duration: animate ? 1000 : 0,
    });
  }, [groups, pos]);

  // Frame the trip on load, and again whenever the map's box settles to a new
  // size (phone toolbars, the card's height) — until the person moves the map.
  const userMoved = useRef(false);
  const onLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) applyMapPalette(map, 'light');
    fit(false);
  }, [fit]);
  const onResize = useCallback(() => {
    if (!userMoved.current) fit(false);
  }, [fit]);

  const eta = data.eta;
  const nextEtaLabel = useClock(data.timezone);

  return (
    <div className="absolute inset-0">
      <MapGL
        ref={mapRef}
        mapStyle={LIVE_MAP_STYLES.light}
        initialViewState={{ longitude: SAUDI_CENTER[1], latitude: SAUDI_CENTER[0], zoom: DEFAULT_SAUDI_ZOOM }}
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
        {data.route && (
          <Source id="trk-route" type="geojson" data={line(data.route)}>
            <Layer id="trk-route-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': phase === 'done' ? '#16a34a' : phase === 'cancelled' ? '#a8a29e' : '#7c3aed',
                'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3, 13, 6],
                ...(phase === 'done' ? {} : { 'line-dasharray': [2, 1.6] }),
              }} />
          </Source>
        )}
        {data.path.length >= 2 && (
          <Source id="trk-path" type="geojson" data={line(data.path)}>
            <Layer id="trk-path-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': phase === 'done' ? '#16a34a' : '#94a3b8', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3, 13, 6] }} />
          </Source>
        )}
        {data.ahead && (
          <Source id="trk-ahead" type="geojson" data={line(data.ahead)}>
            <Layer id="trk-ahead-casing" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': BLUE, 'line-width': 12, 'line-opacity': 0.18, 'line-blur': 2 }} />
            <Layer id="trk-ahead-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': BLUE, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3, 13, 7], ...(pos?.fresh ? {} : { 'line-opacity': 0.5 }) }} />
          </Source>
        )}

        {groups.map((g) => (
          <StopPin
            key={g.numbers.join('-')}
            group={g}
            tone={phase === 'done' ? 'done' : phase === 'planned' ? 'planned' : phase === 'cancelled' ? 'cancelled' : 'live'}
            eta={g.isNext && eta ? nextEtaLabel(eta.arrival) : null}
          />
        ))}

        {pos && (
          <Marker longitude={pos.lng} latitude={pos.lat} anchor="center" style={{ zIndex: 20 }}>
            <TruckPuck heading={pos.moving ? pos.heading_deg : null} live={pos.fresh} />
          </Marker>
        )}
      </MapGL>

      <div className="pointer-events-none absolute right-3 bottom-8 flex flex-col items-end gap-2 md:bottom-4">
        <button
          type="button"
          onClick={() => { userMoved.current = false; fit(true); }}
          aria-label="Show the whole trip"
          className="pointer-events-auto flex size-10 items-center justify-center rounded-xl border border-black/5 bg-white/90 text-slate-700 shadow-md backdrop-blur"
        >
          <Focus className="size-4" />
        </button>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto rounded bg-white/70 px-1.5 text-[10px] text-slate-500"
        >
          © OpenStreetMap · OpenFreeMap
        </a>
      </div>
    </div>
  );
}

/** Blue arrow while live (pointing where the truck is heading), grey when the truck has stopped reporting. */
function TruckPuck({ heading, live }: { heading: number | null; live: boolean }) {
  const color = live ? BLUE : '#94a3b8';
  return (
    <div className="relative flex size-11 items-center justify-center">
      {live && <span className="absolute inset-0 animate-ping rounded-full opacity-25" style={{ backgroundColor: color }} />}
      <span className="absolute inset-1 rounded-full opacity-20" style={{ backgroundColor: color }} />
      <span className="relative flex size-7 items-center justify-center rounded-full border-[3px] border-white shadow-lg" style={{ backgroundColor: color }}>
        {heading != null ? (
          <svg viewBox="0 0 24 24" className="size-4" style={{ transform: `rotate(${heading}deg)` }} aria-hidden>
            <path d="M12 3 L19 20 L12 16 L5 20 Z" fill="white" />
          </svg>
        ) : (
          <Truck className="size-3.5 text-white" strokeWidth={2.5} />
        )}
      </span>
    </div>
  );
}

function MapTopBar({ data }: { data: PublicTracking }) {
  const pos = data.position;
  const live = data.trip.phase === 'active' || data.trip.phase === 'planned';
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2 md:left-auto md:right-4 md:top-4">
      <span className="pointer-events-auto flex h-9 items-center gap-2 rounded-xl border border-black/5 bg-white/90 px-3 shadow-sm backdrop-blur md:hidden">
        {data.brand.logo_url
          ? <img src={resolveFileUrl(data.brand.logo_url)} alt={data.brand.name} className="h-5 w-auto max-w-[110px] object-contain" />
          : <span className="text-sm font-bold tracking-wide text-[#3E3C3D]">{data.brand.name}</span>}
      </span>
      {live && (
        <span className="pointer-events-auto flex h-9 items-center gap-2 rounded-xl border border-black/5 bg-white/90 px-3 text-xs font-medium text-slate-700 shadow-sm backdrop-blur">
          {pos ? (
            <>
              <span className={cn('size-2 rounded-full', pos.fresh ? 'bg-emerald-500' : 'bg-slate-400')} />
              {pos.fresh ? `Live · ${timeAgo(pos.recorded_at)}` : `Last seen ${timeAgo(pos.recorded_at)}`}
            </>
          ) : (
            <><span className="size-2 rounded-full bg-slate-300" /> No live location yet</>
          )}
        </span>
      )}
    </div>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────

function Chip({ tone, children }: { tone: 'blue' | 'violet' | 'green' | 'slate' | 'amber'; children: React.ReactNode }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700',
    violet: 'bg-violet-50 text-violet-700',
    green: 'bg-emerald-50 text-emerald-700',
    slate: 'bg-slate-100 text-slate-600',
    amber: 'bg-amber-50 text-amber-800',
  } as const;
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', tones[tone])}>{children}</span>;
}

function statusChip(data: PublicTracking) {
  const { phase } = data.trip;
  if (phase === 'done') return <Chip tone="green"><Check className="size-3.5" strokeWidth={3} /> Delivered</Chip>;
  if (phase === 'planned') return <Chip tone="violet">Scheduled</Chip>;
  if (phase === 'cancelled') return <Chip tone="slate">Cancelled</Chip>;
  const pos = data.position;
  if (pos?.fresh && !pos.moving) return <Chip tone="amber"><span className="size-1.5 rounded-full bg-amber-500" /> Stopped</Chip>;
  return <Chip tone="blue"><Truck className="size-3.5" /> On the way</Chip>;
}

function Headline({ data }: { data: PublicTracking }) {
  const clock = useClock(data.timezone);
  const { phase } = data.trip;
  const eta = data.eta;
  const target = eta ? data.stops[eta.stop_index] : null;
  const after = eta ? data.stops.length - 1 - eta.stop_index : 0;

  let big: string;
  let sub: React.ReactNode;
  if (phase === 'done') {
    big = data.trip.finished_at ? clock(data.trip.finished_at) : 'Delivered';
    sub = 'Delivered — all stops completed';
  } else if (eta && target) {
    big = clock(eta.arrival);
    sub = (
      <>
        {phase === 'planned' ? 'Truck arrives for loading at ' : 'Arrives at '}
        <span className="font-semibold text-slate-800">{target.name}</span>
        {' · in '}{formatDuration(eta.seconds)}
        {phase === 'active' && after > 0 && <span className="block text-slate-500">then {after} more {after === 1 ? 'stop' : 'stops'}</span>}
      </>
    );
  } else if (phase === 'planned') {
    big = 'Scheduled';
    sub = data.trip.planned_start ? `Starts ${clock(data.trip.planned_start)}` : 'The truck will be on its way soon.';
  } else {
    big = 'On the way';
    sub = data.eta_gap === 'stale' && data.position
      ? `Last location ${timeAgo(data.position.recorded_at)}. The arrival time comes back when the truck reports again.`
      : data.eta_gap === 'no_position'
        ? "This truck's live location isn't available right now."
        : "We couldn't work out the arrival time just now. It'll update shortly.";
  }

  return (
    <header>
      <div className="flex items-center justify-between gap-2">
        {statusChip(data)}
        <span className="hidden text-sm font-bold tracking-wide text-[#3E3C3D] md:block">
          {data.brand.logo_url
            ? <img src={resolveFileUrl(data.brand.logo_url)} alt={data.brand.name} className="h-6 w-auto max-w-[120px] object-contain" />
            : data.brand.name}
        </span>
      </div>
      <p className="mt-3 text-[34px] leading-none font-semibold tracking-tight text-slate-900">{big}</p>
      <p className="mt-2 text-sm leading-snug text-slate-600">{sub}</p>
    </header>
  );
}

function Progress({ data }: { data: PublicTracking }) {
  const p = data.progress;
  if (!p || data.trip.phase !== 'active') return null;
  return (
    <div className="mt-4">
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(3, p.pct)}%`, backgroundColor: BLUE }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-slate-500">
        <span>{formatKm(p.done_m / 1000)} done</span>
        <span>{formatKm((p.total_m - p.done_m) / 1000)} to go</span>
      </div>
    </div>
  );
}

const STOP_KIND: Record<string, string> = { Pickup: 'Loading', Dropoff: 'Delivery' };

function Timeline({ data }: { data: PublicTracking }) {
  const clock = useClock(data.timezone);
  if (data.stops.length === 0) return null;
  return (
    <ol className="mt-5 border-t border-slate-100 pt-4">
      {data.stops.map((s, i) => {
        const last = i === data.stops.length - 1;
        return (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <StopDot stop={s} />
              {!last && <span className={cn('my-1 w-0.5 flex-1 rounded-full', s.state === 'done' ? 'bg-emerald-500' : 'bg-slate-200')} />}
            </div>
            <div className={cn('min-w-0 flex-1', !last && 'pb-4')}>
              <p className={cn('truncate text-sm font-semibold', s.state === 'upcoming' ? 'text-slate-500' : 'text-slate-900')}>{s.name}</p>
              <p className="text-xs text-slate-500">{stopLine(s, i, data, clock)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StopDot({ stop }: { stop: PublicTrackingStop }) {
  if (stop.state === 'done') {
    return <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="size-3" strokeWidth={3.5} /></span>;
  }
  if (stop.state === 'next') {
    return <span className="flex size-5 items-center justify-center rounded-full border-[3px] border-blue-100" style={{ backgroundColor: BLUE }} />;
  }
  return <span className="size-5 rounded-full border-2 border-slate-300 bg-white" />;
}

function stopLine(s: PublicTrackingStop, i: number, data: PublicTracking, clock: (iso: string) => string): string {
  const kind = STOP_KIND[s.type] ?? 'Stop';
  if (s.state === 'done') {
    const parts = [s.actual_arrival ? `Arrived ${clock(s.actual_arrival)}` : `${kind} done`];
    if (s.actual_departure) parts.push(`left ${clock(s.actual_departure)}`);
    return parts.join(' · ');
  }
  if (s.state === 'next') {
    if (data.eta?.stop_index === i) return `${kind} · ETA ${clock(data.eta.arrival)}`;
    return `${kind} · next stop`;
  }
  return kind;
}

function Footer({ data, updatedAt, refreshing, onRefresh }: { data: PublicTracking; updatedAt: number; refreshing: boolean; onRefresh: () => void }) {
  const live = data.trip.phase === 'active' || data.trip.phase === 'planned';
  return (
    <footer className="mt-5 space-y-3 border-t border-slate-100 pt-4">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
        {data.vehicle.plate && <Fact icon={Truck} label="Truck" value={[data.vehicle.plate, data.vehicle.type].filter(Boolean).join(' · ')} />}
        {data.driver_first_name && <Fact icon={UserRound} label="Driver" value={data.driver_first_name} />}
        {data.trip.ref && <Fact icon={Hash} label="Trip" value={data.trip.ref} />}
      </dl>
      {live && (
        <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
          <span>Updated {timeAgo(new Date(updatedAt).toISOString())} · refreshes on its own</span>
          <button type="button" onClick={onRefresh} className="flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-slate-600 hover:bg-slate-100">
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} /> Refresh
          </button>
        </div>
      )}
      <p className="text-center text-[11px] text-slate-400">Shared by {data.brand.name}</p>
    </footer>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Truck; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <dt className="text-[11px] text-slate-500">{label}</dt>
        <dd className="truncate font-medium text-slate-900">{value}</dd>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-slate-50 px-6">{children}</div>;
}
