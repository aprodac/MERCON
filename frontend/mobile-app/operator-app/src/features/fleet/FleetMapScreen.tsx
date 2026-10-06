/**
 * Route: /fleet-map — the phone version of the web live map.
 *
 *   Search    plate, driver, trip no. or customer. A city ("near Dammam",
 *             "jeddah"), an address picked from the suggestions, a long press
 *             on the map or "Near a place" (prefills "near " to type a city,
 *             address or site) searches around that place: a circle on
 *             the map, radius chips (10–200 km), Free only, the trucks inside
 *             closest first with road drive time, or the nearest outside and
 *             a one-tap wider search (FleetSummary.tsx NearSheet).
 *   Lane      "riyadh to jeddah" (or ruh → jed): A and B on the map with the
 *             road between, and a card (LaneSheet.tsx) with free trucks near
 *             A, trips on the road A→B and trips booked on it; Book / Create
 *             trip open Create trip with the lane (and truck) filled in.
 *   Summary   with nothing picked: trucks working, late, free soon, stopped
 *             long, not live, and each customer's live page to share.
 *   Changes   a toast and a buzz when a truck turns late, stops long, loses
 *             GPS, starts or finishes its trip while the map is open.
 *   Saved     filter, theme and the camera come back next time; the map
 *             always opens flat (2D) and never tilts unless 3D is picked.
 *   Filters   All · On trip · Delayed · Free · Free soon · Stopped · No GPS
 *             (Free soon and Stopped only while they have trucks).
 *   Map/List  toggle. The list has three tabs (FleetLists.tsx): Trucks
 *             (delayed → running → planned → free), Needs attention (Home's
 *             trip action items) and Scheduled (by start day). A red chip on
 *             the map opens Needs attention; a row with a truck on the road
 *             shows it on the map, otherwise opens the trip.
 *   Truck     tap a pin: a bottom sheet with the ETA to the next stop (road
 *             drive time when routing is up), on time / late, the trip drawn
 *             on the map and Call · Share ETA (WhatsApp) · Open trip; drag it
 *             up for the stop timeline (with the driver's photos per stop)
 *             and GPS feeds, swipe it sideways for
 *             the next truck (FleetSheet.tsx).
 *   Groups    nearby trucks merge into a numbered bubble (its bar shows the
 *             mix; delayed trucks never merge); tap to list them, with Zoom.
 *   Not live  the "N not live" pill lists trucks with only an old position
 *             (tap to see it) and those that never reported.
 *   Trail     a grey line of where the picked truck has driven on its trip
 *             (the driver phone's GPS — the truck tracker keeps no history).
 *   Deep link /fleet-map?trip=<id> (from a "Trip delayed" / "Driver app
 *             silent" notification) opens on that trip's truck, or on the
 *             trip page when the truck has no position.
 *   Camera    a picked truck is shown alone, framed with its next stop;
 *             the card's Route frames the whole trip (tap again to go back).
 *             It follows the truck as it moves; dragging the map stops that
 *             and shows Recenter. Zoomed in, trucks carry their plates.
 *   Controls  zoom ±, All trucks, and Map (2D / 3D, light / dark, map key).
 * Live feed refreshes every 15 s here (the web map's rate), 30 s on Home.
 *   Actions   the truck sheet moves its trip to the next step or cancels it;
 *             a trip without a truck (Scheduled row, or a "no truck"
 *             attention item) gets Find a truck — nearest free trucks and a
 *             one-tap assign (FleetActions.tsx). Each asks to confirm first.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import {
  AlertTriangle, Compass, Info, Layers, List, LocateFixed, Map as MapIcon, MapPin, Maximize, MessageCircle, Minus, Plus, Search, X, type LucideIcon,
} from 'lucide-react-native';
import { Toast } from '@mercon/mobile-shared/components/Toast';
import { operatorService, type LiveUnit } from '../../lib/operator';
import { AppTopBar } from '@/components/AppTopBar';
import { makeTime } from '../trips/list/tripListModel';
import { FleetMap, SILENT_COLOR, TONE, type FleetMapHandle, type FocusMode, type MapTheme, type MapView } from './FleetMap';
import { GroupSheet, NotLiveSheet, UnitRow, UnitSheet } from './FleetSheet';
import { CustomerPageSheet, NearSheet, SummarySheet, defaultRadiusKm, type PlaceSearch } from './FleetSummary';
import { changeText, isBadChange, useFleetChanges, useFleetPrefs, type FleetChange } from './useFleetMapState';
import { FleetLegend } from './FleetLegend';
import { LaneSheet } from './LaneSheet';
import { LANE_KM, LANE_WIDE_KM, bookedOnLane, freeTrucksAt, lanesOnRoad, parseLaneQuery, truckSeconds } from './laneModel';
import { FindTruckSheet, useTripActions } from './FleetActions';
import { AttentionList, ListTabs, ScheduledList, attentionItems, matchesTripText, scheduledTrips, type ListTab } from './FleetLists';
import { useActionInbox } from '../dashboard/actions/useActionInbox';
import { useActionIntent } from '../dashboard/actions/useActionIntent';
import { MediaViewer, type ViewerItem } from '../trips/details/components/MediaViewer';
import { niceName } from '../trips/create/components/ui';
import type { QuickKind } from '../trips/details/tripDetailsModel';
import { BulkStatusSheet, ShareKindSheet, TripShareFromMap } from './FleetShare';
import {
  agoText, computeEta, haversineKm, isDelayed, isFree, isSilent, located, matchesFilter, matchesQuery, nextStop, onTrip, placeFromQuery, truckDriveSeconds, unitPriority, type FleetFilter,
} from './fleetModel';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';
const LINE = '#E9E9EC';

/** `whenAny`: shown only while it has trucks (or is the one picked) — the rest always. */
const FILTERS: { id: FleetFilter; label: string; dot?: string; whenAny?: boolean }[] = [
  { id: 'all', label: 'All' },
  { id: 'on_trip', label: 'On trip', dot: TONE.active.color },
  { id: 'delayed', label: 'Delayed', dot: TONE.delayed.color },
  { id: 'free', label: 'Free', dot: TONE.free.color },
  { id: 'free_soon', label: 'Free soon', dot: '#0284C7', whenAny: true },
  { id: 'long_stop', label: 'Stopped', dot: '#D97706', whenAny: true },
  { id: 'silent', label: 'No GPS', dot: SILENT_COLOR },
];
/** Wait this long after typing before asking the server for an address. */
const PLACE_SEARCH_DELAY_MS = 450;
/** "near riyadh", "trucks around the port": the place search prefix. */
const NEAR_PREFIX = /^(?:trucks?\s+)?(?:near|around|close to)\s+/i;

