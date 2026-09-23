import { useState } from 'react';
import { useDebouncedValue } from '@/shared/hooks';

export function useQuotationSearch(delayMs = 350) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, delayMs);

  return { query, debouncedQuery, setQuery };
}
