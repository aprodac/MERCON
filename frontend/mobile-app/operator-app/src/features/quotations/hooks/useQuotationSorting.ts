import { useState } from 'react';
import type { QuotationSortOption } from '../types';

export function useQuotationSorting(initial: QuotationSortOption = 'route') {
  const [sort, setSort] = useState<QuotationSortOption>(initial);
  return { sort, setSort };
}
