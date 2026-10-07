/**
 * Two pieces of Fleet map state that outlive one render:
 *
 *   useFleetPrefs     the view to come back to — filter, light/dark, 2D/3D,
 *                     the trip live view's mode and where the camera was —
 *                     kept on the phone, so reopening the map lands where it
 *                     was left.
 *   useFleetChanges   what changed between two live refreshes while the map is
 *                     open (a truck turned late, stopped long, lost its GPS,
 *                     started or finished its trip), told once per refresh.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { safeSecureStore as SecureStore } from '@mercon/mobile-shared/lib/secure-store';
import type { LiveUnit } from '../../lib/operator';
import type { MapTheme } from './mapStyle';
import { isDelayed, isLongStop, isSilent, onTrip, type FleetFilter } from './fleetModel';

const PREFS_KEY = 'fleetMap.view.v1';
const SAVE_DELAY_MS = 600;

export interface FleetPrefs {
  filter?: FleetFilter;
  theme?: MapTheme;
  is3D?: boolean;
  /** The view a trip's full-screen live map opens in (TripLiveScreen). */
  tripView?: 'flat' | 'tilted' | 'drive' | 'route';
  camera?: { center: [number, number]; zoom: number };
}

export function useFleetPrefs() {
  const [state, setState] = useState<{ ready: boolean; prefs: FleetPrefs }>({ ready: false, prefs: {} });
  const latest = useRef<FleetPrefs>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    SecureStore.getItemAsync(PREFS_KEY)
      .then((raw) => {
        let prefs: FleetPrefs = {};
        try { prefs = raw ? (JSON.parse(raw) as FleetPrefs) : {}; } catch { /* a bad save starts fresh */ }
        latest.current = prefs;
        if (alive) setState({ ready: true, prefs });
      })
      .catch(() => alive && setState({ ready: true, prefs: {} }));
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  /** Merge and write a moment later — a pan fires many camera changes. */
  const save = useCallback((p: Partial<FleetPrefs>) => {
    latest.current = { ...latest.current, ...p };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      SecureStore.setItemAsync(PREFS_KEY, JSON.stringify(latest.current)).catch(() => {});
    }, SAVE_DELAY_MS);
  }, []);

  return { ready: state.ready, prefs: state.prefs, save };
}

type Snapshot = { late: boolean; stopped: boolean; silent: boolean; running: boolean; trip: string | null; plate: string };

export type FleetChange = { kind: 'late' | 'stopped' | 'gps' | 'started' | 'finished'; key: string; plate: string };

function snap(u: LiveUnit, now: number): Snapshot {
  return {
    late: isDelayed(u),
    stopped: isLongStop(u, now),
    silent: isSilent(u, now),
    running: onTrip(u),
    trip: u.trip?.id ?? null,
    plate: u.vehicle?.plate_number ?? u.driver?.name ?? 'A truck',
  };
}

/**
 * Compares each refresh with the one before and calls `onChanges` with what
 * got worse (late, stopped long, lost GPS on a trip) or moved on (trip
 * started, trip finished). The first load only sets the baseline.
 */
export function useFleetChanges(units: LiveUnit[] | undefined, updatedAt: number, onChanges: (c: FleetChange[]) => void) {
  const prev = useRef<Map<string, Snapshot> | null>(null);
  const cb = useRef(onChanges);
  useEffect(() => { cb.current = onChanges; }, [onChanges]);

  useEffect(() => {
    if (!units || !updatedAt) return;
    const now = updatedAt;
    const next = new Map(units.map((u) => [u.key, snap(u, now)]));
    const before = prev.current;
    prev.current = next;
    if (!before) return;
    const out: FleetChange[] = [];
    for (const [key, n] of next) {
      const b = before.get(key);
      if (!b) continue;
      if (n.late && !b.late) out.push({ kind: 'late', key, plate: n.plate });
      else if (n.stopped && !b.stopped) out.push({ kind: 'stopped', key, plate: n.plate });
      else if (n.running && n.silent && !b.silent) out.push({ kind: 'gps', key, plate: n.plate });
      else if (n.running && !b.running && n.trip === b.trip) out.push({ kind: 'started', key, plate: n.plate });
      else if (b.running && b.trip && n.trip !== b.trip) out.push({ kind: 'finished', key, plate: n.plate });
    }
    if (out.length) cb.current(out);
  }, [units, updatedAt]);
}

/** One line for a toast: "TRK-1234 is running late" or "3 updates: 2 late, 1 finished". */
export function changeText(c: FleetChange[]): string {
  const words: Record<FleetChange['kind'], [string, string]> = {
    late: ['is running late', 'late'],
    stopped: ['has stopped for 30 min+', 'stopped'],
    gps: ['lost its GPS', 'lost GPS'],
    started: ['started its trip', 'started'],
    finished: ['finished its trip', 'finished'],
  };
  if (c.length === 1) return `${c[0].plate} ${words[c[0].kind][0]}`;
  const counts = new Map<FleetChange['kind'], number>();
  for (const x of c) counts.set(x.kind, (counts.get(x.kind) ?? 0) + 1);
  return `${c.length} updates: ${[...counts].map(([k, n]) => `${n} ${words[k][1]}`).join(', ')}`;
}

/** A change worth a warning buzz (versus a plain tick for good news). */
export const isBadChange = (c: FleetChange) => c.kind === 'late' || c.kind === 'stopped' || c.kind === 'gps';
