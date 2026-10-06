/**
 * Trucks on one MapLibre map — the phone version of the web's FleetCommandMap.
 *
 *   Markers match the web live map: a white disc with a glyph coloured by the
 *   trip — on trip blue · delayed red · scheduled violet · free green. The
 *   glyph's shape is the movement: an arrow turned to the heading (moving), a
 *   rounded square (stopped), a hollow grey ring with its age (GPS gone
 *   quiet). A small dark badge says which GPS is live: truck, phone or both.
 *   Trucks close together on screen merge into a numbered group whose bar
 *   shows the mix (on trip · scheduled · free); delayed trucks and the picked
 *   one always stand alone. Tapping a group zooms in until it splits and
 *   lists its trucks in the sheet. Between refreshes a
 *   moving truck glides to its new spot instead of jumping. The basemap uses
 *   the web's Apple Maps-style palette (mapStyle.ts).
 *   Pins are native Markers with their own onPress — a touchable inside a map
 *   annotation never gets the tap — and draw PNG icons, which annotations
 *   show reliably where SVG icons came out blank. On iOS a marker re-drawn
 *   after a tap fires the map's own onPress at the same spot, which used to
 *   undo the pick at once; so a map tap is hit-tested against the pins
 *   (handleMapPress) and both paths go through one dedup'd pressTarget.
 *   Trucks carry their plate at every zoom — most urgent first, skipping any
 *   label that would overlap another. Picking a truck flies in to street level. The selected truck gets its road route
 *   to the next stop (real roads when routing is up, dashed straight line
 *   otherwise), a faint line through the rest of the trip (only when it
 *   follows real roads), a grey breadcrumb trail of where it has driven on
 *   this trip, and its trip's numbered stops. While following, the
 *   camera moves with the truck as fresh positions arrive; dragging the map
 *   stops that until recenter().
 *
 * Views (driven through the ref, like the web map's controls):
 *   2D / 3D       flat, or tilted 55° — Liberty's 3D buildings rise from ~z14
 *   Driver view   low behind the selected truck, facing where it's going
 *   Trip overview flat and north-up, framing the truck and every stop
 *   Fit all · Face north · Zoom in / out; light or dark basemap.
 * Lane search ("riyadh to jeddah"): a green A and red B pin, the road
 * between them in violet, the trucks that matter to the lane framed, and
 * free trucks near A ringed green.
 * Used full-screen on the Fleet map page and as a small, non-interactive
 * preview on Home. Falls back to a plain panel on builds without MapLibre.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View, Text, Image, StyleSheet, TurboModuleRegistry, useWindowDimensions } from 'react-native';
import { MapPin } from 'lucide-react-native';
import Supercluster from 'supercluster';
import type { LiveUnit } from '../../lib/operator';
import { feedsApart, isDelayed, isFree, isLongStop, isSilent, lateMin, lateText, located, minText, shortAgo, stoppedMin, tripProgress, unitPriority } from './fleetModel';
import { quietOfflineTileErrors } from '../../lib/mapLogs';
import { MAP_BG, MAP_STYLES, loadMapStyle, readyMapStyle, type MapTheme, type StyleJson } from './mapStyle';

const hasNativeMap = (() => {
  try {
    return !!TurboModuleRegistry.get('MLRNNetworkModule');
  } catch {
    return false;
  }
})();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ML: typeof import('@maplibre/maplibre-react-native') | null = hasNativeMap ? require('@maplibre/maplibre-react-native') : null;
quietOfflineTileErrors(ML);

export { MAP_STYLES, type MapTheme };

/** How long the map waits for its coloured style before opening on the plain one. */
const STYLE_WAIT_MS = 1500;
/** Matches the camera's follow animation, so a followed truck and the map move together. */
const GLIDE_MS = 1200;
/** Further than this (≈5 km) is a jump — a tracker back online — not driving: snap. */
const GLIDE_MAX_DEG = 0.05;
/** A group's mix bar, left to right (delayed trucks are never grouped). */
const MIX_ORDER = ['active', 'upcoming', 'free'] as const;
type Mix = Record<(typeof MIX_ORDER)[number], number>;

/** What a marker's colour means — the trip, not the GPS (web `liveMapStyle.ts` TONE). */
export type UnitTone = 'active' | 'delayed' | 'upcoming' | 'free';

export const TONE: Record<UnitTone, { color: string; label: string }> = {
  active: { color: '#2563EB', label: 'On trip' },
  delayed: { color: '#E11D48', label: 'Delayed' },
  upcoming: { color: '#7C3AED', label: 'Scheduled' },
  free: { color: '#059669', label: 'Free' },
};

export function unitTone(u: LiveUnit): UnitTone {
  if (!u.trip) return 'free';
  return u.trip.phase === 'delayed' ? 'delayed' : u.trip.phase === 'upcoming' ? 'upcoming' : 'active';
}

/** Grey of a truck whose GPS has gone quiet (its ring, the No GPS chip). */
export const SILENT_COLOR = '#94A3B8';

export type UnitState = 'delayed' | 'silent' | 'moving' | 'upcoming' | 'free';

export const STATE_STYLE: Record<UnitState, { color: string; label: string }> = {
  delayed: TONE.delayed,
  silent: { color: SILENT_COLOR, label: 'No GPS' },
  moving: TONE.active,
  upcoming: TONE.upcoming,
  free: TONE.free,
};

/** One label for a card: delayed wins, then silent, then trip / scheduled / free. */
export function unitState(u: LiveUnit, now = Date.now()): UnitState {
  if (isDelayed(u)) return 'delayed';
  if (isSilent(u, now)) return 'silent';
  if (u.trip?.phase === 'upcoming') return 'upcoming';
  return isFree(u) ? 'free' : 'moving';
}

