import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import MapGL, { Layer, Source, type MapRef } from 'react-map-gl/maplibre';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Focus, Map as MapIcon, Minus, Moon, Navigation, Plus, Route, Sun, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatInDeploymentTz, useDeploymentTimezone } from '@/lib/datetime';
import { computeEta, formatDuration, formatKm, groupStopsOf, routeBearing, type EtaInfo } from '@/lib/fleetLive';
import { fleetLiveService, type TripOverview } from '@/services/fleetLiveService';
import { SAUDI_CENTER, DEFAULT_SAUDI_ZOOM } from '@/utils/saudiMapConfig';
import { LiveUnitMarker } from './LiveUnitMarker';
import { ControlGroup, CtlButton, MapLegend, StopPin, type StopPinTone } from './LiveMapBits';
import { EtaStrip, GLASS } from './LiveUnitPanel';
import { BUILDING_EXTRUSION_COLOR, LIVE_MAP_STYLES, ROUTE_COLOR, applyMapPalette, type LiveMapTheme } from './liveMapStyle';

const THEME_KEY = 'mercon.liveMap.theme';
const ACTIVE_REFRESH_MS = 15_000;
const PLANNED_REFRESH_MS = 60_000;

/** Line colours per state. The active trip keeps the fleet map's blue. */
const LINE = {
  planned: '#7c3aed',
  deadhead: '#94a3b8',
  driven: '#94a3b8',
  done: '#16a34a',
  cancelled: '#a8a29e',
} as const;

const PIN_TONE: Record<TripOverview['phase'], StopPinTone> = {
  planned: 'planned',
  active: 'live',
  done: 'done',
  cancelled: 'cancelled',
};

function readTheme(): LiveMapTheme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* storage blocked */ }
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

type Pt = { lat: number; lng: number };

function boundsOf(points: Pt[]): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const p of points) {
    minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

const line = (coords: [number, number][]) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } });

/**
 * The trip details page's map. What it draws depends on where the trip is:
 *  - planned: the planned road route (purple, dashed) and where the assigned
 *    truck is now, with its drive to the pickup
 *  - active: the live truck, the path driven (grey), the road ahead (blue),
 *    the ETA strip, and a driver view
 *  - done: the path actually driven (green) — or, when the driver app sent no
 *    GPS, the road route through the stops, labelled as such
 *  - cancelled: the planned route, greyed
 */
