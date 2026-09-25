import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import MapGL, { Layer, Source, type MapRef } from 'react-map-gl/maplibre';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Supercluster from 'supercluster';
import { Compass, Focus, Maximize2, Minimize2, Minus, Moon, Plus, Search, SignalLow, Sun, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatInDeploymentTz, useDeploymentTimezone } from '@/lib/datetime';
import { whatsAppLink } from '@/lib/share';
import {
  LIVE_FILTERS, buildEtaShareText, computeEta, groupStops, isOffline, matchesFilter, matchesQuery, nextStop, pickLabels, timeAgo,
  unitPriority, unitTitle, type LiveFilter,
} from '@/lib/fleetLive';
import { fleetLiveService, type LiveUnit } from '@/services/fleetLiveService';
import { SAUDI_BOUNDS_COORDS, SAUDI_CENTER, DEFAULT_SAUDI_ZOOM } from '@/utils/saudiMapConfig';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LiveUnitMarker } from './LiveUnitMarker';
import { ClusterMarker, HoverPeek, MapLegend, StopPin } from './LiveMapBits';
import { EtaStrip, GLASS, LiveUnitPanel, NextStopCard } from './LiveUnitPanel';
import { BUILDING_EXTRUSION_COLOR, LIVE_MAP_STYLES, ROUTE_COLOR, TONE, applyMapPalette, type LiveMapTheme, type UnitTone } from './liveMapStyle';

const REFRESH_MS = 15_000;
/** Below this width the map uses one bottom card instead of the CarPlay layout. */
const COMPACT_BELOW_PX = 760;
/** Units closer than this many pixels merge into a numbered group. */
const CLUSTER_RADIUS_PX = 52;
/** From this zoom up every unit is drawn on its own. */
const CLUSTER_MAX_ZOOM = 12;
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

function toneForPriority(p: number): UnitTone {
  return p >= 40 ? 'delayed' : p >= 30 ? 'active' : p >= 20 ? 'upcoming' : 'free';
}