export const ICONS = {
  // Drawn pointing north, so the heading is the rotation; tinted to the trip's colour.
  nav: require('./icons/nav-white.png'),
  // The live-GPS badge: truck tracker, driver's phone.
  truck: require('./icons/truck-white.png'),
  person: require('./icons/person-white.png'),
};

/** Lane search: start, end and the road between them. */
export const LANE_A = '#16A34A';
export const LANE_B = '#D92D20';
const LANE_VIOLET = '#7C5CFC';

/** Trucks closer than this many screen pixels merge into a group. */
const GROUP_RADIUS_PX = 50;
/** From this zoom up every truck is drawn on its own. */
const GROUP_MAX_ZOOM = 14;
/** Picking a truck zooms in at least this far — street level, like the web map. */
const PICK_ZOOM = 14;
/** Picking a truck tilts the map this much (the web's 55°). */
export const PICK_PITCH = 55;
/** A map tap this close (screen px) to a pin or group counts as tapping it. */
const HIT_PX = 30;
/** The same pin pressed again this soon is the echo of one tap (marker + map both report it). */
const ECHO_MS = 800;
/** The time of a tap (read in press handlers, never while rendering). */
const tapTime = () => Date.now();

type Target = { kind: 'unit'; key: string } | { kind: 'group'; id: number; lng: number; lat: number };

type GroupProps = { key: string } & Mix;

type Bounds = [number, number, number, number];
type LngLat = [number, number];

function boundsOf(pts: { lat: number; lng: number }[], minSpan = 0.05, pad = 0.1): Bounds | null {
  if (pts.length === 0) return null;
  let [w, s, e, n] = [pts[0].lng, pts[0].lat, pts[0].lng, pts[0].lat];
  for (const p of pts) {
    w = Math.min(w, p.lng); e = Math.max(e, p.lng); s = Math.min(s, p.lat); n = Math.max(n, p.lat);
  }
  if (e - w < minSpan) { w -= pad; e += pad; }
  if (n - s < minSpan) { s -= pad; n += pad; }
  return [w, s, e, n];
}

