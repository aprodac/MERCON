import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import MapGL, { Layer, Marker, Source, type MapRef } from 'react-map-gl/maplibre';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Box, Compass, Info, Focus, Maximize2, Minimize2, Minus, Moon, Plus, Search, SignalLow, Sun, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatInDeploymentTz, useDeploymentTimezone } from '@/lib/datetime';
import { whatsAppLink } from '@/lib/share';
import {
  LIVE_FILTERS, buildEtaShareText, computeEta, isOffline, matchesFilter, matchesQuery, nextStop, timeAgo, unitTitle,
  type LiveFilter,
} from '@/lib/fleetLive';
import { fleetLiveService, type LiveUnit } from '@/services/fleetLiveService';
import { SAUDI_BOUNDS_COORDS, SAUDI_CENTER, DEFAULT_SAUDI_ZOOM } from '@/utils/saudiMapConfig';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LiveUnitMarker } from './LiveUnitMarker';
import { EtaStrip, GLASS, LiveUnitPanel, NextStopCard } from './LiveUnitPanel';
import { BUILDING_EXTRUSION_COLOR, LIVE_MAP_STYLES, ROUTE_COLOR, TONE, applyMapPalette, type LiveMapTheme } from './liveMapStyle';

const REFRESH_MS = 15_000;
/** Below this width the map uses one bottom card instead of the CarPlay layout. */
const COMPACT_BELOW_PX = 760;
/** Plate labels appear from this zoom — below it they overlap into noise. */
const LABEL_MIN_ZOOM = 8.5;
const THEME_KEY = 'mercon.liveMap.theme';

/** [west, south, east, north] — Saudi Arabia plus room to pan around its borders. */
const MAX_BOUNDS: [number, number, number, number] = [
  SAUDI_BOUNDS_COORDS[0][1] - 6, SAUDI_BOUNDS_COORDS[0][0] - 4,
  SAUDI_BOUNDS_COORDS[1][1] + 6, SAUDI_BOUNDS_COORDS[1][0] + 4,
];

