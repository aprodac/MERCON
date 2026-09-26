import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, CalendarClock, CheckCircle2, ChevronsLeft, ChevronsRight, List, Plus, Search, Truck, X,
} from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '@/components/layout/DashboardLayout';
import FleetCommandMap, { type PreviewTrip } from '@/components/maps/live/FleetCommandMap';
import { GLASS } from '@/components/maps/live/LiveUnitPanel';
import { TONE } from '@/components/maps/live/liveMapStyle';
import ConfirmModal from '@/components/ui/ConfirmModal';
import PostTripSettlementModal from '@/components/trips/PostTripSettlementModal';
import QuickAssignModal from '@/components/trips/QuickAssignModal';
import { cn } from '@/lib/utils';
import { formatInDeploymentTz, useDeploymentTimezone } from '@/lib/datetime';
import { LIVE_FILTERS, isOffline, matchesFilter, matchesQuery, timeAgo, type LiveFilter } from '@/lib/fleetLive';
import {
  OPS_TABS, STATUS_LABEL, attentionReasons, groupSchedule, isActiveTrip, isPlannedTrip, matchesTripQuery, needsConfirm,
  nextStopIndex, sortActive, toLiveStops, type AttentionReason, type OpsTab,
} from '@/lib/liveOps';
import { fleetLiveService, type LiveUnit } from '@/services/fleetLiveService';
import { tripService, type Trip, type TripStatus } from '@/services/tripService';
import OpsTripCard from './components/OpsTripCard';
import FleetUnitRow from './components/FleetUnitRow';

const LIVE_REFRESH_MS = 15_000;
const TRIPS_REFRESH_MS = 30_000;
const SIDEBAR_KEY = 'mercon.liveMapPage.sidebar';
/** Old drafts nobody will run clutter the schedule; only recent or upcoming ones are listed. */
const DRAFT_LOOKBACK_DAYS = 14;

const TAB_ICON: Record<OpsTab, typeof Activity> = {
  active: Activity,
  attention: AlertTriangle,
  scheduled: CalendarClock,
  fleet: Truck,
  done: CheckCircle2,
};

const REASON_WEIGHT: Record<AttentionReason, number> = { delayed: 0, overdue_stop: 1, late_start: 2, unassigned: 3, no_gps: 4 };

const DESKTOP_QUERY = '(min-width: 1024px)';

/** Desktop gets the docked sidebar, smaller screens the list over the map — only one is ever mounted. */
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

