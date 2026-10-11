/**
 * The live fleet for a map page: every truck (refreshed every 15 s — the same
 * query as Home's preview, so opening a map reuses what's loaded), the
 * deployment's time formatter, and the clock for ages, lateness and ETAs —
 * it moves on each refresh and every 30 s between.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { operatorService } from '../../lib/operator';
import { makeTime } from '../trips/list/tripListModel';

const REFRESH_MS = 15_000;
const TICK_MS = 30_000;

export function useLiveFleet() {
  const live = useQuery({ queryKey: ['dashboard', 'actions', 'live-map'], queryFn: () => operatorService.liveMap(), refetchInterval: REFRESH_MS });
  const tzQ = useQuery({ queryKey: ['dashboard', 'tz'], queryFn: () => operatorService.deploymentTimezone(), staleTime: Infinity });
  const f = useMemo(() => makeTime(tzQ.data ?? 'Asia/Riyadh'), [tzQ.data]);

  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);
  const now = Math.max(clock, live.dataUpdatedAt || 0);

  return { live, f, now };
}
