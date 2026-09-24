import { useState } from 'react';
import type { VehicleSortOption } from '../types';

export function useVehicleSorting(initial: VehicleSortOption = 'plate') {
  const [sort, setSort] = useState<VehicleSortOption>(initial);
  return { sort, setSort };
}
