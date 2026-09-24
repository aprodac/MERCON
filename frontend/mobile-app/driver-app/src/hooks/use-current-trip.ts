import { useCallback, useEffect, useState } from 'react';
import { tripService, type MobileTrip } from '@mercon/mobile-shared/lib/trips';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';

let cachedTrip: MobileTrip | null = null;
let isFetched = false;

export function clearCurrentTripCache() {
  cachedTrip = null;
  isFetched = false;
}

/** Loads the driver's current active trip. Uses in-memory caching to eliminate tab-switch flickering. */
export function useCurrentTrip() {
  const [trip, setTripState] = useState<MobileTrip | null>(() => {
    if (cachedTrip && (cachedTrip.status === 'Completed' || cachedTrip.status === 'Invoiced' || cachedTrip.status === 'Cancelled' || cachedTrip.driver_workflow_state === 'COMPLETED')) {
      cachedTrip = null;
    }
    return cachedTrip;
  });
  const [loading, setLoading] = useState(!isFetched);
  const [error, setError] = useState<string | null>(null);

  const setTrip = useCallback((newTrip: MobileTrip | null | ((prev: MobileTrip | null) => MobileTrip | null)) => {
    const toCache = (next: MobileTrip | null) =>
      !next || next.status === 'Completed' || next.status === 'Invoiced' || next.status === 'Cancelled' || next.driver_workflow_state === 'COMPLETED'
        ? null
        : next;
    // Update the shared cache right away, not inside the state updater: a screen
    // that navigates immediately after setTrip (e.g. Stop → Navigate) must hand
    // the NEXT screen the new trip. The updater runs later, so the next screen
    // read the stale trip ("still at stop") and bounced back to the stop screen.
    if (typeof newTrip !== 'function') cachedTrip = toCache(newTrip);
    setTripState((prev) => {
      const next = typeof newTrip === 'function' ? newTrip(prev) : newTrip;
      cachedTrip = toCache(next);
      return next;
    });
  }, []);

  const refetch = useCallback(async (opts?: { showLoading?: boolean } | any) => {
    const showLoading = typeof opts === 'boolean' ? opts : typeof opts?.showLoading === 'boolean' ? opts.showLoading : !isFetched;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await tripService.getCurrent();
      if (!data || data.status === 'Completed' || data.status === 'Invoiced' || data.status === 'Cancelled' || data.driver_workflow_state === 'COMPLETED') {
        cachedTrip = null;
        setTripState(null);
      } else {
        cachedTrip = data;
        setTripState(data);
      }
      isFetched = true;
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { trip, loading, error, refetch, setTrip };
}