function readTheme(): LiveMapTheme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* storage blocked — fall through */ }
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function boundsOf(points: { lat: number; lng: number }[]): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const p of points) {
    minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

interface Props {
  className?: string;
}

/**
 * The dashboard's live fleet map: every truck and on-trip driver, CarPlay-style.
 * Click a unit to fly to it and see its trip, both GPS feeds, the road route to
 * the next stop with a drive-time ETA, and share that ETA on WhatsApp.
 */
export default function FleetCommandMap({ className }: Props) {
  const mapRef = useRef<MapRef>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tz = useDeploymentTimezone();
  const formatTime = useCallback((d: Date) => formatInDeploymentTz(d, tz, 'HH:mm'), [tz]);

  const [theme, setTheme] = useState<LiveMapTheme>(readTheme);
  const [expanded, setExpanded] = useState(false);
  const [compact, setCompact] = useState(true);
  const [filter, setFilter] = useState<LiveFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [is3d, setIs3d] = useState(false);
  const [firstSymbolId, setFirstSymbolId] = useState<string | undefined>();
  const fittedOnce = useRef(false);

  const { data, dataUpdatedAt, isError } = useQuery({
    queryKey: ['fleet-live-map'],
    queryFn: fleetLiveService.getLiveMap,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
  });
  const units = useMemo(() => data?.units ?? [], [data]);

  const onMap = useMemo(() => units.filter((u) => u.position), [units]);
  const visible = useMemo(() => onMap.filter((u) => matchesFilter(u, filter) && matchesQuery(u, query)), [onMap, filter, query]);
  const visibleKeys = useMemo(() => new Set(visible.map((u) => u.key)), [visible]);
  const offlineUnits = useMemo(() => units.filter(isOffline), [units]);
  const counts = useMemo(
    () => Object.fromEntries(LIVE_FILTERS.map((f) => [f.id, onMap.filter((u) => matchesFilter(u, f.id)).length])) as Record<LiveFilter, number>,
    [onMap],
  );

  const selected = useMemo(() => units.find((u) => u.key === selectedKey) ?? null, [units, selectedKey]);
  const stop = selected ? nextStop(selected) : null;

  // ── Road route to the next stop (rounded so a few metres of drift don't refetch) ──
  const routeFrom = selected?.position ? { lat: +selected.position.lat.toFixed(3), lng: +selected.position.lng.toFixed(3) } : null;
  const routeTo = stop?.lat != null && stop.lng != null ? { lat: stop.lat, lng: stop.lng } : null;
  const { data: route, isFetched: routeFetched } = useQuery({
    queryKey: ['fleet-live-route', routeFrom, routeTo],
    queryFn: () => fleetLiveService.getRoute(routeFrom!, routeTo!),
    enabled: !!routeFrom && !!routeTo,
    staleTime: 60_000,
  });
  const eta = useMemo(
    () => (selected && routeFetched ? computeEta(selected, route ?? null) : selected && !routeTo ? computeEta(selected, null) : null),
    // dataUpdatedAt keeps the arrival clock moving between refreshes
    [selected, route, routeFetched, routeTo, dataUpdatedAt],
  );

  // ── Layout: compact card vs full CarPlay layout ──
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setCompact(e.contentRect.width < COMPACT_BELOW_PX));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.resize(), 320);
    return () => clearTimeout(t);
  }, [expanded]);

  // ── Camera helpers ──
  const panelPadding = useCallback(
    () => (compact ? { top: 40, bottom: 190, left: 40, right: 40 } : { top: 60, bottom: 60, left: 60, right: 340 }),
    [compact],
  );

  const fitAll = useCallback(
    (animate = true) => {
      const map = mapRef.current;
      const b = boundsOf(visible.map((u) => u.position!));
      if (!map) return;
      if (!b) {
        map.flyTo({ center: [SAUDI_CENTER[1], SAUDI_CENTER[0]], zoom: DEFAULT_SAUDI_ZOOM, pitch: 0, bearing: 0 });
        return;
      }
      map.fitBounds(b, { padding: 70, maxZoom: 11, pitch: 0, bearing: 0, duration: animate ? 1200 : 0 });
    },
    [visible],
  );

  const flyToUnit = useCallback(
    (u: LiveUnit) => {
      const map = mapRef.current;
      if (!map || !u.position) return;
      const moving = u.motion === 'moving' && u.position.heading_deg != null;
      map.flyTo({
        center: [u.position.lng, u.position.lat],
        zoom: Math.max(map.getZoom(), 14),
        pitch: 55,
        bearing: moving ? u.position.heading_deg! : map.getBearing(),
        padding: panelPadding(),
        duration: 1600,
        essential: true,
      });
      setIs3d(true);
    },
    [panelPadding],
  );

  const select = useCallback(
    (key: string) => {
      setSelectedKey(key);
      setFollow(true);
      const u = units.find((x) => x.key === key);
      if (u) flyToUnit(u);
    },
    [units, flyToUnit],
  );

  const deselect = useCallback(() => {
    setSelectedKey(null);
    setIs3d(false);
    fitAll();
  }, [fitAll]);

  const showRoute = useCallback(() => {
    if (!selected?.position || !selected.trip) return;
    const pts = [selected.position, ...selected.trip.stops.filter((s) => s.lat != null && s.lng != null).map((s) => ({ lat: s.lat!, lng: s.lng! }))];
    const b = boundsOf(pts);
    if (b) mapRef.current?.fitBounds(b, { padding: panelPadding(), pitch: 30, bearing: 0, duration: 1400, maxZoom: 14 });
    setFollow(false);
  }, [selected, panelPadding]);

  // First data: frame everything once.
  useEffect(() => {
    if (!fittedOnce.current && data && mapRef.current) {
      fittedOnce.current = true;
      fitAll(false);
    }
  }, [data, fitAll]);

  // Follow the selected unit as fresh positions arrive.
  const followLat = selected?.position?.lat;
  const followLng = selected?.position?.lng;
  useEffect(() => {
    if (!follow || followLat == null || followLng == null) return;
    mapRef.current?.easeTo({ center: [followLng, followLat], duration: 1200, padding: panelPadding() });
  }, [followLat, followLng, follow, panelPadding]);

  // Escape: close details, then leave expanded view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedKey) deselect();
      else if (expanded) setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedKey, expanded, deselect]);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  };

  const toggle3d = () => {
    const map = mapRef.current;
    if (!map) return;
    const on = !is3d;
    setIs3d(on);
    map.easeTo({ pitch: on ? 55 : 0, zoom: on ? Math.max(map.getZoom(), 14) : map.getZoom(), duration: 900 });
  };

  const share = () => {
    if (!selected) return;
    const text = buildEtaShareText(selected, eta, formatTime);
    window.open(whatsAppLink(null, text), '_blank', 'noopener');
    toast.success('ETA ready to send in WhatsApp');
  };

  // Keep the bearing and label visibility in CSS so markers don't re-render per frame.
  const syncCamera = useCallback(() => {
    const map = mapRef.current;
    const el = wrapRef.current;
    if (!map || !el) return;
    el.style.setProperty('--map-bearing', `${map.getBearing()}deg`);
    el.dataset.labels = map.getZoom() >= LABEL_MIN_ZOOM ? 'on' : 'off';
  }, []);

  const paintedFor = useRef<LiveMapTheme | null>(null);
  const onStyleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const layers = (map.getStyle() as StyleSpecification | undefined)?.layers ?? [];
    // Our route and buildings go under the labels, but above every road and bridge
    // (Liberty puts one-way arrows mid-stack, so "first symbol" would be too low).
    const lastDrawn = layers.reduce((i, l, idx) => (l.type !== 'symbol' ? idx : i), -1);
    setFirstSymbolId(layers.slice(lastDrawn + 1).find((l) => l.type === 'symbol')?.id);
    if (paintedFor.current !== theme && map.isStyleLoaded()) {
      paintedFor.current = theme;
      applyMapPalette(map, theme);
    }
    syncCamera();
  }, [syncCamera, theme]);

  // ── Route geometry ──
  const routeLine = useMemo(() => {
    if (!selected?.position || !routeTo) return null;
    const coords = route?.geometry ?? [[selected.position.lng, selected.position.lat], [routeTo.lng, routeTo.lat]];
    return { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } };
  }, [selected, route, routeTo]);

  const pendingLine = useMemo(() => {
    if (!selected?.trip || selected.trip.next_stop_index == null) return null;
    const rest = selected.trip.stops.slice(selected.trip.next_stop_index).filter((s) => s.lat != null && s.lng != null);
    if (rest.length < 2) return null;
    return { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: rest.map((s) => [s.lng!, s.lat!]) } };
  }, [selected]);

  const colors = ROUTE_COLOR[theme];
  const lastUpdate = dataUpdatedAt ? timeAgo(new Date(dataUpdatedAt).toISOString()) : null;

  return (
    <div
      className={cn(
        expanded ? 'fixed inset-3 z-[70] rounded-3xl shadow-2xl' : 'relative h-full w-full',
        'overflow-hidden bg-slate-100 dark:bg-slate-900',
        className,
      )}
    >
      {expanded && <div className="fixed inset-0 -z-10 bg-black/40 backdrop-blur-sm" onClick={() => setExpanded(false)} />}

      <div ref={wrapRef} className="group/map absolute inset-0" data-labels="off">
        <MapGL
          ref={mapRef}
          mapStyle={LIVE_MAP_STYLES[theme]}
          initialViewState={{ longitude: SAUDI_CENTER[1], latitude: SAUDI_CENTER[0], zoom: DEFAULT_SAUDI_ZOOM }}
          maxBounds={MAX_BOUNDS}
          minZoom={3.5}
          maxZoom={19}
          maxPitch={70}
          dragRotate
          touchPitch
          attributionControl={false}
          onLoad={onStyleLoad}
          onStyleData={onStyleLoad}
          onMove={syncCamera}
          onDragStart={() => setFollow(false)}
          onClick={() => selectedKey && deselect()}
          cursor="grab"
          style={{ width: '100%', height: '100%' }}
        >
          {/* 3D buildings once tilted and close */}
          <Layer
            id="live-3d-buildings"
            type="fill-extrusion"
            source="openmaptiles"
            source-layer="building"
            minzoom={14}
            beforeId={firstSymbolId}
            paint={{
              'fill-extrusion-color': BUILDING_EXTRUSION_COLOR[theme],
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
              'fill-extrusion-opacity': 0.75,
            }}
          />

          {pendingLine && (
            <Source id="live-pending" type="geojson" data={pendingLine}>
              <Layer id="live-pending-line" type="line" beforeId={firstSymbolId}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{ 'line-color': colors.pending, 'line-width': 3, 'line-dasharray': [1, 2] }} />
            </Source>
          )}

          {routeLine && (
            <Source id="live-route" type="geojson" data={routeLine}>
              <Layer id="live-route-casing" type="line" beforeId={firstSymbolId}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{ 'line-color': colors.casing, 'line-width': 14, 'line-opacity': 0.22, 'line-blur': 2 }} />
              <Layer id="live-route-line" type="line" beforeId={firstSymbolId}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': colors.line,
                  'line-width': ['interpolate', ['linear'], ['zoom'], 6, 3, 14, 7],
                  ...(route ? {} : { 'line-dasharray': [2, 1.5] }),
                }} />
            </Source>
          )}

          {/* Stops of the selected trip */}
          {selected?.trip?.stops.map((s, i) =>
            s.lat != null && s.lng != null ? (
              <Marker key={`stop-${s.sequence}`} longitude={s.lng} latitude={s.lat} anchor="bottom">
                <StopPin index={i + 1} done={s.actual_arrival != null} next={i === selected.trip!.next_stop_index} />
              </Marker>
            ) : null,
          )}

          {onMap.map((u) => (
            <LiveUnitMarker
              key={u.key}
              unit={u}
              selected={u.key === selectedKey}
              dimmed={!visibleKeys.has(u.key) || (!!selectedKey && u.key !== selectedKey)}
              onSelect={select}
            />
          ))}
        </MapGL>
      </div>

      {/* ── Overlays ── */}
      <div className="pointer-events-none absolute inset-0 p-3">
        {/* Top-left: next-stop card when a trip is selected in the full layout, otherwise search + filters */}
        <div className="absolute top-3 left-3 flex max-w-[calc(100%-5rem)] flex-col gap-2">
          {selected && compact ? null : selected && selected.trip && stop ? (
            <NextStopCard unit={selected} eta={eta} />
          ) : (
            <>
              <div className={cn('pointer-events-auto flex h-9 items-center gap-2 rounded-xl px-3', GLASS, compact ? 'w-[200px]' : 'w-[260px]')}>
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Plate, driver, trip…"
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  aria-label="Search the map"
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-muted-foreground hover:text-foreground">
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <div className={cn('pointer-events-auto flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-xl p-1', GLASS)}>
                {LIVE_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                      filter === f.id ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10',
                    )}
                  >
                    {f.id === 'on_trip' && <span className={cn('size-1.5 rounded-full', TONE.active.dot)} />}
                    {f.id === 'delayed' && <span className={cn('size-1.5 rounded-full', TONE.delayed.dot)} />}
                    {f.id === 'free' && <span className={cn('size-1.5 rounded-full', TONE.free.dot)} />}
                    {f.id === 'offline' && <span className="size-1.5 rounded-full bg-slate-400" />}
                    {f.label}
                    <span className="tabular-nums opacity-60">{counts[f.id]}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Top-right: live status + speed */}
        <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
          <div className={cn('pointer-events-auto flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-medium', GLASS)}>
            <span className="relative flex size-2">
              {!isError && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
              <span className={cn('relative inline-flex size-2 rounded-full', isError ? 'bg-rose-500' : 'bg-emerald-500')} />
            </span>
            <span className="text-foreground">{isError ? 'Connection lost' : 'Live'}</span>
            {lastUpdate && !isError && <span className="text-muted-foreground">· {lastUpdate}</span>}
          </div>
          {selected?.motion === 'moving' && selected.position?.speed_kph != null && (
            <div className={cn('pointer-events-auto flex size-14 flex-col items-center justify-center rounded-2xl', GLASS)}>
              <span className="text-xl leading-none font-semibold tabular-nums text-foreground">{Math.round(selected.position.speed_kph)}</span>
              <span className="text-[10px] text-muted-foreground">km/h</span>
            </div>
          )}
        </div>

        {/* Right: details panel (full layout) */}
        {selected && !compact && (
          <div className="absolute top-16 right-3 bottom-3 flex items-start">
            <LiveUnitPanel unit={selected} eta={eta} formatTime={formatTime} compact={false} onClose={deselect} onShare={share} onShowRoute={showRoute} />
          </div>
        )}

        {/* Bottom-left: ETA strip, or the offline list */}
        <div className="absolute bottom-3 left-3 flex items-end gap-2">
          {selected && !compact && eta && selected.trip ? (
            <EtaStrip eta={eta} formatTime={formatTime} />
          ) : !selected && offlineUnits.length > 0 ? (
            <OfflineList units={offlineUnits} onSelect={select} />
          ) : null}
        </div>

        {/* Map controls */}
        <div className={cn('absolute bottom-3 flex flex-col gap-2', !selected ? 'right-3' : compact ? 'hidden' : 'right-[324px]')}>
          <ControlGroup>
            <CtlButton label="Zoom in" onClick={() => mapRef.current?.zoomIn()}><Plus /></CtlButton>
            <CtlButton label="Zoom out" onClick={() => mapRef.current?.zoomOut()}><Minus /></CtlButton>
          </ControlGroup>
          <ControlGroup>
            <CtlButton label="Reset north" onClick={() => { mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 700 }); setIs3d(false); }}>
              <Compass style={{ transform: 'rotate(calc(var(--map-bearing, 0deg) * -1 - 45deg))' }} className="transition-transform" />
            </CtlButton>
            <CtlButton label={is3d ? '2D view' : '3D view'} active={is3d} onClick={toggle3d}><Box /></CtlButton>
            <CtlButton label="Show all" onClick={() => (selectedKey ? deselect() : fitAll())}><Focus /></CtlButton>
          </ControlGroup>
          <ControlGroup>
            <CtlButton label={theme === 'light' ? 'Dark map' : 'Light map'} onClick={toggleTheme}>{theme === 'light' ? <Moon /> : <Sun />}</CtlButton>
            <CtlButton label={expanded ? 'Exit full view' : 'Full view'} onClick={() => setExpanded((v) => !v)}>
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </CtlButton>
            <MapCredits />
          </ControlGroup>
        </div>

        {/* Compact: one bottom card */}
        {selected && compact && (
          <div className="absolute right-3 bottom-3 left-3">
            <LiveUnitPanel unit={selected} eta={eta} formatTime={formatTime} compact onClose={deselect} onShare={share} onShowRoute={showRoute} />
          </div>
        )}

        {!data && !isError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={cn('rounded-xl px-3 py-2 text-xs text-muted-foreground', GLASS)}>Loading live fleet…</div>
          </div>
        )}
        {data && units.length > 0 && onMap.length === 0 && (
          <div className="absolute inset-x-0 top-1/2 flex justify-center">
            <div className={cn('pointer-events-auto max-w-xs rounded-xl px-4 py-3 text-center text-xs text-muted-foreground', GLASS)}>
              None of your {units.length} trucks have reported a GPS position yet.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * OpenStreetMap (ODbL) and OpenFreeMap require visible credit. It lives behind
 * an info button instead of a permanent strip over the map — the same pattern
 * Apple and Google Maps use — so it must stay reachable, not be removed.
 */
function MapCredits() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" title="Map credits" aria-label="Map credits" className="flex size-9 items-center justify-center text-foreground/60 transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10 [&_svg]:size-4">
          <Info />
        </button>
      </PopoverTrigger>
      <PopoverContent side="left" align="end" className="w-auto px-3 py-2 text-xs text-muted-foreground">
        Map ©{' '}
        <a className="underline hover:text-foreground" href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>{' '}·{' '}
        <a className="underline hover:text-foreground" href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a>{' '}·{' '}
        Data ©{' '}
        <a className="underline hover:text-foreground" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>
      </PopoverContent>
    </Popover>
  );
}

