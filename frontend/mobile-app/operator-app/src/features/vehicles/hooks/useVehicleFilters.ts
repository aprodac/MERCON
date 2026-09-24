import { useState } from 'react';
import type { AssetStatus } from '../types';

/** Selected status filter for the vehicles list — null means "All". */
export function useVehicleFilters() {
  const [status, setStatus] = useState<AssetStatus | null>(null);
  return { status, setStatus };
}
