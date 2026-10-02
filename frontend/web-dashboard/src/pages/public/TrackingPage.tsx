import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Layer, Marker, Source, type MapRef } from 'react-map-gl/maplibre';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { AlertTriangle, BadgeCheck, Check, ChevronLeft, Clock, Clock3, Focus, Hash, Loader2, MapPinOff, Play, RefreshCw, Truck, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveFileUrl } from '@/lib/documents';
import type { StopGroup } from '@/lib/fleetLive';
import { StopPin } from '@/components/maps/live/LiveMapBits';
import { SAUDI_CENTER, DEFAULT_SAUDI_ZOOM } from '@/utils/saudiMapConfig';
import { trackingService, type PublicTracking, type PublicTrackingStop } from '@/services/trackingService';
import { useTrackingText, type TrackingText } from './trackingI18n';
import { SheetHandle, useBottomSheet } from './bottomSheet';
import { PublicMap } from './publicMap';
import { AskButton, BrandMark, Centered, Chip, LangToggle, Photo, PhotoViewer, TRACK_BLUE, TruckPuck, line, isVideoUrl } from './trackingParts';

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
  // Opened from the customer's all-trucks page: its token, for the back button.
  const [params] = useSearchParams();
  const fleetToken = backToFleetToken(params.get('c'));
  const sheet = useBottomSheet(0.46);
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
      <div dir="ltr" className={cn('relative shrink-0 overflow-hidden md:absolute md:inset-0', sheet.mapBox.className)} style={sheet.mapBox.style}>
        <TrackingMap data={data} text={text} />
        <MapTopBar data={data} text={text} fleetToken={fleetToken} />
      </div>
      <section
        className={cn(
          'relative z-10 flex-1 overflow-y-auto bg-white px-4 pt-3 pb-6 shadow-[0_-8px_30px_rgba(0,0,0,0.10)]',
          sheet.expanded ? 'mt-0' : '-mt-5 rounded-t-3xl',
          'md:absolute md:top-4 md:bottom-4 md:mt-0 md:w-[390px] md:flex-none md:rounded-3xl md:pt-5 md:shadow-[0_8px_30px_rgba(0,0,0,0.15)]',
          text.rtl ? 'md:right-4' : 'md:left-4',
        )}
      >
        <SheetHandle handle={sheet.handle} expanded={sheet.expanded} label={sheet.expanded ? text.t.showMap : text.t.showMore} />
        {fleetToken && sheet.expanded && <BackToFleet token={fleetToken} text={text} className="mb-3" />}
        <Headline data={data} text={text} />
        <Progress data={data} text={text} />
        <ProofOfDelivery data={data} text={text} onOpen={setPhoto} />
        <DelayUpdates data={data} text={text} />
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
    fit(false, map);
    // Once more after the page has settled — the map's box can still change size right after load.
    setTimeout(() => { if (!userMoved.current) fit(false, map); }, 400);
  }, [fit]);
  const onResize = useCallback(() => {
    if (!userMoved.current) fit(false);
  }, [fit]);

  const eta = data.eta;

  return (
    <PublicMap
      ref={mapRef}
      initialViewState={initialView}
      onLoad={onLoad}
      onResize={onResize}
      onDragStart={() => { userMoved.current = true; }}
      onZoomStart={(e) => { if (e.originalEvent) userMoved.current = true; }}
      controls={
        <button
          type="button"
          onClick={() => { userMoved.current = false; fit(true); }}
          aria-label={text.t.showAll}
          className="pointer-events-auto flex size-10 items-center justify-center rounded-xl border border-black/5 bg-white/90 text-slate-700 shadow-md backdrop-blur"
        >
          <Focus className="size-4" />
        </button>
      }
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
    </PublicMap>
  );
}

/** The all-trucks page token from `?c=` — only a well-formed token, so the back link can only lead to a /c/ page. */
function backToFleetToken(raw: string | null): string | null {
  return raw && /^[A-Za-z0-9_-]{16,64}$/.test(raw) ? raw : null;
}

/** "‹ All trucks" — back to the customer's page this trip was opened from. */
function BackToFleet({ token, text, className }: { token: string; text: TrackingText; className?: string }) {
  return (
    <Link
      to={`/c/${token}`}
      className={cn('pointer-events-auto inline-flex h-9 items-center gap-1 rounded-xl border border-black/5 bg-white/90 px-3 text-xs font-semibold whitespace-nowrap text-slate-800 shadow-sm backdrop-blur', className)}
    >
      <ChevronLeft className={cn('size-4', text.rtl && 'rotate-180')} /> {text.t.allTrucks}
    </Link>
  );
}

