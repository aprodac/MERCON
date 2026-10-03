import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, ChevronsLeft, List, MapPin, PanelLeftOpen, Plus, Search, Truck, X,
} from 'lucide-react';
import { toast } from 'sonner';
import FleetCommandMap, { type MapArea, type PreviewTrip } from '@/components/maps/live/FleetCommandMap';
import { GLASS } from '@/components/maps/live/LiveUnitPanel';
import { TONE } from '@/components/maps/live/liveMapStyle';
import ConfirmModal from '@/components/ui/ConfirmModal';
import PostTripSettlementModal from '@/components/trips/PostTripSettlementModal';
import QuickAssignModal from '@/components/trips/QuickAssignModal';
import { cn } from '@/lib/utils';
import { formatInDeploymentTz, useDeploymentTimezone } from '@/lib/datetime';
import { LIVE_FILTERS, isOffline, matchesFilter, matchesQuery, timeAgo, type LiveFilter } from '@/lib/fleetLive';
import {
  OPS_TABS, STATUS_LABEL, attentionReasons, groupSchedule, isActiveTrip, isPlannedTrip, isThirdParty, matchesTripQuery, needsConfirm,
  nextStopIndex, sortActive, toLiveStops, type AttentionReason, type OpsTab,
} from '@/lib/liveOps';
import { defaultRadiusKm, isFreeTruck, lookupCity, tripsOnRoute, tripsTouching, unitsNear } from '@/lib/placeSearch';
import { fleetLiveService, type LiveUnit } from '@/services/fleetLiveService';
import { tripService, type Trip, type TripStatus } from '@/services/tripService';
import OpsTripCard from './components/OpsTripCard';
import FleetUnitRow from './components/FleetUnitRow';
import AssignTruckPanel from './components/AssignTruckPanel';
import { pickupOf, useTruckCandidates } from './useTruckCandidates';
import PlaceResults, { type PlaceResultsData } from './components/PlaceResults';
import { usePlaceSearch } from './usePlaceSearch';

const LIVE_REFRESH_MS = 15_000;
const TRIPS_REFRESH_MS = 30_000;
const PANEL_KEY = 'mercon.liveMapPage.panel';
/** Old drafts nobody will run clutter the schedule; only recent or upcoming ones are listed. */
const DRAFT_LOOKBACK_DAYS = 14;
/** Floating panel width, and the gap it keeps from the screen edge. */
const PANEL_W = 380;
const EDGE = 12;
const RAIL_W = 52;

const TAB_ICON: Record<OpsTab, typeof Activity> = {
  active: Activity,
  attention: AlertTriangle,
  scheduled: CalendarClock,
  fleet: Truck,
  done: CheckCircle2,
};

const REASON_WEIGHT: Record<AttentionReason, number> = { delayed: 0, overdue_stop: 1, late_start: 2, unassigned: 3, no_gps: 4 };

const DESKTOP_QUERY = '(min-width: 1024px)';

/** Desktop floats the panel beside the map's content; smaller screens open it over the whole map. */
function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const on = () => setDesktop(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return desktop;
}

function readPanelPref(): boolean {
  // On a phone the panel covers the whole map, so the page always opens on the map.
  if (typeof window !== 'undefined' && !window.matchMedia(DESKTOP_QUERY).matches) return false;
  try {
    return localStorage.getItem(PANEL_KEY) !== 'closed';
  } catch {
    return true;
  }
}

type ConfirmState = { trip: Trip; status: string } | null;

function confirmCopy(trip: Trip, to: string): { title: string; message: string; label: string; destructive: boolean } {
  if (to === 'Cancelled') {
    return {
      title: `Cancel ${trip.ref_id}?`,
      message: 'The trip leaves the live board. It can be restored to Draft or Scheduled later.',
      label: 'Cancel trip',
      destructive: true,
    };
  }
  if (to === 'Completed') {
    return {
      title: `Complete ${trip.ref_id}?`,
      message: 'This closes the trip and generates its invoice. You can add extra charges straight after.',
      label: 'Mark completed',
      destructive: false,
    };
  }
  if (to === 'Draft') {
    return {
      title: `Send ${trip.ref_id} back to Draft?`,
      message: 'Its driver and truck are released back to Available.',
      label: 'Move to Draft',
      destructive: false,
    };
  }
  return {
    title: `Reopen ${trip.ref_id}?`,
    message: `It moves from ${STATUS_LABEL[trip.status] ?? trip.status} back to ${STATUS_LABEL[to] ?? to}.`,
    label: 'Reopen',
    destructive: false,
  };
}