function ControlGroup({ children }: { children: React.ReactNode }) {
  return <div className={cn('pointer-events-auto flex flex-col overflow-hidden rounded-xl', GLASS)}>{children}</div>;
}

function CtlButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex size-9 items-center justify-center text-foreground/80 transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10 [&_svg]:size-4',
        'border-b border-black/[0.05] last:border-b-0 dark:border-white/10',
        active && 'text-blue-600 dark:text-blue-400',
      )}
    >
      {children}
    </button>
  );
}

function StopPin({ index, done, next }: { index: number; done: boolean; next: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          'flex size-7 items-center justify-center rounded-full border-[2.5px] border-white text-[11px] font-bold shadow-md',
          done ? 'bg-slate-400 text-white' : next ? 'bg-blue-600 text-white' : 'bg-slate-800 text-white',
        )}
      >
        {index}
      </div>
      <div className={cn('-mt-0.5 h-2 w-0.5 rounded-full', done ? 'bg-slate-400' : next ? 'bg-blue-600' : 'bg-slate-800')} />
    </div>
  );
}

function OfflineList({ units, onSelect }: { units: LiveUnit[]; onSelect: (key: string) => void }) {
  const stale = units.filter((u) => u.motion === 'stale');
  const none = units.filter((u) => u.motion === 'no_signal');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn('pointer-events-auto flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-medium text-foreground', GLASS)}>
          <SignalLow className="size-4 text-amber-600" />
          {units.length} not live
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 p-0">
        <div className="max-h-72 overflow-y-auto py-1">
          {stale.length > 0 && <p className="px-3 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">Last known position</p>}
          {stale.map((u) => (
            <button key={u.key} type="button" onClick={() => onSelect(u.key)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent">
              <span className="size-1.5 rounded-full bg-amber-500" />
              <span className="flex-1 truncate font-mono text-xs">{unitTitle(u)}</span>
              <span className="text-xs text-muted-foreground">{timeAgo(u.position?.recorded_at)}</span>
            </button>
          ))}
          {none.length > 0 && <p className="px-3 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">Never reported</p>}
          {none.map((u) => (
            <div key={u.key} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="size-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
              <span className="flex-1 truncate font-mono text-xs">{unitTitle(u)}</span>
              <span className="text-xs text-muted-foreground">{u.vehicle && !u.vehicle.has_tracker ? 'No tracker' : 'No fix'}</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
