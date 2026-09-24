import { useCallback, useEffect, useState } from 'react';
import { tripService, type MobileTrip } from '@mercon/mobile-shared/lib/trips';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';

let cachedScheduled: MobileTrip[] = [];
let isScheduledFetched = false;

/** Loads the driver's scheduled and upcoming trips. Uses in-memory caching to eliminate tab-switch flickering. */
export function useScheduledTrips() {
  const [trips, setTrips] = useState<MobileTrip[]>(cachedScheduled);
  const [loading, setLoading] = useState(!isScheduledFetched);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (opts?: { showLoading?: boolean } | any) => {
    const showLoading = typeof opts === 'boolean' ? opts : typeof opts?.showLoading === 'boolean' ? opts.showLoading : !isScheduledFetched;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await tripService.getScheduled();
      cachedScheduled = data;
      isScheduledFetched = true;
      setTrips(data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { trips, loading, error, refetch };
}
