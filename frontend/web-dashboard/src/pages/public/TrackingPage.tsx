import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import MapGL, { Layer, Marker, Source, type MapRef } from 'react-map-gl/maplibre';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AlertTriangle, Check, Clock, Focus, Hash, Loader2, MapPinOff, RefreshCw, SignalLow, Truck, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveFileUrl } from '@/lib/documents';
import type { StopGroup } from '@/lib/fleetLive';
import { StopPin } from '@/components/maps/live/LiveMapBits';
import { LIVE_MAP_STYLES, applyMapPalette } from '@/components/maps/live/liveMapStyle';
import { SAUDI_CENTER, DEFAULT_SAUDI_ZOOM } from '@/utils/saudiMapConfig';
import { trackingService, type PublicTracking, type PublicTrackingStop } from '@/services/trackingService';
import { useTrackingText, type TrackingText } from './trackingI18n';
import { AskButton, BrandMark, Centered, Chip, LangToggle, PhotoViewer, TRACK_BLUE, TruckPuck, line } from './trackingParts';

/**
 * The customer tracking page (/t/:token) — what a customer opens from the
 * WhatsApp status update. No login: the unguessable token is the permission.
 *
 * Answers, in this order: where is my truck (map), when does it arrive (big
 * ETA), what's done (stop timeline, with photos when the customer's settings
 * allow). Built for a phone first; on a wide screen the card floats over a
 * full-screen map. English / Arabic. A truck that stopped reporting is shown as
 * "last seen", never as if it were live.
 */
const LIVE_REFRESH_MS = 30_000;
const IDLE_REFRESH_MS = 120_000;

export default function TrackingPage() {
  const { token = '' } = useParams();
  // The first load counts as an open for ops ("customer opened 3 times"); refreshes don't.
  const counted = useRef(false);
  const { data, error, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ['public-tracking', token],
    queryFn: () => {
      const view = !counted.current;
      counted.current = true;
      return trackingService.getPublic(token, view);
    },
    retry: (n, err: any) => n < 2 && !err?.response?.status,
    refetchInterval: (q) => {
      const phase = q.state.data?.trip.phase;
      return phase === 'active' ? LIVE_REFRESH_MS : phase === 'planned' ? IDLE_REFRESH_MS : false;
    },
  });
  const text = useTrackingText(data?.timezone ?? 'Asia/Riyadh');
  const [photo, setPhoto] = useState<string | null>(null);

  // Re-render every 15 s so "updated 40s ago" stays honest between fetches.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    document.title = data?.vehicle.plate ? `${data.vehicle.plate} · ${data.brand.name}` : data?.brand.name ?? 'Tracking';
  }, [data?.vehicle.plate, data?.brand.name]);

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

  const about = [data.trip.ref, data.vehicle.plate].filter(Boolean).join(' · ');

  return (
    <div dir={text.rtl ? 'rtl' : 'ltr'} className="relative flex h-[100dvh] flex-col overflow-hidden bg-[#f6f4ef] text-slate-900 md:block">
      <div dir="ltr" className="relative h-[46dvh] shrink-0 md:absolute md:inset-0 md:h-auto">
        <TrackingMap data={data} text={text} />
        <MapTopBar data={data} text={text} />
      </div>
      <section
        className={cn(
          'relative z-10 -mt-5 flex-1 overflow-y-auto rounded-t-3xl bg-white px-4 pt-3 pb-6 shadow-[0_-8px_30px_rgba(0,0,0,0.10)]',
          'md:absolute md:top-4 md:bottom-4 md:mt-0 md:w-[390px] md:flex-none md:rounded-3xl md:pt-5 md:shadow-[0_8px_30px_rgba(0,0,0,0.15)]',
          text.rtl ? 'md:right-4' : 'md:left-4',
        )}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 md:hidden" />
        <Headline data={data} text={text} />
        <Progress data={data} text={text} />
        <Timeline data={data} text={text} onPhoto={setPhoto} />
        {(data.trip.phase === 'active' || data.trip.phase === 'planned') && !notReporting(data) && (
          <div className="mt-4"><AskButton brand={data.brand} text={text} about={about || text.t.trip} /></div>
        )}
        <Footer data={data} text={text} updatedAt={dataUpdatedAt} refreshing={isFetching} onRefresh={() => refetch()} />
      </section>
      <PhotoViewer url={photo} onClose={() => setPhoto(null)} closeLabel={text.t.close} />
    </div>
  );
}