export default function TripMap({ tripId, className, overlay, onEta }: {
  tripId: string;
  className?: string;
  /** A card shown on the map, top-left (the page puts truck and driver here). */
  overlay?: React.ReactNode;
  /** The road-route ETA for the next stop, whenever it changes (the page's Share ETA uses it). */
  onEta?: (eta: EtaInfo | null) => void;
}) {
  const mapRef = useRef<MapRef>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tz = useDeploymentTimezone();
  const formatTime = useCallback((d: Date) => formatInDeploymentTz(d, tz, 'HH:mm'), [tz]);
  const [theme, setTheme] = useState<LiveMapTheme>(readTheme);
  const [firstSymbolId, setFirstSymbolId] = useState<string | undefined>();
  const [pov, setPov] = useState(false);
  const [follow, setFollow] = useState(true);

  const { data, dataUpdatedAt, isError } = useQuery({
    queryKey: ['trip-overview', tripId],
    queryFn: () => fleetLiveService.getTripOverview(tripId),
    refetchInterval: (q) => (q.state.data?.phase === 'active' ? ACTIVE_REFRESH_MS : q.state.data?.phase === 'planned' ? PLANNED_REFRESH_MS : false),
  });
  const phase = data?.phase;
  const unit = data?.unit ?? null;
  const pos = unit?.position ?? null;
  const stopsWithCoords = useMemo(
    () => (data?.stops ?? []).filter((s) => s.lat != null && s.lng != null).map((s) => ({ lat: s.lat!, lng: s.lng! })),
    [data?.stops],
  );
  const nextIdx = data?.next_stop_index ?? null;
  const nextStop = nextIdx != null ? data?.stops[nextIdx] : null;
  const remaining = useMemo(
    () => (nextIdx == null ? [] : (data?.stops ?? []).slice(nextIdx).filter((s) => s.lat != null && s.lng != null).map((s) => ({ lat: s.lat!, lng: s.lng! }))),
    [data?.stops, nextIdx],
  );

  // ── Routes (each only where its state needs it) ──
  const noDrivenPath = (data?.path.length ?? 0) < 2;
  const needAllStopsRoute = phase === 'planned' || phase === 'cancelled' || (phase === 'done' && noDrivenPath);
  const allKey = stopsWithCoords.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join(';');
  const { data: allRoute } = useQuery({
    queryKey: ['trip-route-all', tripId, allKey],
    queryFn: () => fleetLiveService.getRouteThrough(stopsWithCoords),
    enabled: needAllStopsRoute && stopsWithCoords.length >= 2,
    staleTime: Infinity,
  });

  const from = pos ? { lat: +pos.lat.toFixed(3), lng: +pos.lng.toFixed(3) } : null;
  const aheadTo = phase === 'active' && nextStop?.lat != null && nextStop.lng != null ? { lat: nextStop.lat, lng: nextStop.lng } : null;
  const pickupTo = phase === 'planned' && stopsWithCoords[0] ? stopsWithCoords[0] : null;
  const legTo = aheadTo ?? pickupTo;
  const { data: leg, isFetched: legFetched } = useQuery({
    queryKey: ['trip-route-leg', tripId, from, legTo],
    queryFn: () => fleetLiveService.getRoute(from!, legTo!),
    enabled: !!from && !!legTo,
    staleTime: 60_000,
  });
  const { data: restRoute } = useQuery({
    queryKey: ['trip-route-rest', tripId, nextIdx],
    queryFn: () => fleetLiveService.getRouteThrough(remaining),
    enabled: phase === 'active' && remaining.length >= 2,
    staleTime: 10 * 60_000,
  });

  const eta = useMemo(
    () => (phase === 'active' && unit && legFetched ? computeEta(unit, leg ?? null, dataUpdatedAt || Date.now()) : null),
    [phase, unit, leg, legFetched, dataUpdatedAt],
  );

  useEffect(() => { onEta?.(eta); }, [eta, onEta]);

  // ── Camera ──
  const fitAll = useCallback((animate = true) => {
    const map = mapRef.current;
    if (!map) return;
    const pts = [...stopsWithCoords, ...(pos && phase !== 'done' && phase !== 'cancelled' ? [pos] : [])];
    const b = boundsOf(pts);
    if (!b) return;
    setPov(false);
    map.fitBounds(b, { padding: { top: 70, bottom: phase === 'active' ? 110 : 60, left: 60, right: 70 }, maxZoom: 14, pitch: 0, bearing: 0, duration: animate ? 1200 : 0 });
  }, [stopsWithCoords, pos, phase]);

  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && data && mapRef.current) {
      fitted.current = true;
      fitAll(false);
    }
  }, [data, fitAll]);

  const povBearing = useCallback(() => {
    if (unit?.motion === 'moving' && pos?.heading_deg != null) return pos.heading_deg;
    return (leg?.geometry ? routeBearing(leg.geometry) : null) ?? mapRef.current?.getBearing() ?? 0;
  }, [unit, pos, leg]);
  const povPadding = useCallback(() => {
    const h = mapRef.current?.getContainer().clientHeight ?? 400;
    return { top: Math.round(h * 0.5), bottom: 110, left: 40, right: 60 };
  }, []);

  const enterPov = useCallback(() => {
    if (!pos) return;
    setPov(true);
    setFollow(true);
    mapRef.current?.easeTo({ center: [pos.lng, pos.lat], zoom: 17.5, pitch: 72, bearing: povBearing(), padding: povPadding(), duration: 1600, essential: true });
  }, [pos, povBearing, povPadding]);

  // In driver view, move only when the truck actually moves — so the entry animation isn't cut short.
  const last = useRef<{ lat?: number; lng?: number }>({});
  useEffect(() => {
    const prev = last.current;
    last.current = { lat: pos?.lat, lng: pos?.lng };
    if (!pov || !follow || !pos || (prev.lat === pos.lat && prev.lng === pos.lng)) return;
    mapRef.current?.easeTo({ center: [pos.lng, pos.lat], bearing: povBearing(), duration: 1200, padding: povPadding() });
  }, [pos, pov, follow, povBearing, povPadding]);

  // ── Map style ──
  const paintedFor = useRef<LiveMapTheme | null>(null);
  const syncCamera = useCallback(() => {
    const map = mapRef.current;
    if (map && wrapRef.current) wrapRef.current.style.setProperty('--map-bearing', `${map.getBearing()}deg`);
  }, []);
  const onStyleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const layers = (map.getStyle() as StyleSpecification | undefined)?.layers ?? [];
    const lastDrawn = layers.reduce((i, l, idx) => (l.type !== 'symbol' ? idx : i), -1);
    setFirstSymbolId(layers.slice(lastDrawn + 1).find((l) => l.type === 'symbol')?.id);
    if (paintedFor.current !== theme && map.isStyleLoaded()) {
      paintedFor.current = theme;
      applyMapPalette(map, theme);
    }
    syncCamera();
  }, [theme, syncCamera]);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  };

  // ── What to draw ──
  const blue = ROUTE_COLOR[theme].line;
  const stopGroups = useMemo(() => (data ? groupStopsOf({ stops: data.stops, next_stop_index: data.next_stop_index }) : []), [data]);
  const drivenColor = phase === 'done' ? LINE.done : LINE.driven;
  const plannedColor = phase === 'cancelled' ? LINE.cancelled : phase === 'done' ? LINE.done : LINE.planned;
  const showUnit = !!pos && (phase === 'active' || phase === 'planned');
  const pinTone = phase ? PIN_TONE[phase] : 'live';

  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-slate-100 dark:bg-slate-900', className)}>
      <div ref={wrapRef} className="absolute inset-0 isolate">
        <MapGL
          ref={mapRef}
          mapStyle={LIVE_MAP_STYLES[theme]}
          initialViewState={{ longitude: SAUDI_CENTER[1], latitude: SAUDI_CENTER[0], zoom: DEFAULT_SAUDI_ZOOM }}
          minZoom={3.5}
          maxZoom={19}
          maxPitch={75}
          attributionControl={false}
          onLoad={onStyleLoad}
          onStyleData={onStyleLoad}
          onMove={syncCamera}
          onDragStart={() => setFollow(false)}
          style={{ width: '100%', height: '100%' }}
        >
          <Layer
            id="trip-3d-buildings" type="fill-extrusion" source="openmaptiles" source-layer="building" minzoom={14} beforeId={firstSymbolId}
            paint={{
              'fill-extrusion-color': BUILDING_EXTRUSION_COLOR[theme],
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
              'fill-extrusion-opacity': 0.75,
            }}
          />

          {/* Planned / cancelled / done-without-GPS: the road route through every stop */}
          {needAllStopsRoute && allRoute && (
            <Source id="trip-all" type="geojson" data={line(allRoute.geometry)}>
              <Layer id="trip-all-line" type="line" beforeId={firstSymbolId} layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': plannedColor,
                  'line-width': ['interpolate', ['linear'], ['zoom'], 6, 3, 14, 6],
                  ...(phase === 'done' ? {} : { 'line-dasharray': [2, 1.6] }),
                  'line-opacity': phase === 'cancelled' ? 0.7 : 1,
                }} />
            </Source>
          )}

          {/* Driven path from the driver app's GPS */}
          {(phase === 'active' || phase === 'done') && !noDrivenPath && (
            <Source id="trip-driven" type="geojson" data={line(data!.path)}>
              <Layer id="trip-driven-line" type="line" beforeId={firstSymbolId} layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{ 'line-color': drivenColor, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 3, 14, 6] }} />
            </Source>
          )}

          {/* Planned: truck's drive to the pickup */}
          {phase === 'planned' && leg && (
            <Source id="trip-deadhead" type="geojson" data={line(leg.geometry)}>
              <Layer id="trip-deadhead-line" type="line" beforeId={firstSymbolId} layout={{ 'line-cap': 'round' }}
                paint={{ 'line-color': LINE.deadhead, 'line-width': 3, 'line-dasharray': [0.5, 2] }} />
            </Source>
          )}

          {/* Active: rest of the trip (faint) and the road ahead (bold) */}
          {phase === 'active' && restRoute && (
            <Source id="trip-rest" type="geojson" data={line(restRoute.geometry)}>
              <Layer id="trip-rest-line" type="line" beforeId={firstSymbolId} layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{ 'line-color': blue, 'line-opacity': 0.35, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 2, 14, 5] }} />
            </Source>
          )}
          {phase === 'active' && pos && aheadTo && (
            <Source id="trip-ahead" type="geojson" data={line(leg?.geometry ?? [[pos.lng, pos.lat], [aheadTo.lng, aheadTo.lat]])}>
              <Layer id="trip-ahead-casing" type="line" beforeId={firstSymbolId} layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{ 'line-color': blue, 'line-width': 14, 'line-opacity': 0.22, 'line-blur': 2 }} />
              <Layer id="trip-ahead-line" type="line" beforeId={firstSymbolId} layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{ 'line-color': blue, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 3, 14, 7], ...(leg ? {} : { 'line-dasharray': [2, 1.5] }) }} />
            </Source>
          )}

          {stopGroups.map((g) => (
            <StopPin
              key={`stop-${g.numbers.join('-')}`}
              group={g}
              tone={pinTone}
              eta={phase === 'active' && g.isNext && eta?.arrival ? formatTime(eta.arrival) : null}
            />
          ))}

          {showUnit && unit && (
            <LiveUnitMarker unit={unit} selected dimmed={false} showLabel onSelect={() => undefined} onHover={() => undefined} />
          )}
        </MapGL>
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 p-3">
        {/* Top: what the lines mean in this state, and the driver-view switch for a live trip */}
        <div className="absolute top-3 left-3 flex max-w-[calc(100%-15rem)] flex-col items-start gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {phase && <StateNote overview={data!} legKm={leg ? leg.distanceMeters / 1000 : null} legSec={leg?.durationSeconds ?? null} />}
          </div>
          {overlay}
        </div>
        {phase === 'active' && pos && (
          <div className="absolute top-3 right-3 flex rounded-full bg-charcoal/90 p-0.5 text-xs font-medium text-white shadow-lg backdrop-blur-md pointer-events-auto">
            <button type="button" onClick={() => fitAll()} aria-pressed={!pov}
              className={cn('flex items-center gap-1 rounded-full px-2.5 py-1', !pov ? 'bg-white text-charcoal' : 'hover:bg-white/15')}>
              <MapIcon className="size-3" /> Overview
            </button>
            <button type="button" onClick={enterPov} aria-pressed={pov}
              className={cn('flex items-center gap-1 rounded-full px-2.5 py-1', pov ? 'bg-white text-charcoal' : 'hover:bg-white/15')}>
              <Navigation className="size-3" /> Driver view
            </button>
            {pov && !follow && (
              <button type="button" onClick={enterPov} className="rounded-full px-2.5 py-1 hover:bg-white/15">Recenter</button>
            )}
          </div>
        )}

        {phase === 'active' && eta && (
          <div className="absolute bottom-3 left-3"><EtaStrip eta={eta} formatTime={formatTime} /></div>
        )}

        <div className="absolute right-3 bottom-3 flex flex-col gap-2">
          <ControlGroup>
            <CtlButton label="Zoom in" onClick={() => mapRef.current?.zoomIn()}><Plus /></CtlButton>
            <CtlButton label="Zoom out" onClick={() => mapRef.current?.zoomOut()}><Minus /></CtlButton>
          </ControlGroup>
          <ControlGroup>
            <CtlButton label="Show the whole trip" onClick={() => fitAll()}><Focus /></CtlButton>
            <CtlButton label={theme === 'light' ? 'Dark map' : 'Light map'} onClick={toggleTheme}>{theme === 'light' ? <Moon /> : <Sun />}</CtlButton>
            <MapLegend />
          </ControlGroup>
        </div>

        {!data && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={cn('max-w-xs rounded-xl px-3 py-2 text-center text-xs text-muted-foreground', GLASS)}>
              {isError ? "Couldn't load this trip's map data. The server may not have the latest update yet." : 'Loading map…'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** One quiet line explaining the lines on the map for this state. */
function StateNote({ overview, legKm, legSec }: { overview: TripOverview; legKm: number | null; legSec: number | null }) {
  const pill = cn('pointer-events-auto flex h-8 items-center gap-2 rounded-xl px-3 text-xs font-medium text-foreground', GLASS);
  const swatch = (color: string, dashed = false) => (
    <span className="h-1 w-5 rounded-full" style={dashed ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 6px, transparent 6px 10px)` } : { backgroundColor: color }} />
  );

  switch (overview.phase) {
    case 'planned':
      return (
        <>
          <span className={pill}>{swatch(LINE.planned, true)} Planned route</span>
          <span className={pill}>
            <Truck className="size-3.5 text-muted-foreground" />
            {!overview.unit ? 'No truck assigned yet'
              : !overview.unit.position ? 'Truck has no GPS position'
              : legKm != null && legSec != null ? `Truck is ${formatKm(legKm)} · ${formatDuration(legSec)} from pickup`
              : 'Truck position shown'}
          </span>
        </>
      );
    case 'active':
      return <span className={pill}>{swatch(LINE.driven)} Driven so far {swatch('#1a73e8')} Road ahead</span>;
    case 'done':
      return (overview.path.length >= 2) ? (
        <span className={pill}>
          {swatch(LINE.done)} Path driven
          {overview.path_distance_m != null && <span className="text-muted-foreground">· {formatKm(overview.path_distance_m / 1000)}</span>}
        </span>
      ) : (
        <span className={pill} title="The driver app sent no GPS during this trip, so the actual path isn't known.">
          <Route className="size-3.5 text-muted-foreground" /> Route through the stops — no GPS was recorded
        </span>
      );
    case 'cancelled':
      return <span className={pill}>{swatch(LINE.cancelled, true)} Planned route — trip cancelled</span>;
  }
}
