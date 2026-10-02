/**
 * Extra-charges check — same backend as the web dashboard's assistant:
 *   GET  /trips/unsettled            → finished trips nobody has answered yet (+ customer habits)
 *   POST /trips/:id/charge-review    → add sub-charges (billed to the customer); [] = none
 *   GET  /surcharge-rules            → the customer's saved charge rates
 * One operator's answer clears a trip for everyone; "later" is per phone.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@mercon/mobile-shared/lib/api';
import { safeSecureStore } from '@mercon/mobile-shared/lib/secure-store';
import { normalizeAssistantConfig, type AssistantConfig, type ChargeRuleLike, type ChargeReviewTripLike, type CustomerChargeHabit } from '@mercon/shared-types';

export interface ChargeReviewTrip extends ChargeReviewTripLike {
  id: string;
  ref_id: string | null;
  customerId: string | null;
  quotationId: string | null;
  is_third_party: boolean;
  customer: { id: string; name: string } | null;
  driver: { first_name: string; last_name: string | null } | null;
  subcontract: { driverName: string | null; provider: { name: string } | null } | null;
  stops: (ChargeReviewTripLike['stops'][number] & { stop_sequence: number })[];
  charges: { id: string; charge_type: string; amount: number | string }[];
}

export interface NewSubCharge {
  surchargeRuleId: string | null;
  charge_type: string;
  unit: string | null;
  rate: number;
  quantity: number;
}

interface Queue { trips: ChargeReviewTrip[]; count: number; habits: Record<string, CustomerChargeHabit[]> }

const QUEUE_KEY = ['charge-review-queue'] as const;
const SNOOZE_KEY = 'mercon_charge_review_snoozed_v1';

export const tripRef = (t: ChargeReviewTrip) => t.ref_id || `Trip ${t.id.slice(0, 8)}`;
export const routeLabel = (t: ChargeReviewTrip) => {
  const name = (s?: ChargeReviewTrip['stops'][number]) => s?.location?.name || s?.location_name || '';
  const from = name(t.stops.find((s) => s.stop_type === 'Pickup') || t.stops[0]);
  const to = name([...t.stops].reverse().find((s) => s.stop_type === 'Dropoff') || t.stops[t.stops.length - 1]);
  return from && to ? `${from} → ${to}` : from || to || 'Route not set';
};
export const driverLabel = (t: ChargeReviewTrip) =>
  t.is_third_party
    ? t.subcontract?.driverName || t.subcontract?.provider?.name || '3PL'
    : t.driver ? `${t.driver.first_name} ${t.driver.last_name || ''}`.trim() : 'No driver';

export const reviewErrorMessage = (err: any) =>
  err?.response?.data?.error?.message || 'Could not save. Check your connection and try again.';

export function useChargeReviewQueue(enabled = true) {
  const qc = useQueryClient();
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});

  useEffect(() => {
    safeSecureStore.getItemAsync(SNOOZE_KEY).then((raw) => {
      try {
        const now = Date.now();
        const map: Record<string, number> = JSON.parse(raw || '{}');
        setSnoozed(Object.fromEntries(Object.entries(map).filter(([, until]) => until > now)));
      } catch { /* corrupt value — start fresh */ }
    });
  }, []);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: QUEUE_KEY,
    queryFn: async (): Promise<Queue> => {
      const { data: res } = await api.get('/trips/unsettled');
      return { trips: res.data ?? [], count: res.count ?? (res.data ?? []).length, habits: res.habits ?? {} };
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled,
  });

  const now = Date.now();
  const trips = useMemo(() => (data?.trips ?? []).filter((t) => !(snoozed[t.id] > now)), [data, snoozed]); // eslint-disable-line react-hooks/exhaustive-deps
  const hidden = Math.max(0, (data?.count ?? 0) - (data?.trips.length ?? 0));

  const drop = useCallback((tripId: string) => {
    qc.setQueryData<Queue>(QUEUE_KEY, (old) => (old ? { ...old, trips: old.trips.filter((t) => t.id !== tripId), count: Math.max(0, old.count - 1) } : old));
  }, [qc]);

  const mutation = useMutation({
    mutationFn: ({ tripId, charges }: { tripId: string; charges: NewSubCharge[] }) => api.post(`/trips/${tripId}/charge-review`, { charges }),
    onSuccess: (_r, { tripId }) => drop(tripId),
    onError: (err: any, { tripId }) => { if (err?.response?.data?.error?.code === 'ALREADY_REVIEWED') drop(tripId); },
  });

  const snooze = useCallback((tripId: string, minutes: number) => {
    setSnoozed((prev) => {
      const next = { ...prev, [tripId]: Date.now() + minutes * 60_000 };
      safeSecureStore.setItemAsync(SNOOZE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return {
    trips,
    habits: data?.habits ?? {},
    total: trips.length + hidden,
    isLoading,
    isError,
    refetch,
    submit: (tripId: string, charges: NewSubCharge[]) => mutation.mutateAsync({ tripId, charges }),
    isSubmitting: mutation.isPending,
    snooze,
  };
}

export function useCustomerChargeRules(customerId?: string | null, quotationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ['surcharge-rules', 'assistant', customerId, quotationId],
    queryFn: async (): Promise<ChargeRuleLike[]> => {
      const { data } = await api.get('/surcharge-rules', {
        params: { customerId, ...(quotationId ? { quotationId, rateCardId: quotationId } : {}), active_only: 'true' },
      });
      return data.data ?? [];
    },
    enabled: enabled && Boolean(customerId),
    staleTime: 60_000,
  });
}

/** The team's assistant settings (set by an Admin in the web dashboard's Settings → Assistant). */
export function useAssistantConfig(): AssistantConfig {
  const { data } = useQuery({
    queryKey: ['assistant-config'],
    queryFn: async () => {
      const { data: res } = await api.get('/settings');
      return res.data?.assistantConfig ?? null;
    },
    staleTime: 5 * 60_000,
  });
  return normalizeAssistantConfig(data);
}