function MapTopBar({ data, text, fleetToken }: { data: PublicTracking; text: TrackingText; fleetToken: string | null }) {
  const pos = data.position;
  const live = data.trip.phase === 'active' || data.trip.phase === 'planned';
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2 md:top-4 md:right-4 md:left-auto">
      {fleetToken ? (
        <BackToFleet token={fleetToken} text={text} />
      ) : (
        <span className="pointer-events-auto flex h-9 items-center gap-2 rounded-xl border border-black/5 bg-white/90 px-3 shadow-sm backdrop-blur md:hidden">
          <BrandMark brand={data.brand} className="block max-w-[150px] truncate whitespace-nowrap" />
        </span>
      )}
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
  if (!data.trip.route_label && facts.length === 0 && !data.customer) return null;
  return (
    <div className="mt-3 flex items-center gap-3">
      {data.customer && <Photo url={data.customer.logo_url} name={data.customer.name} kind="logo" size={44} />}
      <div className="min-w-0">
        {data.trip.route_label && <p className="text-base font-semibold text-slate-900">{data.trip.route_label}</p>}
        {facts.length > 0 && <p className="text-xs text-slate-500">{facts.join(' · ')}</p>}
      </div>
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
        <WifiOff className="size-4 shrink-0" /> {t.notReportingTitle}
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
              {s.photos.some((ph) => !ph.delay) && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                  {s.photos.filter((ph) => !ph.delay).map((ph) => (
                    <button
                      key={ph.url}
                      type="button"
                      onClick={() => onPhoto(ph.url)}
                      className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-black/5"
                      aria-label={ph.kind === 'video' ? text.t.playVideo : text.t.photos}
                    >
                      <MediaThumb url={ph.url} video={ph.kind === 'video'} />
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

/** A photo, or a video's first frame with a play mark. */
function MediaThumb({ url, video }: { url: string; video: boolean }) {
  if (video || isVideoUrl(url)) {
    return (
      <>
        <video src={`${resolveFileUrl(url)}#t=0.1`} muted playsInline preload="metadata" className="size-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/20">
          <span className="flex size-7 items-center justify-center rounded-full bg-white/90 text-slate-900"><Play className="size-3.5 translate-x-px fill-current" /></span>
        </span>
      </>
    );
  }
  return <img src={resolveFileUrl(url)} alt="" loading="lazy" className="size-full object-cover" />;
}

/**
 * Proof of delivery: the photos taken at the delivery stops, large, newest
 * delivery first — what a customer forwards to their own customer.
 */
function ProofOfDelivery({ data, text, onOpen }: { data: PublicTracking; text: TrackingText; onOpen: (url: string) => void }) {
  const deliveries = data.stops
    .filter((s) => s.type === 'Dropoff' && s.state === 'done')
    .map((s) => ({ stop: s, media: s.photos.filter((p) => !p.delay).sort((a, b) => (a.kind === 'pod' ? -1 : 0) - (b.kind === 'pod' ? -1 : 0)) }))
    .filter((d) => d.media.length > 0)
    .reverse();
  if (deliveries.length === 0) return null;
  return (
    <section className="mt-5 border-t border-slate-100 pt-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900"><BadgeCheck className="size-4 text-emerald-600" /> {text.t.proofOfDelivery}</h3>
      <div className="mt-3 space-y-4">
        {deliveries.map(({ stop, media }, i) => (
          <div key={i}>
            <p className="mb-1.5 text-xs text-slate-500">
              {text.t.deliveredAtStop(stop.name, stop.actual_arrival ? text.clock(stop.actual_arrival) : text.t.delivered)}
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {media.map((m, k) => (
                <button
                  key={m.url}
                  type="button"
                  onClick={() => onOpen(m.url)}
                  className={cn('relative aspect-square overflow-hidden rounded-xl bg-slate-100 ring-1 ring-black/5', k === 0 && media.length > 2 && 'col-span-2 row-span-2')}
                  aria-label={m.kind === 'video' ? text.t.playVideo : text.t.photos}
                >
                  <MediaThumb url={m.url} video={m.kind === 'video'} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The driver's delay photos and videos, playable right here, with the stop and time. */
function DelayUpdates({ data, text }: { data: PublicTracking; text: TrackingText }) {
  const items = data.stops.flatMap((s) => s.photos.filter((p) => p.delay).map((p) => ({ stop: s.name, ...p })));
  if (items.length === 0) return null;
  return (
    <section className="mt-5 border-t border-slate-100 pt-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900"><Clock3 className="size-4 text-amber-600" /> {text.t.delayUpdates}</h3>
      {data.delay?.reason && <p className="mt-1 text-xs text-slate-500">{data.delay.reason}</p>}
      <div className="mt-3 space-y-3">
        {items.map((m) => (
          <figure key={m.url} className="overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-black/5">
            {m.kind === 'video' || isVideoUrl(m.url) ? (
              <video src={resolveFileUrl(m.url)} controls playsInline preload="metadata" className="aspect-video w-full bg-black object-contain" />
            ) : (
              <img src={resolveFileUrl(m.url)} alt="" loading="lazy" className="aspect-video w-full object-cover" />
            )}
            <figcaption className="px-3 py-2 text-xs text-slate-500">{m.stop} · {text.clock(m.captured_at)}</figcaption>
          </figure>
        ))}
      </div>
    </section>
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
      <div className="grid grid-cols-2 gap-2">
        {data.driver_first_name && (
          <Person photo={<Photo url={data.driver_photo_url} name={data.driver_first_name} />} label={t.driver} value={data.driver_first_name} />
        )}
        {data.vehicle.plate && (
          <Person
            photo={<Photo url={data.vehicle.photo_url} name={data.vehicle.plate} kind="truck" />}
            label={t.truck}
            value={data.vehicle.plate}
            sub={data.vehicle.type}
            ltr
          />
        )}
      </div>
      {data.trip.ref && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500"><Hash className="size-3.5" /> {t.trip} <span dir="ltr">{data.trip.ref}</span></p>
      )}
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

/** Driver or truck: photo, what it is, and who / which. */
function Person({ photo, label, value, sub, ltr }: { photo: React.ReactNode; label: string; value: string; sub?: string | null; ltr?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-2xl bg-slate-50 p-2.5">
      {photo}
      <div className="min-w-0">
        <p className="text-[11px] text-slate-500">{label}</p>
        <p className="truncate text-sm font-semibold text-slate-900" dir={ltr ? 'ltr' : undefined}>{value}</p>
        {sub && <p className="truncate text-[11px] text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