/** Screen pixel of a point at a zoom (Web Mercator, 512 px tiles), turned to the map's bearing. */
function toScreen(p: { lat: number; lng: number }, zoom: number, bearing: number): [number, number] {
  const size = 512 * 2 ** zoom;
  const x = ((p.lng + 180) / 360) * size;
  const r = (p.lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * size;
  const b = (-bearing * Math.PI) / 180;
  return [x * Math.cos(b) - y * Math.sin(b), x * Math.sin(b) + y * Math.cos(b)];
}

/**
 * Which trucks get a plate label: most urgent first, each placed under its
 * pin and dropped when it would cover another label or pin.
 */
function pickLabels(
  items: { key: string; x: number; y: number; text: string; priority: number }[],
  /** Group bubbles: labels must not cover them either. */
  others: { x: number; y: number }[],
): Set<string> {
  type Box = [number, number, number, number];
  const hit = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const pinBox = (p: { x: number; y: number }): Box => [p.x - 21, p.y - 21, p.x + 21, p.y + 21];
  const pins = items.map((i) => ({ key: i.key, box: pinBox(i) }));
  const groups = others.map(pinBox);
  const taken: Box[] = [];
  const out = new Set<string>();
  for (const i of [...items].sort((a, b) => b.priority - a.priority)) {
    const w = i.text.length * 7 + 12;
    const box: Box = [i.x - w / 2, i.y + BOX / 2, i.x + w / 2, i.y + BOX / 2 + 20];
    if (taken.some((t) => hit(t, box)) || groups.some((g) => hit(g, box)) || pins.some((p) => p.key !== i.key && hit(p.box, box))) continue;
    taken.push(box);
    out.add(i.key);
  }
  return out;
}

/** A truck's label: its plate, plus how long ago it was seen when its GPS has gone quiet. */
function labelText(u: LiveUnit, now: number): string {
  const age = isSilent(u, now) ? shortAgo(u.position?.recorded_at, now) : '';
  return age ? `${u.vehicle!.plate_number} · ${age}` : u.vehicle!.plate_number;
}

/** A circle as a 64-point polygon — MapLibre has no geodesic circle (web FleetCommandMap `circlePolygon`). */
function circleOf(a: { lat: number; lng: number; km: number }): GeoJSON.Feature {
  const pts: LngLat[] = [];
  const latR = a.km / 110.574;
  const lngR = a.km / (111.32 * Math.cos((a.lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * 2 * Math.PI;
    pts.push([a.lng + lngR * Math.cos(t), a.lat + latR * Math.sin(t)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } };
}

/** Compass bearing from a to b, degrees clockwise from north. */
function bearingBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** The camera state the page shows controls for. */
export interface MapView { zoom: number; pitch: number; bearing: number; center?: LngLat }
export type FocusMode = 'none' | 'driver' | 'overview';

export interface FleetMapHandle {
  fitAll(): void;
  /** Frame these trucks (a group's list → "Zoom to these"). */
  fitKeys(keys: string[]): void;
  zoomBy(delta: number): void;
  faceNorth(): void;
  set3D(on: boolean): void;
  driverView(): void;
  tripOverview(): void;
  /** Back on the selected truck in the current view, following it again. */
  recenter(): void;
}

interface Props {
  units: LiveUnit[];
  selected?: string | null;
  onSelect?: (key: string | null) => void;
  interactive?: boolean;
  theme?: MapTheme;
  /** Tilted by default when a truck is picked (the 3D toggle's state). */
  tilted?: boolean;
  /** Driver view / trip overview show only the selected truck. */
  focusMode?: FocusMode;
  /** Road route from the selected truck to its next stop; null → dashed straight line. */
  routeLine?: LngLat[] | null;
  /** A place to frame (city search): its centre and radius in km. */
  focus?: { lat: number; lng: number; km: number; label?: string } | null;
  /** Extra space kept clear at the top/bottom (overlaid controls, the card). */
  padding?: { top: number; bottom: number };
  onViewChange?: (v: MapView) => void;
  /** A group of trucks that sit on the same spot was tapped — show them as a list. */
  onGroupPress?: (keys: string[]) => void;
  /** The rest of the trip after the next stop, along real roads; nothing drawn when null. */
  restLine?: LngLat[] | null;
  /** Where the selected truck has driven on this trip (driver phone GPS), oldest first. */
  trail?: LngLat[] | null;
  /** Keep the camera on the selected truck as it moves. */
  follow?: boolean;
  /** The user moved the map by hand (the page turns follow off). */
  onUserMove?: () => void;
  /** A lane search: its two ends and the road between them (null → straight dashed line). */
  lane?: { from: { label: string; lat: number; lng: number }; to: { label: string; lat: number; lng: number }; line: LngLat[] | null } | null;
  /** Trucks drawn with a green ring (free near the lane's start). */
  ringed?: Set<string>;
  /** Where to open instead of framing every truck (the view saved from last time). */
  initialCamera?: { center: LngLat; zoom: number } | null;
  /** A long press on the map — "trucks near here". */
  onLongPress?: (at: { lat: number; lng: number }) => void;
}

export const FleetMap = forwardRef<FleetMapHandle, Props>(function FleetMap({
  units, selected, onSelect, interactive = false, theme = 'light', tilted = false, focusMode = 'none',
  routeLine, focus, padding = { top: 40, bottom: 40 }, onViewChange, onGroupPress, restLine, trail, follow = true, onUserMove,
  initialCamera, onLongPress, lane, ringed,
}, ref) {
  const { height } = useWindowDimensions();
  const points = useMemo(() => units.filter(located), [units]);
  // A lane's ends count as points too, so its map shows even with no truck on it.
  const bounds = useMemo(() => boundsOf([...points.map((u) => u.position!), ...(lane ? [lane.from, lane.to] : [])]), [points, lane]);
  const laneKey = lane ? `${lane.from.lat},${lane.from.lng}>${lane.to.lat},${lane.to.lng}` : null;
  const laneFeature = useMemo<GeoJSON.Feature | null>(() => {
    if (!lane) return null;
    const coords = lane.line && lane.line.length > 1 ? lane.line : [[lane.from.lng, lane.from.lat], [lane.to.lng, lane.to.lat]];
    return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } };
  }, [lane]);
  const sel = points.find((u) => u.key === selected) ?? null;
  const camera = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const zoomRef = useRef(5);
  const [view, setView] = useState<MapView>({ zoom: 5, pitch: 0, bearing: 0 });
  // What's on screen when the camera settles — drives grouping.
  const [area, setArea] = useState<{ bbox: Bounds; zoom: number } | null>(null);
  const pad = { top: padding.top, bottom: padding.bottom, left: 50, right: 50 };
  // The clock for "no GPS for 30 min" and the age tags; ticks so they don't go stale on an open map.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // The basemap opens already coloured; on a theme switch the old style stays up until the new one is ready.
  const [loaded, setLoaded] = useState<{ theme: MapTheme; style: StyleJson | string } | null>(null);
  const style = loaded?.theme === theme ? loaded.style : readyMapStyle(theme) ?? loaded?.style ?? null;
  useEffect(() => {
    if (readyMapStyle(theme)) return;
    let alive = true;
    // Don't wait for ever: after a moment the plain style is used, and kept for this map.
    const plain = () => alive && setLoaded((cur) => (cur?.theme === theme ? cur : { theme, style: MAP_STYLES[theme] }));
    const timer = setTimeout(plain, STYLE_WAIT_MS);
    loadMapStyle(theme)
      .then((st) => alive && setLoaded((cur) => (cur?.theme === theme ? cur : { theme, style: st })))
      .catch(plain);
    return () => { alive = false; clearTimeout(timer); };
  }, [theme]);

  // The selected truck's trip: its stops (numbered) and where it's heading.
  const stops = useMemo(() => (sel?.trip?.stops ?? []).filter((s) => s.lat != null && s.lng != null && !(s.lat === 0 && s.lng === 0)), [sel]);
  const next = sel?.trip && sel.trip.next_stop_index != null ? sel.trip.stops[sel.trip.next_stop_index] : null;
  const toNext = useMemo<GeoJSON.Feature | null>(() => {
    if (!sel?.position || !next || next.lat == null || next.lng == null) return null;
    const coords = routeLine && routeLine.length > 1 ? routeLine : [[sel.position.lng, sel.position.lat], [next.lng, next.lat]];
    return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } };
  }, [sel, next, routeLine]);

  // Group nearby trucks; the picked one always stands on its own.
  const groupIndex = useMemo(() => {
    const index = new Supercluster<GroupProps, Mix>({
      radius: GROUP_RADIUS_PX,
      maxZoom: GROUP_MAX_ZOOM,
      map: (p) => ({ active: p.active, upcoming: p.upcoming, free: p.free }),
      reduce: (acc, p) => { acc.active += p.active; acc.upcoming += p.upcoming; acc.free += p.free; },
    });
    // A late truck is what this map is looked at for, so it never hides in a group.
    index.load(points.filter((u) => u.key !== selected && !isDelayed(u)).map((u) => {
      const t = unitTone(u);
      return {
        type: 'Feature' as const,
        properties: { key: u.key, active: +(t === 'active'), upcoming: +(t === 'upcoming'), free: +(t === 'free') },
        geometry: { type: 'Point' as const, coordinates: [u.position!.lng, u.position!.lat] },
      };
    }));
    return index;
  }, [points, selected]);

  const { groups, singles } = useMemo(() => {
    const out = { groups: [] as { id: number; lng: number; lat: number; count: number; mix: Mix }[], singles: [] as LiveUnit[] };
    if (focusMode !== 'none' && sel) { out.singles = [sel]; return out; }
    const byKey = new globalThis.Map(points.map((u) => [u.key, u]));
    const bbox = area?.bbox ?? bounds;
    if (!bbox) return out;
    // A little past the screen edge, so groups don't pop in while panning.
    const [w, s, e, n] = bbox;
    const dx = (e - w) * 0.2;
    const dy = (n - s) * 0.2;
    for (const f of groupIndex.getClusters([w - dx, Math.max(-85, s - dy), e + dx, Math.min(85, n + dy)], Math.floor(area?.zoom ?? view.zoom))) {
      const [lng, lat] = f.geometry.coordinates;
      const p = f.properties as Partial<GroupProps> & { cluster?: boolean; cluster_id?: number; point_count?: number };
      if (p.cluster) out.groups.push({ id: p.cluster_id!, lng, lat, count: p.point_count!, mix: { active: p.active ?? 0, upcoming: p.upcoming ?? 0, free: p.free ?? 0 } });
      else if (p.key && byKey.has(p.key)) out.singles.push(byKey.get(p.key)!);
    }
    for (const u of points) if (isDelayed(u) && u.key !== selected) out.singles.push(u);
    if (sel) out.singles.push(sel);
    return out;
  }, [groupIndex, points, area, bounds, focusMode, sel, selected, view.zoom]);

  // Plates on the trucks standing alone, once zoomed in far enough to read them.
  const labelled = useMemo(() => {
    if (!area) return new Set(selected ? [selected] : []);
    const { zoom } = area;
    const items = singles.filter((u) => u.vehicle?.plate_number).map((u) => {
      const [x, y] = toScreen(u.position!, zoom, view.bearing);
      return { key: u.key, x, y, text: labelText(u, now), priority: unitPriority(u) + (u.key === selected ? 100 : 0) };
    });
    const others = groups.map((g) => {
      const [x, y] = toScreen(g, zoom, view.bearing);
      return { x, y };
    });
    return pickLabels(items, others);
  }, [singles, groups, area, view.bearing, selected, now]);

  const pressGroup = (g: { id: number; lng: number; lat: number }) => {
    let keys: string[] = [];
    let zoom = GROUP_MAX_ZOOM;
    try {
      keys = groupIndex.getLeaves(g.id, Infinity).map((f) => (f.properties as GroupProps).key);
      zoom = groupIndex.getClusterExpansionZoom(g.id);
    } catch {
      return; // the group was regrouped since it was drawn
    }
    // Zoom in until the group splits (trucks on one spot: as far as the street), and list them.
    const set = new Set(keys);
    const b = boundsOf(points.filter((u) => set.has(u.key)).map((u) => u.position!), 0.002, 0.004);
    const target = Math.min(Math.max(zoom + 0.5, zoomRef.current + 1), 16);
    if (b && zoom > GROUP_MAX_ZOOM) camera.current?.fitBounds(b, { padding: pad, pitch: 0, bearing: 0, duration: 700 });
    else camera.current?.easeTo?.({ center: [g.lng, g.lat], zoom: target, padding: pad, duration: 700 });
    onGroupPress?.(keys);
  };

  // One tap can arrive twice (the marker's onPress and the map's); act on it once.
  const lastPress = useRef<{ id: string; at: number }>({ id: '', at: 0 });
  const pressTarget = (t: Target) => {
    const id = t.kind === 'unit' ? `u:${t.key}` : `g:${t.id}`;
    const at = tapTime();
    if (lastPress.current.id === id && at - lastPress.current.at < ECHO_MS) return;
    lastPress.current = { id, at };
    if (t.kind === 'unit') onSelect?.(t.key);
    else pressGroup(t);
  };

  // A tap on the map: the pin or group under the finger if there is one, else clear the pick.
  const handleMapPress = async (point: [number, number]) => {
    const cands: { t: Target; lng: number; lat: number }[] = [
      ...groups.map((g) => ({ t: { kind: 'group' as const, id: g.id, lng: g.lng, lat: g.lat }, lng: g.lng, lat: g.lat })),
      ...singles.map((u) => ({ t: { kind: 'unit' as const, key: u.key }, lng: u.position!.lng, lat: u.position!.lat })),
    ];
    let best: { t: Target; d: number } | null = null;
    try {
      const pts: [number, number][] = await Promise.all(cands.map((c) => mapRef.current.project([c.lng, c.lat])));
      pts.forEach((p, i) => {
        const d = Math.hypot(p[0] - point[0], p[1] - point[1]);
        if (d <= HIT_PX && (!best || d < best.d)) best = { t: cands[i].t, d };
      });
    } catch {
      // projection unavailable — treat as an empty-map tap
    }
    if (best) { pressTarget((best as { t: Target }).t); return; }
    // The echo of a pin tap that missed (the camera already moved off it) must not undo the pick.
    if (tapTime() - lastPress.current.at < ECHO_MS) return;
    onSelect?.(null);
  };

  const headingOf = (u: LiveUnit): number => {
    if (u.motion === 'moving' && u.position?.heading_deg != null) return u.position.heading_deg;
    if (routeLine && routeLine.length > 1) return bearingBetween({ lng: routeLine[0][0], lat: routeLine[0][1] }, { lng: routeLine[1][0], lat: routeLine[1][1] });
    if (u.position && next?.lat != null && next.lng != null) return bearingBetween(u.position, { lat: next.lat, lng: next.lng });
    return 0;
  };

  const flyToSelected = (u: LiveUnit, pitch: number) => {
    camera.current?.easeTo?.({
      center: [u.position!.lng, u.position!.lat],
      zoom: Math.max(zoomRef.current, PICK_ZOOM),
      pitch,
      bearing: pitch > 0 && u.motion === 'moving' && u.position?.heading_deg != null ? u.position.heading_deg : 0,
      padding: pad,
      duration: 1400,
    });
  };

  const driverView = () => {
    if (!sel?.position) return;
    camera.current?.easeTo?.({
      center: [sel.position.lng, sel.position.lat],
      zoom: 17,
      pitch: 70,
      bearing: headingOf(sel),
      // The truck sits low on screen with the road ahead above it.
      padding: { ...pad, top: Math.round(height * 0.45) },
      duration: 1400,
    });
  };

  const tripOverview = () => {
    if (!sel?.position) return;
    const b = boundsOf([sel.position, ...stops.map((s) => ({ lat: s.lat!, lng: s.lng! }))], 0.02, 0.05);
    if (b) camera.current?.fitBounds(b, { padding: pad, pitch: 0, bearing: 0, duration: 1000 });
  };

  useImperativeHandle(ref, () => ({
    fitAll() {
      if (bounds) camera.current?.fitBounds(bounds, { padding: pad, pitch: 0, bearing: 0, duration: 800 });
    },
    fitKeys(keys: string[]) {
      const set = new Set(keys);
      const b = boundsOf(points.filter((u) => set.has(u.key)).map((u) => u.position!), 0.005, 0.01);
      if (b) camera.current?.fitBounds(b, { padding: pad, pitch: 0, bearing: 0, duration: 900 });
    },
    zoomBy(delta: number) {
      camera.current?.zoomTo(Math.max(3, Math.min(19, zoomRef.current + delta)), { duration: 250 });
    },
    faceNorth() {
      mapRef.current?.getCenter().then((center: LngLat) => camera.current?.easeTo({ center, bearing: 0, pitch: 0, duration: 600 })).catch(() => {});
    },
    set3D(on: boolean) {
      if (sel?.position) { flyToSelected(sel, on ? 55 : 0); return; }
      mapRef.current?.getCenter()
        .then((center: LngLat) => camera.current?.easeTo({ center, pitch: on ? 55 : 0, zoom: on ? Math.max(zoomRef.current, 6) : zoomRef.current, duration: 700 }))
        .catch(() => {});
    },
    driverView,
    recenter() {
      if (!sel?.position) return;
      if (focusMode === 'driver') driverView();
      else if (focusMode === 'overview') tripOverview();
      else flyToSelected(sel, tilted ? 55 : 0);
    },
    tripOverview,
  }));

  // Picking a truck flies to it (tilted when 3D is on); a lane frames both ends and its trucks; a city search frames the city.
  useEffect(() => {
    if (!interactive || !camera.current) return;
    if (sel?.position) flyToSelected(sel, tilted ? 55 : 0);
    else if (lane) {
      const b = boundsOf([lane.from, lane.to, ...points.map((u) => u.position!)], 0.2, 0.3);
      if (b) camera.current.fitBounds(b, { padding: pad, pitch: 0, bearing: 0, duration: 800 });
    } else if (focus) {
      const d = focus.km / 111;
      camera.current.fitBounds([focus.lng - d, focus.lat - d, focus.lng + d, focus.lat + d], { padding: pad, pitch: 0, bearing: 0, duration: 700 });
    }
    // Only a new selection or search moves the camera, not padding/tilt changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, sel?.key, focus?.lat, focus?.lng, focus?.km, laneKey]);

  // Follow the selected truck as fresh positions arrive (a new pick is handled above).
  const followLat = sel?.position?.lat;
  const followLng = sel?.position?.lng;
  const lastFollowed = useRef<{ key: string | null; lat?: number; lng?: number }>({ key: null });
  useEffect(() => {
    const prev = lastFollowed.current;
    lastFollowed.current = { key: sel?.key ?? null, lat: followLat, lng: followLng };
    if (!interactive || !follow || !sel || followLat == null || followLng == null) return;
    if (prev.key !== sel.key || (prev.lat === followLat && prev.lng === followLng)) return;
    if (focusMode === 'overview') return; // the whole trip is framed — the truck stays in it
    if (focusMode === 'driver') {
      camera.current?.easeTo?.({ center: [followLng, followLat], bearing: headingOf(sel), padding: { ...pad, top: Math.round(height * 0.45) }, duration: 1200 });
    } else {
      camera.current?.easeTo?.({ center: [followLng, followLat], padding: pad, duration: 1200 });
    }
    // Only a new position moves the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followLat, followLng, sel?.key, follow, interactive]);

  if (!ML || !bounds) {
    return <Fallback text={!ML ? 'Map needs the latest app update' : 'No truck locations match'} />;
  }
  if (!style) return <View style={[StyleSheet.absoluteFill, { backgroundColor: MAP_BG[theme] }]} />;
  const { Map, Camera, GeoJSONSource, Layer, ViewAnnotation, Marker } = ML;
  const apart = sel && feedsApart(sel) && sel.vehicle_gps && sel.driver_gps ? { v: sel.vehicle_gps, d: sel.driver_gps } : null;
  const dark = theme === 'dark';
  // Markers stand upright but a heading arrow turns with the map.
  const mapBearing = view.bearing;

  return (
    <Map
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      // Our style JSON is the fetched MapLibre style, recoloured.
      mapStyle={style as string | MapStyleSpec}
      logo={false}
      compass={false}
      scaleBar={false}
      attribution={false}
      dragPan={interactive}
      touchZoom={interactive}
      doubleTapZoom={interactive}
      touchRotate={interactive}
      touchPitch={interactive}
      onPress={interactive && onSelect ? (e) => { handleMapPress(e.nativeEvent.point).catch(() => {}); } : undefined}
      onLongPress={interactive && onLongPress ? (e) => onLongPress({ lng: e.nativeEvent.lngLat[0], lat: e.nativeEvent.lngLat[1] }) : undefined}
      onRegionDidChange={(e) => {
        const v = { zoom: e.nativeEvent.zoom, pitch: e.nativeEvent.pitch, bearing: e.nativeEvent.bearing, center: e.nativeEvent.center };
        zoomRef.current = v.zoom;
        setView(v);
        setArea({ bbox: e.nativeEvent.bounds, zoom: v.zoom });
        onViewChange?.(v);
        if (e.nativeEvent.userInteraction) onUserMove?.();
      }}
    >
      {interactive ? (
        <Camera ref={camera} initialViewState={initialCamera ? { center: initialCamera.center, zoom: initialCamera.zoom } : { bounds, padding: pad }} />
      ) : (
        <Camera bounds={bounds} padding={{ top: padding.top, bottom: padding.bottom, left: 30, right: 30 }} duration={0} />
      )}

      {/* Breadcrumb trail: where the picked truck has been on this trip, under everything else. */}
      {trail && trail.length > 1 && sel ? (
        <GeoJSONSource id="trip-trail" data={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: trail } }}>
          <Layer id="trip-trail-casing" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': '#FFFFFF', 'line-width': 6, 'line-opacity': dark ? 0.15 : 0.8 }} />
          <Layer id="trip-trail-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': dark ? '#C9C9D1' : '#3E3C3D', 'line-width': 3, 'line-opacity': 0.55 }} />
        </GeoJSONSource>
      ) : null}

      {restLine && restLine.length > 1 && sel ? (
        <GeoJSONSource id="trip-rest" data={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: restLine } }}>
          <Layer id="trip-rest-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': dark ? '#FF8A78' : '#FA634E', 'line-width': 4, 'line-opacity': 0.35 }} />
        </GeoJSONSource>
      ) : null}

      {laneFeature ? (
        <GeoJSONSource id="lane" data={laneFeature}>
          <Layer id="lane-casing" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': LANE_VIOLET, 'line-width': 12, 'line-opacity': 0.18, 'line-blur': 2 }} />
          {/* Separate layers, not a toggled prop: a dash set once on a native layer isn't cleared by dropping it. */}
          {lane?.line && lane.line.length > 1 ? (
            <Layer key="road" id="lane-road" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': LANE_VIOLET, 'line-width': 4, 'line-opacity': 0.75 }} />
          ) : (
            <Layer key="straight" id="lane-straight" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': LANE_VIOLET, 'line-width': 3, 'line-opacity': 0.75, 'line-dasharray': [2, 1.5] }} />
          )}
        </GeoJSONSource>
      ) : null}
      {lane ? (
        <>
          <ViewAnnotation id="lane-a" lngLat={[lane.from.lng, lane.from.lat]} anchor="bottom">
            <View style={st.laneEnd}><View style={[st.lanePin, { backgroundColor: LANE_A }]}><Text style={st.lanePinText}>A</Text></View><View style={[st.laneTip, { borderTopColor: LANE_A }]} /></View>
          </ViewAnnotation>
          <ViewAnnotation id="lane-b" lngLat={[lane.to.lng, lane.to.lat]} anchor="bottom">
            <View style={st.laneEnd}><View style={[st.lanePin, { backgroundColor: LANE_B }]}><Text style={st.lanePinText}>B</Text></View><View style={[st.laneTip, { borderTopColor: LANE_B }]} /></View>
          </ViewAnnotation>
        </>
      ) : null}

      {toNext ? (
        <GeoJSONSource id="to-next" data={toNext}>
          <Layer id="to-next-casing" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': dark ? '#FF8A78' : '#FA634E', 'line-width': 12, 'line-opacity': 0.2, 'line-blur': 2 }} />
          {/* Separate layers, not a toggled prop: a dash set once on a native layer isn't cleared by dropping it. */}
          {routeLine && routeLine.length > 1 ? (
            <Layer key="road" id="to-next-road" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': dark ? '#FF8A78' : '#FA634E', 'line-width': 5 }} />
          ) : (
            <Layer key="straight" id="to-next-straight" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': dark ? '#FF8A78' : '#FA634E', 'line-width': 4, 'line-dasharray': [2, 1.5] }} />
          )}
        </GeoJSONSource>
      ) : null}

      {/* A place search: its catchment circle and centre, under the trucks */}
      {focus ? (
        <GeoJSONSource id="near-area" data={circleOf(focus)}>
          <Layer id="near-area-fill" type="fill" paint={{ 'fill-color': '#0EA5E9', 'fill-opacity': 0.08 }} />
          <Layer id="near-area-line" type="line" paint={{ 'line-color': '#0284C7', 'line-width': 1.5, 'line-opacity': 0.8, 'line-dasharray': [3, 2] }} />
        </GeoJSONSource>
      ) : null}
      {focus ? (
        <ViewAnnotation id="near-centre" lngLat={[focus.lng, focus.lat]} anchor="bottom">
          <View style={{ alignItems: 'center' }}>
            {focus.label ? <Text style={st.placeLabel} numberOfLines={1}>{focus.label} · {focus.km} km</Text> : null}
            <View style={st.placePin}><View style={st.placePinDot} /></View>
          </View>
        </ViewAnnotation>
      ) : null}

      {/* Tracker and phone over a kilometre apart: both spots, joined, so it's plain the driver isn't with the truck. */}
      {apart ? (
        <GeoJSONSource id="feeds-apart" data={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[apart.v.lng, apart.v.lat], [apart.d.lng, apart.d.lat]] } }}>
          <Layer id="feeds-apart-line" type="line" layout={{ 'line-cap': 'round' }} paint={{ 'line-color': '#D97706', 'line-width': 3, 'line-dasharray': [1.5, 1.5] }} />
        </GeoJSONSource>
      ) : null}
      {apart
        ? (['v', 'd'] as const).map((k) => (
          <ViewAnnotation key={`feed-${k}`} id={`feed-${k}`} lngLat={[apart[k].lng, apart[k].lat]} anchor="center">
            <View style={st.feedSpot}>
              <Image source={k === 'v' ? ICONS.truck : ICONS.person} style={{ width: 12, height: 12 }} fadeDuration={0} />
            </View>
          </ViewAnnotation>
        ))
        : null}

      {stops.map((s, i) => {
        const done = !!s.actual_arrival;
        const isNext = next?.id === s.id;
        return (
          <ViewAnnotation key={`stop-${s.id}`} id={`stop-${s.id}`} lngLat={[s.lng!, s.lat!]} anchor="center">
            <View style={[st.stop, done && st.stopDone, isNext && st.stopNext]}>
              <Text style={[st.stopText, (done || isNext) && { color: '#FFFFFF' }]}>{i + 1}</Text>
            </View>
          </ViewAnnotation>
        );
      })}

      {groups.map((g) => (
        <Marker key={`group-${g.id}`} id={`group-${g.id}`} lngLat={[g.lng, g.lat]} anchor="center" onPress={interactive ? () => pressTarget({ kind: 'group', id: g.id, lng: g.lng, lat: g.lat }) : undefined}>
          <View style={[st.group, g.count >= 10 && st.groupBig]}>
            <Text style={st.groupText}>{g.count}</Text>
            {/* How the group splits — the web's coloured ring, as a bar */}
            <View style={st.mix}>
              {MIX_ORDER.filter((t) => g.mix[t] > 0).map((t) => (
                <View key={t} style={{ flex: g.mix[t], backgroundColor: TONE[t].color }} />
              ))}
            </View>
          </View>
        </Marker>
      ))}

      {singles.map((u) => (
        <UnitMarker
          key={u.key}
          Marker={Marker}
          unit={u}
          selected={selected === u.key}
          dimmed={!!selected && selected !== u.key}
          ringed={!!ringed?.has(u.key)}
          plate={labelled.has(u.key) ? u.vehicle?.plate_number ?? null : null}
          now={now}
          mapBearing={mapBearing}
          onPress={interactive && onSelect ? () => pressTarget({ kind: 'unit', key: u.key }) : undefined}
        />
      ))}
    </Map>
  );
});

