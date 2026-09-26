/**
 * Everything the trip details screen shows: the trip, the live overview
 * (phase, GPS, pre-trip checks, path driven) and the driver's photo updates.
 * Refreshes on its own while the screen is open and the trip is running, and
 * stops when the app goes to the background.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { operatorService, type DriverUpdate, type OperatorTripDetail, type TripOverview } from '../../../lib/operator';
import { haversineKm, phaseOf, sortedStops, stopName, type Remaining } from './tripDetailsModel';

const ACTIVE_REFRESH_MS = 20_000;
const IDLE_REFRESH_MS = 60_000;
/** Average truck speed for the straight-line guess when routing is down. */
const FALLBACK_KMH = 70;
/** Straight line → road distance, roughly. */
const ROAD_FACTOR = 1.25;

export function useTripDetails(id: string | undefined) {
  const [trip, setTrip] = useState<OperatorTripDetail | null>(null);
  const [overview, setOverview] = useState<TripOverview | null>(null);
  const [updates, setUpdates] = useState<DriverUpdate[]>([]);
  const [whatsappApi, setWhatsappApi] = useState(false);
  const [tz, setTz] = useState('Asia/Riyadh');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async (mode: 'initial' | 'pull' | 'silent') => {
    if (!id || inFlight.current) return;
    inFlight.current = true;
    if (mode === 'pull') setRefreshing(true);
    try {
      const t = await operatorService.tripById(id);
      setTrip(t);
      setError(null);
      // The overview and photos are extras: the page still works without them.
      const [ov, up] = await Promise.allSettled([
        operatorService.tripOverview(t.id),
        operatorService.tripDriverUpdates(t.id),
      ]);
      if (ov.status === 'fulfilled') setOverview(ov.value);
      if (up.status === 'fulfilled') {
        setUpdates(up.value.updates ?? []);
        setWhatsappApi(!!up.value.whatsapp_api_available);
      }
    } catch (e) {
      if (mode !== 'silent') setError(getApiErrorMessage(e));
    } finally {
      inFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    operatorService.deploymentTimezone().then(setTz).catch(() => {});
  }, []);

  useEffect(() => {
    // Fetching on mount; load() only sets state after its request returns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load('initial');
  }, [load]);

  const phase = trip ? overview?.phase ?? phaseOf(trip.status) : null;

  // Distance and drive time from the truck to the destination, for the status
  // message and the map chip. Re-asked only when the truck has moved ~1 km.
  const [remaining, setRemaining] = useState<Remaining | null>(null);
  const pos = overview?.unit?.position;
  const stops = trip ? sortedStops(trip) : [];
  const dest = stops.length ? stops[stops.length - 1] : null;
  const posKey = pos && phase === 'active' ? `${pos.lat.toFixed(2)},${pos.lng.toFixed(2)}` : null;
  const destKey = dest && Number.isFinite(dest.location_lat) && (dest.location_lat || dest.location_lng) ? `${dest.location_lat},${dest.location_lng}` : null;
  const destName = dest ? (dest.location?.city || stopName(dest, stops.length - 1)).toUpperCase() : '';

  useEffect(() => {
    if (!posKey || !destKey) return;
    let live = true;
    const [flat, flng] = posKey.split(',').map(Number);
    const [tlat, tlng] = destKey.split(',').map(Number);
    operatorService.routeEstimate({ lat: flat, lng: flng }, { lat: tlat, lng: tlng }).then((r) => {
      if (!live) return;
      if (r) {
        setRemaining({ km: r.distanceMeters / 1000, sec: r.durationSeconds, to: destName, approx: false });
      } else {
        const km = haversineKm({ lat: flat, lng: flng }, { lat: tlat, lng: tlng }) * ROAD_FACTOR;
        setRemaining({ km, sec: (km / FALLBACK_KMH) * 3600, to: destName, approx: true });
      }
    });
    return () => { live = false; };
  }, [posKey, destKey, destName]);

  // Poll while this screen is focused and the app is in the foreground.
  useFocusEffect(
    useCallback(() => {
      const every = phase === 'active' ? ACTIVE_REFRESH_MS : IDLE_REFRESH_MS;
      let timer: ReturnType<typeof setInterval> | null = setInterval(() => load('silent'), every);
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') {
          load('silent');
          if (!timer) timer = setInterval(() => load('silent'), every);
        } else if (timer) {
          clearInterval(timer);
          timer = null;
        }
      });
      return () => {
        if (timer) clearInterval(timer);
        sub.remove();
      };
    }, [load, phase]),
  );

  return {
    trip,
    overview,
    updates,
    whatsappApi,
    tz,
    phase,
    remaining: posKey && destKey ? remaining : null,
    loading,
    refreshing,
    error,
    refresh: () => load('pull'),
    reload: () => load('silent'),
  };
}
