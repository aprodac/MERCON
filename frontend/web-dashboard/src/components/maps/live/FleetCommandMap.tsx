import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import MapGL, { Layer, Marker, Source, type MapRef } from 'react-map-gl/maplibre';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Supercluster from 'supercluster';
import { Compass, Focus, Map as MapIcon, Navigation, Maximize2, Minimize2, Minus, Moon, Plus, Search, SignalLow, Sun, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatInDeploymentTz, useDeploymentTimezone } from '@/lib/datetime';
import { whatsAppLink } from '@/lib/share';
import {
  LIVE_FILTERS, buildEtaShareText, computeEta, groupStops, groupStopsOf, isOffline, matchesFilter, matchesQuery, nextStop, pickLabels, routeBearing, timeAgo,
  unitPriority, unitTitle, type LiveFilter,
} from '@/lib/fleetLive';
import { fleetLiveService, type LiveStop, type LiveUnit } from '@/services/fleetLiveService';
import { SAUDI_BOUNDS_COORDS, SAUDI_CENTER, DEFAULT_SAUDI_ZOOM } from '@/utils/saudiMapConfig';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LiveUnitMarker } from './LiveUnitMarker';
import { ClusterMarker, ControlGroup, CtlButton, HoverPeek, MapLegend, StopPin, type StopPinTone } from './LiveMapBits';
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

/** A trip drawn from its stops alone — for trips with no truck reporting GPS (planned, or tracker offline). */
export interface PreviewTrip {
  id: string;
  title: string;
  subtitle?: string | null;
  stops: LiveStop[];
  next_stop_index: number | null;
  tone: StopPinTone;
}

const PREVIEW_LINE: Record<StopPinTone, string> = {
  planned: '#7c3aed',
  live: '#2563eb',
  done: '#059669',
  cancelled: '#a8a29e',
};

/** A search catchment drawn as a circle — "trucks near Riyadh", or each end of "Riyadh to Jeddah". */
export interface MapArea {
  id: string;
  label: string;
  lat: number;
  lng: number;
  radiusKm: number;
}