function Fallback({ text }: { text: string }) {
  return (
    <View style={[StyleSheet.absoluteFill, st.fallback]}>
      <MapPin size={22} color="#52525B" />
      <Text style={st.fallbackText}>{text}</Text>
    </View>
  );
}

/**
 * Where a truck is drawn: eased from its last fix to the new one, so trucks
 * drive across the map on each refresh instead of teleporting (web `useGlide`).
 */
function useGlide(lng: number, lat: number): LngLat {
  const [shown, setShown] = useState<LngLat>([lng, lat]);
  const shownRef = useRef(shown);
  useEffect(() => {
    const from = shownRef.current;
    if (from[0] === lng && from[1] === lat) return;
    let raf = 0;
    const far = Math.abs(from[0] - lng) > GLIDE_MAX_DEG || Math.abs(from[1] - lat) > GLIDE_MAX_DEG;
    const start = Date.now();
    const step = () => {
      const t = far ? 1 : Math.min(1, (Date.now() - start) / GLIDE_MS);
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; // ease-in-out
      shownRef.current = [from[0] + (lng - from[0]) * e, from[1] + (lat - from[1]) * e];
      setShown(shownRef.current);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [lng, lat]);
  return shown;
}

type MarkerComponent = NonNullable<typeof ML>['Marker'];
type MapStyleSpec = Exclude<React.ComponentProps<NonNullable<typeof ML>['Map']>['mapStyle'], string>;

/** Each truck sits centred in a box this size; the stop ring and the halo stay inside it. */
const BOX = 52;

/** The selected truck's halo: a soft ring in its colour, breathing out. */
function Pulse({ color }: { color: string }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[st.halo, {
        backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
      }]}
    />
  );
}