const SEARCH_EXAMPLES = ['riyadh to jeddah', 'near dammam', 'jubail'];

/**
 * Live map — a full-screen fleet map. The Live operations panel floats over
 * it: what is on the road, what needs attention, what is scheduled and every
 * truck. The search box also reads places ("near dammam", "riyadh to
 * jeddah"), and a trip without a truck can be given the nearest free one in
 * one click.
 */
export default function LiveMapPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = useDeploymentTimezone();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') as OpsTab | null;
  const tab: OpsTab = OPS_TABS.some((t) => t.id === tabParam) ? tabParam! : 'active';
  const setTab = (next: OpsTab) => setParams((p) => { p.set('tab', next); return p; }, { replace: true });

  const [query, setQuery] = useState('');
  const [fleetFilter, setFleetFilter] = useState<LiveFilter>('all');
  const [panelOpen, setPanelOpen] = useState(readPanelPref);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedUnitKey, setSelectedUnitKey] = useState<string | null>(null);
  const [previewTripId, setPreviewTripId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ tripId?: string; unitKey?: string; nonce: number }>({ nonce: 0 });
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [settlementTrip, setSettlementTrip] = useState<Trip | null>(null);
  const [manualAssignTrip, setManualAssignTrip] = useState<Trip | null>(null);
  const [findTruckTripId, setFindTruckTripId] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const [freeOnly, setFreeOnly] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const isDesktop = useIsDesktop();

  const setPanel = useCallback((open: boolean) => {
    setPanelOpen(open);
    try { localStorage.setItem(PANEL_KEY, open ? 'open' : 'closed'); } catch { /* storage blocked */ }
  }, []);

  const formatTime = useCallback(
    (iso: string) => {
      const d = new Date(iso);
      const sameDay = formatInDeploymentTz(d, tz, 'yyyy-MM-dd') === formatInDeploymentTz(new Date(), tz, 'yyyy-MM-dd');
      return formatInDeploymentTz(d, tz, sameDay ? 'HH:mm' : 'EEE d MMM, HH:mm');
    },
    [tz],
  );

  // ── Data ──
  // Same key as the map's own query, so both read one cache and one request.
  const liveQ = useQuery({
    queryKey: ['fleet-live-map'],
    queryFn: fleetLiveService.getLiveMap,
    refetchInterval: LIVE_REFRESH_MS,
    refetchIntervalInBackground: false,
  });
  const openQ = useQuery({
    queryKey: ['live-ops-trips', 'open'],
    queryFn: async () => (await tripService.getAll({ status: 'Draft,Scheduled,Loading,InTransit,Delayed', per_page: 1000 })).data ?? [],
    refetchInterval: TRIPS_REFRESH_MS,
  });
  const doneQ = useQuery({
    queryKey: ['live-ops-trips', 'done'],
    queryFn: async () =>
      (await tripService.getAll({
        status: 'Completed,Invoiced',
        // Finished in the last 3 days. Filtering on the planned start hid a late trip
        // completed today (planned last week), so "Completed" looked like it hadn't saved.
        ended_since: new Date(Date.now() - 3 * 86_400_000).toISOString(),
        per_page: 500,
      })).data ?? [],
    refetchInterval: 60_000,
  });

  const units = useMemo(() => liveQ.data?.units ?? [], [liveQ.data]);
  const unitByTrip = useMemo(() => {
    const m = new Map<string, LiveUnit>();
    for (const u of units) if (u.trip) m.set(u.trip.id, u);
    return m;
  }, [units]);

  // Re-evaluated with every refresh, so "late" and "overdue" move on with the clock.
  const now = Math.max(openQ.dataUpdatedAt, liveQ.dataUpdatedAt) || Date.now();
  const openTrips = useMemo(() => {
    const cutoff = now - DRAFT_LOOKBACK_DAYS * 86_400_000;
    return (openQ.data ?? []).filter((t) => {
      if (t.status !== 'Draft') return true;
      const when = t.planned_start ?? t.createdAt;
      return !when || new Date(when).getTime() >= cutoff;
    });
  }, [openQ.data, now]);

  const reasonsById = useMemo(() => {
    const m = new Map<string, AttentionReason[]>();
    for (const t of openTrips) m.set(t.id, attentionReasons(t, unitByTrip.get(t.id) ?? null, now));
    return m;
  }, [openTrips, unitByTrip, now]);

  const dayKey = useCallback((d: Date) => formatInDeploymentTz(d, tz, 'yyyy-MM-dd'), [tz]);
  const today = dayKey(new Date(now));

  // ── Search: plain text filters the lists; places switch to place results ──
  const placeSearch = usePlaceSearch(query);
  const placeMode = placeSearch.kind !== 'text';
  const textQuery = placeMode ? '' : query;
  // A lone city name ("jubail") still searches as text, but offers the place searches too.
  const citySuggestion = !placeMode && !/\d/.test(query) ? lookupCity(query) : null;

  const lists = useMemo(() => {
    const q = (t: Trip) => matchesTripQuery(t, textQuery);
    const active = sortActive(openTrips.filter((t) => isActiveTrip(t) && q(t)));
    const planned = openTrips.filter((t) => isPlannedTrip(t) && q(t));
    const attention = openTrips
      .filter((t) => (reasonsById.get(t.id)?.length ?? 0) > 0 && q(t))
      .sort((a, b) => {
        const wa = Math.min(...reasonsById.get(a.id)!.map((r) => REASON_WEIGHT[r]));
        const wb = Math.min(...reasonsById.get(b.id)!.map((r) => REASON_WEIGHT[r]));
        return wa - wb;
      });
    const done = (doneQ.data ?? [])
      .filter((t) => dayKey(new Date(t.actual_end ?? t.planned_start ?? t.updatedAt)) === today && q(t))
      .sort((a, b) => new Date(b.actual_end ?? b.updatedAt).getTime() - new Date(a.actual_end ?? a.updatedAt).getTime());
    const fleet = units
      .filter((u) => matchesFilter(u, fleetFilter) && matchesQuery(u, textQuery))
      .sort((a, b) => Number(!a.position) - Number(!b.position) || Number(isOffline(a)) - Number(isOffline(b)));
    return { active, planned, attention, done, fleet };
  }, [openTrips, reasonsById, doneQ.data, units, fleetFilter, textQuery, dayKey, today]);

  const scheduleGroups = useMemo(
    () => groupSchedule(lists.planned, dayKey, (k) => formatInDeploymentTz(new Date(`${k}T12:00:00Z`), 'UTC', 'EEEE d MMM'), now),
    [lists.planned, dayKey, now],
  );

  const placeResults = useMemo<{ data: PlaceResultsData; areas: MapArea[]; keys: Set<string> } | null>(() => {
    if (placeSearch.kind === 'near' && placeSearch.status === 'ready' && placeSearch.place) {
      const place = placeSearch.place;
      const r = radiusKm ?? defaultRadiusKm(place);
      const pool = freeOnly ? units.filter(isFreeTruck) : units;
      const trucks = unitsNear(pool, place, r);
      const nearestOutside = trucks.length ? [] : unitsNear(pool, place, Infinity).slice(0, 3);
      const trips = sortActive(tripsTouching(openTrips, place, r));
      const shown = trucks.length ? trucks : nearestOutside;
      return {
        data: { kind: 'near', place, radiusKm: r, trucks, nearestOutside, trips },
        areas: [{ id: 'near', label: place.label, lat: place.lat, lng: place.lng, radiusKm: r }],
        keys: new Set([...shown.map((x) => x.unit.key), ...trips.map((t) => unitByTrip.get(t.id)?.key).filter((k): k is string => !!k)]),
      };
    }
    if (placeSearch.kind === 'route' && placeSearch.status === 'ready' && placeSearch.from && placeSearch.to) {
      const { from, to } = placeSearch;
      const r = radiusKm ?? Math.max(defaultRadiusKm(from), defaultRadiusKm(to));
      const onRoute = tripsOnRoute(openTrips, from, to, r);
      const running = sortActive(onRoute.filter(isActiveTrip));
      const scheduled = onRoute.filter(isPlannedTrip).sort((a, b) => (a.planned_start ?? '').localeCompare(b.planned_start ?? ''));
      const free = units.filter(isFreeTruck);
      const freeNearFrom = unitsNear(free, from, r);
      const nearestFreeOutside = freeNearFrom.length ? [] : unitsNear(free, from, Infinity).slice(0, 3);
      const runningKeys = running.map((t) => unitByTrip.get(t.id)?.key).filter((k): k is string => !!k);
      return {
        data: { kind: 'route', from, to, radiusKm: r, running, scheduled, freeNearFrom, nearestFreeOutside },
        areas: [
          { id: 'from', label: from.label, lat: from.lat, lng: from.lng, radiusKm: r },
          { id: 'to', label: to.label, lat: to.lat, lng: to.lng, radiusKm: r },
        ],
        keys: new Set([...runningKeys, ...(freeNearFrom.length ? freeNearFrom : nearestFreeOutside).map((x) => x.unit.key)]),
      };
    }
    return null;
  }, [placeSearch, radiusKm, freeOnly, units, openTrips, unitByTrip]);

  const tabCount: Record<OpsTab, number> = {
    active: lists.active.length,
    attention: lists.attention.length,
    scheduled: lists.planned.length,
    fleet: lists.fleet.length,
    done: lists.done.length,
  };

  // ── Selection ↔ map ──
  const previewRef = useRef(previewTripId);
  previewRef.current = previewTripId;

  const allTrips = useMemo(() => [...openTrips, ...(doneQ.data ?? [])], [openTrips, doneQ.data]);
  const findTruckTrip = useMemo(() => (findTruckTripId ? openTrips.find((t) => t.id === findTruckTripId) ?? null : null), [findTruckTripId, openTrips]);
  const candidates = useTruckCandidates(findTruckTrip, units);

  const previewTrip: PreviewTrip | null = useMemo(() => {
    const t = previewTripId ? allTrips.find((x) => x.id === previewTripId) : null;
    if (!t) return null;
    const active = isActiveTrip(t);
    const tone = active ? 'live' : t.status === 'Completed' || t.status === 'Invoiced' ? 'done' : t.status === 'Cancelled' ? 'cancelled' : 'planned';
    const subtitle = [
      t.customer?.name,
      active ? 'no live GPS — planned stops' : t.planned_start ? `starts ${formatTime(t.planned_start)}` : null,
    ].filter(Boolean).join(' · ');
    return {
      id: t.id,
      title: t.ref_id,
      subtitle,
      stops: toLiveStops(t.stops ?? []),
      next_stop_index: active ? nextStopIndex(t.stops ?? []) : null,
      tone,
    };
  }, [previewTripId, allTrips, formatTime]);

  const selectTrip = useCallback(
    (t: Trip) => {
      setSelectedTripId(t.id);
      if (!isDesktop) setPanel(false);
      const u = unitByTrip.get(t.id);
      if (u?.position) {
        setPreviewTripId(null);
        setFocus((f) => ({ tripId: t.id, nonce: f.nonce + 1 }));
      } else {
        setPreviewTripId(t.id);
        setFocus((f) => ({ nonce: f.nonce + 1 }));
      }
    },
    [unitByTrip, isDesktop, setPanel],
  );

  const selectUnit = useCallback((u: LiveUnit) => {
    if (!isDesktop) setPanel(false);
    setPreviewTripId(null);
    setSelectedUnitKey(u.key);
    setSelectedTripId(u.trip?.id ?? null);
    setFocus((f) => ({ unitKey: u.key, nonce: f.nonce + 1 }));
  }, [isDesktop, setPanel]);

  const onMapSelected = useCallback((u: LiveUnit | null) => {
    setSelectedUnitKey(u?.key ?? null);
    if (u) setSelectedTripId(u.trip?.id ?? null);
    else if (!previewRef.current) setSelectedTripId(null);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewTripId(null);
    setSelectedTripId(null);
  }, []);

  /** A trip without a truck gets the nearest-truck finder; one missing only a driver, the manual picker. */
  const startAssign = useCallback((t: Trip) => {
    if (t.vehicle || isThirdParty(t)) {
      setManualAssignTrip(t);
      return;
    }
    setPanel(true);
    setFindTruckTripId(t.id);
    setSelectedTripId(t.id);
    setPreviewTripId(t.id);
    setFocus((f) => ({ nonce: f.nonce + 1 }));
  }, [setPanel]);

  const endAssign = useCallback(() => {
    setFindTruckTripId(null);
    setPreviewTripId(null);
  }, []);

  // Keep the picked row in view when it was picked on the map.
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const setRowRef = (id: string) => (el: HTMLElement | null) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  };
  useEffect(() => {
    const id = tab === 'fleet' || placeMode ? selectedUnitKey ?? selectedTripId : selectedTripId;
    if (id) rowRefs.current.get(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedTripId, selectedUnitKey, tab, placeMode]);

  // A new place search starts from its own default radius.
  const placeKey = placeSearch.kind === 'near' ? placeSearch.text : placeSearch.kind === 'route' ? `${placeSearch.fromText}>${placeSearch.toText}` : '';
  useEffect(() => { setRadiusKm(null); }, [placeKey]);

  // ── Status changes ──
  const invalidateTrips = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['live-ops-trips'] });
    queryClient.invalidateQueries({ queryKey: ['fleet-live-map'] });
    queryClient.invalidateQueries({ queryKey: ['trips'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-trips'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
  }, [queryClient]);

  const statusMutation = useMutation({
    mutationFn: ({ trip, status }: { trip: Trip; status: string }) => tripService.updateStatus(trip.id, status as TripStatus),
    onMutate: async ({ trip, status }) => {
      setPendingIds((s) => new Set(s).add(trip.id));
      // Move the card straight away; the refetch after settles the truth.
      await queryClient.cancelQueries({ queryKey: ['live-ops-trips', 'open'] });
      const prev = queryClient.getQueryData<Trip[]>(['live-ops-trips', 'open']);
      queryClient.setQueryData<Trip[]>(['live-ops-trips', 'open'], (old) =>
        (old ?? []).map((t) => (t.id === trip.id ? { ...t, status } : t)),
      );
      return { prev };
    },
    onSuccess: (updated, { trip, status }) => {
      toast.success(`${trip.ref_id} → ${STATUS_LABEL[status] ?? status}`);
      if (status === 'Completed') setSettlementTrip(updated ?? { ...trip, status });
    },
    onError: (err: unknown, { trip }, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['live-ops-trips', 'open'], ctx.prev);
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ? `${trip.ref_id}: ${msg}` : `Couldn't update ${trip.ref_id}`);
    },
    onSettled: (_d, _e, { trip }) => {
      setPendingIds((s) => { const n = new Set(s); n.delete(trip.id); return n; });
      invalidateTrips();
    },
  });

  const requestStatus = (trip: Trip, status: string) => {
    if (status === trip.status) return;
    if (needsConfirm(trip.status, status)) setConfirm({ trip, status });
    else statusMutation.mutate({ trip, status });
  };

  // ── Keyboard: "/" searches, "[" toggles the panel ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        setPanel(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      } else if (e.key === '[') {
        setPanel(!panelOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen, setPanel]);

  const exit = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));

  const mapFilter: LiveFilter = tab === 'fleet' ? fleetFilter : tab === 'active' ? 'on_trip' : 'all';
  // Finding a truck: a circle round the pickup that reaches the closest few candidates, so the map frames them.
  const findTruckArea = useMemo<MapArea[] | undefined>(() => {
    const pickup = findTruckTrip ? pickupOf(findTruckTrip) : null;
    if (!pickup || candidates.length === 0) return undefined;
    // The two closest decide the zoom; a far third one shouldn't zoom the map out to the whole country.
    const reach = candidates.slice(0, 2).reduce((m, c) => Math.max(m, c.km), 0);
    return [{ id: 'pickup', label: 'Pickup', lat: pickup.lat, lng: pickup.lng, radiusKm: Math.min(150, Math.max(5, Math.ceil(reach * 1.15))) }];
  }, [findTruckTrip, candidates]);
  const mapOnlyKeys = findTruckTrip ? new Set(candidates.map((c) => c.unit.key)) : placeResults?.keys ?? null;
  const loading = openQ.isLoading || (tab === 'done' && doneQ.isLoading) || (tab === 'fleet' && liveQ.isLoading);
  const lastUpdate = liveQ.dataUpdatedAt ? timeAgo(new Date(liveQ.dataUpdatedAt).toISOString()) : null;
  const insetLeft = !isDesktop ? 0 : panelOpen ? PANEL_W + EDGE : RAIL_W + EDGE;

  const renderTrip = (t: Trip) => (
    <OpsTripCard
      key={t.id}
      ref={setRowRef(t.id)}
      trip={t}
      unit={unitByTrip.get(t.id) ?? null}
      reasons={t.status === 'Completed' || t.status === 'Invoiced' ? [] : reasonsById.get(t.id) ?? []}
      selected={selectedTripId === t.id}
      pendingStatus={pendingIds.has(t.id)}
      formatTime={formatTime}
      onSelect={() => selectTrip(t)}
      onChangeStatus={(s) => requestStatus(t, s)}
      onAssign={() => startAssign(t)}
      onOpen={() => navigate(`/trips/${t.id}`)}
    />
  );

  const searchBox = (
    <div className="px-3 pt-3">
      <div className="flex h-10 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 focus-within:border-charcoal/30 focus-within:ring-2 focus-within:ring-charcoal/10 dark:border-white/10 dark:bg-slate-900">
        {placeMode ? <MapPin className="size-4 shrink-0 text-sky-600" /> : <Search className="size-4 shrink-0 text-muted-foreground" />}
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); } }}
          placeholder="Trip, truck, driver — or riyadh to jeddah"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          aria-label="Search trips, trucks and places"
        />
        {query ? (
          <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        ) : (
          <kbd className="hidden rounded border border-black/10 px-1.5 text-[10px] text-muted-foreground sm:inline dark:border-white/15">/</kbd>
        )}
      </div>
      {!query && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          <span>Try</span>
          {SEARCH_EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => setQuery(ex)} className="rounded-full bg-slate-100 px-2 py-0.5 text-foreground hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700">
              {ex}
            </button>
          ))}
        </div>
      )}
      {citySuggestion && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          <button type="button" onClick={() => setQuery(`near ${citySuggestion.label}`)} className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-sky-700">
            <MapPin className="size-3" /> Trucks near {citySuggestion.label}
          </button>
          <button type="button" onClick={() => { setQuery(`${citySuggestion.label} to `); searchRef.current?.focus(); }} className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-800 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300">
            {citySuggestion.label} to …
          </button>
        </div>
      )}
    </div>
  );

  const tabs = (
    <>
      <div className="px-3 pt-3" role="tablist" aria-label="Live map lists">
        <div className="flex gap-0.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/70">
          {OPS_TABS.map((t) => {
            const Icon = TAB_ICON[t.id];
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.id)}
                title={t.label}
                className={cn(
                  'flex min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[11px] font-medium transition-colors',
                  on ? 'flex-[2.2] bg-white text-foreground shadow-sm dark:bg-slate-950' : 'flex-1 text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className={cn('size-3.5 shrink-0', t.id === 'attention' && tabCount.attention > 0 && 'text-rose-600')} />
                {on && <span className="truncate">{t.label}</span>}
                <span className={cn('tabular-nums', on ? 'text-foreground' : 'opacity-70')}>{tabCount[t.id]}</span>
              </button>
            );
          })}
        </div>
      </div>
      {tab === 'fleet' && (
        <div className="flex flex-wrap gap-1 px-3 pt-2">
          {LIVE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFleetFilter(f.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                fleetFilter === f.id
                  ? 'border-charcoal bg-charcoal text-white dark:border-white dark:bg-white dark:text-slate-900'
                  : 'border-black/10 text-muted-foreground hover:text-foreground dark:border-white/15',
              )}
            >
              {f.id === 'on_trip' && <span className={cn('size-1.5 rounded-full', TONE.active.dot)} />}
              {f.id === 'delayed' && <span className={cn('size-1.5 rounded-full', TONE.delayed.dot)} />}
              {f.id === 'free' && <span className={cn('size-1.5 rounded-full', TONE.free.dot)} />}
              {f.id === 'offline' && <span className="size-1.5 rounded-full bg-slate-400" />}
              {f.label}
              <span className="tabular-nums opacity-60">{units.filter((u) => matchesFilter(u, f.id)).length}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );

  const tabList = loading ? (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)}
    </div>
  ) : openQ.isError && tab !== 'fleet' ? (
    <Empty title="Couldn't load trips" hint="Check the connection — the list retries on its own." />
  ) : tab === 'active' ? (
    lists.active.length ? <div className="space-y-2">{lists.active.map(renderTrip)}</div>
      : <Empty title={query ? 'No active trips match' : 'Nothing on the road'} hint={query ? 'Try another search.' : 'Trips show here once they are Loading or In transit.'} />
  ) : tab === 'attention' ? (
    lists.attention.length ? <div className="space-y-2">{lists.attention.map(renderTrip)}</div>
      : <Empty title="All clear" hint="No delays, late starts, missing drivers or lost GPS right now." good />
  ) : tab === 'scheduled' ? (
    scheduleGroups.length ? (
      <div className="space-y-4">
        {scheduleGroups.map((g) => (
          <section key={g.key}>
            <h3 className={cn(
              'sticky top-0 z-10 -mx-3 mb-2 flex items-center justify-between bg-white/95 px-3 py-1 text-[11px] font-semibold tracking-wide uppercase backdrop-blur dark:bg-slate-950/95',
              g.tone === 'bad' ? 'text-amber-700 dark:text-amber-400' : g.tone === 'muted' ? 'text-muted-foreground' : 'text-foreground',
            )}>
              <span>{g.label}</span>
              <span className="tabular-nums opacity-70">{g.trips.length}</span>
            </h3>
            <div className="space-y-2">{g.trips.map(renderTrip)}</div>
          </section>
        ))}
      </div>
    ) : <Empty title={query ? 'No scheduled trips match' : 'Nothing scheduled'} hint="Create a trip to plan the next run." />
  ) : tab === 'done' ? (
    lists.done.length ? <div className="space-y-2">{lists.done.map(renderTrip)}</div>
      : <Empty title="No trips completed today yet" />
  ) : lists.fleet.length ? (
    <div className="space-y-1">
      {lists.fleet.map((u) => (
        <FleetUnitRow key={u.key} ref={setRowRef(u.key)} unit={u} selected={selectedUnitKey === u.key} onSelect={() => selectUnit(u)} />
      ))}
    </div>
  ) : (
    <Empty title={liveQ.isError ? 'Live feed unavailable' : 'No trucks match'} hint={liveQ.isError ? 'Positions will return when the connection does.' : undefined} />
  );

  const panelBody = findTruckTrip ? (
    <AssignTruckPanel
      trip={findTruckTrip}
      candidates={candidates}
      selectedKey={selectedUnitKey}
      formatTime={formatTime}
      onBack={endAssign}
      onLocate={selectUnit}
      onManual={() => setManualAssignTrip(findTruckTrip)}
      onAssigned={() => { endAssign(); invalidateTrips(); }}
    />
  ) : (
    <div className="flex min-h-0 flex-1 flex-col">
      {searchBox}
      {!placeMode && tabs}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-4" role={placeMode ? undefined : 'tabpanel'}>
        {placeSearch.kind === 'text' ? tabList : (
          <PlaceResults
            status={placeSearch.status}
            missing={
              placeSearch.kind === 'near'
                ? [placeSearch.text]
                : [!placeSearch.from && placeSearch.fromText, !placeSearch.to && placeSearch.toText].filter((x): x is string => !!x)
            }
            data={placeResults?.data ?? null}
            selectedUnitKey={selectedUnitKey}
            freeOnly={freeOnly}
            onFreeOnly={setFreeOnly}
            onRadius={setRadiusKm}
            onClear={() => setQuery('')}
            onSelectUnit={selectUnit}
            renderTrip={renderTrip}
            setRowRef={setRowRef}
          />
        )}
      </div>
    </div>
  );

  const header = (
    <div className="flex items-center gap-2 border-b border-black/[0.06] px-3 py-2.5 dark:border-white/10">
      <div className="min-w-0 flex-1">
        <h1 className="text-[15px] font-semibold tracking-tight text-foreground">Live operations</h1>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="relative flex size-1.5">
            {!liveQ.isError && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
            <span className={cn('relative inline-flex size-1.5 rounded-full', liveQ.isError ? 'bg-rose-500' : 'bg-emerald-500')} />
          </span>
          {liveQ.isError ? 'Connection lost' : lastUpdate ? `Updated ${lastUpdate}` : 'Connecting…'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => navigate('/trips/new')}
        className="inline-flex h-8 items-center gap-1 rounded-lg bg-charcoal px-2.5 text-xs font-medium text-white hover:bg-charcoal/90 dark:bg-white dark:text-slate-900"
      >
        <Plus className="size-3.5" /> Trip
      </button>
      <button
        type="button"
        onClick={() => setPanel(false)}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800"
        aria-label="Close panel"
        title="Close panel  ["
      >
        {isDesktop ? <ChevronsLeft className="size-4" /> : <X className="size-4" />}
      </button>
    </div>
  );

  const confirmText = confirm ? confirmCopy(confirm.trip, confirm.status) : null;

  return (
    <div className="fixed inset-0 overflow-hidden bg-slate-100 dark:bg-slate-900">
      <div className="absolute inset-0">
        <FleetCommandMap
          focusTripId={focus.tripId}
          focusUnitKey={focus.unitKey}
          focusNonce={focus.nonce}
          filter={mapFilter}
          query={textQuery}
          hideFinder
          hideExpand
          onSelectedChange={onMapSelected}
          previewTrip={previewTrip}
          onPreviewClose={findTruckTrip ? undefined : closePreview}
          onlyKeys={mapOnlyKeys}
          areas={findTruckTrip ? findTruckArea : placeResults?.areas}
          insetLeft={insetLeft}
          topRight={
            <button
              type="button"
              onClick={exit}
              title="Leave the live map"
              className={cn('flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-foreground hover:bg-white dark:hover:bg-slate-900', GLASS)}
            >
              <ArrowLeft className="size-3.5" /> Exit
            </button>
          }
        />
      </div>

      {/* Desktop: floating panel, or a slim rail to open it */}
      {isDesktop && panelOpen && (
        <aside
          className="absolute z-20 flex flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white/95 shadow-[0_12px_40px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95"
          style={{ top: EDGE, bottom: EDGE, left: EDGE, width: PANEL_W - EDGE }}
        >
          {header}
          {panelBody}
        </aside>
      )}
      {isDesktop && !panelOpen && (
        <nav
          className={cn('absolute z-20 flex flex-col items-center gap-1 rounded-2xl py-2', GLASS)}
          style={{ top: EDGE, left: EDGE, width: RAIL_W - 8 }}
          aria-label="Live operations"
        >
          <button type="button" onClick={() => setPanel(true)} className="mb-1 flex size-9 items-center justify-center rounded-lg text-foreground hover:bg-black/5 dark:hover:bg-white/10" aria-label="Open Live operations" title="Live operations  [">
            <PanelLeftOpen className="size-4" />
          </button>
          <button type="button" onClick={() => { setPanel(true); requestAnimationFrame(() => searchRef.current?.focus()); }} className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10" aria-label="Search" title="Search  /">
            <Search className="size-4" />
          </button>
          <span className="my-1 h-px w-6 bg-black/10 dark:bg-white/10" />
          {OPS_TABS.map((t) => {
            const Icon = TAB_ICON[t.id];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTab(t.id); setPanel(true); }}
                title={`${t.label} — ${tabCount[t.id]}`}
                aria-label={`${t.label}, ${tabCount[t.id]}`}
                className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
              >
                <Icon className={cn('size-4', t.id === 'attention' && tabCount.attention > 0 && 'text-rose-600')} />
                {tabCount[t.id] > 0 && (
                  <span className={cn(
                    'absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 text-center text-[9px] leading-4 font-bold text-white',
                    t.id === 'attention' ? 'bg-rose-600' : 'bg-charcoal dark:bg-slate-600',
                  )}>
                    {tabCount[t.id] > 99 ? '99+' : tabCount[t.id]}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      )}

      {/* Small screens: a pill opens the panel over the whole map */}
      {!isDesktop && !panelOpen && (
        <button
          type="button"
          onClick={() => setPanel(true)}
          className={cn('absolute bottom-4 left-1/2 z-20 flex h-11 -translate-x-1/2 items-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap text-foreground', GLASS)}
        >
          <List className="size-4" />
          Live operations · {tabCount.active} active
          {tabCount.attention > 0 && <span className="rounded-full bg-rose-600 px-1.5 text-[11px] leading-5 font-bold text-white">{tabCount.attention}</span>}
        </button>
      )}
      {!isDesktop && panelOpen && (
        <div className="absolute inset-0 z-30 flex flex-col bg-white dark:bg-slate-950">
          {header}
          {panelBody}
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) statusMutation.mutate(confirm);
          setConfirm(null);
        }}
        title={confirmText?.title ?? ''}
        message={confirmText?.message}
        confirmLabel={confirmText?.label}
        isDestructive={confirmText?.destructive}
      />
      <PostTripSettlementModal
        isOpen={!!settlementTrip}
        onClose={() => setSettlementTrip(null)}
        trip={settlementTrip}
        onSuccess={() => {
          invalidateTrips();
          toast.success('Charges saved');
        }}
      />
      <QuickAssignModal
        isOpen={!!manualAssignTrip}
        onClose={() => setManualAssignTrip(null)}
        trip={manualAssignTrip}
        onSaved={() => { invalidateTrips(); endAssign(); }}
      />
    </div>
  );
}

function Empty({ title, hint, good }: { title: string; hint?: string; good?: boolean }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className={cn('mb-3 flex size-10 items-center justify-center rounded-full', good ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-200/60 text-slate-500 dark:bg-slate-800')}>
        {good ? <CheckCircle2 className="size-5" /> : <Search className="size-5" />}
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
