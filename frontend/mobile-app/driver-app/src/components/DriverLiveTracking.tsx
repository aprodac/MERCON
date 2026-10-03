/**
 * Headless component: shares the driver's GPS while they have a trip under
 * way. Rendered once on the driver landing so it keeps running as they move
 * between screens. Polls the current trip so tracking starts/stops as trips
 * are started, completed or cancelled without a manual refresh.
 *
 * It is the only thing that sends GPS to the server — the live navigation
 * screen watches GPS for its own map but no longer posts it, so the server
 * never gets each fix twice.
 */
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';
import { useCurrentTrip } from '../hooks/use-current-trip';
import { useLiveTracking } from '../hooks/use-live-tracking';

export function DriverLiveTracking() {
  const { profile } = useAuth();
  // One shared 30s poll of the current trip (React Query dedupes it with every
  // screen reading the same trip).
  const { trip, loading, error } = useCurrentTrip({ pollMs: 30_000 });

  // Only a successful answer may stop tracking: losing signal (or the app
  // still starting up) must not switch GPS off in the middle of a trip.
  useLiveTracking(trip, profile?.id ?? null, !loading && !error);
  return null;
}
