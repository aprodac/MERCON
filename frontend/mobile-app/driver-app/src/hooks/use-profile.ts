import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { profileService } from '../services/profile';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { queryClient } from '@mercon/mobile-shared/lib/query-client';
import { driverKeys } from './query-keys';

/** The driver's profile, shared across screens via React Query. */
export function useProfile() {
  const query = useQuery({
    queryKey: driverKeys.profile,
    queryFn: () => profileService.get(),
  });

  const { refetch: queryRefetch } = query;
  const refetch = useCallback(async () => {
    await queryRefetch();
  }, [queryRefetch]);

  const refetchIfStale = useCallback(() => {
    queryClient.refetchQueries({ queryKey: driverKeys.profile, stale: true });
  }, []);

  return {
    profile: query.data ?? null,
    loading: query.isPending,
    error: query.error ? getApiErrorMessage(query.error) : null,
    refetch,
    refetchIfStale,
  };
}