export default function FleetMapScreen() {
  const router = useRouter();
  const live = useQuery({ queryKey: ['dashboard', 'actions', 'live-map'], queryFn: () => operatorService.liveMap(), refetchInterval: 15_000 });
  const tzQ = useQuery({ queryKey: ['dashboard', 'tz'], queryFn: () => operatorService.deploymentTimezone(), staleTime: Infinity });
  const f = useMemo(() => makeTime(tzQ.data ?? 'Asia/Riyadh'), [tzQ.data]);

  const { onIntent, toast, setToast } = useActionIntent();
  const [filter, setFilterRaw] = useState<FleetFilter>('all');
  const [theme, setThemeRaw] = useState<MapTheme>('light');
  // The 2D / 3D toggle (Map options); off unless the operator turns it on.
  const [is3D, setIs3DRaw] = useState(false);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'map' | 'list'>('map');
  const [listTab, setListTab] = useState<ListTab>('trucks');
  const [selected, setSelected] = useState<string | null>(null);
  // The clock for ages, lateness and "free soon": moves on each refresh and every 30 s between.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const now = Math.max(clock, live.dataUpdatedAt || 0);
  const all = useMemo(() => live.data ?? [], [live.data]);

  // The view to come back to: filter, theme, 2D/3D and camera (useFleetMapState.ts).
  const prefs = useFleetPrefs();
  const restored = useRef(false);
  useEffect(() => {
    if (!prefs.ready || restored.current) return;
    restored.current = true;
    const { filter: f0, theme: t0 } = prefs.prefs;
    // Restoring the saved view is a one-off when it loads; later changes are the user's.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (f0) setFilterRaw(f0); if (t0) setThemeRaw(t0);
  }, [prefs.ready, prefs.prefs]);
  const { save: savePrefs } = prefs;
  const setFilter = (v: FleetFilter) => { setFilterRaw(v); savePrefs({ filter: v }); };
  const setTheme = (v: MapTheme) => { setThemeRaw(v); savePrefs({ theme: v }); };
  // 3D is for the moment, not a saved preference: the map always opens flat.
  const setIs3D = setIs3DRaw;

  // While the map is open, say when a truck turns late, stops long, loses GPS, or starts / finishes its trip.
  const onChanges = useCallback((c: FleetChange[]) => {
    const bad = c.some(isBadChange);
    Haptics.notificationAsync(bad ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success).catch(() => {});
    setToast({ message: changeText(c), type: bad ? 'error' : 'success' });
  }, [setToast]);
  useFleetChanges(live.data, live.dataUpdatedAt, onChanges);

  // A customer's all-trucks live page, to share (FleetSummary.tsx).
  const [customerPage, setCustomerPage] = useState<{ id: string; name: string } | null>(null);

  const counts = useMemo(() => {
    const c = {} as Record<FleetFilter, number>;
    for (const x of FILTERS) c[x.id] = all.filter((u) => matchesFilter(u, x.id, now)).length;
    return c;
  }, [all, now]);

  // "riyadh to jeddah" is a lane (LaneSheet); otherwise see the place search below.
  const laneQuery = useMemo(() => parseLaneQuery(query), [query]);
  // "Trucks near…": a city typed in the search box, or a place picked — an address
  // suggestion, a long-press on the map, or my location (placePick wins, also over a lane).
  const [placePick, setPlacePick] = useState<PlaceSearch | null>(null);
  const lane = !placePick && laneQuery?.kind === 'lane' ? laneQuery : null;
  const laneKey = lane ? `${lane.from.label}>${lane.to.label}` : null;
  // A widened catchment belongs to the lane it was widened on; a new lane starts at the default.
  const [widened, setWidened] = useState<string | null>(null);
  const laneKm = laneKey && widened === laneKey ? LANE_WIDE_KM : LANE_KM;
  const runs = useMemo(() => (lane ? lanesOnRoad(all, lane.from, lane.to, laneKm) : []), [all, lane, laneKm]);
  const free = useMemo(() => (lane ? freeTrucksAt(all, lane.from, laneKm, now) : { inRange: [], nearest: [] }), [all, lane, laneKm, now]);
  const ringed = useMemo(() => new Set(free.inRange.map((c) => c.unit.key)), [free]);
  const typedCity = useMemo(() => {
    if (laneQuery) return null;
    const c = placeFromQuery(query);
    return c ? ({ ...c, kind: 'city' } as PlaceSearch) : null;
  }, [laneQuery, query]);
  const place = placePick ?? typedCity;
  const placeKey = place ? `${place.lat.toFixed(4)},${place.lng.toFixed(4)}` : '';
  // Each new place starts from its own default radius.
  const [radiusFor, setRadiusFor] = useState<{ key: string; km: number } | null>(null);
  const radius = place ? (radiusFor?.key === placeKey ? radiusFor.km : defaultRadiusKm(place)) : 0;
  const [freeOnly, setFreeOnly] = useState(false);
  const byFilter = useMemo(
    () => all.filter((u) => matchesFilter(u, filter, now) && (!place || !freeOnly || isFree(u))),
    [all, filter, now, place, freeOnly],
  );
  const shown = useMemo(() => {
    // A lane shows only the trucks that matter to it: on the road A→B, and free near A (or the nearest free ones).
    if (lane) return [...runs.map((r) => r.unit), ...(free.inRange.length ? free.inRange : free.nearest).map((c) => c.unit)];
    if (place) {
      return byFilter
        .filter(located)
        .map((u) => ({ u, km: haversineKm(u.position!, place) }))
        .filter((x) => x.km <= radius)
        .sort((a, b) => a.km - b.km)
        .map((x) => x.u);
    }
    // "near …" still being typed is a place, not a plate or driver: keep every truck up meanwhile.
    const q = NEAR_PREFIX.test(query) ? '' : query;
    return byFilter.filter((u) => matchesQuery(u, q)).sort((a, b) => unitPriority(b) - unitPriority(a));
  }, [byFilter, place, radius, query, lane, runs, free]);
  // Around a place the map keeps every truck, so the nearest ones outside the circle still show.
  const mapUnits = place ? byFilter : shown;

  // An address, landmark or customer site typed that matches no truck: offer places to search around.
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), PLACE_SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [query]);
  const placeText = debounced.replace(NEAR_PREFIX, '').trim();
  const wantsPlaces = !placePick && !typedCity && !laneQuery && placeText.length >= 3 && debounced === query.trim()
    && (NEAR_PREFIX.test(debounced) || !all.some((u) => matchesQuery(u, debounced)));
  const placesQ = useQuery({
    queryKey: ['fleet', 'places', placeText],
    queryFn: () => operatorService.searchPlaces(placeText),
    enabled: wantsPlaces,
    staleTime: 10 * 60_000,
  });
  const suggestions = wantsPlaces ? (placesQ.data ?? []).slice(0, 4) : [];

  const unit = all.find((u) => u.key === selected) ?? null;
  // Trucks parked on one spot, opened from their map group.
  const [group, setGroup] = useState<string[] | null>(null);
  const groupUnits = useMemo(() => (group ? all.filter((u) => group.includes(u.key)).sort((a, b) => unitPriority(b) - unitPriority(a)) : []), [all, group]);
  const [expanded, setExpanded] = useState(false);
  // The "N not live" list (trucks with an old position, or none).
  const [notLive, setNotLive] = useState(false);
  const [sheetH, setSheetH] = useState(0);
  // Driver view / trip overview, and whether the camera follows the picked truck (until the map is dragged by hand).
  const [focusMode, setFocusMode] = useState<FocusMode>('none');
  const [following, setFollowing] = useState(true);
  const pick = (key: string | null) => {
    if (key && key !== selected) Haptics.selectionAsync().catch(() => {});
    setSelected(key); setFocusMode('none'); setGroup(null); setNotLive(false); setFollowing(true);
    if (key) setView('map'); else setExpanded(false);
  };
  const searchAround = (p: PlaceSearch) => {
    Haptics.selectionAsync().catch(() => {});
    setSelected(null); setGroup(null); setNotLive(false);
    setPlacePick(p);
    setView('map');
  };
  const clearPlace = () => {
    setPlacePick(null);
    if (typedCity) setQuery('');
    setFreeOnly(false);
  };
  // "Near a place": start a "near …" search and let the operator type the city, address or site.
  const searchRef = useRef<TextInput>(null);
  const nearPlace = () => {
    Haptics.selectionAsync().catch(() => {});
    if (selected || group) pick(null);
    setPlacePick(null);
    setQuery('near ');
    searchRef.current?.focus();
  };
  const openGroup = (keys: string[]) => {
    Haptics.selectionAsync().catch(() => {});
    setSelected(null); setFocusMode('none'); setNotLive(false); setGroup(keys);
  };

  // Swiping the sheet walks the trucks on the map in the list's order.
  const ring = useMemo(() => shown.filter(located), [shown]);
  const at = unit ? ring.findIndex((u) => u.key === unit.key) : -1;
  const prevKey = at > 0 ? ring[at - 1].key : null;
  const nextKey = at >= 0 && at < ring.length - 1 ? ring[at + 1].key : null;

  // The other lists: Home's trip action items and the not-started trips (same queries, same cache).
  const inbox = useActionInbox();
  // Trip-changing actions: next step / cancel from the sheet, Find a truck from the lists.
  const tripActions = useTripActions((message) => setToast({ message, type: 'success' }));
  const [findFor, setFindFor] = useState<string | null>(null);

  // WhatsApp (FleetShare.tsx): what to send about the picked truck, then the trip page's share sheet…
  const [shareChoose, setShareChoose] = useState(false);
  const [shareKind, setShareKind] = useState<QuickKind | null>(null);
  // …and trucks picked in the list (long-press) for one status message per customer.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [bulk, setBulk] = useState<{ ids: string[]; positions: Record<string, { lat: number; lng: number } | null> } | null>(null);
  const togglePick = (u: LiveUnit) => {
    if (!u.trip) return; // a free truck has no trip to report on
    Haptics.selectionAsync().catch(() => {});
    setPicked((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(u.key)) next.delete(u.key); else next.add(u.key);
      return next.size ? next : null;
    });
  };
  const pickedUnits = useMemo(() => all.filter((u) => picked?.has(u.key) && u.trip), [all, picked]);
  const lastCustomer = pickedUnits[pickedUnits.length - 1]?.trip?.customer_name ?? null;
  const pickAllOf = (customer: string) =>
    setPicked((prev) => new Set([...(prev ?? []), ...shown.filter((u) => u.trip?.customer_name === customer).map((u) => u.key)]));
  const sendPicked = () => {
    if (!pickedUnits.length) return;
    setBulk({
      ids: pickedUnits.map((u) => u.trip!.id),
      positions: Object.fromEntries(pickedUnits.map((u) => [u.trip!.id, located(u) ? { lat: u.position!.lat, lng: u.position!.lng } : null])),
    });
  };
  // "Assign a truck" from an attention item opens Find a truck here instead of the trip page.
  const fleetIntent = (i: Parameters<typeof onIntent>[0]) => (i.type === 'trip' && i.assign === 'truck' ? setFindFor(i.tripId) : onIntent(i));
  const attention = useMemo(() => {
    const q = lane ? '' : query.trim().toLowerCase();
    return attentionItems(inbox.items).filter((i) => !q || `${i.title} ${i.detail}`.toLowerCase().includes(q));
  }, [inbox.items, query, lane]);
  const scheduled = useMemo(() => {
    const trips = scheduledTrips(inbox.scheduled, now);
    return lane ? bookedOnLane(trips, lane.from, lane.to, laneKm) : trips.filter((t) => matchesTripText(t, query));
  }, [inbox.scheduled, now, query, lane, laneKm]);

  // The lane's road (A → B), the drive to A for the closest free trucks, and the arrival at B for trucks on the road.
  const laneRoadQ = useQuery({
    queryKey: ['fleet', 'lane-road', lane?.from.lat, lane?.from.lng, lane?.to.lat, lane?.to.lng],
    queryFn: () => operatorService.liveRoute([lane!.from, lane!.to]),
    enabled: !!lane,
    staleTime: 60 * 60_000,
  });
  const round3 = (p: { lat: number; lng: number }) => ({ lat: +p.lat.toFixed(3), lng: +p.lng.toFixed(3) });
  const toStartFor = lane ? free.inRange.slice(0, 5).filter((c) => c.km >= 1) : [];
  const toStartQs = useQueries({
    queries: toStartFor.map((c) => {
      const p = round3(c.unit.position!);
      return {
        queryKey: ['fleet', 'lane-to-start', c.unit.key, p.lat, p.lng, lane?.from.label],
        queryFn: () => operatorService.liveRoute([p, lane!.from]),
        staleTime: 5 * 60_000,
      };
    }),
  });
  const arrivalFor = lane ? runs.filter((r) => located(r.unit) && r.stop.lat != null && r.stop.lng != null).slice(0, 8) : [];
  const arrivalQs = useQueries({
    queries: arrivalFor.map((r) => {
      const p = round3(r.unit.position!);
      return {
        queryKey: ['fleet', 'lane-arrival', r.unit.key, p.lat, p.lng, r.stop.id],
        queryFn: () => operatorService.liveRoute([p, { lat: r.stop.lat!, lng: r.stop.lng! }]),
        staleTime: 60_000,
      };
    }),
  });
  const toStart = new Map<string, number>();
  toStartFor.forEach((c, i) => { const d = toStartQs[i]?.data; if (d) toStart.set(c.unit.key, truckSeconds(d)); });
  const arrivals = new Map<string, Date>();
  arrivalFor.forEach((r, i) => { const d = arrivalQs[i]?.data; if (d) arrivals.set(r.unit.key, new Date((live.dataUpdatedAt || now) + truckSeconds(d) * 1000)); });
  const laneRoad = lane
    ? laneRoadQ.data
      ? { km: laneRoadQ.data.distanceMeters / 1000, seconds: truckSeconds(laneRoadQ.data), isRoad: true }
      : laneRoadQ.isFetched ? { km: haversineKm(lane.from, lane.to), seconds: null, isRoad: false } : null
    : null;
  const laneOnMap = useMemo(
    () => (lane ? { from: lane.from, to: lane.to, line: laneRoadQ.data?.geometry ?? null } : null),
    [lane, laneRoadQ.data],
  );
  /** Create trip with the lane (and a truck) filled in; everything stays editable there. */
  const createOnLane = (vehicleId: string | null) => {
    if (!lane) return;
    router.push({
      pathname: '/create-trip',
      params: {
        from: lane.from.label, fromLat: String(lane.from.lat), fromLng: String(lane.from.lng),
        to: lane.to.label, toLat: String(lane.to.lat), toLng: String(lane.to.lng),
        ...(vehicleId ? { vehicleId } : {}),
      },
    });
  };

  /** A trip's truck on the map when it has a fix there; otherwise the trip's own page. */
  const showTrip = (tripId: string) => {
    const u = all.find((x) => x.trip?.id === tripId && located(x));
    if (!u) { router.push({ pathname: '/trip-details', params: { id: tripId } }); return; }
    // Make sure the filter / search doesn't hide it.
    if (!shown.some((x) => x.key === u.key)) { setFilter('all'); setQuery(''); }
    pick(u.key);
  };

  // Opened from a notification: pick that trip's truck once the live data is in.
  const params = useLocalSearchParams<{ trip?: string }>();
  const handledTrip = useRef<string | null>(null);
  useEffect(() => {
    const id = typeof params.trip === 'string' ? params.trip : null;
    if (!id || handledTrip.current === id || !live.data) return;
    handledTrip.current = id;
    showTrip(id);
    // showTrip reads the latest data; only a new trip param or the first data should run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.trip, live.data]);

  // Map view state (the web map's controls): theme, 2D/3D, driver view / trip overview.
  const mapRef = useRef<FleetMapHandle>(null);
  const [camera, setCamera] = useState<MapView>({ zoom: 5, pitch: 0, bearing: 0 });
  const [legend, setLegend] = useState(false);
  const [mapMenu, setMapMenu] = useState(false);
  // The card's Route: frame the whole trip; tapping it again goes back to the truck.
  const toggleRoute = () => {
    if (focusMode === 'overview') { setFocusMode('none'); setFollowing(true); mapRef.current?.set3D(is3D); return; }
    setFocusMode('overview'); setFollowing(true); mapRef.current?.tripOverview();
  };
  const turned = Math.abs(camera.bearing) > 1 || camera.pitch > 1;

  // The selected truck's road ahead: the server's one route for this trip (the web live map shows
  // the same), trimmed to what's left at each new GPS fix. The last answer stays up while the next loads.
  const next = unit ? nextStop(unit) : null;
  const target = next && next.lat != null && next.lng != null ? { lat: next.lat, lng: next.lng } : null;
  const aheadQ = useQuery({
    queryKey: ['fleet', 'route-ahead', unit?.trip?.id, next?.id, unit?.position?.recorded_at],
    queryFn: () => operatorService.routeAhead(unit!.trip!.id),
    enabled: !!unit?.position && !!target && !!unit && onTrip(unit),
    placeholderData: keepPreviousData,
  });
  // Never another trip's or stop's route while the new one loads.
  const routeQ = { ...aheadQ, data: aheadQ.data && aheadQ.data.stopId === next?.id ? aheadQ.data : null };
  // The rest of the trip, next stop onwards — drawn faintly, and only along real roads.
  const restStops = useMemo(() => {
    const t = unit?.trip;
    if (!t || t.next_stop_index == null) return [];
    return t.stops.slice(t.next_stop_index).filter((x) => x.lat != null && x.lng != null && !(x.lat === 0 && x.lng === 0)).map((x) => ({ lat: x.lat!, lng: x.lng! }));
  }, [unit?.trip]);
  const restQ = useQuery({
    queryKey: ['fleet', 'trip-rest', unit?.trip?.id, unit?.trip?.next_stop_index, restStops.length],
    queryFn: () => operatorService.liveRoute(restStops),
    enabled: restStops.length >= 2,
    staleTime: 10 * 60_000,
  });
  // Breadcrumb trail: the trip's driven path (same endpoint as the trip page's map), joined to where the truck is now.
  const trailQ = useQuery({
    queryKey: ['fleet', 'trail', unit?.trip?.id],
    queryFn: () => operatorService.tripOverview(unit!.trip!.id),
    enabled: !!unit && onTrip(unit),
    refetchInterval: 60_000,
    retry: false,
  });
  const here = unit?.position ?? null;
  const trail = useMemo(() => {
    const path = trailQ.data?.path ?? [];
    if (path.length < 2) return null;
    return here ? [...path, [here.lng, here.lat] as [number, number]] : path;
  }, [trailQ.data, here]);

  // What the driver sent from each stop — only while the sheet is open full.
  const mediaQ = useQuery({
    queryKey: ['fleet', 'trip-media', unit?.trip?.id],
    queryFn: () => operatorService.tripMedia(unit!.trip!.id),
    enabled: expanded && !!unit?.trip,
    refetchInterval: 60_000,
    retry: false,
  });
  const [viewer, setViewer] = useState<{ items: ViewerItem[]; index: number; title: string } | null>(null);

  // Delivery time at the last stop: the next-stop ETA plus road time through the rest of the trip
  // (at truck speed — the router times a car, and a loaded truck averages at most ~80 km/h).
  const lastStop = unit?.trip?.stops[unit.trip.stops.length - 1] ?? null;
  const restSec = restQ.data ? truckDriveSeconds(restQ.data.distanceMeters, restQ.data.durationSeconds) : null;
  const eta = unit && onTrip(unit) && (routeQ.isFetched || !target) ? computeEta(unit, routeQ.data, routeQ.data ? Date.parse(routeQ.data.computedAt) : live.dataUpdatedAt || now) : null;

  const quietUnits = useMemo(() => shown.filter((u) => isSilent(u, now)), [shown, now]);
  // With nothing picked the summary (or a place's results) is up, so a sheet is open unless a focus view hides it.
  const lastUpdate = live.dataUpdatedAt ? agoText(new Date(live.dataUpdatedAt).toISOString(), now) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F6F7' }} edges={['top']}>
      <AppTopBar
        title="Fleet map"
        onBack={() => router.back()}
        actions={[{ icon: view === 'map' ? List : MapIcon, label: view === 'map' ? 'Show list' : 'Show map', onPress: () => setView(view === 'map' ? 'list' : 'map') }]}
      />

      <View style={s.controls}>
        <View style={s.search}>
          <Search size={17} color={MUTED} />
          <TextInput
            ref={searchRef}
            value={query}
            onChangeText={(v) => { setQuery(v); setPlacePick(null); if (selected || group) pick(null); }}
            placeholder="Plate, driver, city, address or riyadh to jeddah"
            placeholderTextColor="#9898A4"
            style={s.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? (
            <TouchableOpacity onPress={() => { setQuery(''); setPlacePick(null); }} hitSlop={8} accessibilityLabel="Clear search"><X size={17} color={MUTED} /></TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={nearPlace} hitSlop={8} style={s.nearMe} accessibilityLabel="Find trucks near a place">
              <MapPin size={15} color="#0284C7" />
              <Text style={s.nearMeText}>Near a place</Text>
            </TouchableOpacity>
          )}
        </View>
        {!suggestions.length && NEAR_PREFIX.test(query) && query.replace(NEAR_PREFIX, '').trim().length < 3 ? (
          <Text style={s.near}>Type a city, address or customer site — or long-press the map — to see the closest trucks.</Text>
        ) : null}
        {suggestions.length ? (
          <View style={s.suggest}>
            <Text style={s.suggestHead}>Find trucks near</Text>
            {suggestions.map((p) => (
              <TouchableOpacity key={p.id} style={s.suggestRow} onPress={() => searchAround({ label: p.label.split(',')[0], lat: p.lat, lng: p.lng, kind: 'address' })} activeOpacity={0.6}>
                <MapPin size={15} color="#0284C7" />
                <Text style={s.suggestText} numberOfLines={1}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {view === 'list' ? (
          <ListTabs tab={listTab} counts={{ trucks: shown.length, attention: attention.length, scheduled: scheduled.length }} onChange={setListTab} />
        ) : null}
        {!lane && (view === 'map' || listTab === 'trucks') ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills} style={{ marginHorizontal: -16 }}>
          {FILTERS.filter((p) => !p.whenAny || counts[p.id] > 0 || filter === p.id).map((p) => {
            const on = filter === p.id;
            return (
              <TouchableOpacity key={p.id} style={[s.pill, on && s.pillOn]} onPress={() => { setFilter(p.id); pick(null); }} activeOpacity={0.8}>
                {p.dot ? <View style={[s.dot, { backgroundColor: p.dot }]} /> : null}
                <Text style={[s.pillText, on && { color: '#FFFFFF' }]}>{p.label}</Text>
                <Text style={[s.pillCount, on && { color: 'rgba(255,255,255,0.7)' }]}>{counts[p.id]}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        ) : null}
        {place && view === 'list' && listTab === 'trucks' ? (
          <View style={s.nearLine}>
            <MapPin size={14} color="#0284C7" />
            <Text style={s.near} numberOfLines={1}>{shown.length} {shown.length === 1 ? 'truck' : 'trucks'} within {radius} km of {place.kind === 'me' ? 'you' : place.label}</Text>
            <TouchableOpacity onPress={clearPlace} hitSlop={8} accessibilityLabel="Clear the place search"><X size={15} color={MUTED} /></TouchableOpacity>
          </View>
        ) : null}
        {lane && view === 'list' ? <Text style={s.near}>{lane.from.label} → {lane.to.label} · {laneKm} km around each end</Text> : null}
        {!placePick && laneQuery?.kind === 'unknown' ? (
          laneQuery.suggestion ? (
            <TouchableOpacity onPress={() => setQuery(query.replace(laneQuery.text, laneQuery.suggestion!))} accessibilityLabel={`Search ${laneQuery.suggestion} instead`}>
              <Text style={s.near}>{`Couldn't find "${laneQuery.text}". Did you mean `}<Text style={s.suggestLink}>{laneQuery.suggestion}</Text>?</Text>
            </TouchableOpacity>
          ) : <Text style={s.near}>{`Couldn't find "${laneQuery.text}". Try a city name, like Jeddah or Dammam.`}</Text>
        ) : null}
      </View>

      {view === 'list' && listTab === 'attention' ? (
        <AttentionList items={attention} now={now} onIntent={fleetIntent} onOpenTrip={showTrip} />
      ) : view === 'list' && listTab === 'scheduled' ? (
        <ScheduledList trips={scheduled} f={f} now={now} onOpenTrip={showTrip} onFindTruck={setFindFor} />
      ) : view === 'list' ? (
        <View style={{ flex: 1 }}>
          {picked ? (
            <View style={s.pickBar}>
              <Text style={s.pickText}>{pickedUnits.length} picked</Text>
              {lastCustomer ? (
                <TouchableOpacity onPress={() => pickAllOf(lastCustomer)} style={s.pickChip} accessibilityLabel={`Pick every truck of ${lastCustomer}`}>
                  <Text style={s.pickChipText} numberOfLines={1}>All of {niceName(lastCustomer)}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={() => setPicked(null)} hitSlop={8}><Text style={s.pickCancel}>Cancel</Text></TouchableOpacity>
            </View>
          ) : null}
          <FlatList
            data={shown}
            keyExtractor={(u) => u.key}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: picked ? 100 : 40 }}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#F1F1F3' }} />}
            style={s.listBox}
            ListHeaderComponent={!picked && shown.some((u) => u.trip) ? <Text style={s.listHint}>Long-press trucks to send several statuses on WhatsApp</Text> : null}
            renderItem={({ item }) => (
              <UnitRow
                unit={item}
                now={now}
                time={f.time}
                km={place && item.position ? haversineKm(item.position, place) : null}
                onPress={() => (picked ? togglePick(item) : pick(item.key))}
                onLongPress={() => togglePick(item)}
                selected={picked ? picked.has(item.key) : undefined}
              />
            )}
            ListEmptyComponent={<Text style={s.empty}>{live.isLoading ? 'Loading trucks…' : 'No trucks match.'}</Text>}
          />
          {picked ? (
            <TouchableOpacity style={s.sendBar} onPress={sendPicked} activeOpacity={0.85} accessibilityLabel="Send status on WhatsApp">
              <MessageCircle size={18} color="#FFFFFF" />
              <Text style={s.sendBarText}>Send status · {pickedUnits.length} truck{pickedUnits.length === 1 ? '' : 's'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {prefs.ready ? (
          <FleetMap
            ref={mapRef}
            units={mapUnits}
            selected={selected}
            onSelect={pick}
            interactive
            theme={theme}
            tilted={is3D}
            focusMode={focusMode}
            isolate
            routeLine={routeQ.data?.geometry ?? null}
            focus={place ? { lat: place.lat, lng: place.lng, km: radius, label: place.kind === 'me' ? 'You' : place.label } : null}
            initialCamera={!params.trip && !place && !lane ? prefs.prefs.camera ?? null : null}
            onLongPress={(at) => searchAround({ label: 'Dropped pin', lat: at.lat, lng: at.lng, kind: 'pin' })}
            lane={laneOnMap}
            ringed={lane ? ringed : undefined}
            // Clear of the card (and of Recenter just above it).
            padding={{ top: 70, bottom: sheetH + 40 }}
            onViewChange={(v) => { setCamera(v); if (v.center) savePrefs({ camera: { center: v.center, zoom: v.zoom } }); }}
            onGroupPress={openGroup}
            restLine={restStops.length >= 2 ? restQ.data?.geometry ?? null : null}
            trail={trail}
            halts={unit ? trailQ.data?.halts?.filter((h) => h.kind === 'break') ?? null : null}
            follow={following}
            onUserMove={() => { if (unit) setFollowing(false); }}
          />
          ) : <View style={{ flex: 1, backgroundColor: '#f6f4ef' }} />}

          {/* Top-left: live status (and speed while a picked truck is moving) */}
          <View style={s.topLeft} pointerEvents="none">
            <View style={s.live}>
              <View style={[s.liveDot, { backgroundColor: live.isError ? '#E11D48' : '#10B981' }]} />
              <Text style={s.liveText}>{live.isError ? 'Connection lost' : 'Live'}</Text>
              {lastUpdate && !live.isError ? <Text style={s.liveAgo}>· {lastUpdate}</Text> : null}
            </View>
            {unit?.motion === 'moving' && unit.position?.speed_kph != null ? (
              <View style={s.speed}>
                <Text style={s.speedNum}>{Math.round(unit.position.speed_kph)}</Text>
                <Text style={s.speedUnit}>km/h</Text>
              </View>
            ) : null}
          </View>

          {/* Dragged away from the picked truck: one tap back to it. */}
          {unit?.position && !following ? (
            <TouchableOpacity style={[s.recenter, { bottom: sheetH + 24 }]} onPress={() => { setFollowing(true); mapRef.current?.recenter(); }} activeOpacity={0.85} accessibilityLabel="Back to the truck">
              <LocateFixed size={15} color={INK} />
              <Text style={s.recenterText}>Recenter</Text>
            </TouchableOpacity>
          ) : null}

          {/* Right: map controls, one compact column */}
          <View style={[s.ctlCol, { top: 12 }]}>
            <View style={s.ctlGroup}>
              <Ctl icon={Plus} label="Zoom in" onPress={() => mapRef.current?.zoomBy(1)} />
              <View style={s.ctlRule} />
              <Ctl icon={Minus} label="Zoom out" onPress={() => mapRef.current?.zoomBy(-1)} />
            </View>
            <View style={s.ctlGroup}>
              <Ctl icon={Maximize} caption="All" label="Show all trucks" onPress={() => { pick(null); setFocusMode('none'); mapRef.current?.fitAll(); }} />
              <View style={s.ctlRule} />
              <Ctl icon={Layers} caption="Map" label="Map options" on={mapMenu} onPress={() => { setMapMenu(!mapMenu); setLegend(false); }} />
              {turned ? (
                <>
                  <View style={s.ctlRule} />
                  <Ctl icon={Compass} label="Face north and flatten" onPress={() => { setIs3D(false); setFocusMode('none'); mapRef.current?.faceNorth(); }} rotate={-camera.bearing - 45} />
                </>
              ) : null}
            </View>
          </View>

          {mapMenu ? (
            <View style={s.menu}>
              <Text style={s.menuHead}>View</Text>
              <Segment
                options={[{ id: '2d', label: '2D flat' }, { id: '3d', label: '3D tilted' }]}
                value={is3D ? '3d' : '2d'}
                onChange={(v) => { const on = v === '3d'; setIs3D(on); mapRef.current?.set3D(on); }}
              />
              <Text style={s.menuHead}>Map colours</Text>
              <Segment
                options={[{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]}
                value={theme}
                onChange={(v) => setTheme(v as MapTheme)}
              />
              <TouchableOpacity style={s.menuRow} onPress={() => { setMapMenu(false); setLegend(true); }} accessibilityLabel="How to read the map">
                <Info size={16} color={INK} />
                <Text style={s.menuRowText}>What the colours and icons mean</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {legend ? <FleetLegend style={{ top: 12 }} onClose={() => setLegend(false)} /> : null}

          {unit ? (
            <UnitSheet
              unit={unit}
              eta={eta}
              routeLoading={routeQ.isLoading}
              now={now}
              f={f}
              expanded={expanded}
              onExpand={setExpanded}
              position={{ index: Math.max(at, 0), total: at >= 0 ? ring.length : 0 }}
              onPrev={prevKey ? () => pick(prevKey) : null}
              onNext={nextKey ? () => pick(nextKey) : null}
              onClose={() => pick(null)}
              onOpen={(id) => router.push({ pathname: '/trip-details', params: { id } })}
              onHeight={setSheetH}
              media={mediaQ.data ?? null}
              onOpenMedia={(items, index, title) => setViewer({ items, index, title })}
              nextStep={unit.trip && tripActions.nextLabel(unit.trip.status) ? {
                label: tripActions.nextLabel(unit.trip.status)!,
                onPress: () => tripActions.advance(unit.trip!.id, unit.trip!.status, unit.trip!.ref_id),
              } : null}
              onCancelTrip={unit.trip ? () => tripActions.cancel(unit.trip!.id, unit.trip!.ref_id) : null}
              busy={tripActions.busy}
              onShare={unit.trip ? () => setShareChoose(true) : null}
              onShowRoute={unit.trip && unit.position ? toggleRoute : null}
              routeShown={focusMode === 'overview'}
              halts={trailQ.data?.halts ?? null}
              timeSplit={trailQ.data?.time_split ?? null}
              finalEta={eta?.arrival && restSec != null && restStops.length >= 2 && lastStop
                ? { time: f.time(new Date(eta.arrival.getTime() + restSec * 1000).toISOString()), place: lastStop.name || lastStop.address }
                : null}
            />
          ) : unit ? null : groupUnits.length ? (
            <GroupSheet units={groupUnits} now={now} onPick={pick} onZoom={() => mapRef.current?.fitKeys(group ?? [])} onClose={() => setGroup(null)} onHeight={setSheetH} />
          ) : lane ? (
            <LaneSheet
              key={laneKey!}
              from={lane.from}
              to={lane.to}
              road={laneRoad}
              radiusKm={laneKm}
              onWiden={() => setWidened(laneKey)}
              free={free}
              toStart={toStart}
              runs={runs}
              arrivals={arrivals}
              booked={scheduled}
              bookedCapped={inbox.scheduled.length >= 100}
              f={f}
              now={now}
              onSwap={() => setQuery(`${lane.to.label} to ${lane.from.label}`)}
              onClose={() => setQuery('')}
              onPickTruck={pick}
              onCreateTrip={createOnLane}
              onOpenTrip={(id) => router.push({ pathname: '/trip-details', params: { id } })}
              onFindTruck={setFindFor}
              onHeight={setSheetH}
            />
          ) : notLive && quietUnits.length ? (
            <NotLiveSheet units={quietUnits} now={now} onPick={pick} onClose={() => setNotLive(false)} onHeight={setSheetH} />
          ) : (
            <>
              {attention.length ? (
                <TouchableOpacity style={[s.attn, { bottom: sheetH + 32 }]} onPress={() => { Haptics.selectionAsync().catch(() => {}); setView('list'); setListTab('attention'); }} activeOpacity={0.85} accessibilityLabel="Show what needs attention">
                  <AlertTriangle size={14} color="#FFFFFF" strokeWidth={2.4} />
                  <Text style={s.attnText}>{attention.length} need{attention.length === 1 ? 's' : ''} attention</Text>
                </TouchableOpacity>
              ) : null}
              {place ? (
                <NearSheet
                  place={place}
                  radius={radius}
                  onRadius={(km) => setRadiusFor({ key: placeKey, km })}
                  freeOnly={freeOnly}
                  onFreeOnly={setFreeOnly}
                  units={byFilter}
                  now={now}
                  onPick={pick}
                  onClose={clearPlace}
                  onHeight={setSheetH}
                />
              ) : (
                <SummarySheet
                  units={all}
                  now={now}
                  f={f}
                  onFilter={(v) => { setFilter(v); setView('map'); }}
                  onPick={pick}
                  onNotLive={() => { setGroup(null); setNotLive(true); }}
                  onCustomerPage={setCustomerPage}
                  onHeight={setSheetH}
                />
              )}
            </>
          )}
        </View>
      )}

      {unit?.trip ? (
        <ShareKindSheet
          visible={shareChoose}
          title={`WhatsApp · ${unit.vehicle?.plate_number ?? unit.trip.ref_id ?? 'truck'}`}
          delayed={isDelayed(unit)}
          customer={unit.trip.customer_id ? { id: unit.trip.customer_id, name: unit.trip.customer_name ?? 'Customer' } : null}
          onCustomerPage={(c) => { setShareChoose(false); setTimeout(() => setCustomerPage(c), 300); }}
          // One sheet closes before the next opens (two modals at once don't show on iOS).
          onPick={(k) => { setShareChoose(false); setTimeout(() => setShareKind(k), 300); }}
          onClose={() => setShareChoose(false)}
        />
      ) : null}
      {unit?.trip && shareKind ? <TripShareFromMap tripId={unit.trip.id} kind={shareKind} onClose={() => setShareKind(null)} /> : null}
      {bulk ? <BulkStatusSheet key={bulk.ids.join(',')} tripIds={bulk.ids} positions={bulk.positions} onClose={() => { setBulk(null); setPicked(null); }} /> : null}
      <FindTruckSheet tripId={findFor} units={all} onClose={() => setFindFor(null)} onAssigned={(message) => setToast({ message, type: 'success' })} />
      <CustomerPageSheet customer={customerPage} onClose={() => setCustomerPage(null)} onToast={(message) => setToast({ message, type: 'success' })} />
      <MediaViewer items={viewer?.items ?? null} startIndex={viewer?.index ?? 0} title={viewer?.title ?? ''} onClose={() => setViewer(null)} />
      <Toast visible={!!toast} message={toast?.message ?? ''} type={toast?.type ?? 'success'} onDismiss={() => setToast(null)} />
    </SafeAreaView>
  );
}

/** Two or three choices side by side, the picked one filled. */
function Segment({ options, value, onChange }: { options: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <View style={s.seg}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <TouchableOpacity key={o.id} style={[s.segBtn, on && s.segOn]} onPress={() => onChange(o.id)} activeOpacity={0.8} accessibilityState={{ selected: on }}>
            <Text style={[s.segText, on && { color: '#FFFFFF' }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** A map control: an icon, with a one-word caption when the icon alone wouldn't say what it does. */
function Ctl({ icon: Icon, label, caption, on, onPress, rotate }: { icon: LucideIcon; label: string; caption?: string; on?: boolean; onPress: () => void; rotate?: number }) {
  const color = on ? '#FFFFFF' : INK;
  return (
    <TouchableOpacity style={[s.ctl, caption ? s.ctlTall : null, on && s.ctlOn]} onPress={onPress} accessibilityLabel={label} activeOpacity={0.7}>
      <View style={rotate != null ? { transform: [{ rotate: `${rotate}deg` }] } : undefined}>
        <Icon size={18} color={color} strokeWidth={2.1} />
      </View>
      {caption ? <Text style={[s.ctlCaption, { color }]}>{caption}</Text> : null}
    </TouchableOpacity>
  );
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 };

const s = StyleSheet.create({
  controls: { paddingHorizontal: 16, paddingBottom: 10, gap: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: 12, backgroundColor: '#FFFFFF', paddingHorizontal: 12, borderWidth: 1, borderColor: LINE },
  searchInput: { flex: 1, fontSize: 15, color: INK, paddingVertical: 0 },
  pills: { paddingHorizontal: 16, gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE },
  pillOn: { backgroundColor: INK, borderColor: INK },
  pillText: { fontSize: 13, fontWeight: '600', color: '#3F3F46' },
  pillCount: { fontSize: 13, color: MUTED, fontVariant: ['tabular-nums'] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  near: { flex: 1, fontSize: 13, fontWeight: '600', color: '#3F3F46' },
  nearLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nearMe: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 28, borderRadius: 14, backgroundColor: '#E0F2FE' },
  nearMeText: { fontSize: 12, fontWeight: '700', color: '#0369A1' },
  suggest: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: LINE, paddingHorizontal: 12, paddingVertical: 6 },
  suggestHead: { fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, paddingVertical: 4 },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 },
  suggestText: { flex: 1, fontSize: 14, color: INK },
  suggestLink: { color: '#FA634E', textDecorationLine: 'underline' },

  pickBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: LINE },
  pickText: { fontSize: 14, fontWeight: '700', color: INK },
  pickChip: { flexShrink: 1, borderRadius: 14, borderWidth: 1, borderColor: LINE, paddingHorizontal: 10, paddingVertical: 5 },
  pickChipText: { fontSize: 12, fontWeight: '600', color: INK },
  pickCancel: { fontSize: 13, fontWeight: '600', color: MUTED, marginLeft: 'auto' },
  listHint: { fontSize: 12, color: MUTED, paddingTop: 10, paddingBottom: 2 },
  sendBar: { position: 'absolute', left: 16, right: 16, bottom: 24, height: 52, borderRadius: 16, backgroundColor: '#25D366', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadow },
  sendBarText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  listBox: { flex: 1, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: LINE },
  empty: { textAlign: 'center', color: MUTED, paddingTop: 40, fontSize: 14 },

  attn: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#D92D20', borderRadius: 18, paddingHorizontal: 12, height: 34, ...shadow },
  attnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },


  // map overlays
  topLeft: { position: 'absolute', top: 12, left: 12, gap: 8, alignItems: 'flex-start' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 10, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.95)', ...shadow },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: 12, fontWeight: '600', color: INK },
  liveAgo: { fontSize: 12, color: MUTED },
  speed: { width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center', ...shadow },
  speedNum: { fontSize: 20, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  speedUnit: { fontSize: 10, color: MUTED },
  recenter: {
    position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, ...shadow,
  },
  recenterText: { fontSize: 13, fontWeight: '700', color: INK },
  menu: { position: 'absolute', top: 12, right: 64, width: 230, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, gap: 8, ...shadow },
  menuHead: { fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  menuRowText: { fontSize: 13, fontWeight: '600', color: INK, flexShrink: 1 },
  seg: { flexDirection: 'row', backgroundColor: '#F1F1F3', borderRadius: 10, padding: 3 },
  segBtn: { flex: 1, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: INK },
  segText: { fontSize: 13, fontWeight: '600', color: INK },
  ctlCol: { position: 'absolute', right: 12, gap: 8 },
  ctlGroup: { backgroundColor: '#FFFFFF', borderRadius: 14, ...shadow },
  ctl: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ctlRule: { height: 1, marginHorizontal: 9, backgroundColor: '#F1F1F3' },
  ctlOn: { backgroundColor: INK },
  ctlTall: { height: 50, gap: 1 },
  ctlCaption: { fontSize: 10, fontWeight: '700' },
});
