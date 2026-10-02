import type { QuotationValidityStatus } from '../types';

/** One place for how a quotation's validity is worded and coloured. */
export const QUOTATION_STATUS: Record<QuotationValidityStatus, { label: string; fg: string; dot: string; tone: 'green' | 'gray' | 'red' | 'violet' }> = {
  Active: { label: 'Active', fg: '#146C3C', dot: '#1F9D55', tone: 'green' },
  Inactive: { label: 'Inactive', fg: '#6B6B76', dot: '#9898A4', tone: 'gray' },
  Expired: { label: 'Expired', fg: '#912018', dot: '#D92D20', tone: 'red' },
  Future: { label: 'Starts later', fg: '#5B34B0', dot: '#7651D6', tone: 'violet' },
};
