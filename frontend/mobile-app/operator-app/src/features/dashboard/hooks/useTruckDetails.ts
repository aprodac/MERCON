/** Every active truck's capacity and body (no photos — the light lookup list), for Home's Free trucks. */
import { useQuery } from '@tanstack/react-query';
import { operatorService } from '../../../lib/operator';

export function useTruckDetails() {
  return useQuery({
    queryKey: ['dashboard', 'truck-details'],
    queryFn: () => operatorService.vehiclesLookup(),
    staleTime: 5 * 60_000,
  });
}
