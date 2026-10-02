/**
 * Shares the driver's GPS with the server while a trip is under way.
 *
 * On a phone this starts the trip location service (services/tripLocationTask)
 * when the driver taps Start Trip and stops it when the trip is finished,
 * cancelled or taken off them — it keeps reporting while they are in Google
 * Maps or the screen is locked, and queues points with no signal.
 *
 * On web (and a build without the native module) it falls back to a
 * foreground watch, which only reports while the app is open.
 *
 * The server stores each fix and rebroadcasts it to the live map.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { tripService, type MobileTrip } from '@mercon/mobile-shared/lib/trips';
import { isBackgroundTrackingAvailable, startTripTracking, stopTripTracking } from '../services/tripLocationTask';

const UPDATE_INTERVAL_MS = 15_000;
const MIN_DISTANCE_M = 10;

/** Tracking runs from Start Trip until the trip is done. */
export function isTripUnderWay(trip: MobileTrip | null): boolean {
  if (!trip) return false;
  if (['Completed', 'Invoiced', 'Cancelled'].includes(trip.status)) return false;
  if (trip.driver_workflow_state === 'COMPLETED') return false;
  return (
    (!!trip.driver_workflow_state && trip.driver_workflow_state !== 'ASSIGNED') ||
    trip.status === 'Loading' ||
    trip.status === 'InTransit' ||
    trip.status === 'Delayed'
  );
}

export function useLiveTracking(trip: MobileTrip | null, driverId: string | null | undefined, tripKnown = true) {
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const tripId = trip?.id ?? null;
  const active = !!driverId && !!tripId && isTripUnderWay(trip);
  const background = isBackgroundTrackingAvailable();

  // Phone: the location service. Android only lets it start while the app is
  // on screen, so a start that failed (opened from the background, permission
  // just granted in Settings) is retried whenever the app comes back.
  useEffect(() => {
    if (!background) return;
    if (!active || !tripId) {
      if (tripKnown) stopTripTracking().catch(() => {});
      return;
    }
    startTripTracking(tripId).catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') startTripTracking(tripId).catch(() => {});
    });
    return () => sub.remove();
  }, [background, active, tripId, tripKnown]);

  // Web / no native module: foreground-only watch.
  useEffect(() => {
    if (background || !active || !tripId) return;
    let cancelled = false;

    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted || cancelled) return;
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: UPDATE_INTERVAL_MS, distanceInterval: MIN_DISTANCE_M },
        (loc) => {
          const { latitude, longitude, speed, heading, accuracy } = loc.coords;
          tripService.sendLocationUpdate(tripId, {
            latitude,
            longitude,
            speed_kph: speed != null && speed > 0 ? Math.round(speed * 3.6) : 0,
            heading_deg: heading != null && heading > 0 ? Math.round(heading) : 0,
            accuracy_m: accuracy != null && accuracy > 0 ? Math.round(accuracy) : 0,
            recorded_at: new Date(loc.timestamp).toISOString(),
          });
        },
      );
      if (cancelled) sub.remove();
      else subRef.current = sub;
    })().catch(() => {});

    return () => {
      cancelled = true;
      subRef.current?.remove();
      subRef.current = null;
    };
  }, [background, active, tripId]);
}
