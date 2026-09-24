/**
 * Streams the driver's GPS to the server while a trip is active (foreground).
 * Requests location permission, watches position (~10s / 20m), and emits
 * 'driver:location_update' over the shared socket. Stops when the trip ends
 * or the component unmounts. Background tracking is a later hardening step.
 */
import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { getSocket } from '../services/socket';
import { tripService, type MobileTrip } from '@mercon/mobile-shared/lib/trips';

const UPDATE_INTERVAL_MS = 15_000;
const MIN_DISTANCE_M = 10;

export function useLiveTracking(trip: MobileTrip | null, driverId: string | null | undefined) {
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const tripId = trip?.id ?? null;

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!tripId || !driverId || !trip) return;

      // Tracking starts ONLY after driver taps Start Trip (e.g. GOING_TO_PICKUP, LOADING, IN_TRANSIT)
      const isStarted =
        (trip.driver_workflow_state &&
          trip.driver_workflow_state !== 'ASSIGNED' &&
          trip.driver_workflow_state !== 'COMPLETED') ||
        trip.status === 'Loading' ||
        trip.status === 'InTransit' ||
        trip.status === 'Delayed';

      if (!isStarted) return;

      // Clean up any existing subscription before starting a new one
      if (subRef.current) {
        subRef.current.remove();
        subRef.current = null;
      }

      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted || cancelled) return;

      const socket = await getSocket().catch(() => null);
      if (cancelled) return;

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: UPDATE_INTERVAL_MS,
          distanceInterval: MIN_DISTANCE_M,
        },
        async (loc) => {
          const lat = loc.coords.latitude;
          const lng = loc.coords.longitude;
          const speed = loc.coords.speed ?? 0;
          const heading = loc.coords.heading ?? 0;
          const accuracy = loc.coords.accuracy ?? 0;

          // 1. Real-time WebSocket emission for live dashboard maps
          if (socket) {
            try {
              socket.emit('driver:location_update', {
                tripId,
                driverId,
                lat,
                lng,
                speed,
                heading,
              });
            } catch {}
          }

          // 2. HTTP REST API emission to POST /api/mobile/trips/:id/location
          try {
            await tripService.sendLocationUpdate(tripId, {
              latitude: lat,
              longitude: lng,
              speed_kph: speed > 0 ? Math.round(speed * 3.6) : 0,
              heading_deg: heading > 0 ? Math.round(heading) : 0,
              accuracy_m: accuracy > 0 ? Math.round(accuracy) : 0,
              recorded_at: new Date(loc.timestamp).toISOString(),
            });
          } catch {}
        },
      );

      if (cancelled) {
        sub.remove();
      } else {
        subRef.current = sub;
      }
    }

    start().catch(() => {});

    return () => {
      cancelled = true;
      if (subRef.current) {
        subRef.current.remove();
        subRef.current = null;
      }
    };
  }, [tripId, driverId, trip?.status, trip?.driver_workflow_state]);
}
