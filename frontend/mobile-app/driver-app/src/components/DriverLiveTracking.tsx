/**
 * Headless component: streams the driver's GPS while they have an active trip.
 * Rendered once on the driver landing so it keeps running as they move between
 * screens. Polls the current trip so tracking starts/stops as trips are
 * assigned or completed without a manual refresh.
 *
 * Pauses on the live navigation screen, which runs its own high-accuracy GPS
 * watch and posts the same location updates — running both doubled GPS,
 * battery and network use while driving.
 */
import { usePathname } from 'expo-router';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';
import { useCurrentTrip } from '../hooks/use-current-trip';
import { useLiveTracking } from '../hooks/use-live-tracking';

const NAVIGATION_ROUTE = '/trip/navigate';

export function DriverLiveTracking() {
  const { profile } = useAuth();
  const pathname = usePathname();
  // One shared 30s poll of the current trip (React Query dedupes it with every
  // screen reading the same trip).
  const { trip } = useCurrentTrip({ pollMs: 30_000 });

  useLiveTracking(trip, profile?.id ?? null, pathname === NAVIGATION_ROUTE);
  return null;
}
