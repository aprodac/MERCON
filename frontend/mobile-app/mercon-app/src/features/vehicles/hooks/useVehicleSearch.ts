import { useState } from 'react';
import { useDebouncedValue } from '@/shared/hooks';

/** Debounced search input — `query` updates immediately, `debouncedQuery` triggers backend fetch. */
export function useVehicleSearch(delayMs = 350) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, delayMs);

  return { query, debouncedQuery, setQuery };
}
