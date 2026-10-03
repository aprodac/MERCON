import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { locationService, type Location, type PinPayload } from '@/services/locationService';

/**
 * Save an exact pin on a customer location from the "Set pin" box. The API also
 * moves open trip stops still on the old guess, so the toast says how many.
 * Returns the pinned location for the caller to put on its form.
 */
export async function pinCustomerLocation(queryClient: QueryClient, loc: Pick<Location, 'id' | 'name'>, pin: PinPayload): Promise<Location> {
  const r = await locationService.pin(loc.id, pin);
  const n = r.updated_trip_count;
  toast.success(`Pin saved for ${loc.name}${n > 0 ? ` · ${n} open trip${n === 1 ? '' : 's'} updated` : ''}`);
  queryClient.invalidateQueries({ queryKey: ['locations'] });
  return r.location;
}