type ClusterProps = { key: string; priority: number };

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
  const [firstSymbolId, setFirstSymbolId] = useState<string | undefined>();
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  /** Camera snapshot taken when movement ends — drives grouping and label placement. */
  const [view, setView] = useState<{ zoom: number; bbox: [number, number, number, number]; tilted: boolean } | null>(null);
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
  const offlineUnits = useMemo(() => units.filter(isOffline), [units]);
  const counts = useMemo(
    () => Object.fromEntries(LIVE_FILTERS.map((f) => [f.id, onMap.filter((u) => matchesFilter(u, f.id)).length])) as Record<LiveFilter, number>,
    [onMap],
  );

  const selected = useMemo(() => units.find((u) => u.key === selectedKey) ?? null, [units, selectedKey]);
  const stop = selected ? nextStop(selected) : null;

  // ── Grouping: nearby units merge into a numbered bubble; the selected one never does ──
  const clusterIndex = useMemo(() => {
    const index = new Supercluster<ClusterProps, { priority: number }>({
      radius: CLUSTER_RADIUS_PX,
      maxZoom: CLUSTER_MAX_ZOOM,
      map: (p) => ({ priority: p.priority }),
      reduce: (acc, p) => { acc.priority = Math.max(acc.priority, p.priority); },
    });
    index.load(
      visible
        .filter((u) => u.key !== selectedKey)
        .map((u) => ({
          type: 'Feature' as const,
          properties: { key: u.key, priority: unitPriority(u) },
          geometry: { type: 'Point' as const, coordinates: [u.position!.lng, u.position!.lat] },
        })),
    );
    return index;
  }, [visible, selectedKey]);

  const { clusters, singles } = useMemo(() => {
    const byKey = new Map(visible.map((u) => [u.key, u]));
    const out = { clusters: [] as { id: number; lng: number; lat: number; count: number; tone: UnitTone }[], singles: [] as LiveUnit[] };
    if (!view) {
      out.singles = visible;
      return out;
    }
    for (const f of clusterIndex.getClusters(view.bbox, Math.floor(view.zoom))) {
      const [lng, lat] = f.geometry.coordinates;
      const p = f.properties as Record<string, unknown>;
      if (p.cluster) {
        out.clusters.push({ id: p.cluster_id as number, lng, lat, count: p.point_count as number, tone: toneForPriority(p.priority as number) });
      } else {
        const u = byKey.get(p.key as string);
        if (u) out.singles.push(u);
      }
    }
    if (selected?.position) out.singles.push(selected);
    return out;
  }, [clusterIndex, view, visible, selected]);

  // ── Labels: highest-priority first, dropped where they would overlap ──
  const labelled = useMemo(() => {
    const map = mapRef.current;
    if (!map || !view) return new Set<string>();
    return pickLabels(
      singles.map((u) => {
        const pt = map.project([u.position!.lng, u.position!.lat]);
        return {
          key: u.key,
          x: pt.x,
          y: pt.y,
          priority: unitPriority(u) + (u.key === selectedKey ? 100 : 0),
          width: unitTitle(u).length * 6.6 + 16 + (u.motion === 'stale' ? 30 : 0),
        };
      }),
    );
  }, [singles, view, selectedKey]);

  const hovered = hoverKey && hoverKey !== selectedKey ? singles.find((u) => u.key === hoverKey) ?? null : null;

  // ── Road route to the next stop (rounded so a few metres of drift don't refetch) ──
  const fromLat = selected?.position ? +selected.position.lat.toFixed(3) : null;
  const fromLng = selected?.position ? +selected.position.lng.toFixed(3) : null;
  const routeFrom = useMemo(() => (fromLat != null && fromLng != null ? { lat: fromLat, lng: fromLng } : null), [fromLat, fromLng]);
  const toLat = stop?.lat ?? null;
  const toLng = stop?.lng ?? null;
  const routeTo = useMemo(() => (toLat != null && toLng != null ? { lat: toLat, lng: toLng } : null), [toLat, toLng]);
  const { data: route, isFetched: routeFetched } = useQuery({
    queryKey: ['fleet-live-route', routeFrom, routeTo],
    queryFn: () => fleetLiveService.getRoute(routeFrom!, routeTo!),
    enabled: !!routeFrom && !!routeTo,
    staleTime: 60_000,
  });
  const restStops = useMemo(() => {
    const t = selected?.trip;
    if (!t || t.next_stop_index == null) return [];
    return t.stops.slice(t.next_stop_index).filter((s) => s.lat != null && s.lng != null).map((s) => ({ lat: s.lat!, lng: s.lng! }));
  }, [selected]);
  const { data: restRoute } = useQuery({
    queryKey: ['fleet-live-route-rest', selected?.trip?.id, selected?.trip?.next_stop_index],
    queryFn: () => fleetLiveService.getRouteThrough(restStops),
    enabled: restStops.length >= 2,
    staleTime: 10 * 60_000,
  });

  const eta = useMemo(
    () => {
      // Arrival is counted from the latest fleet refresh, so the clock moves on with each update.
      const now = dataUpdatedAt || Date.now();
      if (!selected) return null;
      if (routeFetched) return computeEta(selected, route ?? null, now);
      return routeTo ? null : computeEta(selected, null, now);
    },
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

  const share = () => {
    if (!selected) return;
    const text = buildEtaShareText(selected, eta, formatTime);
    window.open(whatsAppLink(null, text), '_blank', 'noopener');
    toast.success('ETA ready to send in WhatsApp');
  };

  // Bearing lives in CSS so markers don't re-render on every rotate frame.
  const syncCamera = useCallback(() => {
    const map = mapRef.current;
    const el = wrapRef.current;
    if (!map || !el) return;
    el.style.setProperty('--map-bearing', `${map.getBearing()}deg`);
  }, []);

  const snapshotView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    setView({
      zoom: map.getZoom(),
      bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
      tilted: Math.abs(map.getBearing()) > 1 || map.getPitch() > 1,
    });
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
    snapshotView();
  }, [syncCamera, snapshotView, theme]);

  // ── Route geometry ──
  const routeLine = useMemo(() => {
    if (!selected?.position || !routeTo) return null;
    const coords = route?.geometry ?? [[selected.position.lng, selected.position.lat], [routeTo.lng, routeTo.lat]];
    return { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } };
  }, [selected, route, routeTo]);

  // Later stops only get a line when it follows real roads — a straight line across the desert reads as a route and isn't one.
  const pendingLine = useMemo(() => {
    if (!restRoute || restStops.length < 2) return null;
    return { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: restRoute.geometry } };
  }, [restRoute, restStops]);
  const stopGroups = useMemo(() => (selected ? groupStops(selected) : []), [selected]);

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

      <div ref={wrapRef} className="absolute inset-0 isolate">
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
          onMoveEnd={snapshotView}
          onResize={snapshotView}
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
                paint={{ 'line-color': colors.line, 'line-opacity': 0.35, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 2, 14, 5] }} />
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
          {stopGroups.map((g) => (
            <StopPin key={`stop-${g.numbers.join('-')}`} group={g} eta={g.isNext && eta?.arrival ? formatTime(eta.arrival) : null} />
          ))}

          {clusters.map((c) => (
            <ClusterMarker
              key={`cluster-${c.id}`}
              lng={c.lng}
              lat={c.lat}
              count={c.count}
              tone={c.tone}
              onClick={() => {
                const zoom = Math.min(clusterIndex.getClusterExpansionZoom(c.id), 16);
                mapRef.current?.easeTo({ center: [c.lng, c.lat], zoom, duration: 800 });
              }}
            />
          ))}

          {singles.map((u) => (
            <LiveUnitMarker
              key={u.key}
              unit={u}
              selected={u.key === selectedKey}
              dimmed={!!selectedKey && u.key !== selectedKey}
              showLabel={labelled.has(u.key)}
              onSelect={select}
              onHover={setHoverKey}
            />
          ))}

          {hovered && <HoverPeek unit={hovered} />}
        </MapGL>
      </div>

      {/* ── Overlays ── */}
      <div className="pointer-events-none absolute inset-0 z-10 p-3">
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
              <div className={cn('pointer-events-auto flex w-fit max-w-full gap-0.5 rounded-xl p-1', GLASS)}>
                {LIVE_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    title={`${f.label} — ${counts[f.id]}`}
                    aria-label={`${f.label}, ${counts[f.id]}`}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-lg py-1 text-xs font-medium transition-colors',
                      compact ? 'px-2' : 'px-2.5',
                      filter === f.id ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10',
                    )}
                  >
                    {f.id === 'on_trip' && <span className={cn('size-1.5 rounded-full', TONE.active.dot)} />}
                    {f.id === 'delayed' && <span className={cn('size-1.5 rounded-full', TONE.delayed.dot)} />}
                    {f.id === 'free' && <span className={cn('size-1.5 rounded-full', TONE.free.dot)} />}
                    {f.id === 'offline' && <span className="size-1.5 rounded-full bg-slate-400" />}
                    {(!compact || f.id === 'all') && f.label}
                    <span className={cn('tabular-nums', (!compact || f.id === 'all') && 'opacity-60')}>{counts[f.id]}</span>
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
          {!compact && selected?.motion === 'moving' && selected.position?.speed_kph != null && (
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
            {/* Only when the map is turned or tilted — like Apple Maps, the compass appears when it has something to undo. */}
            {view?.tilted && (
              <CtlButton label="Face north and flatten" onClick={() => mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 700 })}>
                <Compass style={{ transform: 'rotate(calc(var(--map-bearing, 0deg) * -1 - 45deg))' }} className="transition-transform" />
              </CtlButton>
            )}
            <CtlButton label="Show all units" onClick={() => (selectedKey ? deselect() : fitAll())}><Focus /></CtlButton>
          </ControlGroup>
          <ControlGroup>
            <CtlButton label={theme === 'light' ? 'Dark map' : 'Light map'} onClick={toggleTheme}>{theme === 'light' ? <Moon /> : <Sun />}</CtlButton>
            <CtlButton label={expanded ? 'Exit full view' : 'Full view'} onClick={() => setExpanded((v) => !v)}>
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </CtlButton>
            <MapLegend />
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
