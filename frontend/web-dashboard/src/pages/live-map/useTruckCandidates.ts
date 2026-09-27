import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { rankTrucksForTrip, type TruckCandidate } from '@/lib/placeSearch';
import type { LiveUnit } from '@/services/fleetLiveService';
import { getVehicleRecommendations, type Trip } from '@/services/tripService';

const SHOWN = 12;

export function pickupOf(trip: Trip): { lat: number; lng: number } | null {
  const s = (trip.stops ?? []).find((x) => x.location_lat != null && x.location_lng != null);
  return s ? { lat: s.location_lat, lng: s.location_lng } : null;
}

/** Free trucks ranked for a trip — shared by the panel and the map (which shows only these). */
export function useTruckCandidates(trip: Trip | null, units: LiveUnit[]): TruckCandidate[] {
  // The trip's driver may have a primary / backup truck on file.
  const driverId = trip?.driver?.id;
  const { data: prefs } = useQuery({
    queryKey: ['vehicle-recommendations', driverId],
    queryFn: async () => (await getVehicleRecommendations(driverId!)).data ?? [],
    enabled: !!driverId,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return useMemo(() => {
    const pickup = trip ? pickupOf(trip) : null;
    if (!trip || !pickup) return [];
    const prefMap = new Map((prefs ?? []).map((p) => [p.vehicleId, p.assignmentType]));
    return rankTrucksForTrip(trip, pickup, units, prefMap).slice(0, SHOWN);
  }, [trip, units, prefs]);
}

