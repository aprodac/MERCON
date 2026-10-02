import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tripService, ChargeReviewTrip, NewSubCharge, CustomerChargeHabit } from '@/services/tripService';

/**
 * The "any extra charges?" queue behind the Operations Assistant.
 *
 * The queue itself lives on the server (`is_post_trip_settled`), so one
 * operator's answer clears a trip for everyone. Only "remind me later" is
 * per person — it's kept in this browser.
 */

const QUEUE_KEY = ['trips', 'charge-review-queue'] as const;
const SNOOZE_KEY = 'mercon_charge_review_snoozed_v1';

function readSnoozed(): Record<string, number> {
  try {
    const map: Record<string, number> = JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}');
    const now = Date.now();
    // Drop expired entries so the map doesn't grow forever.
    return Object.fromEntries(Object.entries(map).filter(([, until]) => until > now));
  } catch {
    return {};
  }
}

export function routeLabel(trip: ChargeReviewTrip): string {
  const name = (s: ChargeReviewTrip['stops'][number] | undefined) => s?.location?.name || s?.location_name || '';
  const from = name(trip.stops.find((s) => s.stop_type === 'Pickup') || trip.stops[0]);
  const to = name([...trip.stops].reverse().find((s) => s.stop_type === 'Dropoff') || trip.stops[trip.stops.length - 1]);
  return from && to ? `${from} → ${to}` : from || to || 'Route not set';
}

export function driverLabel(trip: ChargeReviewTrip): string {
  if (trip.is_third_party) return trip.subcontract?.driverName || trip.subcontract?.provider?.name || '3PL';
  return trip.driver ? `${trip.driver.first_name} ${trip.driver.last_name || ''}`.trim() : 'No driver';
}

export function tripRef(trip: ChargeReviewTrip): string {
  return trip.ref_id || `Trip ${trip.id.slice(0, 8)}`;
}

export function useChargeReviewQueue(enabled = true) {
  const queryClient = useQueryClient();
  const [snoozed, setSnoozed] = useState<Record<string, number>>(readSnoozed);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: QUEUE_KEY,
    queryFn: () => tripService.getChargeReviewQueue(),
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled,
  });

  const now = Date.now();
  const trips = useMemo(
    () => (data?.trips || []).filter((t) => !(snoozed[t.id] > now)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, snoozed]
  );
  // Trips beyond the first 100 the server sent, still waiting.
  const hiddenCount = Math.max(0, (data?.count || 0) - (data?.trips.length || 0));

  const removeFromQueue = useCallback(
    (tripId: string) => {
      queryClient.setQueryData<{ trips: ChargeReviewTrip[]; count: number; habits: Record<string, CustomerChargeHabit[]> }>(QUEUE_KEY, (old) =>
        old ? { ...old, trips: old.trips.filter((t) => t.id !== tripId), count: Math.max(0, old.count - 1) } : old
      );
    },
    [queryClient]
  );

  const mutation = useMutation({
    mutationFn: ({ tripId, charges }: { tripId: string; charges: NewSubCharge[] }) => tripService.reviewCharges(tripId, charges),
    onSuccess: (_res, { tripId }) => {
      removeFromQueue(tripId);
      queryClient.invalidateQueries({ queryKey: ['trips'], refetchType: 'none' });
    },
    onError: (err: any, { tripId }) => {
      // Someone else answered first — it's done, just drop it here too.
      if (err?.response?.data?.error?.code === 'ALREADY_REVIEWED') removeFromQueue(tripId);
    },
  });

  const snooze = useCallback((tripId: string, minutes: number) => {
    setSnoozed((prev) => {
      const next = { ...readSnoozed(), ...prev, [tripId]: Date.now() + minutes * 60_000 };
      try {
        localStorage.setItem(SNOOZE_KEY, JSON.stringify(next));
      } catch {
        /* storage blocked — snooze lasts until reload */
      }
      return next;
    });
  }, []);

  return {
    trips,
    habits: data?.habits ?? {},
    total: trips.length + hiddenCount,
    isLoading,
    isError,
    refetch,
    /** Saves the answer; throws with the server's message on failure. */
    submit: (tripId: string, charges: NewSubCharge[]) => mutation.mutateAsync({ tripId, charges }),
    isSubmitting: mutation.isPending,
    snooze,
  };
}

/** The server's error message, or a plain fallback. */
export function reviewErrorMessage(err: any): string {
  return err?.response?.data?.error?.message || 'Could not save — check your connection and try again.';
}
