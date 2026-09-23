import { useState } from 'react';
import type { QuotationFilterStatus } from '../types';

export function useQuotationFilters() {
  const [status, setStatus] = useState<QuotationFilterStatus>('all');
  return { status, setStatus };
}
