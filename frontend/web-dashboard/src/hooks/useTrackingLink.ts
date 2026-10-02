import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { autoTrackingUrl, trackingService } from '@/services/trackingService';

/**
 * A trip's customer tracking link, fetched (and created on first ask) while
 * `enabled` — so share messages can include it without waiting on a request
 * after the click, which browsers treat as a pop-up and block.
 *
 * `url` is the link itself (null when the customer has tracking switched off);
 * `autoUrl` is the link only when the customer wants it added to status
 * messages automatically — what share texts should append.
 */
export function useTrackingLink(tripId: string | null | undefined, enabled = true) {
  const qc = useQueryClient();
  const key = ['tracking-link', tripId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => trackingService.getTripLink(tripId!),
    enabled: !!tripId && enabled,
    // Re-read now and then so "opened 3 times" stays current while the page is open.
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const renew = useMutation({
    mutationFn: () => trackingService.getTripLink(tripId!, true),
    onSuccess: (link) => qc.setQueryData(key, link),
  });
  const link = query.data ?? null;
  return {
    link,
    url: link?.enabled ? link.url : null,
    autoUrl: autoTrackingUrl(link),
    /** The customer has tracking switched off. */
    disabled: link ? !link.enabled : false,
    loading: query.isLoading && !!tripId && enabled,
    renew,
  };
}

/**
 * Status-message links for several trips (trip list / board bulk share), keyed
 * by trip id — only for customers who want links added automatically. Fetched
 * while `enabled` so the click that opens WhatsApp doesn't have to wait.
 */
export function useTrackingLinks(tripIds: string[], enabled = true): Record<string, string | null> {
  const ids = [...new Set(tripIds)].sort();
  const { data } = useQuery({
    queryKey: ['tracking-links', ids],
    queryFn: () => trackingService.getTripLinks(ids),
    enabled: enabled && ids.length > 0,
    staleTime: 60_000,
    retry: 1,
  });
  // Same object until the links change — callers rebuild message text from it.
  return useMemo(
    () => Object.fromEntries(Object.entries(data ?? {}).map(([id, link]) => [id, autoTrackingUrl(link)])),
    [data],
  );
}