/** How far along its stops a running trip is: a dot per stop around the pin, reached ones filled. */
function StopRing({ done, total, radius, color }: { done: number; total: number; radius: number; color: string }) {
  const n = Math.min(total, 12);
  // Past 12 stops the dots stand for a share of the trip, not one stop each.
  const filled = Math.round((done / total) * n);
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
        return (
          <View
            key={i}
            pointerEvents="none"
            style={[st.ringDot, {
              left: BOX / 2 + radius * Math.cos(a) - 2.5,
              top: BOX / 2 + radius * Math.sin(a) - 2.5,
              backgroundColor: i < filled ? color : '#CBD5E1',
            }]}
          />
        );
      })}
    </>
  );
}

/**
 * One truck: white disc with its glyph, the live-GPS badge (amber when the
 * tracker and phone disagree), a dot ring for its trip's stops, and below it
 * the plate (or age) with a red "+40m" when late and an amber stop time when
 * it has stood still too long. Others fade while one is picked.
 */
const UnitMarker = React.memo(function UnitMarker({ Marker, unit: u, selected: on, dimmed, ringed, plate, now, mapBearing, onPress }: {
  Marker: MarkerComponent;
  unit: LiveUnit;
  selected: boolean;
  dimmed: boolean;
  ringed: boolean;
  plate: string | null;
  now: number;
  mapBearing: number;
  onPress?: () => void;
}) {
  const at = useGlide(u.position!.lng, u.position!.lat);
  const tone = TONE[unitTone(u)];
  const silent = isSilent(u, now);
  const heading = u.position?.heading_deg;
  const moving = u.motion === 'moving' && heading != null && !silent;
  const feed = silent ? 'none' : u.feed ?? 'none';
  const age = silent ? shortAgo(u.position?.recorded_at, now) : '';
  const late = lateMin(u, now);
  const stopped = isLongStop(u, now) ? stoppedMin(u, now) : null;
  const progress = tripProgress(u);
  const apart = feedsApart(u);
  return (
    <Marker
      id={`unit-${u.key}`}
      lngLat={at}
      // Pinned by the box's centre, so the chips below don't shift it.
      anchor="top"
      offset={[0, -BOX / 2]}
      onPress={onPress}
    >
      <View style={[{ alignItems: 'center' }, dimmed && { opacity: 0.35 }]}>
        <View style={st.box}>
          {on ? <Pulse color={tone.color} /> : null}
          {progress ? <StopRing done={progress.done} total={progress.total} radius={on ? 24 : 21} color={tone.color} /> : null}
          <View style={[st.pin, silent && st.pinSilent, ringed && st.pinRinged, on && st.pinOn, on && { borderColor: tone.color }]}>
            {moving ? (
              <Image
                source={ICONS.nav}
                style={{ width: 18, height: 18, tintColor: tone.color, transform: [{ rotate: `${heading! - mapBearing}deg` }] }}
                fadeDuration={0}
              />
            ) : silent ? (
              <View style={st.ring} />
            ) : (
              <View style={[st.square, { backgroundColor: tone.color }]} />
            )}
            {feed !== 'none' ? (
              <View style={[st.feed, apart && st.feedApart]}>
                {feed === 'vehicle' || feed === 'both' ? <Image source={ICONS.truck} style={st.feedIcon} fadeDuration={0} /> : null}
                {feed === 'driver' || feed === 'both' ? <Image source={ICONS.person} style={st.feedIcon} fadeDuration={0} /> : null}
              </View>
            ) : null}
          </View>
        </View>
        {plate ? (
          <View style={[st.label, !on && st.labelQuiet]}>
            <Text style={[st.labelText, !on && st.labelTextQuiet]}>
              {plate}
              {age ? <Text style={st.labelAge}>{` · ${age}`}</Text> : null}
            </Text>
          </View>
        ) : age ? (
          <Text style={st.age}>{age}</Text>
        ) : null}
        {late != null || stopped != null ? (
          <View style={st.chips}>
            {late != null ? <Text style={[st.chip, st.chipLate]}>{lateText(late)}</Text> : null}
            {stopped != null ? <Text style={[st.chip, st.chipStop]}>{`Stopped ${minText(stopped)}`}</Text> : null}
          </View>
        ) : null}
      </View>
    </Marker>
  );
});