function readSidebarPref(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== 'closed';
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

/**
 * Live map — the whole fleet on one screen. The sidebar lists what is on the
 * road, what needs attention, what is scheduled and every truck; picking one
 * flies the map to it (or draws its planned route when it has no GPS), and
 * its status can be moved on without leaving the map.
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
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarPref);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedUnitKey, setSelectedUnitKey] = useState<string | null>(null);
  const [previewTripId, setPreviewTripId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ tripId?: string; unitKey?: string; nonce: number }>({ nonce: 0 });
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [settlementTrip, setSettlementTrip] = useState<Trip | null>(null);
  const [assignTrip, setAssignTrip] = useState<Trip | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const isDesktop = useIsDesktop();

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
        start_date: new Date(Date.now() - 3 * 86_400_000).toISOString(),
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

  const lists = useMemo(() => {
    const q = (t: Trip) => matchesTripQuery(t, query);
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
      .filter((u) => matchesFilter(u, fleetFilter) && matchesQuery(u, query))
      .sort((a, b) => Number(!a.position) - Number(!b.position) || Number(isOffline(a)) - Number(isOffline(b)));
    return { active, planned, attention, done, fleet };
  }, [openTrips, reasonsById, doneQ.data, units, fleetFilter, query, dayKey, today]);

  const scheduleGroups = useMemo(
    () => groupSchedule(lists.planned, dayKey, (k) => formatInDeploymentTz(new Date(`${k}T12:00:00Z`), 'UTC', 'EEEE d MMM'), now),
    [lists.planned, dayKey, now],
  );

  const kpis = useMemo(() => {
    const active = openTrips.filter(isActiveTrip);
    return {
      onRoad: active.length,
      delayed: openTrips.filter((t) => reasonsById.get(t.id)?.includes('delayed')).length,
      startingToday: openTrips.filter((t) => isPlannedTrip(t) && t.planned_start && dayKey(new Date(t.planned_start)) === today).length,
      attention: openTrips.filter((t) => (reasonsById.get(t.id)?.length ?? 0) > 0).length,
      live: units.filter((u) => u.position && !isOffline(u)).length,
      units: units.length,
    };
  }, [openTrips, reasonsById, units, dayKey, today]);

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
      setMobileListOpen(false);
      const u = unitByTrip.get(t.id);
      if (u?.position) {
        setPreviewTripId(null);
        setFocus((f) => ({ tripId: t.id, nonce: f.nonce + 1 }));
      } else {
        setPreviewTripId(t.id);
        setFocus((f) => ({ nonce: f.nonce + 1 }));
      }
    },
    [unitByTrip],
  );

  const selectUnit = useCallback((u: LiveUnit) => {
    setMobileListOpen(false);
    setPreviewTripId(null);
    setSelectedUnitKey(u.key);
    setSelectedTripId(u.trip?.id ?? null);
    setFocus((f) => ({ unitKey: u.key, nonce: f.nonce + 1 }));
  }, []);

  const onMapSelected = useCallback((u: LiveUnit | null) => {
    setSelectedUnitKey(u?.key ?? null);
    if (u) setSelectedTripId(u.trip?.id ?? null);
    else if (!previewRef.current) setSelectedTripId(null);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewTripId(null);
    setSelectedTripId(null);
  }, []);

  // Keep the picked row in view when it was picked on the map.
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const setRowRef = (id: string) => (el: HTMLElement | null) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  };
  useEffect(() => {
    const id = tab === 'fleet' ? selectedUnitKey : selectedTripId;
    if (id) rowRefs.current.get(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedTripId, selectedUnitKey, tab]);

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

  // ── Keyboard: "/" searches, "[" toggles the sidebar ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        if (isDesktop) setSidebarOpen(true);
        else setMobileListOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      } else if (e.key === '[' && isDesktop) {
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const toggleSidebar = () => {
    setSidebarOpen((open) => {
      try { localStorage.setItem(SIDEBAR_KEY, open ? 'closed' : 'open'); } catch { /* storage blocked */ }
      return !open;
    });
  };

  const mapFilter: LiveFilter = tab === 'fleet' ? fleetFilter : tab === 'active' ? 'on_trip' : 'all';
  const loading = openQ.isLoading || (tab === 'done' && doneQ.isLoading) || (tab === 'fleet' && liveQ.isLoading);
  const lastUpdate = liveQ.dataUpdatedAt ? timeAgo(new Date(liveQ.dataUpdatedAt).toISOString()) : null;

  const renderTrip = (t: Trip) => (
    <OpsTripCard
      key={t.id}
      ref={setRowRef(t.id)}
      trip={t}
      unit={unitByTrip.get(t.id) ?? null}
      reasons={tab === 'done' ? [] : reasonsById.get(t.id) ?? []}
      selected={selectedTripId === t.id}
      pendingStatus={pendingIds.has(t.id)}
      formatTime={formatTime}
      onSelect={() => selectTrip(t)}
      onChangeStatus={(s) => requestStatus(t, s)}
      onAssign={() => setAssignTrip(t)}
      onOpen={() => navigate(`/trips/${t.id}`)}
    />
  );

  const list = (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-1.5 px-3 pt-3">
        <Kpi label="On road" value={kpis.onRoad} tone="text-blue-700 dark:text-blue-300" onClick={() => setTab('active')} active={tab === 'active'} />
        <Kpi label="Delayed" value={kpis.delayed} tone="text-rose-700 dark:text-rose-300" onClick={() => setTab('attention')} active={tab === 'attention'} alert={kpis.delayed > 0} />
        <Kpi label="Today" value={kpis.startingToday} tone="text-violet-700 dark:text-violet-300" onClick={() => setTab('scheduled')} active={tab === 'scheduled'} />
        <Kpi label="Live GPS" value={`${kpis.live}/${kpis.units}`} tone="text-emerald-700 dark:text-emerald-300" onClick={() => setTab('fleet')} active={tab === 'fleet'} />
      </div>

      {/* Search */}
      <div className="px-3 pt-3">
        <div className="flex h-9 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 focus-within:border-charcoal/30 focus-within:ring-2 focus-within:ring-charcoal/10 dark:border-white/10 dark:bg-slate-900">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); } }}
            placeholder="Trip, plate, driver, customer, stop…"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            aria-label="Search trips and trucks"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="hidden rounded border border-black/10 px-1.5 text-[10px] text-muted-foreground sm:inline dark:border-white/15">/</kbd>
          )}
        </div>
      </div>

      {/* Tabs */}
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
                  on ? 'flex-[2.2]' : 'flex-1',
                  on ? 'bg-white text-foreground shadow-sm dark:bg-slate-950' : 'text-muted-foreground hover:text-foreground',
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

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-4" role="tabpanel">
        {loading ? (
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
                    'sticky top-0 z-10 -mx-3 mb-2 flex items-center justify-between bg-slate-50/95 px-3 py-1 text-[11px] font-semibold tracking-wide uppercase backdrop-blur dark:bg-slate-950/90',
                    g.tone === 'bad' ? 'text-amber-700 dark:text-amber-400' : g.tone === 'muted' ? 'text-muted-foreground' : 'text-foreground',
                  )}>
                    <span>{g.label}</span>
                    <span className="tabular-nums opacity-70">{g.trips.length}</span>
                  </h3>
                  <div className="space-y-2">{g.trips.map(renderTrip)}</div>
                </section>
              ))}
            </div>
          ) : <Empty title={query ? 'No scheduled trips match' : 'Nothing scheduled'} hint="Create a trip to plan the next run." action={<NewTripButton onClick={() => navigate('/trips/new')} />} />
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
        onClick={() => (mobileListOpen ? setMobileListOpen(false) : toggleSidebar())}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800"
        aria-label="Hide list"
        title="Hide list  ["
      >
        {mobileListOpen ? <X className="size-4" /> : <ChevronsLeft className="size-4" />}
      </button>
    </div>
  );

  const confirmText = confirm ? confirmCopy(confirm.trip, confirm.status) : null;

  return (
    <DashboardLayout active="live-map" title="Live map" fixedViewport>
      <div className="flex h-full min-h-0 gap-3 px-2 pb-2 sm:px-4 sm:pb-3">
        {/* Desktop sidebar */}
        {!isDesktop ? null : sidebarOpen ? (
          <aside className="flex w-[380px] shrink-0 flex-col overflow-hidden rounded-[18px] border border-black/[0.06] bg-slate-50 shadow-sm dark:border-white/10 dark:bg-slate-950">
            {header}
            {list}
          </aside>
        ) : (
          <nav className="flex w-12 shrink-0 flex-col items-center gap-1 rounded-[18px] border border-black/[0.06] bg-white py-2 shadow-sm dark:border-white/10 dark:bg-slate-950" aria-label="Live map lists">
            <button type="button" onClick={toggleSidebar} className="mb-1 flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800" aria-label="Show list" title="Show list  [">
              <ChevronsRight className="size-4" />
            </button>
            {OPS_TABS.map((t) => {
              const Icon = TAB_ICON[t.id];
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setTab(t.id); toggleSidebar(); }}
                  title={`${t.label} — ${tabCount[t.id]}`}
                  aria-label={`${t.label}, ${tabCount[t.id]}`}
                  className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800"
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

        {/* Map */}
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-[18px] border border-black/[0.06] shadow-sm dark:border-white/10">
          <FleetCommandMap
            focusTripId={focus.tripId}
            focusUnitKey={focus.unitKey}
            focusNonce={focus.nonce}
            filter={mapFilter}
            query={query}
            hideFinder
            hideExpand
            onSelectedChange={onMapSelected}
            previewTrip={previewTrip}
            onPreviewClose={closePreview}
          />

          {/* Small screens: the list opens over the map */}
          {!isDesktop && !mobileListOpen && (
            <button
              type="button"
              onClick={() => setMobileListOpen(true)}
              className={cn('absolute bottom-3 left-1/2 z-20 flex h-10 -translate-x-1/2 items-center gap-2 rounded-full px-4 text-sm font-medium text-foreground', GLASS)}
            >
              <List className="size-4" />
              {kpis.onRoad} on road
              {kpis.attention > 0 && <span className="rounded-full bg-rose-600 px-1.5 text-[11px] leading-5 font-bold text-white">{kpis.attention}</span>}
            </button>
          )}
          {!isDesktop && mobileListOpen && (
            <div className="absolute inset-0 z-30 flex flex-col bg-slate-50 dark:bg-slate-950">
              {header}
              {list}
            </div>
          )}
        </div>
      </div>

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
        isOpen={!!assignTrip}
        onClose={() => setAssignTrip(null)}
        trip={assignTrip}
        onSaved={invalidateTrips}
      />
    </DashboardLayout>
  );
}

function Kpi({
  label, value, tone, onClick, active, alert,
}: { label: string; value: number | string; tone: string; onClick: () => void; active: boolean; alert?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative rounded-xl border px-2 py-1.5 text-left transition-all',
        active ? 'border-charcoal/20 bg-white shadow-sm dark:border-white/20 dark:bg-slate-900' : 'border-transparent bg-white/60 hover:bg-white dark:bg-slate-900/50 dark:hover:bg-slate-900',
      )}
    >
      {alert && <span className="absolute top-1.5 right-1.5 size-1.5 animate-pulse rounded-full bg-rose-500" />}
      <span className={cn('block text-lg leading-6 font-semibold tabular-nums', tone)}>{value}</span>
      <span className="block truncate text-[10px] font-medium text-muted-foreground">{label}</span>
    </button>
  );
}

function Empty({ title, hint, good, action }: { title: string; hint?: string; good?: boolean; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className={cn('mb-3 flex size-10 items-center justify-center rounded-full', good ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-200/60 text-slate-500 dark:bg-slate-800')}>
        {good ? <CheckCircle2 className="size-5" /> : <Search className="size-5" />}
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function NewTripButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-8 items-center gap-1 rounded-lg bg-charcoal px-3 text-xs font-medium text-white hover:bg-charcoal/90 dark:bg-white dark:text-slate-900">
      <Plus className="size-3.5" /> New trip
    </button>
  );
}