/** A circle as a 64-point polygon — MapLibre has no geodesic circle primitive. */
function circlePolygon(a: MapArea): [number, number][] {
  const pts: [number, number][] = [];
  const latR = a.radiusKm / 110.574;
  const lngR = a.radiusKm / (111.32 * Math.cos((a.lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * 2 * Math.PI;
    pts.push([a.lng + lngR * Math.cos(t), a.lat + latR * Math.sin(t)]);
  }
  return pts;
}

interface Props {
  className?: string;
  /** Ask the map to fly to this trip's truck; bump `focusNonce` to repeat the same trip. */
  focusTripId?: string | null;
  /** Same as `focusTripId`, for a unit picked by its key (a free truck has no trip). */
  focusUnitKey?: string | null;
  focusNonce?: number;
  /** Controlled filter and search — when set, the page's own sidebar owns them. */
  filter?: LiveFilter;
  query?: string;
  /** Hide the built-in search, filter chips and offline list (a sidebar shows them instead). */
  hideFinder?: boolean;
  /** Hide the full-view toggle — for a page where the map already fills the screen. */
  hideExpand?: boolean;
  /** Told whenever the selected unit changes, including clicks on the map itself. */
  onSelectedChange?: (unit: LiveUnit | null) => void;
  /** Draw this trip's stops and planned road route; bump `focusNonce` to re-frame it. */
  previewTrip?: PreviewTrip | null;
  onPreviewClose?: () => void;
  /** When set, only these units are drawn (search results, assign candidates). */
  onlyKeys?: ReadonlySet<string> | null;
  /** Catchment circles; the map frames them whenever the set changes. */
  areas?: MapArea[];
  /** Width in px of a panel floating over the map's left edge — overlays and framing keep clear of it. */
  insetLeft?: number;
  /** Extra controls for the top-right corner (e.g. a back button on a full-screen page). */
  topRight?: React.ReactNode;
}

/**
 * The dashboard's live fleet map: every truck and on-trip driver, CarPlay-style.
 * Click a unit to fly to it and see its trip, both GPS feeds, the road route to
 * the next stop with a drive-time ETA, and share that ETA on WhatsApp.
 */
export default function FleetCommandMap({
  className, focusTripId, focusUnitKey, focusNonce, filter: filterProp, query: queryProp, hideFinder, hideExpand,
  onSelectedChange, previewTrip, onPreviewClose, onlyKeys, areas, insetLeft = 0, topRight,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tz = useDeploymentTimezone();
  const formatTime = useCallback((d: Date) => formatInDeploymentTz(d, tz, 'HH:mm'), [tz]);

  const [theme, setTheme] = useState<LiveMapTheme>(readTheme);
  const [expanded, setExpanded] = useState(false);
  const [compact, setCompact] = useState(true);
  const [filterState, setFilter] = useState<LiveFilter>('all');
  const [queryState, setQuery] = useState('');
  const filter = filterProp ?? filterState;
  const query = queryProp ?? queryState;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  /** Driver view: camera low behind the selected arrow, facing where it is going. */
  const [pov, setPov] = useState(false);
  /** Trip overview: flat, north-up, fitted to the truck and every stop of its trip. */
  const [overview, setOverview] = useState(false);
  /** Either focus view hides the other trucks. */
  const focusView = pov || overview;
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
  const visible = useMemo(
    () => onMap.filter((u) => (onlyKeys ? onlyKeys.has(u.key) : matchesFilter(u, filter) && matchesQuery(u, query))),
    [onMap, filter, query, onlyKeys],
  );
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
    // After the size changes, re-centre on the selected unit with the new layout's padding.
    const t = setTimeout(() => {
      mapRef.current?.resize();
      const pos = selectedPosRef.current;
      if (pos) mapRef.current?.easeTo({ center: [pos.lng, pos.lat], padding: panelPaddingRef.current(), duration: 600 });
    }, 320);
    return () => clearTimeout(t);
  }, [expanded]);

  // ── Camera helpers ──
  const panelPadding = useCallback(
    () => (compact ? { top: 40, bottom: 190, left: 40 + insetLeft, right: 40 } : { top: 60, bottom: 60, left: 60 + insetLeft, right: 340 }),
    [compact, insetLeft],
  );
  // Read by the resize timer, which fires after the layout has already switched.
  const panelPaddingRef = useRef(panelPadding);
  panelPaddingRef.current = panelPadding;
  const selectedPosRef = useRef(selected?.position ?? null);
  selectedPosRef.current = selected?.position ?? null;

  const fitAll = useCallback(
    (animate = true) => {
      const map = mapRef.current;
      const b = boundsOf(visible.map((u) => u.position!));
      if (!map) return;
      if (!b) {
        map.flyTo({ center: [SAUDI_CENTER[1], SAUDI_CENTER[0]], zoom: DEFAULT_SAUDI_ZOOM, pitch: 0, bearing: 0 });
        return;
      }
      map.fitBounds(b, { padding: { top: 70, bottom: 70, right: 70, left: 70 + insetLeft }, maxZoom: 11, pitch: 0, bearing: 0, duration: animate ? 1200 : 0 });
    },
    [visible, insetLeft],
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

  const insetLeftRef = useRef(insetLeft);
  insetLeftRef.current = insetLeft;
  const onPreviewCloseRef = useRef(onPreviewClose);
  onPreviewCloseRef.current = onPreviewClose;

  const select = useCallback(
    (key: string) => {
      onPreviewCloseRef.current?.();
      setSelectedKey(key);
      setFollow(true);
      setPov(false);
      setOverview(false);
      const u = units.find((x) => x.key === key);
      if (u) flyToUnit(u);
    },
    [units, flyToUnit],
  );

  const deselect = useCallback(() => {
    setSelectedKey(null);
    setPov(false);
    setOverview(false);
    fitAll();
  }, [fitAll]);

  /** Top-down trip overview: every stop — done ones ticked, the rest numbered — and where the truck is now. */
  const showRoute = useCallback(() => {
    if (!selected?.position || !selected.trip) return;
    const pts = [selected.position, ...selected.trip.stops.filter((s) => s.lat != null && s.lng != null).map((s) => ({ lat: s.lat!, lng: s.lng! }))];
    const b = boundsOf(pts);
    setPov(false);
    setOverview(true);
    setFollow(false);
    if (b) mapRef.current?.fitBounds(b, { padding: { ...panelPadding(), top: 90 }, pitch: 0, bearing: 0, duration: 1400, maxZoom: 15 });
  }, [selected, panelPadding]);

  // ── Driver view ──
  // Heading when moving; otherwise the direction the road route leaves in, so a
  // parked truck still faces its next stop.
  const povBearing = useCallback(
    (u: LiveUnit) => {
      if (u.motion === 'moving' && u.position?.heading_deg != null) return u.position.heading_deg;
      return (route?.geometry ? routeBearing(route.geometry) : null) ?? mapRef.current?.getBearing() ?? 0;
    },
    [route],
  );
  // The arrow sits in the lower part of the view with the road ahead above it.
  const povPadding = useCallback(() => {
    const h = mapRef.current?.getContainer().clientHeight ?? 400;
    return { ...panelPadding(), top: Math.round(h * 0.5) };
  }, [panelPadding]);

  const enterPov = useCallback(() => {
    const map = mapRef.current;
    if (!map || !selected?.position) return;
    setOverview(false);
    setPov(true);
    setFollow(true);
    map.easeTo({
      center: [selected.position.lng, selected.position.lat],
      zoom: 17.5,
      pitch: 72,
      bearing: povBearing(selected),
      padding: povPadding(),
      duration: 1600,
      essential: true,
    });
  }, [selected, povBearing, povPadding]);

  /** Leave driver view or trip overview, back to the normal close-up of the truck. */
  const exitPov = useCallback(() => {
    setPov(false);
    setOverview(false);
    setFollow(true);
    const pos = selected?.position;
    mapRef.current?.easeTo({
      ...(pos ? { center: [pos.lng, pos.lat] as [number, number] } : {}),
      zoom: 14, pitch: 50, padding: panelPadding(), duration: 900,
    });
  }, [selected, panelPadding]);

  // Requests from outside (the inbox): select the trip's unit and fly to it.
  const handledFocus = useRef<number | undefined>(undefined);
  useEffect(() => {
    if ((!focusTripId && !focusUnitKey) || focusNonce === handledFocus.current || !data) return;
    handledFocus.current = focusNonce;
    const u = focusUnitKey ? units.find((x) => x.key === focusUnitKey) : units.find((x) => x.trip?.id === focusTripId);
    if (!u) return void toast.info('That trip has no truck or driver on the map');
    if (!u.position) return void toast.info(`${unitTitle(u)} hasn't reported a GPS position yet`);
    select(u.key);
  }, [focusTripId, focusUnitKey, focusNonce, data, units, select]);

  // Tell the page what is selected — only when the selection itself changes, not on every refresh.
  const onSelectedChangeRef = useRef(onSelectedChange);
  onSelectedChangeRef.current = onSelectedChange;
  const unitsRef = useRef(units);
  unitsRef.current = units;
  useEffect(() => {
    onSelectedChangeRef.current?.(selectedKey ? unitsRef.current.find((u) => u.key === selectedKey) ?? null : null);
  }, [selectedKey]);

  // ── Planned-route preview: a trip without a live truck, drawn from its stops ──
  const previewPoints = useMemo(
    () => (previewTrip?.stops ?? []).filter((s) => s.lat != null && s.lng != null).map((s) => ({ lat: s.lat!, lng: s.lng! })),
    [previewTrip],
  );
  const { data: previewRoute } = useQuery({
    queryKey: ['fleet-live-preview-route', previewTrip?.id, previewPoints.map((p) => `${p.lat},${p.lng}`).join(';')],
    queryFn: () => fleetLiveService.getRouteThrough(previewPoints),
    enabled: previewPoints.length >= 2,
    staleTime: 10 * 60_000,
  });
  const previewGroups = useMemo(() => (previewTrip ? groupStopsOf(previewTrip) : []), [previewTrip]);
  const previewLine = useMemo(() => {
    if (!previewTrip || previewPoints.length < 2) return null;
    const coords = previewRoute?.geometry ?? previewPoints.map((p) => [p.lng, p.lat] as [number, number]);
    return { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } };
  }, [previewTrip, previewPoints, previewRoute]);

  // A new preview (or the same one asked for again) clears the selection and frames every stop.
  const framedPreview = useRef<string | null>(null);
  const previewId = previewTrip?.id ?? null;
  useEffect(() => {
    if (!previewId) { framedPreview.current = null; return; }
    const frameKey = `${previewId}:${focusNonce ?? ''}`;
    if (framedPreview.current === frameKey) return;
    framedPreview.current = frameKey;
    setSelectedKey(null);
    setPov(false);
    setOverview(false);
    const b = boundsOf(previewPoints);
    if (!b) return void toast.info('None of this trip\'s stops have a map position');
    mapRef.current?.fitBounds(b, { padding: { top: 110, bottom: 70, left: 70 + insetLeftRef.current, right: 70 }, maxZoom: 13, pitch: 0, bearing: 0, duration: 1200 });
  }, [previewId, focusNonce, previewPoints]);

  // ── Search areas ──
  const areaShapes = useMemo(() => {
    if (!areas?.length) return null;
    return {
      type: 'FeatureCollection' as const,
      features: areas.map((a) => ({
        type: 'Feature' as const,
        properties: { id: a.id },
        geometry: { type: 'Polygon' as const, coordinates: [circlePolygon(a)] },
      })),
    };
  }, [areas]);
  const areasKey = (areas ?? []).map((a) => `${a.id}:${a.lat.toFixed(3)},${a.lng.toFixed(3)}:${a.radiusKm}`).join('|');
  const framedAreas = useRef('');
  useEffect(() => {
    if (!areasKey || framedAreas.current === areasKey || !areas?.length) {
      if (!areasKey) framedAreas.current = '';
      return;
    }
    framedAreas.current = areasKey;
    const b = boundsOf(areas.flatMap((a) => circlePolygon(a).map(([lng, lat]) => ({ lat, lng }))));
    if (b) mapRef.current?.fitBounds(b, { padding: { top: 90, bottom: 60, left: 60 + insetLeftRef.current, right: 60 }, maxZoom: 12, pitch: 0, bearing: 0, duration: 1100 });
  }, [areasKey, areas]);

  // First data: frame everything once — after the map has loaded, or the
  // padding (which keeps clear of a floating panel) is dropped.
  const [mapLoaded, setMapLoaded] = useState(false);
  useEffect(() => {
    if (!fittedOnce.current && data && mapLoaded && mapRef.current) {
      fittedOnce.current = true;
      fitAll(false);
    }
  }, [data, fitAll, mapLoaded]);

  // Follow the selected unit as fresh positions arrive.
  // Only a real change of position moves the camera. Selecting a unit and
  // entering driver view start their own zoom + tilt animation; an easeTo fired
  // here at the same moment would cancel it half-way (the map stayed zoomed out).
  const followLat = selected?.position?.lat;
  const followLng = selected?.position?.lng;
  const lastFollowed = useRef<{ key: string | null; lat?: number; lng?: number }>({ key: null });
  const povRef = useRef(pov);
  povRef.current = pov;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => {
    const prev = lastFollowed.current;
    lastFollowed.current = { key: selectedKey, lat: followLat, lng: followLng };
    if (!follow || followLat == null || followLng == null) return;
    if (prev.key !== selectedKey) return; // a new selection — its fly-to is in flight
    if (prev.lat === followLat && prev.lng === followLng) return; // nothing moved
    const u = selectedRef.current;
    if (povRef.current && u) {
      mapRef.current?.easeTo({ center: [followLng, followLat], bearing: povBearing(u), duration: 1200, padding: povPadding() });
    } else {
      mapRef.current?.easeTo({ center: [followLng, followLat], duration: 1200, padding: panelPadding() });
    }
  }, [followLat, followLng, selectedKey, follow, povBearing, povPadding, panelPadding]);

  // Escape: close details, then leave expanded view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // An open photo/video viewer handles its own Escape.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      if (focusView) exitPov();
      else if (selectedKey) deselect();
      else if (expanded) setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedKey, expanded, deselect, focusView, exitPov]);

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
      {expanded && <div className="fixed inset-0 -z-10 bg-charcoal-strong/40 backdrop-blur-sm" onClick={() => setExpanded(false)} />}

      <div ref={wrapRef} className="absolute inset-0 isolate">
        <MapGL
          ref={mapRef}
          mapStyle={LIVE_MAP_STYLES[theme]}
          initialViewState={{ longitude: SAUDI_CENTER[1], latitude: SAUDI_CENTER[0], zoom: DEFAULT_SAUDI_ZOOM }}
          maxBounds={MAX_BOUNDS}
          minZoom={3.5}
          maxZoom={19}
          maxPitch={75}
          dragRotate
          touchPitch
          attributionControl={false}
          onLoad={() => { onStyleLoad(); setMapLoaded(true); }}
          onStyleData={onStyleLoad}
          onMove={syncCamera}
          onMoveEnd={snapshotView}
          onResize={snapshotView}
          onDragStart={() => setFollow(false)}
          onClick={() => (selectedKey ? deselect() : previewTrip && onPreviewClose?.())}
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

          {areaShapes && (
            <Source id="live-areas" type="geojson" data={areaShapes}>
              <Layer id="live-areas-fill" type="fill" beforeId={firstSymbolId} paint={{ 'fill-color': '#0ea5e9', 'fill-opacity': 0.07 }} />
              <Layer id="live-areas-line" type="line" beforeId={firstSymbolId}
                paint={{ 'line-color': '#0284c7', 'line-width': 1.5, 'line-opacity': 0.7, 'line-dasharray': [3, 2] }} />
            </Source>
          )}
          {areas?.map((a) => (
            // Label on the circle's top edge, so it never covers the trucks inside it.
            <Marker key={`area-${a.id}`} longitude={a.lng} latitude={a.lat + a.radiusKm / 110.574} anchor="bottom" style={{ zIndex: 1 }}>
              <span className="pointer-events-none mb-1 block rounded-md bg-sky-700/90 px-1.5 py-0.5 text-[10.5px] font-semibold whitespace-nowrap text-white shadow">
                {a.label} · {a.radiusKm} km
              </span>
            </Marker>
          ))}

          {!selected && previewLine && previewTrip && (
            <Source id="live-preview" type="geojson" data={previewLine}>
              <Layer id="live-preview-casing" type="line" beforeId={firstSymbolId}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{ 'line-color': PREVIEW_LINE[previewTrip.tone], 'line-width': 12, 'line-opacity': 0.15, 'line-blur': 2 }} />
              <Layer id="live-preview-line" type="line" beforeId={firstSymbolId}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': PREVIEW_LINE[previewTrip.tone],
                  'line-width': ['interpolate', ['linear'], ['zoom'], 6, 2.5, 14, 6],
                  ...(previewRoute ? {} : { 'line-dasharray': [2, 1.5] }),
                }} />
            </Source>
          )}
          {!selected && previewGroups.map((g) => (
            <StopPin key={`preview-${g.numbers.join('-')}`} group={g} eta={null} tone={previewTrip!.tone} />
          ))}

          {/* Stops of the selected trip */}
          {stopGroups.map((g) => (
            <StopPin key={`stop-${g.numbers.join('-')}`} group={g} eta={g.isNext && eta?.arrival ? formatTime(eta.arrival) : null} />
          ))}

          {/* Driver view is about one truck — the others step aside. */}
          {!focusView && clusters.map((c) => (
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

          {(focusView ? singles.filter((u) => u.key === selectedKey) : singles).map((u) => (
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
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 p-3 transition-[left] duration-300" style={{ left: insetLeft }}>
        {focusView && selected && (
          <div className="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-charcoal/90 p-1 text-xs font-medium text-white shadow-lg backdrop-blur-md pointer-events-auto">
            <span className="px-2 font-mono">{unitTitle(selected)}</span>
            <span className="flex rounded-full bg-white/10 p-0.5">
              <button
                type="button"
                onClick={enterPov}
                aria-pressed={pov}
                className={cn('flex items-center gap-1 rounded-full px-2.5 py-1', pov ? 'bg-white text-charcoal' : 'hover:bg-white/15')}
              >
                <Navigation className="size-3" /> Driver view
              </button>
              {selected.trip && (
                <button
                  type="button"
                  onClick={showRoute}
                  aria-pressed={overview}
                  className={cn('flex items-center gap-1 rounded-full px-2.5 py-1', overview ? 'bg-white text-charcoal' : 'hover:bg-white/15')}
                >
                  <MapIcon className="size-3" /> Trip overview
                </button>
              )}
            </span>
            {pov && !follow && (
              <button type="button" onClick={enterPov} className="rounded-full bg-white/15 px-2.5 py-1 hover:bg-white/25">Recenter</button>
            )}
            <button type="button" onClick={exitPov} className="rounded-full bg-white/15 px-2.5 py-1 hover:bg-white/25">Exit</button>
          </div>
        )}
        {/* Top-left: next-stop card when a trip is selected in the full layout, otherwise search + filters */}
        <div className="absolute top-3 left-3 flex max-w-[calc(100%-5rem)] flex-col gap-2">
          {selected && compact ? null : selected && selected.trip && stop ? (
            <NextStopCard unit={selected} eta={eta} />
          ) : previewTrip ? (
            <div className={cn('pointer-events-auto flex max-w-[320px] items-start gap-2.5 rounded-xl px-3 py-2.5', GLASS)}>
              <span className="mt-1 size-2 shrink-0 rounded-full" style={{ background: PREVIEW_LINE[previewTrip.tone] }} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[13px] font-semibold text-foreground">{previewTrip.title}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {previewTrip.subtitle ?? (previewRoute ? 'Planned road route' : 'Planned stops')}
                </p>
              </div>
              {onPreviewClose && (
                <button type="button" onClick={onPreviewClose} aria-label="Close trip preview" className="text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          ) : hideFinder ? null : (
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
                      filter === f.id ? 'bg-charcoal text-white shadow-sm dark:bg-white dark:text-slate-900' : 'text-muted-foreground hover:bg-charcoal-strong/5 hover:text-foreground dark:hover:bg-white/10',
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
          <div className="flex items-center gap-2">
            <div className={cn('pointer-events-auto flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-medium', GLASS)}>
              <span className="relative flex size-2">
                {!isError && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
                <span className={cn('relative inline-flex size-2 rounded-full', isError ? 'bg-rose-500' : 'bg-emerald-500')} />
              </span>
              <span className="text-foreground">{isError ? 'Connection lost' : 'Live'}</span>
              {lastUpdate && !isError && <span className="text-muted-foreground">· {lastUpdate}</span>}
            </div>
            {topRight && <div className="pointer-events-auto flex items-center gap-2">{topRight}</div>}
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
            <LiveUnitPanel unit={selected} eta={eta} formatTime={formatTime} compact={false} onClose={deselect} onShare={share} onShowRoute={showRoute} expanded={expanded} onToggleExpand={hideExpand ? undefined : () => setExpanded((v) => !v)} pov={pov} onTogglePov={pov ? exitPov : enterPov} />
          </div>
        )}

        {/* Bottom-left: ETA strip, or the offline list */}
        <div className="absolute bottom-3 left-3 flex items-end gap-2">
          {selected && !compact && eta && selected.trip ? (
            <EtaStrip eta={eta} formatTime={formatTime} />
          ) : !selected && !hideFinder && offlineUnits.length > 0 ? (
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
            {!hideExpand && (
              <CtlButton label={expanded ? 'Exit full view' : 'Full view'} onClick={() => setExpanded((v) => !v)}>
                {expanded ? <Minimize2 /> : <Maximize2 />}
              </CtlButton>
            )}
            <MapLegend />
          </ControlGroup>
        </div>

        {/* Compact: one bottom card */}
        {selected && compact && (
          <div className="absolute right-3 bottom-3 left-3">
            <LiveUnitPanel unit={selected} eta={eta} formatTime={formatTime} compact onClose={deselect} onShare={share} onShowRoute={showRoute} expanded={expanded} onToggleExpand={hideExpand ? undefined : () => setExpanded((v) => !v)} pov={pov} onTogglePov={pov ? exitPov : enterPov} />
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