const st = StyleSheet.create({
  fallback: { backgroundColor: '#EFEFF1', alignItems: 'center', justifyContent: 'center', gap: 8 },
  fallbackText: { fontSize: 13, fontWeight: '600', color: '#52525B' },
  // White disc; the glyph inside carries the colour (web LiveUnitMarker).
  pin: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  pinSilent: { backgroundColor: 'rgba(255,255,255,0.85)', shadowOpacity: 0.18, shadowRadius: 2, elevation: 2 },
  pinOn: { width: 38, height: 38, borderRadius: 19, borderWidth: 3 },
  pinRinged: { borderColor: LANE_A, borderWidth: 3 },
  laneEnd: { alignItems: 'center' },
  lanePin: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#FFFFFF',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  lanePinText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  laneTip: { width: 0, height: 0, marginTop: -2, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  box: { width: BOX, height: BOX, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: BOX, height: BOX, borderRadius: BOX / 2 },
  ringDot: { position: 'absolute', width: 5, height: 5, borderRadius: 2.5, borderWidth: 0.5, borderColor: '#FFFFFF' },
  feedApart: { backgroundColor: '#D97706' },
  placeLabel: { maxWidth: 200, marginBottom: 3, fontSize: 11, fontWeight: '700', color: '#FFFFFF', backgroundColor: '#0369A1', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  placePin: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#0284C7', borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3 },
  placePinDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  feedSpot: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#D97706', borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: 3, marginTop: 2 },
  chip: { fontSize: 10, fontWeight: '800', color: '#FFFFFF', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, overflow: 'hidden' },
  chipLate: { backgroundColor: '#E11D48' },
  chipStop: { backgroundColor: '#D97706' },
  square: { width: 12, height: 12, borderRadius: 4 },
  ring: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: SILENT_COLOR },
  feed: {
    position: 'absolute', right: -7, bottom: -4, flexDirection: 'row', gap: 1, paddingHorizontal: 3, paddingVertical: 2,
    borderRadius: 8, backgroundColor: '#3E3C3D', borderWidth: 2, borderColor: '#FFFFFF',
  },
  feedIcon: { width: 9, height: 9 },
  label: { marginTop: -4, backgroundColor: '#3E3C3D', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  labelText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', fontFamily: 'monospace' },
  labelQuiet: { backgroundColor: 'rgba(255,255,255,0.95)', borderWidth: 1, borderColor: '#E4E4E7' },
  labelTextQuiet: { color: '#3E3C3D', fontWeight: '600' },
  labelAge: { fontFamily: undefined, fontWeight: '500', color: '#94A3B8' },
  age: { marginTop: -4, fontSize: 9, fontWeight: '600', color: '#64748B' },
  group: {
    // White like the trucks, the count dark, the mix bar under it (web ClusterMarker).
    minWidth: 40, height: 40, borderRadius: 20, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  groupBig: { minWidth: 46, height: 46, borderRadius: 23 },
  groupText: { fontSize: 14, fontWeight: '800', color: '#1E293B', fontVariant: ['tabular-nums'], marginTop: -2 },
  mix: { position: 'absolute', bottom: 7, width: 20, height: 3.5, borderRadius: 2, overflow: 'hidden', flexDirection: 'row', backgroundColor: '#E2E8F0' },
  stop: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#71717A', alignItems: 'center', justifyContent: 'center' },
  stopDone: { backgroundColor: '#3E3C3D', borderColor: '#FFFFFF' },
  stopNext: { backgroundColor: '#FA634E', borderColor: '#FFFFFF' },
  stopText: { fontSize: 10, fontWeight: '800', color: '#3F3F46' },
});