// ── Map ─────────────────────────────────────────────────────────────────────

type Pt = { lat: number; lng: number };

function TrackingMap({ data, text }: { data: PublicTracking; text: TrackingText }) {
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

  // The trip's box, and room for the pin labels (drawn above each pin), the top
  // bar and the card (beside the map on a wide screen, overlapping it on a phone).
  const frame = useCallback(() => {
    const pts: Pt[] = [...groups, ...(pos ? [pos] : [])];
    if (pts.length === 0) return null;
    const lngs = pts.map((p) => p.lng);
    const lats = pts.map((p) => p.lat);
    const wide = window.matchMedia('(min-width: 768px)').matches;
    const side = wide ? 450 : 50;
    return {
      bounds: [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]] as [[number, number], [number, number]],
      options: {
        padding: wide
          ? { top: 110, bottom: 60, left: text.rtl ? 80 : side, right: text.rtl ? side : 80 }
          : { top: 110, bottom: 50, left: 50, right: 50 },
        maxZoom: 13,
      },
    };
  }, [groups, pos, text.rtl]);

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
    map.fitBounds(f.bounds, { ...f.options, duration: animate ? 1000 : 0 });
  }, [frame]);

  // Re-frame when the map's box settles to a new size (phone toolbars, the
  // card's height) — until the person moves the map.
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

  const eta = data.eta;

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
              paint={{ 'line-color': TRACK_BLUE, 'line-width': 12, 'line-opacity': 0.18, 'line-blur': 2 }} />
            <Layer id="trk-ahead-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': TRACK_BLUE, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3, 13, 7], ...(pos?.fresh ? {} : { 'line-opacity': 0.5 }) }} />
          </Source>
        )}

        {groups.map((g) => (
          <StopPin
            key={g.numbers.join('-')}
            group={g}
            tone={phase === 'done' ? 'done' : phase === 'planned' ? 'planned' : phase === 'cancelled' ? 'cancelled' : 'live'}
            eta={g.isNext && eta ? text.clock(eta.arrival) : null}
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
          aria-label={text.t.showAll}
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

function MapTopBar({ data, text }: { data: PublicTracking; text: TrackingText }) {
  const pos = data.position;
  const live = data.trip.phase === 'active' || data.trip.phase === 'planned';
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2 md:top-4 md:right-4 md:left-auto">
      <span className="pointer-events-auto flex h-9 items-center gap-2 rounded-xl border border-black/5 bg-white/90 px-3 shadow-sm backdrop-blur md:hidden">
        <BrandMark brand={data.brand} className="block max-w-[150px] truncate whitespace-nowrap" />
      </span>
      <div className="flex items-center gap-2">
        {live && (
          <span className="pointer-events-auto flex h-9 items-center gap-2 rounded-xl border border-black/5 bg-white/90 px-3 text-xs font-medium whitespace-nowrap text-slate-700 shadow-sm backdrop-blur">
            {pos ? (
              <>
                <span className={cn('size-2 rounded-full', pos.fresh ? 'bg-emerald-500' : 'bg-slate-400')} />
                {pos.fresh ? `${text.t.live} · ${text.ago(pos.recorded_at)}` : `${text.t.lastSeen} ${text.ago(pos.recorded_at)}`}
              </>
            ) : (
              <><span className="size-2 rounded-full bg-slate-300" /> {text.t.noLiveYet}</>
            )}
          </span>
        )}
        <LangToggle text={text} />
      </div>
    </div>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────

function StatusChips({ data, text }: { data: PublicTracking; text: TrackingText }) {
  const { phase } = data.trip;
  const pos = data.position;
  const main = phase === 'done' ? <Chip tone="green"><Check className="size-3.5" strokeWidth={3} /> {text.t.delivered}</Chip>
    : phase === 'planned' ? <Chip tone="violet">{text.t.scheduled}</Chip>
    : phase === 'cancelled' ? <Chip tone="slate">{text.t.cancelled}</Chip>
    : pos?.fresh && !pos.moving ? <Chip tone="amber"><span className="size-1.5 rounded-full bg-amber-500" /> {text.t.stopped}</Chip>
    : <Chip tone="blue"><Truck className="size-3.5" /> {text.t.onTheWay}</Chip>;
  const p = data.punctuality;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {main}
      {p && (p.late_min > 0
        ? <Chip tone="red"><Clock className="size-3.5" /> {text.t.expectedLate(text.duration(p.late_min * 60))}</Chip>
        : <Chip tone="green"><Check className="size-3.5" strokeWidth={3} /> {text.t.onTime}</Chip>)}
      {data.delay && <Chip tone="amber"><AlertTriangle className="size-3.5" /> {text.t.delayed} · {text.delayReason(data.delay.reason)}</Chip>}
    </div>
  );
}

function Headline({ data, text }: { data: PublicTracking; text: TrackingText }) {
  const { t, clock, duration, ago } = text;
  const { phase } = data.trip;
  const eta = data.eta;
  const target = eta ? data.stops[eta.stop_index] : null;
  const after = eta ? data.stops.length - 1 - eta.stop_index : 0;

  let big: string;
  let bigIsTime = true;
  let sub: React.ReactNode;
  const next = data.next_stop_index != null ? data.stops[data.next_stop_index] : null;
  if (phase === 'done') {
    big = data.trip.finished_at ? clock(data.trip.finished_at) : t.delivered;
    sub = t.deliveredAll;
  } else if (notReporting(data)) {
    // No arrival time to show: say where it's going; the card below explains why.
    big = next ? t.toPlace(next.name) : t.onTheWay;
    bigIsTime = false;
    sub = null;
  } else if (eta && target) {
    big = clock(eta.arrival);
    sub = (
      <>
        {phase === 'planned' ? t.arrivesForLoading : t.arrivesAt}{' '}
        <span className="font-semibold text-slate-800">{target.name}</span>
        {` · ${t.in} ${duration(eta.seconds)}`}
        {target.due_at && <span className="block text-slate-500">{t.due} {clock(target.due_at)}</span>}
        {phase === 'active' && after > 0 && <span className="block text-slate-500">{t.thenMore(after)}</span>}
      </>
    );
  } else if (phase === 'planned') {
    big = t.scheduled;
    bigIsTime = false;
    sub = data.trip.planned_start ? `${t.startsAt} ${clock(data.trip.planned_start)}` : t.soon;
  } else {
    big = next ? t.toPlace(next.name) : t.onTheWay;
    bigIsTime = false;
    sub = t.noRouteSub;
  }

  return (
    <header>
      <div className="flex items-start justify-between gap-2">
        <StatusChips data={data} text={text} />
        <span className="hidden shrink-0 md:block"><BrandMark brand={data.brand} className="h-6" /></span>
      </div>
      <TripSummary data={data} text={text} />
      <p
        className={cn('mt-3 leading-none font-semibold tracking-tight text-slate-900', bigIsTime ? 'text-[34px]' : 'text-[26px] leading-tight')}
        dir={bigIsTime ? 'ltr' : undefined}
        style={bigIsTime ? { textAlign: text.rtl ? 'right' : 'left' } : undefined}
      >
        {big}
      </p>
      {sub && <p className="mt-2 text-sm leading-snug text-slate-600">{sub}</p>}
      {notReporting(data) && <NotReportingCard data={data} text={text} ago={ago} clock={clock} />}
    </header>
  );
}

/** Running or about to run, but no usable truck position — so no arrival time. */
function notReporting(data: PublicTracking): boolean {
  return (data.trip.phase === 'active' || data.trip.phase === 'planned') && (data.eta_gap === 'stale' || data.eta_gap === 'no_position');
}

/** Route, truck and dates in one line — "Khamis Mushayt ⇄ Muhayil · 10 TON · Scheduled Thu 2 Oct, 23:40". */
function TripSummary({ data, text }: { data: PublicTracking; text: TrackingText }) {
  const { t, clock } = text;
  const facts = [
    data.vehicle.type,
    data.trip.planned_start && `${t.scheduledFor} ${clock(data.trip.planned_start)}`,
    data.trip.started_at && `${t.startedAt} ${clock(data.trip.started_at)}`,
  ].filter(Boolean);
  if (!data.trip.route_label && facts.length === 0) return null;
  return (
    <div className="mt-3">
      {data.trip.route_label && <p className="text-base font-semibold text-slate-900">{data.trip.route_label}</p>}
      {facts.length > 0 && <p className="text-xs text-slate-500">{facts.join(' · ')}</p>}
    </div>
  );
}

/** Says plainly that the truck has gone quiet, and what the customer can do about it. */
function NotReportingCard({ data, text, ago, clock }: {
  data: PublicTracking; text: TrackingText; ago: TrackingText['ago']; clock: TrackingText['clock'];
}) {
  const { t } = text;
  const pos = data.position;
  const about = [data.trip.ref, data.vehicle.plate].filter(Boolean).join(' · ') || t.trip;
  return (
    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <SignalLow className="size-4 shrink-0" /> {t.notReportingTitle}
      </p>
      <p className="mt-1 text-sm leading-snug text-amber-900/80">
        {pos ? t.notReportingStale(ago(pos.recorded_at), clock(pos.recorded_at)) : t.notReportingNone}
      </p>
      {data.brand.support_whatsapp && (
        <>
          <p className="mt-2 text-xs text-amber-900/70">{t.needUpdate}</p>
          <div className="mt-2"><AskButton brand={data.brand} text={text} about={about} /></div>
        </>
      )}
    </div>
  );
}

function Progress({ data, text }: { data: PublicTracking; text: TrackingText }) {
  const p = data.progress;
  if (!p || data.trip.phase !== 'active') return null;
  return (
    <div className="mt-4">
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(3, p.pct)}%`, backgroundColor: TRACK_BLUE }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-slate-500">
        <span>{text.km(p.done_m)} {text.t.done}</span>
        <span>{text.km(p.total_m - p.done_m)} {text.t.toGo}</span>
      </div>
    </div>
  );
}

function Timeline({ data, text, onPhoto }: { data: PublicTracking; text: TrackingText; onPhoto: (url: string) => void }) {
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
              <p className="text-xs text-slate-500">{stopLine(s, i, data, text)}</p>
              {s.photos.length > 0 && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                  {s.photos.map((ph) => (
                    <button
                      key={ph.url}
                      type="button"
                      onClick={() => onPhoto(ph.url)}
                      className="size-14 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-black/5"
                      aria-label={text.t.photos}
                    >
                      <img src={resolveFileUrl(ph.url)} alt="" loading="lazy" className="size-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
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
    return <span className="flex size-5 items-center justify-center rounded-full border-[3px] border-blue-100" style={{ backgroundColor: TRACK_BLUE }} />;
  }
  return <span className="size-5 rounded-full border-2 border-slate-300 bg-white" />;
}

function stopLine(s: PublicTrackingStop, i: number, data: PublicTracking, text: TrackingText): string {
  const { t, clock, duration } = text;
  const kind = s.type === 'Pickup' ? t.loading : s.type === 'Dropoff' ? t.delivery : t.stop;
  const due = s.due_at ? `${t.due} ${clock(s.due_at)}` : null;
  if (s.state === 'done') {
    const parts = [s.actual_arrival ? `${t.arrived} ${clock(s.actual_arrival)}` : kind];
    if (s.actual_departure) parts.push(`${t.left} ${clock(s.actual_departure)}`);
    if (s.late_min != null) parts.push(s.late_min > 0 ? t.arrivedLate(duration(s.late_min * 60)) : t.onTime);
    return parts.join(' · ');
  }
  if (s.state === 'next') {
    const parts = [kind, data.eta?.stop_index === i ? `${t.eta} ${clock(data.eta.arrival)}` : t.nextStop];
    if (due) parts.push(due);
    return parts.join(' · ');
  }
  return [kind, due].filter(Boolean).join(' · ');
}

function Footer({ data, text, updatedAt, refreshing, onRefresh }: {
  data: PublicTracking; text: TrackingText; updatedAt: number; refreshing: boolean; onRefresh: () => void;
}) {
  const { t } = text;
  const live = data.trip.phase === 'active' || data.trip.phase === 'planned';
  return (
    <footer className="mt-5 space-y-3 border-t border-slate-100 pt-4">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
        {data.vehicle.plate && <Fact icon={Truck} label={t.truck} value={[data.vehicle.plate, data.vehicle.type].filter(Boolean).join(' · ')} />}
        {data.driver_first_name && <Fact icon={UserRound} label={t.driver} value={data.driver_first_name} />}
        {data.trip.ref && <Fact icon={Hash} label={t.trip} value={data.trip.ref} />}
      </dl>
      {live && (
        <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
          <span>{t.updated(text.ago(new Date(updatedAt).toISOString()))}</span>
          <button type="button" onClick={onRefresh} className="flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-slate-600 hover:bg-slate-100">
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} /> {t.refresh}
          </button>
        </div>
      )}
      <p className="text-center text-[11px] text-slate-400">{t.sharedBy(data.brand.name)}</p>
    </footer>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Truck; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <dt className="text-[11px] text-slate-500">{label}</dt>
        <dd className="truncate font-medium text-slate-900" dir="ltr">{value}</dd>
      </div>
    </div>
  );
}
