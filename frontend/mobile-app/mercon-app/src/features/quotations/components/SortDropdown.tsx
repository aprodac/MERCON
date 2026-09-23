import React from 'react';
import * as Haptics from 'expo-haptics';
import { SortDropdown as BaseSortDropdown, type SortOption } from '@/shared/components';
import type { QuotationSortOption } from '../types';

const OPTIONS: readonly SortOption<QuotationSortOption>[] = [
  { value: 'route', label: 'Route Origin' },
  { value: 'customer', label: 'Customer' },
  { value: 'rate', label: 'Highest Rate' },
  { value: 'newest', label: 'Newest' },
];

interface SortDropdownProps {
  value: QuotationSortOption;
  onChange: (value: QuotationSortOption) => void;
  className?: string;
}

export function SortDropdown({ value, onChange, className }: SortDropdownProps) {
  const handleChange = (val: QuotationSortOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onChange(val);
  };

  return <BaseSortDropdown value={value} options={OPTIONS} onChange={handleChange} className={className} />;
}
