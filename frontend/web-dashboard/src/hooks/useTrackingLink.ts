import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trackingService } from '@/services/trackingService';

/**
 * A trip's customer tracking link, fetched (and created on first ask) while
 * `enabled` — so share messages can include it without waiting on a request
 * after the click, which browsers treat as a pop-up and block.
 */
export function useTrackingLink(tripId: string | null | undefined, enabled = true) {
  const qc = useQueryClient();
  const key = ['tracking-link', tripId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => trackingService.getTripLink(tripId!),
    enabled: !!tripId && enabled,
    staleTime: Infinity,
    retry: 1,
  });
  const renew = useMutation({
    mutationFn: () => trackingService.getTripLink(tripId!, true),
    onSuccess: (link) => qc.setQueryData(key, link),
  });
  return { url: query.data?.url ?? null, loading: query.isLoading && !!tripId && enabled, renew };
}
